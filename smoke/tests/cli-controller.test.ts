import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    mkdtemp,
    writeFile,
    readFile,
    rm,
    access,
    cp,
    mkdir,
    symlink,
} from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { runCLIController } from '../src/cli-controller.js';
import { Cancellation } from '../src/cancellation.js';

test('standard CLI executable uses its isolated checkout and returns final worker evidence', async (t) => {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const root = await mkdtemp('/private/tmp/controller-executable-');
    const resources: { path?: string } = {};
    t.after(async () => {
        if (resources.path) await rm(resources.path, { recursive: true });
        await rm(root, { recursive: true });
    });
    const target = join(root, 'smoke/dist/src');
    await mkdir(target, { recursive: true });
    await cp(new URL('../src/', import.meta.url), target, { recursive: true });
    await writeFile(join(root, 'smoke/package.json'), '{"type":"module"}');
    await symlink(
        new URL('../../node_modules', import.meta.url).pathname,
        join(root, 'smoke/node_modules'),
    );
    let stdout = '';
    try {
        await promisify(execFile)(process.execPath, [
            join(target, 'cli.js'),
            '--build',
            '/missing-r2.app',
            '--suite',
            'editing',
            '--output',
            'json',
        ]);
        assert.fail('missing app must not pass');
    } catch (error) {
        assert.ok(error && typeof error === 'object' && 'stdout' in error);
        stdout = String(error.stdout);
    }
    const result = JSON.parse(stdout);
    resources.path = result.resourcesPath;
    assert.equal(result.outcome, 'blocked');
    assert.equal(result.suites, 'editing');
    assert.ok(result.resultPath.startsWith(root));
    assert.equal(result.cleanup.reservationRetained, false);
    assert.deepEqual(
        JSON.parse(await readFile(result.resultPath, 'utf8')),
        result,
    );
    assert.match(
        await readFile(
            join(root, 'reports/smoke', result.runId, 'result.txt'),
            'utf8',
        ),
        /BLOCKED/,
    );
});

test('ordinary successful worker result remains zero and preserves all evidence', async (t) => {
    const root = await mkdtemp('/private/tmp/controller-success-');
    t.after(() => rm(root, { recursive: true }));
    const entry = join(root, 'case.mjs');
    await writeFile(
        entry,
        `import {parentPort} from 'node:worker_threads';parentPort.postMessage({outcome:'passed',versions:{fixture:'inert'},cleanup:{disposition:'removed',reservationRetained:false,errors:[]}});parentPort.close();`,
    );
    const before = ['SIGINT', 'SIGTERM'].map((signal) =>
        process.listenerCount(signal),
    );
    let output = '';
    assert.equal(
        await runCLIController(['--output', 'json'], root, {
            workerURL: pathToFileURL(entry),
            output: (value) => {
                output = value;
            },
        }),
        0,
    );
    assert.equal(JSON.parse(output).versions.fixture, 'inert');
    assert.deepEqual(
        ['SIGINT', 'SIGTERM'].map((signal) => process.listenerCount(signal)),
        before,
    );
});

test('production worker preserves early CLI evidence and saves both reports', async (t) => {
    const root = await mkdtemp('/private/tmp/controller-cli-');
    const resources: { path?: string } = {};
    t.after(async () => {
        if (resources.path) await rm(resources.path, { recursive: true });
        await rm(root, { recursive: true });
    });
    const messages: string[] = [];
    assert.equal(
        await runCLIController(
            ['--suite', 'python', '--output', 'json'],
            root,
            { output: (value) => messages.push(value) },
        ),
        1,
    );
    assert.equal(messages.length, 1);
    const result = JSON.parse(messages[0]);
    resources.path = result.resourcesPath;
    assert.equal(result.outcome, 'blocked');
    assert.equal(result.chatSelected, false);
    assert.equal(result.requests, null);
    assert.equal(result.versions.node, process.version);
    assert.equal(result.suites, 'python');
    assert.equal(result.cleanup.reservationRetained, false);
    assert.deepEqual(
        JSON.parse(await readFile(result.resultPath, 'utf8')),
        result,
    );
    assert.match(
        await readFile(
            join(root, 'reports/smoke', result.runId, 'result.txt'),
            'utf8',
        ),
        /Chat: Not selected/,
    );
    await assert.rejects(access(join(root, 'reports/smoke/.reservation')));
});

test('passed worker evidence requires safe cleanup and cannot contradict cancellation', async (t) => {
    const root = await mkdtemp('/private/tmp/controller-contradiction-');
    t.after(() => rm(root, { recursive: true }));
    const entry = join(root, 'case.mjs');
    for (const result of [
        { outcome: 'passed' },
        {
            outcome: 'passed',
            cleanup: {
                disposition: 'retained',
                reservationRetained: true,
                errors: [],
            },
        },
        {
            outcome: 'passed',
            cleanup: {
                disposition: 'removed',
                reservationRetained: false,
                errors: ['uncertain'],
            },
        },
        {
            outcome: 'passed',
            cancellation: { reason: 'Cancelled by user' },
            cleanup: {
                disposition: 'removed',
                reservationRetained: false,
                errors: [],
            },
        },
    ]) {
        await writeFile(
            entry,
            `import {parentPort} from 'node:worker_threads';parentPort.postMessage(${JSON.stringify(result)});parentPort.close();`,
        );
        let output = '';
        assert.equal(
            await runCLIController(['--output', 'json'], root, {
                workerURL: pathToFileURL(entry),
                output: (value) => {
                    output = value;
                },
            }),
            1,
        );
        assert.equal(JSON.parse(output).outcome, 'harness_error');
    }
});

