import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
    lstat,
    mkdir,
    mkdtemp,
    readFile,
    readdir,
    readlink,
    realpath,
    rename,
    rm,
    symlink,
    writeFile,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { _electron, expect, type ElectronApplication } from '@playwright/test';
import { resolveApp } from '../src/app.js';
import { createRun, finishRun } from '../src/resources.js';
import {
    requireClosedProfile,
    type ProfilePaths,
} from '../src/real-profile.js';
import { commonSettings } from '../src/profile.js';
import { bounded, Workbench } from '../src/workbench.js';

interface GuardEvidence {
    protectedContentsUnchanged: boolean;
    allowedWriteSucceeded: boolean;
    deniedOperations: string[];
}

// Feasibility checks only; the separately authorized Python walkthrough is
// delegated below. No production Python suite is exposed by this probe.
const worker = String.raw`
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const [root, operation] = process.argv.slice(1);
const protectedRoot = path.join(root, 'protected');
const original = path.join(protectedRoot, 'original.txt');
const metadata = path.join(root, 'metadata.txt');
const append = () => fs.appendFileSync(original, 'changed');
const operations = {
    append,
    create: () => fs.writeFileSync(path.join(protectedRoot, 'created.txt'), 'changed'),
    'rename-file': () => fs.renameSync(original, path.join(root, 'moved.txt')),
    'unlink-file': () => fs.unlinkSync(original),
    'rename-directory': () => fs.renameSync(protectedRoot, path.join(root, 'moved')),
    'unlink-symlink': () => fs.unlinkSync(path.join(protectedRoot, 'link')),
    'write-through-symlink': () => fs.appendFileSync(path.join(root, 'alias'), 'changed'),
    'literal-append': () => fs.appendFileSync(metadata, 'changed'),
    'literal-rename': () => fs.renameSync(metadata, path.join(root, 'moved-metadata.txt')),
    'literal-unlink': () => fs.unlinkSync(metadata),
};
if (operation === 'allowed-write') {
    fs.writeFileSync(path.join(root, 'allowed.txt'), 'allowed');
    process.stdout.write('ALLOWED');
} else if (operation === 'grandchild-append' || operation === 'detached-grandchild-append') {
    const script = "try { require('node:fs').appendFileSync(process.argv[1], 'changed'); process.stdout.write('UNEXPECTED_WRITE'); } catch(e) { if(e.code !== 'EPERM' && e.code !== 'EACCES') throw e; process.stdout.write('DENIED'); }";
    const child = spawnSync(process.execPath, ['-e', script, original], {
        env: process.env,
        encoding: 'utf8',
        timeout: 5000,
        detached: operation === 'detached-grandchild-append',
    });
    if (child.error) throw child.error;
    if (child.status !== 0 || child.signal) throw new Error('Grandchild did not finish');
    process.stdout.write(child.stdout);
} else {
    try {
        operations[operation]();
        process.stdout.write('UNEXPECTED_WRITE');
    } catch (error) {
        if (error.code !== 'EPERM' && error.code !== 'EACCES') throw error;
        process.stdout.write('DENIED');
    }
}
`;

async function snapshot(path: string): Promise<string> {
    const entries: unknown[] = [];
    for (const name of (await readdir(path)).sort()) {
        const item = join(path, name);
        const stat = await lstat(item);
        entries.push({
            name,
            mode: stat.mode,
            size: stat.size,
            mtimeMs: stat.mtimeMs,
            data: stat.isSymbolicLink()
                ? await readlink(item)
                : (await readFile(item)).toString('base64'),
        });
    }
    return JSON.stringify(entries);
}

