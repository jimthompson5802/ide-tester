import assert from 'node:assert/strict';
import test from 'node:test';
import {
    mkdtemp,
    mkdir,
    writeFile,
    readFile,
    rm,
    realpath,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const bootstrapURL = new URL('../../scripts/test-gui.mjs', import.meta.url)
    .href;

async function fixture(t: test.TestContext): Promise<string> {
    const directory = await mkdtemp(path.join(tmpdir(), 'gui-bootstrap-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    await mkdir(path.join(directory, 'smoke'));
    return directory;
}

test('syntax fails before storage or compiled import', async (t) => {
    const root = await fixture(t);
    const { runGUIBootstrap } = await import(bootstrapURL);
    let calls = 0;
    const result = await runGUIBootstrap(['--suite', 'git'], {
        checkoutDirectory: root,
        createReport: async () => {
            calls++;
            throw Error('must not initialize');
        },
        loadCommand: async () => {
            calls++;
            throw Error('must not import');
        },
        output: () => {},
    });
    assert.equal(result.exitCode, 1);
    assert.equal(calls, 0);
});

test('existing compiled command receives original paths after initial evidence is saved', async (t) => {
    const root = await fixture(t);
    const { runGUIBootstrap } = await import(bootstrapURL);
    const result = await runGUIBootstrap(
        [
            '--build',
            '/Applications/Code With Spaces.app',
            '--python-interpreter',
            'bin/python with spaces',
        ],
        {
            checkoutDirectory: root,
            packageDirectory: path.join(root, 'smoke'),
            invocationCwd: root,
            environment: {},
            loadCommand: async () => ({
                runGUICommand: async (options: any, services: any) => {
                    assert.equal(
                        options.buildPath,
                        '/Applications/Code With Spaces.app',
                    );
                    assert.equal(
                        options.pythonInterpreter,
                        path.join(root, 'bin/python with spaces'),
                    );
                    const saved = JSON.parse(
                        await readFile(
                            path.join(services.directory, 'result.json'),
                            'utf8',
                        ),
                    );
                    assert.equal(saved.build.state, 'not_run');
                    assert.equal(saved.state, 'running');
                    return { exitCode: 0, result: services.batch };
                },
            }),
            output: () => {},
        },
    );
    assert.equal(result.exitCode, 0);
});

test('missing or unusable compiled code fails with an explicit build prerequisite and no suites', async (t) => {
    const { runGUIBootstrap } = await import(bootstrapURL);
    const before = ['SIGINT', 'SIGTERM'].map((signal) =>
        process.listenerCount(signal),
    );
    for (const moduleSource of [
        undefined,
        'export const unrelated = true;',
        'invalid javascript !!!',
    ]) {
        const root = await fixture(t);
        const packageDirectory = path.join(root, 'smoke');
        await writeFile(
            path.join(packageDirectory, 'package.json'),
            '{"type":"module"}',
        );
        if (moduleSource !== undefined) {
            await mkdir(path.join(packageDirectory, 'dist/src'), {
                recursive: true,
            });
            await writeFile(
                path.join(packageDirectory, 'dist/src/gui-command.js'),
                moduleSource,
            );
        }
        const messages: string[] = [];
        const result = await runGUIBootstrap(
            [
                '--build',
                '/Applications/Code.app',
                '--python-interpreter',
                'python',
            ],
            {
                checkoutDirectory: root,
                packageDirectory,
                output: (text: string) => messages.push(text),
            },
        );
        assert.equal(result.exitCode, 1);
        assert.equal(result.batch.state, 'completed');
        assert.equal(result.batch.build.state, 'not_run');
        assert.deepEqual(
            result.batch.rows.map((row: any) => row.outcome),
            ['not_run', 'not_run', 'not_run'],
        );
        assert.match(messages.join(''), /run npm --prefix smoke run build/);
        const saved = JSON.parse(
            await readFile(path.join(result.directory, 'result.json'), 'utf8'),
        );
        assert.match(saved.error, /Compiled GUI command unavailable/);
        assert.deepEqual(saved.reportingErrors, []);
    }
    assert.deepEqual(
        ['SIGINT', 'SIGTERM'].map((signal) => process.listenerCount(signal)),
        before,
    );
});

test('cancellation during initial aggregate creation saves interruption without loading command', async (t) => {
    const root = await fixture(t);
    const { runGUIBootstrap } = await import(bootstrapURL);
    const { createGUIReport } = await import(
        new URL('../../scripts/gui-bootstrap-report.mjs', import.meta.url).href
    );
    let imports = 0;
    const result = await runGUIBootstrap(
        ['--build', '/Applications/Code.app', '--python-interpreter', 'python'],
        {
            checkoutDirectory: root,
            createReport: async () => {
                process.emit('SIGINT');
                return createGUIReport(root);
            },
            loadCommand: async () => {
                imports++;
                throw Error('must not load');
            },
            output: () => {},
            errorOutput: () => {},
        },
    );
    assert.equal(imports, 0);
    assert.equal(result.batch.cancellation.reason, 'Cancelled by user');
    assert.equal(
        JSON.parse(
            await readFile(path.join(result.directory, 'result.json'), 'utf8'),
        ).cancellation.reason,
        'Cancelled by user',
    );
});

test('default import executes existing compilation without invoking npm build', async (t) => {
    const root = await fixture(t);
    const { runGUIBootstrap } = await import(bootstrapURL);
    const packageDirectory = path.join(root, 'smoke');
    const marker = path.join(root, 'built');
    const imported = path.join(root, 'imported');
    await writeFile(
        path.join(packageDirectory, 'package.json'),
        JSON.stringify({
            type: 'module',
            scripts: {
                build: `node -e "require('fs').writeFileSync('${marker}','unexpected')"`,
            },
        }),
    );
    await mkdir(path.join(packageDirectory, 'dist/src'), { recursive: true });
    await writeFile(
        path.join(packageDirectory, 'dist/src/gui-command.js'),
        `import {writeFileSync} from 'node:fs'; export async function runGUICommand(options,services){writeFileSync(${JSON.stringify(imported)},'existing');return {exitCode:0,result:services.batch};}`,
    );
    const result = await runGUIBootstrap(
        ['--build', '/Applications/Code.app', '--python-interpreter', 'python'],
        { checkoutDirectory: root, packageDirectory, output: () => {} },
    );
    assert.equal(result.exitCode, 0);
    assert.equal(await readFile(imported, 'utf8'), 'existing');
    await assert.rejects(readFile(marker), { code: 'ENOENT' });
    assert.equal(result.batch.build.state, 'not_run');
});

test('real filesystem initialization and running-record failures prevent command import', async (t) => {
    const { createGUIReport } = await import(
        new URL('../../scripts/gui-bootstrap-report.mjs', import.meta.url).href
    );
    const { runGUIBootstrap } = await import(bootstrapURL);
    for (const duringSave of [false, true]) {
        const root = await fixture(t);
        if (!duringSave)
            await writeFile(path.join(root, 'reports'), 'not a directory');
        let imports = 0;
        const result = await runGUIBootstrap(
            [
                '--build',
                '/Applications/Code.app',
                '--python-interpreter',
                'python',
            ],
            {
                checkoutDirectory: root,
                createReport: async () => {
                    const store = await createGUIReport(root);
                    await rm(path.join(store.directory, 'result.txt'));
                    await mkdir(path.join(store.directory, 'result.txt'));
                    return store;
                },
                loadCommand: async () => {
                    imports++;
                },
                output: () => {},
            },
        );
        assert.equal(result.exitCode, 1);
        assert.equal(imports, 0);
    }
});

test('cancellation during missing-compilation final persistence is reconciled durably', async (t) => {
    const root = await fixture(t);
    const { runGUIBootstrap } = await import(bootstrapURL);
    const { saveGUIReport } = await import(
        new URL('../../scripts/gui-bootstrap-report.mjs', import.meta.url).href
    );
    let interrupted = false;
    const result = await runGUIBootstrap(
        ['--build', '/Applications/Code.app', '--python-interpreter', 'python'],
        {
            checkoutDirectory: root,
            loadCommand: async () => {
                throw Error('compiled code missing');
            },
            saveReport: async (directory: string, batch: any) => {
                await saveGUIReport(directory, batch);
                if (batch.state === 'completed' && !interrupted) {
                    interrupted = true;
                    process.emit('SIGINT');
                }
            },
            output: () => {},
            errorOutput: () => {},
        },
    );
    assert.equal(result.exitCode, 1);
    assert.equal(
        JSON.parse(
            await readFile(path.join(result.directory, 'result.json'), 'utf8'),
        ).cancellation.reason,
        'Cancelled by user',
    );
});

test('npm and direct wrapper interrupts reach actual compiled command suite child once', async (t) => {
    const { spawn } = await import('node:child_process');
    for (const groupSignal of [true, false]) {
        const root = await fixture(t);
        const packageDirectory = path.join(root, 'smoke');
        await mkdir(path.join(packageDirectory, 'dist/src'), {
            recursive: true,
        });
        await writeFile(
            path.join(packageDirectory, 'package.json'),
            '{"type":"module"}',
        );
        const ready = path.join(root, 'ready');
        const signalLog = path.join(root, 'signals');
        const childPidFile = path.join(root, 'child-pid');
        const wrapperPidFile = path.join(root, 'wrapper-pid');
        const finished = path.join(root, 'finished');
        const interpreter = path.join(root, 'python fixture');
        await writeFile(interpreter, 'filesystem-only preflight fixture');
        await writeFile(
            path.join(packageDirectory, 'dist/src/cli.js'),
            `import {writeFileSync} from 'node:fs';
import {runCLIController} from ${JSON.stringify(new URL('../src/cli-controller.js', import.meta.url).href)};
writeFileSync(${JSON.stringify(childPidFile)},String(process.pid));
process.exitCode=await runCLIController(['--output','json'],${JSON.stringify(root)},{workerURL:new URL('./fixture-worker.mjs',import.meta.url)});`,
        );
        await writeFile(
            path.join(packageDirectory, 'dist/src/fixture-worker.mjs'),
            `import {parentPort} from 'node:worker_threads';import {writeFileSync,appendFileSync} from 'node:fs';
parentPort.on('message',()=>{appendFileSync(${JSON.stringify(signalLog)},'CANCEL\\n');setTimeout(()=>{parentPort.postMessage({outcome:'harness_error',suites:'basic',chatBackend:'real',cancellation:{reason:'Cancelled by user'},cleanup:{disposition:'retained',reservationRetained:false,errors:[]}});parentPort.close();},80);});
writeFileSync(${JSON.stringify(ready)},'ready');`,
        );
        await writeFile(
            path.join(packageDirectory, 'dist/src/gui-command.js'),
            `export {runGUICommand} from ${JSON.stringify(new URL('../src/gui-command.js', import.meta.url).href)};`,
        );
        const wrapper = path.join(root, 'wrapper.mjs');
        await writeFile(
            wrapper,
            `import {writeFileSync} from 'node:fs';import {runGUIBootstrap} from ${JSON.stringify(bootstrapURL)};
writeFileSync(${JSON.stringify(wrapperPidFile)},String(process.pid));
const result=await runGUIBootstrap(['--build','/Applications/Code.app','--python-interpreter',${JSON.stringify(interpreter)}],{checkoutDirectory:${JSON.stringify(root)},packageDirectory:${JSON.stringify(packageDirectory)},output:()=>{},errorOutput:()=>{}});
writeFileSync(${JSON.stringify(finished)},JSON.stringify(result));process.exitCode=result.exitCode;`,
        );
        await writeFile(
            path.join(root, 'package.json'),
            JSON.stringify({
                scripts: {
                    fixture: `${JSON.stringify(process.execPath)} ${JSON.stringify(wrapper)}`,
                },
            }),
        );
        const npm = spawn('npm', ['run', 'fixture'], {
            cwd: root,
            detached: true,
            stdio: 'ignore',
        });
        const closed = new Promise<void>((resolve) =>
            npm.once('close', () => resolve()),
        );
        const ownedChild: { pid?: number } = {};
        t.after(() => {
            for (const pid of [
                ownedChild.pid,
                npm.pid ? -npm.pid : undefined,
            ]) {
                if (pid) {
                    try {
                        process.kill(pid, 'SIGKILL');
                    } catch {
                        /* Exited owned fixture. */
                    }
                }
            }
        });
        const waitFor = async (file: string): Promise<string> => {
            const deadline = Date.now() + 5000;
            while (Date.now() < deadline) {
                try {
                    return await readFile(file, 'utf8');
                } catch {
                    await new Promise((resolve) => setTimeout(resolve, 10));
                }
            }
            throw new Error(
                `Missing owned signal fixture ${path.basename(file)}`,
            );
        };
        await waitFor(ready);
        ownedChild.pid = Number(await waitFor(childPidFile));
        const wrapperPid = Number(await waitFor(wrapperPidFile));
        assert.ok(npm.pid);
        process.kill(groupSignal ? -npm.pid : wrapperPid, 'SIGINT');
        await new Promise((resolve) => setTimeout(resolve, 20));
        process.kill(wrapperPid, 'SIGTERM');
        const result = JSON.parse(await waitFor(finished));
        await closed;
        assert.equal(result.exitCode, 1);
        assert.equal(result.batch.cancellation.reason, 'Cancelled by user');
        assert.deepEqual(
            result.batch.rows.map((row: { outcome: string }) => row.outcome),
            ['harness_error', 'not_run', 'not_run'],
        );
        assert.equal(await readFile(signalLog, 'utf8'), 'CANCEL\n');
    }
});

test('actual npm original directory controls relative space-containing interpreter argv', async (t) => {
    const { spawn } = await import('node:child_process');
    const root = await fixture(t);
    const packageDirectory = path.join(root, 'smoke');
    const captured = path.join(root, 'captured.json');
    const wrapper = path.join(packageDirectory, 'fixture.mjs');
    await writeFile(
        wrapper,
        `import {writeFileSync} from 'node:fs';import {runGUIBootstrap} from ${JSON.stringify(bootstrapURL)};
const result=await runGUIBootstrap(process.argv.slice(2),{checkoutDirectory:${JSON.stringify(root)},packageDirectory:${JSON.stringify(packageDirectory)},loadCommand:async()=>({runGUICommand:async(options,services)=>{writeFileSync(${JSON.stringify(captured)},JSON.stringify(options));return {exitCode:0,result:services.batch};}}),output:()=>{}});process.exitCode=result.exitCode;`,
    );
    await writeFile(
        path.join(packageDirectory, 'package.json'),
        JSON.stringify({
            scripts: {
                fixture: `${JSON.stringify(process.execPath)} ${JSON.stringify(wrapper)}`,
            },
        }),
    );
    const child = spawn(
        'npm',
        [
            '--prefix',
            packageDirectory,
            'run',
            'fixture',
            '--',
            '--build',
            '/Applications/Code With Spaces.app',
            '--python-interpreter',
            'relative directory/python',
        ],
        { cwd: root, stdio: 'ignore' },
    );
    const exit = await new Promise<number | null>((resolve, reject) => {
        child.once('error', reject);
        child.once('close', resolve);
    });
    assert.equal(exit, 0);
    const options = JSON.parse(await readFile(captured, 'utf8'));
    const npmOriginalDirectory = await realpath(root);
    assert.equal(options.invocationCwd, npmOriginalDirectory);
    assert.equal(
        options.pythonInterpreter,
        path.join(npmOriginalDirectory, 'relative directory/python'),
    );
    assert.equal(options.buildPath, '/Applications/Code With Spaces.app');
});
