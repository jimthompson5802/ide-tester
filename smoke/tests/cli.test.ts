import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkoutRoot, executeCLI } from '../src/cli.js';

test('default checkout is the canonical directory path required by preservation checks', async () => {
    assert.equal(checkoutRoot, await realpath(checkoutRoot));
});

test('CLI reports invalid arguments and missing installed apps as nonzero without GUI execution', async (t) => {
    const checkout = await mkdtemp(join(tmpdir(), 'smoke-cli-test-'));
    t.after(() => rm(checkout, { recursive: true, force: true }));
    const messages: string[] = [];
    for (const args of [
        [],
        ['--build', join(checkout, 'Missing.app'), '--suite', 'basic'],
    ]) {
        assert.equal(
            await executeCLI(
                [...args, '--output', 'json'],
                checkout,
                false,
                (message) => messages.push(message),
            ),
            1,
        );
        const message = messages.at(-1)!;
        assert.match(message, /blocked/);
        const output = JSON.parse(message);
        const result = JSON.parse(await readFile(output.resultPath, 'utf8'));
        t.after(() =>
            rm(result.resourcesPath, { recursive: true, force: true }),
        );
        assert.equal(
            await readFile(
                output.resultPath.replace(/result.json$/, 'result.txt'),
                'utf8',
            ),
            (await import('../src/report.js')).formatResult(result) + '\n',
        );
        assert.equal(result.outcome, 'blocked');
        assert.equal(result.mockRequestCount, 0);
        assert.equal(result.cleanup.reservationRetained, false);
    }
    assert.match(messages[1], /ENOENT/);
    assert.equal(JSON.parse(messages[1]).scope, 'selected-suites');
});

test('default summary is saved beside unchanged JSON for both commands', async (t) => {
    const checkout = await mkdtemp(join(tmpdir(), 'smoke-text-test-'));
    t.after(() => rm(checkout, { recursive: true, force: true }));
    for (const qualify of [false, true]) {
        let message = '';
        assert.equal(
            await executeCLI([], checkout, qualify, (text) => {
                message = text;
            }),
            1,
        );
        assert.match(message, /Smoke test: BLOCKED/);
        const path = message.match(/JSON report: (.+)/)![1];
        assert.equal(
            await readFile(path.replace(/result.json$/, 'result.txt'), 'utf8'),
            message + '\n',
        );
        const saved = JSON.parse(await readFile(path, 'utf8'));
        t.after(() =>
            rm(saved.resourcesPath, { recursive: true, force: true }),
        );
        assert.equal(saved.scope, qualify ? 'foundation' : 'selected-suites');
        assert.equal(saved.checks, undefined);
        assert.equal(saved.output, undefined);
    }
});

test('an existing reservation produces an honest early harness error in both modes', async (t) => {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const checkout = await mkdtemp(join(tmpdir(), 'smoke-reserved-test-'));
    t.after(() => rm(checkout, { recursive: true, force: true }));
    await mkdir(join(checkout, 'reports/smoke'), { recursive: true });
    await writeFile(
        join(checkout, 'reports/smoke/.reservation'),
        'owned elsewhere',
    );
    for (const mode of ['text', 'json']) {
        let message = '';
        assert.equal(
            await executeCLI(['--output', mode], checkout, false, (value) => {
                message = value;
            }),
            1,
        );
        if (mode === 'json')
            assert.equal(JSON.parse(message).outcome, 'harness_error');
        else assert.match(message, /Smoke test: HARNESS ERROR/);
    }
});

test('invalid output is blocked and still saves both reports', async (t) => {
    const checkout = await mkdtemp(join(tmpdir(), 'smoke-output-test-'));
    t.after(() => rm(checkout, { recursive: true, force: true }));
    let message = '';
    assert.equal(
        await executeCLI(
            ['--build', '/a.app', '--output', 'xml'],
            checkout,
            false,
            (value) => {
                message = value;
            },
        ),
        1,
    );
    assert.match(message, /--output must be text or json/);
    const path = message.match(/JSON report: (.+)/)![1];
    const result = JSON.parse(await readFile(path, 'utf8'));
    t.after(() => rm(result.resourcesPath, { recursive: true, force: true }));
    assert.equal(result.outcome, 'blocked');
    assert.equal(
        await readFile(path.replace(/result.json$/, 'result.txt'), 'utf8'),
        message + '\n',
    );
});