export async function verifyWriteGuard(): Promise<GuardEvidence> {
    const root = await mkdtemp('/private/tmp/ide-python-guard-');
    const owner = randomUUID();
    await writeFile(join(root, '.owner'), owner, { flag: 'wx', mode: 0o600 });
    const protectedRoot = join(root, 'protected');
    await mkdir(protectedRoot);
    await writeFile(join(protectedRoot, 'original.txt'), 'unchanged');
    await symlink('original.txt', join(protectedRoot, 'link'));
    await symlink(join(protectedRoot, 'original.txt'), join(root, 'alias'));
    const metadata = join(root, 'metadata.txt');
    await writeFile(metadata, 'unchanged metadata');
    const metadataBefore = await readFile(metadata, 'utf8');
    const before = await snapshot(protectedRoot);
    // JSON string quoting escapes quotes/backslashes in this generated fixture path.
    // The canonical disposable path contains no SBPL control characters.
    const canonical = await realpath(protectedRoot);
    if ([...canonical].some((character) => character.charCodeAt(0) < 32))
        throw new Error('Unsupported sandbox path');
    const policy = `(version 1)(allow default)(deny file-write* (subpath ${JSON.stringify(canonical)}) (literal ${JSON.stringify(metadata)}))`;
    const deniedOperations = [
        'append',
        'create',
        'rename-file',
        'unlink-file',
        'rename-directory',
        'unlink-symlink',
        'write-through-symlink',
        'grandchild-append',
        'detached-grandchild-append',
        'literal-append',
        'literal-rename',
        'literal-unlink',
    ];
    for (const operation of [...deniedOperations, 'allowed-write']) {
        try {
            const result = await promisify(execFile)(
                '/usr/bin/sandbox-exec',
                ['-p', policy, process.execPath, '-e', worker, root, operation],
                {
                    env: { PATH: '/usr/bin:/bin', HOME: root, TMPDIR: root },
                    encoding: 'utf8',
                    timeout: 10_000,
                    maxBuffer: 16_384,
                },
            );
            const expected =
                operation === 'allowed-write' ? 'ALLOWED' : 'DENIED';
            if (result.stdout !== expected || result.stderr)
                throw new Error(
                    `Expected ${expected}; received ${result.stdout}`,
                );
        } catch (cause) {
            // Failed verification retains only its own disposable fixture.
            throw new Error(
                `Write guard failed at ${operation}; fixture retained: ${root}`,
                {
                    cause,
                },
            );
        }
    }
    const protectedContentsUnchanged =
        (await snapshot(protectedRoot)) === before &&
        (await readFile(metadata, 'utf8')) === metadataBefore;
    const allowedWriteSucceeded =
        (await readFile(join(root, 'allowed.txt'), 'utf8')) === 'allowed';
    if (!protectedContentsUnchanged || !allowedWriteSucceeded)
        throw new Error(
            `Write guard comparison failed; fixture retained: ${root}`,
        );
    if (
        (await realpath(root)) !== root ||
        (await lstat(root)).isSymbolicLink() ||
        (await readFile(join(root, '.owner'), 'utf8')) !== owner
    )
        throw new Error(`Guard fixture ownership mismatch: ${root}`);
    await rm(root, { recursive: true });
    return {
        protectedContentsUnchanged,
        allowedWriteSucceeded,
        deniedOperations,
    };
}

export function validateTerminalLines(value: unknown): string[] {
    if (
        !Array.isArray(value) ||
        value.length > 2000 ||
        !value.every((line): line is string => typeof line === 'string') ||
        Buffer.byteLength(value.join('\n'), 'utf8') > 256 * 1024
    )
        throw new Error('Invalid or oversized terminal buffer');
    return value;
}

export function verifyTerminalBatch(
    lines: string[],
    token: string,
    batch: 1 | 2,
    pid: number,
): void {
    const expected = [
        `Hello, world! ${token} ${batch}`,
        `OBS_ID ${token} ${batch} ${pid}`,
        `OBS_DONE ${token} ${batch}`,
    ];
    if (
        expected.some(
            (line) => lines.filter((actual) => actual === line).length !== 1,
        )
    )
        throw new Error(
            `Missing, partial or duplicate terminal batch ${batch}`,
        );
}

interface TerminalFixture {
    script: string;
    ready: string;
    trigger: (batch: 1 | 2) => string;
    stop: string;
}

export async function createTerminalFixture(
    root: string,
    token: string,
): Promise<TerminalFixture> {
    if (!/^[A-Za-z0-9_-]{1,24}$/.test(token))
        throw new Error('Invalid fixture token');
    if ((await realpath(root)) !== root)
        throw new Error('Redirected fixture root');
    const fixture = {
        script: join(root, 'terminal-observation.cjs'),
        ready: join(root, 'terminal-ready.json'),
        trigger: (batch: 1 | 2) => join(root, `terminal-trigger-${batch}`),
        stop: join(root, 'terminal-stop'),
    };
    // The real terminal process writes its identity, then waits for file triggers.
    // No expected marker is passed as terminal input or as a command argument.
    const source = `
const fs = require('node:fs');
const config = ${JSON.stringify({ token, ready: fixture.ready, stop: fixture.stop, triggers: [fixture.trigger(1), fixture.trigger(2)] })};
fs.writeFileSync(config.ready, JSON.stringify({ token: config.token, pid: process.pid }), { flag: 'wx', mode: 0o600 });
let batch = 0;
const timer = setInterval(() => {
    if (fs.existsSync(config.stop)) { clearInterval(timer); process.exit(0); }
    if (batch < 2 && fs.existsSync(config.triggers[batch])) {
        batch++;
        process.stdout.write('Hello, world! ' + config.token + ' ' + batch + '\\n');
        process.stdout.write('OBS_ID ' + config.token + ' ' + batch + ' ' + process.pid + '\\n');
        process.stdout.write('OBS_DONE ' + config.token + ' ' + batch + '\\n');
    }
}, 25);
setTimeout(() => process.exit(0), 90000).unref();
`;
    await writeFile(fixture.script, source, { flag: 'wx', mode: 0o600 });
    return fixture;
}

