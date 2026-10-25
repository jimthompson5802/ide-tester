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

test('failed build never imports stale compiled GUI code and persists all suites not run', async (t) => {
    const root = await fixture(t);
    const { runGUIBootstrap } = await import(bootstrapURL);
    let loaded = false;
    const output: string[] = [];
    const result = await runGUIBootstrap(
        [
            '--build',
            '/Applications/Code.app',
            '--python-interpreter',
            'python with spaces',
        ],
        {
            checkoutDirectory: root,
            packageDirectory: path.join(root, 'smoke'),
            invocationCwd: root,
            spawnBuild: async () => ({ code: 2, signal: null }),
            loadCommand: async () => {
                loaded = true;
                throw new Error('stale import');
            },
            output: (message: string) => output.push(message),
        },
    );
    assert.equal(result.exitCode, 1);
    assert.equal(loaded, false);
    assert.equal(result.batch.build.state, 'harness_error');
    assert.deepEqual(
        result.batch.rows.map((row: { outcome: string }) => row.outcome),
        ['not_run', 'not_run', 'not_run'],
    );
    const saved = JSON.parse(
        await readFile(path.join(result.directory, 'result.json'), 'utf8'),
    );
    assert.equal(saved.build.state, 'harness_error');
    assert.match(output.join('\n'), /basic/);
    assert.match(output.join('\n'), /python/);
});

test('syntax fails before storage, build or compiled import', async (t) => {
    const root = await fixture(t);
    const { runGUIBootstrap } = await import(bootstrapURL);
    let built = false;
    const result = await runGUIBootstrap(['--suite', 'git'], {
        checkoutDirectory: root,
        spawnBuild: async () => {
            built = true;
            return { code: 0 };
        },
        output: () => {},
    });
    assert.equal(result.exitCode, 1);
    assert.equal(built, false);
});

test('real disposable Node build completes before compiled module loads with original argv intact', async (t) => {
    const root = await fixture(t);
    const { runGUIBootstrap } = await import(bootstrapURL);
    const marker = path.join(root, 'build-finished');
    const build = path.join(root, 'build.mjs');
    await writeFile(
        build,
        `import {writeFile} from 'node:fs/promises'; await writeFile(${JSON.stringify(marker)}, 'done');`,
    );
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
            buildCommand: { executable: process.execPath, args: [build] },
            loadCommand: async () => ({
                runGUICommand: async (options: any, services: any) => {
                    assert.equal(await readFile(marker, 'utf8'), 'done');
                    assert.equal(
                        options.buildPath,
                        '/Applications/Code With Spaces.app',
                    );
                    assert.equal(
                        options.pythonInterpreter,
                        path.join(root, 'bin/python with spaces'),
                    );
                    assert.equal(
                        JSON.parse(
                            await readFile(
                                path.join(services.directory, 'result.json'),
                                'utf8',
                            ),
                        ).build.state,
                        'passed',
                    );
                    return {
                        exitCode: 0,
                        batch: services.batch,
                        directory: services.directory,
                    };
                },
            }),
            output: () => {},
        },
    );
    assert.equal(result.exitCode, 0);
});