test('early argument failures retain the requested real backend and inapplicable mock evidence', async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'real-cli-report-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    let message = '';
    const code = await executeCLI(
        [
            '--build',
            '/missing.app',
            '--suite',
            'editing',
            '--chat-backend',
            'real',
            '--output',
            'json',
        ],
        root,
        false,
        (value) => {
            message = value;
        },
    );
    assert.equal(code, 1);
    const result = JSON.parse(message);
    t.after(() => rm(result.resourcesPath, { recursive: true, force: true }));
    assert.equal(result.outcome, 'blocked');
    assert.equal(result.chatBackend, 'real');
    assert.equal(result.mockRequestEvidence, 'inapplicable');
    assert.equal(result.mockRequestCount, null);
});

test('recoverable Git-only argument failures keep Chat and mock evidence inapplicable', async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'git-cli-early-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    let message = '';
    await executeCLI(
        ['--suite', 'git', '--output', 'json'],
        root,
        false,
        (value) => {
            message = value;
        },
    );
    const result = JSON.parse(message);
    t.after(() => rm(result.resourcesPath, { recursive: true, force: true }));
    assert.equal(result.suites, 'git');
    assert.equal(result.chatSelected, false);
    assert.equal(result.mockRequestEvidence, 'inapplicable');
    assert.equal(result.mockRequestCount, null);
    assert.equal(result.requests, null);
});

test('Git foundation rejection and reserved-run errors preserve Git-only metadata', async (t) => {
    const { writeFile } = await import('node:fs/promises');
    const root = await mkdtemp(join(tmpdir(), 'git-cli-contract-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    let message = '';
    await executeCLI(
        ['--build', '/a.app', '--suite', 'git', '--output', 'json'],
        root,
        true,
        (v) => {
            message = v;
        },
    );
    const foundation = JSON.parse(message);
    t.after(() =>
        rm(foundation.resourcesPath, { recursive: true, force: true }),
    );
    assert.match(foundation.error, /Foundation/);
    assert.equal(foundation.mockRequestEvidence, 'inapplicable');
    assert.equal(foundation.chatSelected, false);
    await writeFile(
        join(root, 'reports/smoke/.reservation'),
        'reserved elsewhere',
    );
    await executeCLI(
        ['--suite', 'git', '--output', 'json'],
        root,
        false,
        (v) => {
            message = v;
        },
    );
    const reserved = JSON.parse(message);
    assert.equal(reserved.outcome, 'harness_error');
    assert.equal(reserved.mockRequestCount, null);
    assert.equal(reserved.chatSelected, false);
});

test('Git-only text errors explicitly show Chat not selected', async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'git-cli-text-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    let text = '';
    await executeCLI(['--suite', 'git'], root, false, (v) => {
        text = v;
    });
    assert.match(text, /Chat: Not selected/);
    assert.match(text, /Mock request evidence: Inapplicable/);
    assert.doesNotMatch(text, /Chat backend: mock/);
    const path = text.match(/JSON report: (.+)/)![1];
    const result = JSON.parse(await readFile(path, 'utf8'));
    t.after(() => rm(result.resourcesPath, { recursive: true, force: true }));
});

test('Python early errors and unsupported foundation retain non-Chat metadata', async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'python-cli-early-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    for (const qualify of [false, true]) {
        let message = '';
        await executeCLI(
            ['--suite', 'python', '--output', 'json'],
            root,
            qualify,
            (value) => {
                message = value;
            },
        );
        const result = JSON.parse(message);
        t.after(() =>
            rm(result.resourcesPath, { recursive: true, force: true }),
        );
        assert.equal(result.outcome, 'blocked');
        assert.equal(result.chatSelected, false);
        assert.equal(result.mockRequestEvidence, 'inapplicable');
        assert.equal(result.mockRequestCount, null);
        assert.equal(result.requests, null);
    }
});