async function requireOwnedPath(
    path: string,
    directory: boolean,
): Promise<void> {
    const stat = await lstat(path);
    if (
        (await realpath(path)) !== path ||
        !(directory ? stat.isDirectory() : stat.isFile())
    )
        throw new Error('Feasibility profile ownership mismatch');
}

export async function prepareObservationProfile(
    checkout: string,
    settings: Record<string, unknown>,
): Promise<ProfilePaths> {
    const parent = join(await realpath(checkout), 'profiles');
    await mkdir(parent, { recursive: true });
    await requireOwnedPath(parent, true);
    const root = join(parent, 'smoke-python-feasibility');
    let created = false;
    try {
        await mkdir(root);
        created = true;
    } catch (error) {
        if (
            !(error instanceof Error) ||
            !('code' in error) ||
            error.code !== 'EEXIST'
        )
            throw error;
    }
    const marker = join(root, '.owner');
    if (created)
        await writeFile(marker, 'ide-tester:smoke-python-feasibility:v1', {
            flag: 'wx',
            mode: 0o600,
        });
    await requireOwnedPath(root, true);
    await requireOwnedPath(marker, false);
    if (
        (await readFile(marker, 'utf8')) !==
        'ide-tester:smoke-python-feasibility:v1'
    )
        throw new Error('Feasibility profile ownership mismatch');
    const paths = {
        userData: join(root, 'user-data'),
        extensions: join(root, 'extensions'),
        state: join(root, 'state'),
    };
    for (const path of Object.values(paths)) {
        if (created) await mkdir(path);
        await requireOwnedPath(path, true);
    }
    await requireClosedProfile(paths);
    const user = join(paths.userData, 'User');
    if (created) await mkdir(user);
    await requireOwnedPath(user, true);
    const destination = join(user, 'settings.json');
    let previous: unknown = {};
    if (!created) {
        await requireOwnedPath(destination, false);
        previous = JSON.parse(await readFile(destination, 'utf8'));
    }
    if (!previous || typeof previous !== 'object' || Array.isArray(previous))
        throw new Error('Invalid feasibility profile settings');
    // Refuse existing redirects in VS Code state before the app can follow them.
    const pending = [root];
    while (pending.length) {
        const directory = pending.pop();
        if (!directory) break;
        for (const entry of await readdir(directory, { withFileTypes: true })) {
            if (entry.isSymbolicLink())
                throw new Error('Redirected feasibility profile state');
            if (entry.isDirectory()) pending.push(join(directory, entry.name));
        }
    }
    const temporary = join(user, 'settings.observation-tmp.json');
    await writeFile(
        temporary,
        JSON.stringify({ ...previous, ...settings }, null, 2),
        { flag: 'wx', mode: 0o600 },
    );
    await rename(temporary, destination);
    return paths;
}