test('pre-requested cancellation admits no production worker run or reservation', async (t) => {
    const root = await mkdtemp('/private/tmp/controller-pre-');
    t.after(() => rm(root, { recursive: true }));
    const cancellation = new Cancellation();
    cancellation.request();
    let output = '';
    assert.equal(
        await runCLIController(['--output', 'json'], root, {
            cancellation,
            output: (value) => {
                output = value;
            },
        }),
        1,
    );
    const result = JSON.parse(output);
    assert.equal(result.cancellation.reason, 'Cancelled by user');
    assert.equal(result.runId, undefined);
    await assert.rejects(access(join(root, 'reports')));
});

test('worker exit and invalid evidence never become successful cleanup', async (t) => {
    const root = await mkdtemp('/private/tmp/controller-fail-');
    t.after(() => rm(root, { recursive: true }));
    for (const source of [
        'throw new Error("private worker detail");',
        'process.exit(0);',
        'parentPort.postMessage({outcome:"passed",checks:[null]});parentPort.close();',
        'parentPort.postMessage({outcome:"passed"});parentPort.postMessage({outcome:"passed"});parentPort.close();',
        'parentPort.postMessage({outcome:"passed"});process.exitCode=2;parentPort.close();',
    ]) {
        const entry = join(root, 'case.mjs');
        await writeFile(
            entry,
            `import {parentPort} from 'node:worker_threads';${source}`,
        );
        const messages: string[] = [];
        const before = ['SIGINT', 'SIGTERM'].map((signal) =>
            process.listenerCount(signal),
        );
        const code = await runCLIController(['--output', 'json'], root, {
            workerURL: pathToFileURL(entry),
            output: (value) => messages.push(value),
        });
        assert.equal(code, 1);
        assert.equal(messages.length, 1);
        const result = JSON.parse(messages[0]);
        assert.equal(result.outcome, 'harness_error');
        assert.match(result.error, /worker/i);
        assert.equal(result.cleanup, undefined);
        assert.doesNotMatch(messages[0], /private worker detail/);
        assert.deepEqual(
            ['SIGINT', 'SIGTERM'].map((signal) =>
                process.listenerCount(signal),
            ),
            before,
        );
    }
});

test('controller awaits worker exit, forwards once and reconciles late cancellation before reporting', async (t) => {
    const root = await mkdtemp('/private/tmp/controller-late-');
    t.after(() => rm(root, { recursive: true }));
    const entry = join(root, 'late.mjs');
    const resultPath = join(root, 'result.json');
    const marker = join(root, 'settled');
    await writeFile(
        entry,
        `import {parentPort,workerData} from 'node:worker_threads';import {writeFileSync} from 'node:fs';
const root=workerData.checkout;let count=0;parentPort.on('message',()=>count++);
const result={outcome:'passed',suites:'editing',custom:{kept:true},resultPath:root+'/result.json',cleanup:{disposition:'removed',reservationRetained:false,errors:[]}};
writeFileSync(result.resultPath,JSON.stringify(result));parentPort.postMessage(result);
setTimeout(()=>{writeFileSync(root+'/settled',String(count));parentPort.close()},150);`,
    );
    let signals: NodeJS.Timeout | undefined;
    const statuses: string[] = [];
    let output = '';
    // A filesystem observation schedules cancellation after result persistence but before worker exit.
    signals = setInterval(() => {
        readFile(resultPath)
            .then(() => {
                if (!signals) return;
                clearInterval(signals);
                signals = undefined;
                process.emit('SIGINT');
                process.emit('SIGTERM');
            })
            .catch(() => {});
    }, 5);
    t.after(() => clearInterval(signals));
    const code = await runCLIController(['--output', 'json'], root, {
        workerURL: pathToFileURL(entry),
        output: (value) => {
            output = value;
        },
        statusOutput: (value) => statuses.push(value),
    });
    assert.equal(code, 1);
    assert.equal(await readFile(marker, 'utf8'), '1');
    const result = JSON.parse(output);
    assert.equal(result.cancellation.reason, 'Cancelled by user');
    assert.equal(result.originating.outcome, 'passed');
    assert.equal(result.custom.kept, true);
    assert.deepEqual(JSON.parse(await readFile(resultPath, 'utf8')), result);
    assert.match(
        await readFile(join(root, 'result.txt'), 'utf8'),
        /Cancelled by user/,
    );
    assert.equal(statuses.length, 2);
    assert.match(statuses[1], /pending/);
});

test('controller invoked from Node eval preserves the existing reservation error', async () => {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const root = await mkdtemp('/private/tmp/controller-entry-');
    // An existing reservation blocks before launch; its bytes must remain intact.
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(root, 'reports/smoke'), { recursive: true });
    await writeFile(
        join(root, 'reports/smoke/.reservation'),
        'owned elsewhere',
    );
    try {
        // The public controller entry accepts a checkout at this test seam, never a production override flag.
        const script = `import {runCLIController} from ${JSON.stringify(new URL('../src/cli-controller.js', import.meta.url).href)};process.exitCode=await runCLIController(['--output','json'],process.argv[1]);`;
        try {
            await promisify(execFile)(process.execPath, [
                '--input-type=module',
                '-e',
                script,
                root,
            ]);
            assert.fail('expected nonzero');
        } catch (error) {
            assert.ok(error && typeof error === 'object' && 'stdout' in error);
            assert.equal(
                JSON.parse(String(error.stdout)).outcome,
                'harness_error',
            );
            assert.match(
                JSON.parse(String(error.stdout)).error,
                /reservation/i,
            );
        }
        assert.equal(
            await readFile(join(root, 'reports/smoke/.reservation'), 'utf8'),
            'owned elsewhere',
        );
    } finally {
        await rm(root, { recursive: true });
    }
});