test('Python text and reservation errors retain inapplicable Chat evidence', async (t) => {
    const { writeFile } = await import('node:fs/promises');
    const root = await mkdtemp(join(tmpdir(), 'python-cli-contract-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    let message = '';
    await executeCLI(['--suite', 'python'], root, false, (value) => {
        message = value;
    });
    assert.match(message, /Chat: Not selected/);
    assert.match(message, /Mock request evidence: Inapplicable/);
    const path = message.match(/JSON report: (.+)/)![1];
    const saved = JSON.parse(await readFile(path, 'utf8'));
    t.after(() => rm(saved.resourcesPath, { recursive: true, force: true }));
    await writeFile(
        join(root, 'reports/smoke/.reservation'),
        'reserved elsewhere',
    );
    await executeCLI(
        ['--suite', 'python', '--output', 'json'],
        root,
        false,
        (value) => {
            message = value;
        },
    );
    const result = JSON.parse(message);
    assert.equal(result.outcome, 'harness_error');
    assert.equal(result.chatSelected, false);
    assert.equal(result.mockRequestEvidence, 'inapplicable');
    assert.equal(result.mockRequestCount, null);
    assert.equal(result.requests, null);
});

test('pre-requested CLI cancellation starts no run and preserves a single JSON result', async (t) => {
    const { Cancellation } = await import('../src/cancellation.js');
    const { access } = await import('node:fs/promises');
    const checkout = await mkdtemp(join(tmpdir(), 'smoke-cli-cancel-'));
    t.after(() => rm(checkout, { recursive: true, force: true }));
    const cancellation = new Cancellation();
    cancellation.request();
    const messages: string[] = [];
    const code = await executeCLI(
        ['--build', '/missing.app', '--suite', 'git', '--output', 'json'],
        checkout,
        false,
        (value: string) => messages.push(value),
        cancellation,
    );
    assert.equal(code, 1);
    assert.equal(messages.length, 1);
    const result = JSON.parse(messages[0]);
    if (result.resourcesPath)
        t.after(() =>
            rm(result.resourcesPath, { recursive: true, force: true }),
        );
    assert.equal(result.outcome, 'harness_error');
    assert.equal(result.cancellation.reason, 'Cancelled by user');
    assert.equal(result.runId, undefined);
    assert.equal(result.cleanup, undefined);
    assert.equal(result.chatSelected, false);
    await assert.rejects(access(join(checkout, 'reports/smoke/.reservation')));
});

test('a disposable executable handles real repeated signals without contaminating JSON or leaking listeners', async (t) => {
    const { spawn } = await import('node:child_process');
    const checkout = await mkdtemp(join(tmpdir(), 'smoke-cli-signals-'));
    t.after(() => rm(checkout, { recursive: true, force: true }));
    const script = `
        import { executeCLI } from ${JSON.stringify(new URL('../src/cli.js', import.meta.url).href)};
        import { Cancellation, installCancellationHandlers } from ${JSON.stringify(new URL('../src/cancellation.js', import.meta.url).href)};
        import { setTimeout } from 'node:timers/promises';
        const cancellation = new Cancellation();
        const baseline = ['SIGINT', 'SIGTERM'].map(signal => process.listenerCount(signal));
        const dispose = installCancellationHandlers(cancellation, message => process.stderr.write(message + '\\n'));
        const keepAlive = globalThis.setInterval(() => {}, 1000);
        process.stderr.write('READY\\n');
        try {
            await cancellation.perform(() => new Promise(() => {}));
        } catch {
            await setTimeout(100);
            process.exitCode = await executeCLI(['--output', 'json'], process.argv[1], false, console.log, cancellation);
        } finally {
            globalThis.clearInterval(keepAlive);
            dispose();
            const counts = ['SIGINT', 'SIGTERM'].map(signal => process.listenerCount(signal));
            if (JSON.stringify(counts) !== JSON.stringify(baseline)) throw new Error('Signal listeners leaked');
        }
    `;
    const child = spawn(
        process.execPath,
        ['--input-type=module', '-e', script, checkout],
        { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const exited = new Promise<{
        code: number | null;
        signal: NodeJS.Signals | null;
    }>((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', (code, signal) => resolve({ code, signal }));
    });
    t.after(async () => {
        if (child.exitCode === null && child.signalCode === null)
            child.kill('SIGKILL');
        await exited;
    });
    let stdout = '';
    let stderr = '';
    child.stdout!.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
    });
    child.stderr!.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
    });
    const until = async (pattern: RegExp): Promise<void> => {
        const deadline = Date.now() + 2000;
        while (!pattern.test(stderr)) {
            if (
                Date.now() >= deadline ||
                child.exitCode !== null ||
                child.signalCode !== null
            )
                assert.fail(
                    `Disposable signal fixture did not reach ${pattern}: ${stderr}`,
                );
            await new Promise((resolve) => setTimeout(resolve, 5));
        }
    };
    await until(/READY/);
    child.kill('SIGINT');
    await until(/Cancellation requested/);
    child.kill('SIGTERM');
    await until(/Owned shutdown is pending/);
    assert.deepEqual(await exited, { code: 1, signal: null });
    const result = JSON.parse(stdout.trim());
    assert.equal(result.outcome, 'harness_error');
    assert.equal(result.cancellation.reason, 'Cancelled by user');
    assert.doesNotMatch(stdout, /pending|READY/);
});