async function observeTerminal(build: string): Promise<boolean> {
    const installed = await resolveApp(build);
    if (
        process.platform !== 'darwin' ||
        process.arch !== 'arm64' ||
        process.version !== 'v26.3.1' ||
        installed.vscode !== '1.135.0'
    )
        throw new Error(
            'Terminal observation requires macOS arm64, Node 26.3.1 and VS Code 1.135.0',
        );
    const checkout = fileURLToPath(new URL('../../../', import.meta.url));
    const run = await createRun(checkout);
    const token = randomUUID().replaceAll('-', '').slice(0, 12);
    const started = Date.now();
    const evidence: Record<string, unknown> = {
        token,
        scope: 'terminal-observation',
        versions: installed,
        runId: run.id,
    };
    let app: ElectronApplication | undefined;
    let attempted = false;
    let passed = false;
    let stage = 'prepare';
    let error: string | undefined;
    let fixture: TerminalFixture | undefined;
    try {
        fixture = await createTerminalFixture(run.resources, token);
        const home = join(run.resources, 'home');
        const tmp = join(run.resources, 'tmp');
        await mkdir(home);
        await mkdir(tmp);
        const profile = await prepareObservationProfile(checkout, {
            ...commonSettings,
            'chat.disableAIFeatures': true,
            'extensions.autoUpdate': 'off',
            'terminal.integrated.profiles.osx': {
                'Observation fixture': {
                    path: process.execPath,
                    args: [fixture.script],
                    env: { HOME: home, TMPDIR: tmp },
                },
            },
            'terminal.integrated.defaultProfile.osx': 'Observation fixture',
            'terminal.integrated.shellIntegration.enabled': false,
            'terminal.integrated.enablePersistentSessions': false,
            'terminal.integrated.inheritEnv': false,
            'terminal.integrated.tabs.enabled': true,
        });
        evidence.profile = profile;
        stage = 'launch';
        attempted = true;
        const launchDeadline = Date.now() + 60_000;
        app = await _electron.launch({
            executablePath: installed.executable,
            timeout: 60_000,
            env: {
                HOME: home,
                TMPDIR: tmp,
                XDG_STATE_HOME: run.state,
                PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
                LANG: 'en_US.UTF-8',
            },
            args: [
                run.workspace,
                '--new-window',
                '--user-data-dir',
                profile.userData,
                '--extensions-dir',
                profile.extensions,
                '--disable-extensions',
                '--use-inmemory-secretstorage',
                '--password-store=basic',
                '--enable-smoke-test-driver',
                '--skip-welcome',
                '--skip-release-notes',
                '--disable-telemetry',
                '--disable-experiments',
                '--locale=en',
            ],
        });
        app.process().stdout?.on('data', () => {});
        app.process().stderr?.on('data', () => {});
        evidence.applicationPid = app.process().pid;
        const page = await app.firstWindow({
            timeout: Math.max(1, launchDeadline - Date.now()),
        });
        page.setDefaultTimeout(10_000);
        await new Workbench(page).ready(
            Math.max(1, launchDeadline - Date.now()),
        );
        evidence.launchMs = Date.now() - (launchDeadline - 60_000);
        const deadline = Date.now() + 60_000;
        const remaining = (): number => {
            if (Date.now() >= deadline)
                throw new Error(`Observation deadline expired at ${stage}`);
            return deadline - Date.now();
        };
        const selector = '#terminal .terminal-wrapper';
        stage = 'capability';
        evidence.driverCapability = await bounded(
            page.evaluate(() => {
                const driver: unknown = window.driver;
                return (
                    !!driver &&
                    typeof driver === 'object' &&
                    'getTerminalBuffer' in driver &&
                    typeof driver.getTerminalBuffer === 'function'
                );
            }),
            remaining(),
            'Terminal driver capability',
        );
        if (!evidence.driverCapability)
            throw new Error('Installed driver has no getTerminalBuffer');
        stage = 'open-terminal';
        await page.keyboard.press('Meta+Shift+P');
        const input = page.locator(
            '.quick-input-widget .quick-input-box input',
        );
        await input.fill('>Terminal: Create New Terminal');
        const command = page
            .locator('.quick-input-widget .label-name')
            .filter({ hasText: /^Terminal: Create New Terminal$/ });
        await expect(command).toHaveCount(1, { timeout: remaining() });
        await command.click({ timeout: remaining() });
        await page.waitForFunction(
            (selector) => {
                const nodes = document.querySelectorAll(selector);
                const node = nodes[0];
                return (
                    nodes.length === 1 &&
                    !!node &&
                    node.getClientRects().length > 0 &&
                    'xterm' in node &&
                    !!node.xterm
                );
            },
            selector,
            { timeout: remaining() },
        );
        evidence.selector = selector;
        evidence.terminalCount = await page.locator(selector).count();
        const readLines = async (): Promise<string[]> => {
            const value: unknown = await bounded(
                page.evaluate(async (selector) => {
                    const driver: unknown = window.driver;
                    if (
                        !driver ||
                        typeof driver !== 'object' ||
                        !('getTerminalBuffer' in driver) ||
                        typeof driver.getTerminalBuffer !== 'function'
                    )
                        throw new Error('Terminal driver unavailable');
                    const result: unknown =
                        await driver.getTerminalBuffer(selector);
                    return result;
                }, selector),
                remaining(),
                'Terminal buffer read',
            );
            remaining();
            return validateTerminalLines(value);
        };
        stage = 'baseline';
        const baseline = await readLines();
        evidence.baseline = baseline;
        if (baseline.some((line) => line.includes(token)))
            throw new Error('Current run already present in terminal baseline');
        await expect
            .poll(
                async () => {
                    try {
                        const info: unknown = JSON.parse(
                            await readFile(fixture!.ready, 'utf8'),
                        );
                        if (
                            info &&
                            typeof info === 'object' &&
                            'token' in info &&
                            info.token === token &&
                            'pid' in info &&
                            Number.isSafeInteger(info.pid) &&
                            Number(info.pid) > 0
                        )
                            return Number(info.pid);
                    } catch {
                        /* Fixture startup may still be in progress. */
                    }
                    return 0;
                },
                {
                    timeout: remaining(),
                    message: 'Owned terminal fixture identity',
                },
            )
            .toBeGreaterThan(0);
        const identity: unknown = JSON.parse(
            await readFile(fixture.ready, 'utf8'),
        );
        if (
            !identity ||
            typeof identity !== 'object' ||
            !('pid' in identity) ||
            typeof identity.pid !== 'number'
        )
            throw new Error('Invalid fixture identity');
        const pid = identity.pid;
        evidence.fixturePid = pid;
        for (const batch of [1, 2] as const) {
            stage = `batch-${batch}`;
            const before = await readLines();
            if (before.some((line) => line === `OBS_DONE ${token} ${batch}`))
                throw new Error('Terminal batch appeared before its trigger');
            evidence[`beforeBatch${batch}`] = before;
            remaining();
            await writeFile(fixture.trigger(batch), token, {
                flag: 'wx',
                mode: 0o600,
            });
            await expect
                .poll(
                    async () => {
                        const lines = await readLines();
                        evidence[`batch${batch}`] = lines;
                        try {
                            verifyTerminalBatch(lines, token, batch, pid);
                            return true;
                        } catch {
                            return false;
                        }
                    },
                    {
                        timeout: remaining(),
                        message: `Fresh terminal batch ${batch}`,
                    },
                )
                .toBe(true);
        }
        const final = await readLines();
        verifyTerminalBatch(final, token, 1, pid);
        verifyTerminalBatch(final, token, 2, pid);
        evidence.final = final;
        evidence.observationMs = Date.now() - (deadline - 60_000);
        passed = true;
    } catch (cause) {
        error = cause instanceof Error ? cause.message : String(cause);
    }
    const cleanupStarted = Date.now();
    const cleanup = await finishRun(run, passed, [
        async () => {
            if (fixture)
                await writeFile(fixture.stop, token, {
                    flag: 'wx',
                    mode: 0o600,
                });
            if (app) {
                const child = app.process();
                if (child.exitCode === null && child.signalCode === null)
                    await bounded(
                        app.close(),
                        25_000,
                        'Owned application close',
                    );
                if (child.exitCode === null && child.signalCode === null)
                    await bounded(
                        new Promise<void>((done) =>
                            child.once('exit', () => done()),
                        ),
                        Math.max(1, 30_000 - (Date.now() - cleanupStarted)),
                        'Owned application exit',
                    );
                evidence.applicationExit = {
                    exitCode: child.exitCode,
                    signalCode: child.signalCode,
                };
            } else if (attempted)
                throw new Error(
                    'Application launch uncertain; retain desktop reservation',
                );
        },
    ]);
    const result = {
        outcome: cleanup.errors.length
            ? 'harness_error'
            : passed
              ? 'passed'
              : 'failed',
        stage,
        error,
        ...evidence,
        cleanup,
        report: run.report,
        durationMs: Date.now() - started,
        limitations: [
            'Node fixture output only; Python workflow unverified',
            'VS Code main-process exit accepted; descendants not independently checked',
            'Protected Electron-launch guard inheritance unverified',
        ],
    };
    await writeFile(
        join(run.report, 'terminal-observation.json'),
        JSON.stringify(result, null, 2),
        { flag: 'wx', mode: 0o600 },
    );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return passed && cleanup.errors.length === 0;
}

async function main(): Promise<void> {
    if (
        !process.argv[1] ||
        import.meta.url !== pathToFileURL(resolve(process.argv[1])).href
    )
        return;
    const args = process.argv.slice(2);
    try {
        if (args.length === 1 && args[0] === '--self-check') {
            process.stdout.write(
                `${JSON.stringify(await verifyWriteGuard(), null, 2)}\n`,
            );
        } else if (
            args.length === 4 &&
            args[0] === '--build' &&
            args[2] === '--python-interpreter'
        ) {
            const { runPythonWalkthrough } =
                await import('./python-walkthrough.js');
            if (!(await runPythonWalkthrough(args))) process.exitCode = 1;
        } else if (
            args.length === 3 &&
            args[0] === '--observe-terminal' &&
            args[1] === '--build' &&
            args[2]
        ) {
            if (!(await observeTerminal(args[2]))) process.exitCode = 1;
        } else
            throw new Error(
                'Use --self-check or --observe-terminal --build <app>',
            );
    } catch (error) {
        process.stderr.write(`${String(error)}\n`);
        process.exitCode = 1;
    }
}

void main();