test('npm foreground-group and direct wrapper signals deliver one cancellation to isolated owned child', async (t) => {
    const { spawn } = await import('node:child_process');
    for (const groupSignal of [true, false]) {
        const root = await fixture(t);
        const ready = path.join(root, 'ready');
        const childPid = path.join(root, 'child-pid');
        const signals = path.join(root, 'signals');
        const finished = path.join(root, 'finished');
        const wrapperPid = path.join(root, 'wrapper-pid');
        const childFile = path.join(root, 'child.mjs');
        await writeFile(
            childFile,
            `import {writeFileSync,appendFileSync} from 'node:fs';
process.on('SIGINT',()=>{appendFileSync(${JSON.stringify(signals)},'SIGINT\\n');setTimeout(()=>process.exit(1),80);});
writeFileSync(${JSON.stringify(childPid)},String(process.pid));writeFileSync(${JSON.stringify(ready)},'ready');setInterval(()=>{},1000);`,
        );
        const wrapper = path.join(root, 'wrapper.mjs');
        await writeFile(
            wrapper,
            `import {writeFileSync} from 'node:fs';
import {runGUIBootstrap} from ${JSON.stringify(bootstrapURL)};
writeFileSync(${JSON.stringify(wrapperPid)},String(process.pid));
const result=await runGUIBootstrap(['--build','/Applications/Code.app','--python-interpreter','python'],{
checkoutDirectory:${JSON.stringify(root)},packageDirectory:${JSON.stringify(path.join(root, 'smoke'))},
buildCommand:{executable:process.execPath,args:[${JSON.stringify(childFile)}]},output:()=>{},errorOutput:()=>{},
loadCommand:async()=>{throw Error('must not import');}});
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
        const npmClosed = new Promise<void>((resolve) =>
            npm.once('close', () => resolve()),
        );
        t.after(() => {
            try {
                if (npm.pid) process.kill(-npm.pid, 'SIGKILL');
            } catch {
                /* Already exited. */
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
            throw new Error(`Fixture did not produce ${path.basename(file)}`);
        };
        await waitFor(ready);
        const ownedChildPid = Number(await readFile(childPid, 'utf8'));
        t.after(() => {
            try {
                process.kill(ownedChildPid, 'SIGKILL');
            } catch {
                /* Already exited. */
            }
        });
        const pid = Number(await waitFor(wrapperPid));
        process.kill(groupSignal ? -npm.pid! : pid, 'SIGINT');
        await new Promise((resolve) => setTimeout(resolve, 20));
        process.kill(pid, 'SIGTERM');
        const result = JSON.parse(await waitFor(finished));
        await npmClosed;
        assert.equal(result.exitCode, 1);
        assert.equal(result.batch.cancellation.reason, 'Cancelled by user');
        assert.equal(await readFile(signals, 'utf8'), 'SIGINT\n');
        assert.deepEqual(
            result.batch.rows.map((row: { outcome: string }) => row.outcome),
            ['not_run', 'not_run', 'not_run'],
        );
    }
});

test('build spawn errors and signal exits never load compiled modules or leak signal listeners', async (t) => {
    const root = await fixture(t);
    const { runGUIBootstrap } = await import(bootstrapURL);
    const before = [
        process.listenerCount('SIGINT'),
        process.listenerCount('SIGTERM'),
    ];
    for (const status of [
        { code: null, signal: 'SIGTERM' },
        { code: null, error: true },
    ]) {
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
                spawnBuild: async () => status,
                loadCommand: async () => {
                    imports++;
                },
                output: () => {},
            },
        );
        assert.equal(result.exitCode, 1);
        assert.equal(imports, 0);
        assert.equal(result.batch.state, 'completed');
    }
    assert.deepEqual(
        [process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')],
        before,
    );
});

test('cancellation during initial aggregate creation saves interruption and starts no build', async (t) => {
    const root = await fixture(t);
    const { runGUIBootstrap } = await import(bootstrapURL);
    const { createGUIReport } = await import(
        new URL('../../scripts/gui-bootstrap-report.mjs', import.meta.url).href
    );
    let builds = 0;
    const result = await runGUIBootstrap(
        ['--build', '/Applications/Code.app', '--python-interpreter', 'python'],
        {
            checkoutDirectory: root,
            createReport: async () => {
                process.emit('SIGINT');
                return createGUIReport(root);
            },
            spawnBuild: async () => {
                builds++;
                return { code: 1 };
            },
            output: () => {},
            errorOutput: () => {},
        },
    );
    assert.equal(builds, 0);
    assert.equal(result.batch.cancellation.reason, 'Cancelled by user');
    assert.equal(
        JSON.parse(
            await readFile(path.join(result.directory, 'result.json'), 'utf8'),
        ).cancellation.reason,
        'Cancelled by user',
    );
});

test('default dynamic import reads only freshly built disposable compiled module', async (t) => {
    const root = await fixture(t);
    const { runGUIBootstrap } = await import(bootstrapURL);
    const packageDirectory = path.join(root, 'smoke');
    const target = path.join(packageDirectory, 'dist/src/gui-command.js');
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(
        path.join(packageDirectory, 'package.json'),
        '{"type":"module"}',
    );
    const marker = path.join(root, 'imported');
    const build = path.join(root, 'build-module.mjs');
    await writeFile(
        target,
        `import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(marker)},'stale');throw Error('stale');`,
    );
    const failed = await runGUIBootstrap(
        ['--build', '/Applications/Code.app', '--python-interpreter', 'python'],
        {
            checkoutDirectory: root,
            packageDirectory,
            buildCommand: {
                executable: process.execPath,
                args: ['-e', 'process.exit(2)'],
            },
            output: () => {},
        },
    );
    assert.equal(failed.exitCode, 1);
    await assert.rejects(readFile(marker), { code: 'ENOENT' });
    await writeFile(
        build,
        `import {writeFile} from 'node:fs/promises';await writeFile(${JSON.stringify(target)},${JSON.stringify(`import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(marker)},'fresh');export async function runGUICommand(options,services){return {exitCode:0,result:services.batch};}`)});`,
    );
    const passed = await runGUIBootstrap(
        ['--build', '/Applications/Code.app', '--python-interpreter', 'python'],
        {
            checkoutDirectory: root,
            packageDirectory,
            buildCommand: { executable: process.execPath, args: [build] },
            output: () => {},
        },
    );
    assert.equal(passed.exitCode, 0);
    assert.equal(await readFile(marker, 'utf8'), 'fresh');
    const missing = await runGUIBootstrap(
        ['--build', '/Applications/Code.app', '--python-interpreter', 'python'],
        {
            checkoutDirectory: root,
            packageDirectory,
            buildCommand: {
                executable: path.join(root, 'absent-executable'),
                args: [],
            },
            output: () => {},
        },
    );
    assert.equal(missing.exitCode, 1);
    assert.equal(missing.batch.build.state, 'harness_error');
});

test('real filesystem initialization and running-record failures prevent build and import', async (t) => {
    const { createGUIReport } = await import(
        new URL('../../scripts/gui-bootstrap-report.mjs', import.meta.url).href
    );
    const { runGUIBootstrap } = await import(bootstrapURL);
    for (const duringSave of [false, true]) {
        const root = await fixture(t);
        if (!duringSave)
            await writeFile(path.join(root, 'reports'), 'not a directory');
        let builds = 0;
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
                spawnBuild: async () => {
                    builds++;
                    return { code: 0 };
                },
                loadCommand: async () => {
                    imports++;
                },
                output: () => {},
            },
        );
        assert.equal(result.exitCode, 1);
        assert.equal(builds, 0);
        assert.equal(imports, 0);
    }
});

test('cancellation during final failed-build persistence is reconciled durably', async (t) => {
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
            spawnBuild: async () => ({ code: 2 }),
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
const result=await runGUIBootstrap(['--build','/Applications/Code.app','--python-interpreter',${JSON.stringify(interpreter)}],{checkoutDirectory:${JSON.stringify(root)},packageDirectory:${JSON.stringify(packageDirectory)},buildCommand:{executable:process.execPath,args:['-e','']},output:()=>{},errorOutput:()=>{}});
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
const result=await runGUIBootstrap(process.argv.slice(2),{checkoutDirectory:${JSON.stringify(root)},packageDirectory:${JSON.stringify(packageDirectory)},buildCommand:{executable:process.execPath,args:['-e','']},loadCommand:async()=>({runGUICommand:async(options,services)=>{writeFileSync(${JSON.stringify(captured)},JSON.stringify(options));return {exitCode:0,result:services.batch};}}),output:()=>{}});process.exitCode=result.exitCode;`,
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
