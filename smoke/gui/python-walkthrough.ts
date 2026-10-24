import {
    _electron,
    expect,
    type ElectronApplication,
    type Page,
} from '@playwright/test';
import {
    lstat,
    mkdir,
    readFile,
    readdir,
    realpath,
    writeFile,
} from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { resolveApp } from '../src/app.js';
import { createRun, finishRun } from '../src/resources.js';
import { commonSettings } from '../src/profile.js';
import { bounded, Workbench } from '../src/workbench.js';
import { requireAbsent, verifySavedFile } from '../src/files.js';
import {
    prepareObservationProfile,
    validateTerminalLines,
    verifyWriteGuard,
} from './issue-40-python-feasibility.js';
import {
    capturePreservation,
    createProtectedLaunch,
    requirePreservationUnchanged,
    type PreservationManifest,
} from './python-preservation.js';
import {
    makePythonSource,
    verifyPythonEvidence,
} from './python-execution-evidence.js';

export function commandLabelPattern(title: string): RegExp {
    const labels = [title, title.slice(title.indexOf(': ') + 2)];
    return new RegExp(
        `^(?:${labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`,
    );
}

export function parsePythonWalkthrough(args: string[]): {
    build: string;
    interpreter: string;
} {
    if (
        args.length !== 4 ||
        args[0] !== '--build' ||
        args[2] !== '--python-interpreter' ||
        !isAbsolute(args[1]) ||
        !isAbsolute(args[3])
    )
        throw new Error(
            'Python walkthrough requires --build <absolute app> --python-interpreter <absolute path>',
        );
    return { build: args[1], interpreter: args[3] };
}

export async function runPythonWalkthrough(args: string[]): Promise<boolean> {
    const options = parsePythonWalkthrough(args);
    const checkout = await realpath(
        fileURLToPath(new URL('../../../', import.meta.url)),
    );
    if (options.interpreter !== join(checkout, '.venv/bin/python'))
        throw new Error(
            'Only the authorized retained interpreter is supported',
        );
    const installed = await resolveApp(options.build);
    if (
        process.platform !== 'darwin' ||
        process.arch !== 'arm64' ||
        process.version !== 'v26.3.1' ||
        installed.vscode !== '1.135.0'
    )
        throw new Error('Unqualified host/application');
    const run = await createRun(checkout);
    const token = randomUUID().replaceAll('-', '').slice(0, 12);
    const evidence: Record<string, unknown> = {
        scope: 'python-feasibility',
        token,
        versions: installed,
        runId: run.id,
    };
    const deadline = Date.now() + 480_000;
    let stageDeadline = deadline;
    let stage = 'prepare';
    let app: ElectronApplication | undefined;
    let page: Page | undefined;
    let attempted = false;
    let passed = false;
    let error: string | undefined;
    let before: PreservationManifest | undefined;
    const remaining = (limit = 15_000): number => {
        if (Date.now() >= Math.min(deadline, stageDeadline))
            throw new Error(`Scenario expired at ${stage}`);
        return Math.min(
            limit,
            deadline - Date.now(),
            stageDeadline - Date.now(),
        );
    };
    const mark = (value: string, budget = 60_000): void => {
        remaining();
        stage = value;
        stageDeadline = Math.min(deadline, Date.now() + budget);
        process.stdout.write(`Python walkthrough: ${stage}\n`);
    };
    try {
        evidence.guardFixture = await verifyWriteGuard();
        before = await capturePreservation(checkout);
        await requirePreservationUnchanged(checkout, before);
        await writeFile(
            join(run.report, 'preservation-before.json'),
            JSON.stringify(before),
            { flag: 'wx', mode: 0o600 },
        );
        const home = join(run.resources, 'home');
        const tmp = join(run.resources, 'tmp');
        const sentinel = join(run.resources, 'protected-sentinel');
        await mkdir(home);
        await mkdir(tmp);
        await mkdir(sentinel);
        const sentinelFile = join(sentinel, 'unchanged');
        await writeFile(sentinelFile, token, { flag: 'wx' });
        const guardScript = join(run.resources, 'terminal-guard.cjs');
        const guardResult = join(run.resources, 'terminal-guard.json');
        await writeFile(
            guardScript,
            `const fs = require('node:fs');\nlet denied = false;\ntry { fs.appendFileSync(${JSON.stringify(sentinelFile)}, 'mutation'); } catch(e) { if (e.code === 'EPERM' || e.code === 'EACCES') denied = true; else throw e; }\nfs.writeFileSync(${JSON.stringify(guardResult)}, JSON.stringify({denied, pid:process.pid}), {flag:'wx'});\nconsole.log(denied ? 'GUARD_DENIED ${token}' : 'GUARD_FAILED ${token}');\nsetTimeout(() => process.exit(0), 90000);\n`,
            { flag: 'wx' },
        );
        const launch = await createProtectedLaunch(
            run.resources,
            installed.executable,
            checkout,
            sentinel,
        );
        evidence.protectedPaths = launch.protectedPaths;
        evidence.chromiumSandbox = 'disabled-by-approved-diagnostic';
        const pythonEnv = {
            PYTHONDONTWRITEBYTECODE: '1',
            PYTHONNOUSERSITE: '1',
            PIP_NO_INDEX: '1',
            PIP_DISABLE_PIP_VERSION_CHECK: '1',
            HOME: home,
            TMPDIR: tmp,
        };
        const suppression = {
            'python.createEnvironment.trigger': 'off',
            'python.createEnvironment.contentButton': 'hide',
            'python.experiments.enabled': false,
            'python.globalModuleInstallation': false,
            'python.terminal.activateEnvironment': false,
            'python.terminal.useEnvFile': false,
            'python-envs.terminal.autoActivationType': 'off',
        };
        const profile = await prepareObservationProfile(checkout, {
            ...commonSettings,
            ...suppression,
            'chat.disableAIFeatures': true,
            'editor.fontSize': 10,
            'editor.lineHeight': 12,
            'editor.wordWrap': 'off',
            'editor.minimap.enabled': false,
            'editor.autoIndent': 'none',
            'editor.formatOnType': false,
            'editor.autoClosingBrackets': 'never',
            'editor.autoClosingQuotes': 'never',
            'editor.quickSuggestions': false,
            'editor.suggestOnTriggerCharacters': false,
            'extensions.autoUpdate': 'off',
            'terminal.integrated.profiles.osx': {
                'Python feasibility': {
                    path: '/bin/bash',
                    args: ['--noprofile', '--norc'],
                    env: pythonEnv,
                },
                'Guard verification': {
                    path: process.execPath,
                    args: [guardScript],
                    env: pythonEnv,
                },
            },
            'terminal.integrated.defaultProfile.osx': 'Python feasibility',
            'terminal.integrated.env.osx': pythonEnv,
            'terminal.integrated.inheritEnv': false,
            'terminal.integrated.shellIntegration.enabled': false,
            'terminal.integrated.enablePersistentSessions': false,
            'terminal.integrated.tabs.enabled': true,
        });
        evidence.profile = profile;
        const production = join(checkout, 'profiles/smoke-python');
        try {
            await lstat(production);
            throw new Error(
                'Existing production profile needs separate comparison review',
            );
        } catch (cause) {
            if (!(
                cause instanceof Error &&
                'code' in cause &&
                cause.code === 'ENOENT'
            ))
                throw cause;
        }
        mark('launch');
        attempted = true;
        app = await _electron.launch({
            executablePath: launch.executable,
            timeout: remaining(60_000),
            env: {
                ...pythonEnv,
                ...launch.environment,
                XDG_STATE_HOME: profile.state,
                PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
                LANG: 'en_US.UTF-8',
            },
            args: [
                run.workspace,
                '--new-window',
                '--no-sandbox',
                '--user-data-dir',
                profile.userData,
                '--extensions-dir',
                profile.extensions,
                '--use-inmemory-secretstorage',
                '--password-store=basic',
                '--disable-extension',
                'github.copilot-chat',
                '--enable-smoke-test-driver',
                '--skip-welcome',
                '--skip-release-notes',
                '--disable-telemetry',
                '--disable-experiments',
                '--locale=en',
            ],
        });
        app.process().stdout?.on('data', () => {});
        app.process().stderr?.on('data', (chunk: Buffer) => {
            evidence.applicationStderr =
                `${String(evidence.applicationStderr ?? '')}${chunk.toString()}`.slice(
                    -65_536,
                );
        });
        evidence.applicationPid = app.process().pid;
        page = await app.firstWindow({ timeout: remaining(60_000) });
        page.setDefaultTimeout(10_000);
        const workbench = new Workbench(page);
        await workbench.ready(remaining(60_000));
        const input = page.locator(
            '.quick-input-widget .quick-input-box input',
        );
        const command = async (title: string): Promise<void> => {
            remaining();
            await page!.keyboard.press('Meta+Shift+P');
            await input.fill(`>${title}`);
            const item = page!
                .locator('.quick-input-widget .label-name')
                .filter({ hasText: commandLabelPattern(title) });
            await expect(item).toHaveCount(1, { timeout: remaining() });
            evidence.lastCommand = title;
            evidence.lastCommandLabel = await item.textContent();
            await item.click({ timeout: remaining() });
        };
        const readTerminal = async (): Promise<string[]> => {
            remaining();
            await page!.waitForFunction(
                () => {
                    const nodes = document.querySelectorAll(
                        '#terminal .terminal-wrapper.active',
                    );
                    return (
                        nodes.length === 1 &&
                        nodes[0].getClientRects().length > 0 &&
                        'xterm' in nodes[0] &&
                        !!nodes[0].xterm
                    );
                },
                undefined,
                { timeout: remaining() },
            );
            const result: unknown = await bounded(
                page!.evaluate(async () => {
                    const driver: unknown = window.driver;
                    if (
                        !driver ||
                        typeof driver !== 'object' ||
                        !('getTerminalBuffer' in driver) ||
                        typeof driver.getTerminalBuffer !== 'function'
                    )
                        throw new Error('No terminal observation driver');
                    const result: unknown = await driver.getTerminalBuffer(
                        '#terminal .terminal-wrapper.active',
                    );
                    return result;
                }),
                remaining(),
                'Read terminal',
            );
            remaining();
            return validateTerminalLines(result);
        };
        mark('guard-inheritance');
        evidence.mainGuardDenied = await bounded(
            app.evaluate((_electron, path) => {
                const fs = process.getBuiltinModule('node:fs');
                try {
                    fs.appendFileSync(path, 'mutation');
                    return false;
                } catch (cause) {
                    return (
                        cause instanceof Error &&
                        'code' in cause &&
                        (cause.code === 'EPERM' || cause.code === 'EACCES')
                    );
                }
            }, sentinelFile),
            remaining(),
            'Electron guard verification',
        );
        if (!evidence.mainGuardDenied)
            throw new Error(
                'Electron write guard did not deny sentinel mutation',
            );
        await command('Terminal: Create New Terminal (With Profile)');
        const guardRow = page
            .locator('.quick-input-widget .label-name')
            .filter({ hasText: /^\s*Guard verification\s*$/ });
        await guardRow.click({ timeout: remaining() });
        await expect
            .poll(
                async () =>
                    (await readTerminal()).includes(`GUARD_DENIED ${token}`),
                { timeout: remaining(30_000) },
            )
            .toBe(true);
        const terminalGuard: unknown = JSON.parse(
            await readFile(guardResult, 'utf8'),
        );
        if (
            !terminalGuard ||
            typeof terminalGuard !== 'object' ||
            !('denied' in terminalGuard) ||
            terminalGuard.denied !== true
        )
            throw new Error('Terminal process guard not established');
        evidence.terminalGuard = terminalGuard;
        if ((await readFile(sentinelFile, 'utf8')) !== token)
            throw new Error('Disposable guard sentinel changed');
        await command('Terminal: Kill All Terminals');
        mark('extension-install', 180_000);
        const installDeadline = Date.now() + remaining(180_000);
        const extensionDirectories = async (): Promise<string[]> =>
            (await readdir(profile.extensions)).filter((name) =>
                name.startsWith('ms-python.python-'),
            );
        evidence.installMode = (await extensionDirectories()).length
            ? 'reused'
            : 'fresh';
        await command('Extensions: Install Extensions');
        const searchSelector = '.extensions-search-container .monaco-editor';
        await page.locator(`${searchSelector} .native-edit-context`).focus();
        await page.keyboard.press('Meta+A');
        await workbench.typeInEditor(searchSelector, '@id:ms-python.python');
        const extension = page
            .locator('.extensions-viewlet .monaco-list-row')
            .filter({
                has: page.locator('.name').filter({ hasText: /^Python$/ }),
            });
        await expect(extension).toHaveCount(1, { timeout: remaining(30_000) });
        await extension.click();
        const editor = page.locator('.extension-editor');
        await expect(editor.locator('.header .name')).toHaveText('Python', {
            timeout: remaining(),
        });
        evidence.extensionHeader = await editor.locator('.header').innerText();
        if (evidence.installMode === 'fresh') {
            const install = editor
                .locator(':scope > .header .extension-action:visible')
                .filter({ hasText: /^Install$/ });
            await expect(install).toHaveCount(1, { timeout: remaining() });
            await install.click();
        }
        await expect
            .poll(
                async () => {
                    remaining();
                    return (await extensionDirectories()).length;
                },
                { timeout: Math.max(1, installDeadline - Date.now()) },
            )
            .toBe(1);
        await expect(
            editor
                .locator(':scope > .header .extension-action:visible')
                .filter({ hasText: /^Uninstall$/ }),
        ).toBeVisible({ timeout: Math.max(1, installDeadline - Date.now()) });
        evidence.extensionInstalledHeader = await editor
            .locator('.header')
            .innerText();
        const properties: Record<string, unknown> = {};
        const extensions: unknown[] = [];
        for (const name of (await readdir(profile.extensions)).filter((value) =>
            value.startsWith('ms-python.'),
        )) {
            const manifest = JSON.parse(
                await readFile(
                    join(profile.extensions, name, 'package.json'),
                    'utf8',
                ),
            );
            extensions.push({
                id: `${manifest.publisher}.${manifest.name}`,
                version: manifest.version,
                extensionDependencies: manifest.extensionDependencies,
                extensionPack: manifest.extensionPack,
            });
            const config = manifest.contributes?.configuration;
            for (const entry of Array.isArray(config) ? config : [config])
                Object.assign(properties, entry?.properties ?? {});
        }
        evidence.extensions = extensions;
        const unsupported = Object.keys(suppression).filter(
            (key) => !(key in properties),
        );
        evidence.unsupportedSettings = unsupported;
        if (unsupported.length)
            throw new Error(
                `Installed suppression controls unsupported: ${unsupported.join(', ')}`,
            );
        if (
            await page
                .getByText(
                    /Reload Required|Restart Extensions|Sign in to|Keychain/,
                    { exact: false },
                )
                .count()
        )
            throw new Error(
                'Unexpected reload/authentication prompt requires review',
            );
        mark('editor-save-reopen', 120_000);
        const script = join(run.workspace, 'hello.py');
        const resultPath = join(run.workspace, `python-evidence-${token}.json`);
        await requireAbsent(run.workspace, 'hello.py');
        await requireAbsent(run.workspace, `python-evidence-${token}.json`);
        const source = makePythonSource(token, resultPath);
        await workbench.newTextFile();
        await workbench.replaceEditorText(source);
        await workbench.saveAs(script);
        evidence.savedFile = await verifySavedFile(
            run.workspace,
            'hello.py',
            source,
        );
        await workbench.closeEditors();
        await workbench.openFile(script);
        evidence.reopenedLines = await workbench.expectEditorText(source);
        evidence.reopened = true;
        await verifySavedFile(run.workspace, 'hello.py', source);
        mark('interpreter-selection');
        await command('Python: Select Interpreter');
        const enterPath = page
            .locator('.quick-input-widget .label-name')
            .filter({ hasText: /^\s*Enter interpreter path\.\.\.\s*$/ });
        await enterPath.click({ timeout: remaining(60_000) });
        await expect(input).toHaveAttribute(
            'placeholder',
            'Enter path to a Python interpreter.',
            { timeout: remaining() },
        );
        await input.fill(options.interpreter);
        await expect(input).toHaveValue(options.interpreter);
        evidence.enteredInterpreterPath = await input.inputValue();
        await input.press('Enter');
        await expect(input).toBeHidden({ timeout: remaining(60_000) });
        evidence.interpreterStatus = await page
            .locator('.statusbar-item[id*="python"]')
            .evaluateAll((nodes) =>
                nodes.map((node) => ({
                    id: node.id,
                    text: node.textContent,
                    aria: node.getAttribute('aria-label'),
                })),
            );
        await command('Python: Select Interpreter');
        await expect(input).toHaveAttribute(
            'placeholder',
            `Selected Interpreter: ${options.interpreter}`,
            { timeout: remaining() },
        );
        evidence.selectedInterpreterPlaceholder =
            await input.getAttribute('placeholder');
        evidence.selectionRows = await page
            .locator('.quick-input-widget .monaco-list-row')
            .allTextContents();
        evidence.selectionTitle = await page
            .locator('.quick-input-widget .quick-input-title')
            .textContent();
        await page.keyboard.press('Escape');
        await command('Python: Create Terminal');
        const baseline = await readTerminal();
        if (baseline.some((line) => line.includes(token)))
            throw new Error('Current Python evidence already in baseline');
        evidence.baseline = baseline;
        evidence.terminalSelector = '#terminal .terminal-wrapper.active';
        evidence.terminalsBeforeRun = await page
            .locator('#terminal .terminal-wrapper')
            .count();
        await requireAbsent(run.workspace, `python-evidence-${token}.json`);
        mark('python-run');
        await workbench.openFile(script);
        await command('Python: Run Python File in Terminal');
        const executionDeadline = Date.now() + remaining(60_000);
        await expect
            .poll(
                async () => {
                    remaining();
                    const lines = await readTerminal();
                    evidence.terminal = lines;
                    try {
                        const stat = await lstat(resultPath);
                        if (
                            !stat.isFile() ||
                            stat.isSymbolicLink() ||
                            stat.size > 8192 ||
                            (await realpath(resultPath)) !== resultPath
                        )
                            throw new Error('Invalid Python evidence file');
                        const raw = await readFile(resultPath, 'utf8');
                        const identity = verifyPythonEvidence(lines, raw, {
                            token,
                            script,
                            canonicalInterpreter: launch.canonicalInterpreter,
                        });
                        await verifySavedFile(
                            run.workspace,
                            'hello.py',
                            source,
                        );
                        evidence.identity = identity;
                        evidence.programJson = raw;
                        return true;
                    } catch {
                        return false;
                    }
                },
                {
                    timeout: Math.max(1, executionDeadline - Date.now()),
                    message:
                        'Combined saved source, terminal and program-written Python evidence',
                },
            )
            .toBe(true);
        remaining();
        evidence.terminalsAfterRun = await page
            .locator('#terminal .terminal-wrapper')
            .count();
        evidence.activeTerminalsAfterRun = await page
            .locator('#terminal .terminal-wrapper.active')
            .count();
        passed = true;
    } catch (cause) {
        error = cause instanceof Error ? cause.message : String(cause);
        if (page && !page.isClosed()) {
            evidence.pythonStatusItems = await page
                .locator('.statusbar-item[id*="python"]')
                .evaluateAll((nodes) =>
                    nodes.map((node) => ({
                        id: node.id,
                        text: node.textContent,
                        aria: node.getAttribute('aria-label'),
                    })),
                )
                .catch(() => []);
            evidence.quickInputLabels = await page
                .locator('.quick-input-widget .label-name')
                .allTextContents()
                .catch(() => []);
            evidence.dialogText = await page
                .locator('.monaco-dialog-box .dialog-message-text')
                .allTextContents()
                .catch(() => []);
        }
    }
    const cleanupDeadline = Date.now() + 120_000;
    const cleanup = await finishRun(run, passed, [
        async () => {
            if (app) {
                const child = app.process();
                if (child.exitCode === null && child.signalCode === null)
                    await bounded(
                        app.close(),
                        60_000,
                        'Owned application close',
                    );
                if (child.exitCode === null && child.signalCode === null)
                    await bounded(
                        new Promise<void>((done) =>
                            child.once('exit', () => done()),
                        ),
                        Math.max(1, cleanupDeadline - Date.now()),
                        'Owned main process exit',
                    );
                evidence.applicationExit = {
                    exitCode: child.exitCode,
                    signalCode: child.signalCode,
                };
            } else if (attempted)
                throw new Error('Launch uncertain; retain reservation');
            if (before) {
                await requirePreservationUnchanged(checkout, before);
                evidence.preservation = {
                    unchanged: true,
                    entries: before.entries.length,
                };
            }
            try {
                await lstat(join(checkout, 'profiles/smoke-python'));
                throw new Error('Production profile unexpectedly exists');
            } catch (cause) {
                if (!(
                    cause instanceof Error &&
                    'code' in cause &&
                    cause.code === 'ENOENT'
                ))
                    throw cause;
            }
            evidence.productionProfileAbsent = true;
        },
    ]);
    const result = {
        ...evidence,
        outcome: cleanup.errors.length
            ? 'harness_error'
            : passed
              ? 'passed'
              : 'harness_error',
        verificationComplete: passed,
        stage,
        error,
        cleanup,
        report: run.report,
        limitations: [
            'Main-process exit accepted; descendants not independently verified',
            'No independently observed Python exit status',
            'Feasibility only; no production Python suite',
        ],
    };
    await writeFile(
        join(run.report, 'python-walkthrough.json'),
        JSON.stringify(result, null, 2),
        { flag: 'wx', mode: 0o600 },
    );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return passed && cleanup.errors.length === 0;
}
