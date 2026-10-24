import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runGUICommand } from '../src/gui-command.js';
import { createGUIRecord } from '../src/gui-report.js';

test('missing interpreter blocks every GUI launch and retains all summary entries', async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'gui-command-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const result = await runGUICommand(
        {
            buildPath: '/Applications/Test.app',
            pythonInterpreter: 'missing',
            invocationCwd: directory,
        },
        {
            batch: createGUIRecord('fixture'),
            save: async () => {},
            output: () => {},
            smokeDirectory: directory,
            spawn: () => {
                throw new Error('GUI must not start');
            },
        },
    );
    assert.equal(result.exitCode, 1);
    assert.equal(result.result.outcome, 'blocked');
    assert.deepEqual(
        result.result.rows.map((row) => row.outcome),
        ['not_run', 'not_run', 'not_run'],
    );
});

import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { spawn } from 'node:child_process';

const passed = {
    outcome: 'passed',
    durationMs: 12,
    cleanup: { disposition: 'removed', reservationRetained: false, errors: [] },
};
function childFactory(results: unknown[], seen: string[][]): typeof spawn {
    return ((_executable: string, args: string[]) => {
        seen.push(args);
        const child = Object.assign(new EventEmitter(), {
            stdout: new PassThrough(),
            stderr: new PassThrough(),
            kill: () => true,
        });
        queueMicrotask(() => {
            child.stdout.end(JSON.stringify(results[seen.length - 1]));
            child.stderr.end('private diagnostics');
            child.emit(
                'close',
                (results[seen.length - 1] as { outcome?: string })?.outcome ===
                    'passed'
                    ? 0
                    : 1,
                null,
            );
        });
        return child;
    }) as unknown as typeof spawn;
}

test('suites run in exact order with routed paths and successful cleanup', async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'gui-order-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    await writeFile(join(directory, 'python with spaces'), 'fixture');
    const seen: string[][] = [];
    const messages: string[] = [];
    const batch = createGUIRecord('ordered');
    const result = await runGUICommand(
        {
            buildPath: '/Applications/Test.app',
            pythonInterpreter: 'python with spaces',
            invocationCwd: directory,
        },
        {
            batch,
            save: async () => {},
            output: (message) => messages.push(message),
            smokeDirectory: directory,
            spawn: childFactory([passed, passed, passed], seen),
        },
    );
    assert.equal(result.exitCode, 0);
    assert.deepEqual(
        seen.map((args) => args[args.indexOf('--suite') + 1]),
        ['basic', 'git', 'python'],
    );
    assert.ok(seen[0].includes('real'));
    assert.ok(!seen[1].includes('--python-interpreter'));
    assert.equal(seen[2].at(-1), join(directory, 'python with spaces'));
    assert.equal(messages.join('').includes('private diagnostics'), false);
    assert.equal(result.result.state, 'completed');
});

test('each unsuccessful position stops later suites and preserves observed reporting and cleanup errors', async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'gui-failures-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    await writeFile(join(directory, 'python'), 'fixture');
    for (const failure of [
        { ...passed, outcome: 'failed' },
        { ...passed, outcome: 'blocked' },
        { ...passed, reportingError: 'Unable to save text' },
        {
            ...passed,
            cleanup: {
                disposition: 'removed',
                reservationRetained: true,
                errors: ['exit uncertain'],
            },
        },
        { ...passed, cleanup: undefined },
        { ...passed, suites: 'editing' },
        { ...passed, durationMs: -1 },
    ]) {
        for (let position = 0; position < 3; position++) {
            const seen: string[][] = [];
            const responses = [passed, passed, passed];
            responses[position] = failure as typeof passed;
            const result = await runGUICommand(
                {
                    buildPath: '/Applications/Test.app',
                    pythonInterpreter: 'python',
                    invocationCwd: directory,
                },
                {
                    batch: createGUIRecord('failure'),
                    save: async () => {},
                    output: () => {},
                    smokeDirectory: directory,
                    spawn: childFactory(responses, seen),
                },
            );
            assert.equal(result.exitCode, 1);
            assert.equal(seen.length, position + 1);
            if (failure.outcome === 'failed' || failure.outcome === 'blocked')
                assert.equal(
                    result.result.rows[position].outcome,
                    failure.outcome,
                );
            assert.ok(
                result.result.rows
                    .slice(position + 1)
                    .every((row) => row.outcome === 'not_run'),
            );
            if ('reportingError' in failure)
                assert.equal(
                    result.result.rows[position].reportingError,
                    failure.reportingError,
                );
        }
    }
});

class Interrupted {
    requested = false;
    private listeners = new Set<() => void>();
    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    request(): void {
        this.requested = true;
        for (const listener of this.listeners) listener();
    }
    get listenerCount(): number {
        return this.listeners.size;
    }
}

test('cancellation during final persistence preserves passed rows but commits nonzero cancellation', async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'gui-final-cancel-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    await writeFile(join(directory, 'python'), 'fixture');
    const cancellation = new Interrupted();
    const saved: string[] = [];
    const seen: string[][] = [];
    const result = await runGUICommand(
        {
            buildPath: '/Applications/Test.app',
            pythonInterpreter: 'python',
            invocationCwd: directory,
        },
        {
            batch: createGUIRecord('cancel'),
            save: async (batch) => {
                saved.push(JSON.stringify(batch));
                if (batch.state === 'completed' && !batch.cancellation)
                    cancellation.request();
            },
            output: () => {},
            smokeDirectory: directory,
            cancellation,
            spawn: childFactory([passed, passed, passed], seen),
        },
    );
    assert.equal(result.exitCode, 1);
    assert.ok(result.result.rows.every((row) => row.outcome === 'passed'));
    assert.equal(
        JSON.parse(saved.at(-1)!).cancellation.reason,
        'Cancelled by user',
    );
    assert.equal(cancellation.listenerCount, 0);
});

test('failed running-stage persistence prevents the corresponding launch', async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'gui-save-fail-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    await writeFile(join(directory, 'python'), 'fixture');
    const seen: string[][] = [];
    const result = await runGUICommand(
        {
            buildPath: '/Applications/Test.app',
            pythonInterpreter: 'python',
            invocationCwd: directory,
        },
        {
            batch: createGUIRecord('save'),
            save: async (batch) => {
                if (batch.state === 'running') throw new Error('disk full');
            },
            output: () => {},
            smokeDirectory: directory,
            spawn: childFactory([passed], seen),
        },
    );
    assert.equal(result.exitCode, 1);
    assert.equal(result.result.state, 'incomplete');
    assert.equal(seen.length, 0);
});

test('missing final child evidence remains incomplete and cancellation at progress boundary prevents spawn', async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'gui-boundary-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    await writeFile(join(directory, 'python'), 'fixture');
    const seen: string[][] = [];
    const cancellation = new Interrupted();
    const first = await runGUICommand(
        {
            buildPath: '/Applications/Test.app',
            pythonInterpreter: 'python',
            invocationCwd: directory,
        },
        {
            batch: createGUIRecord('missing-evidence'),
            save: async () => {},
            output: () => {},
            smokeDirectory: directory,
            spawn: childFactory([{ outcome: 'passed' }], seen),
        },
    );
    assert.equal(first.result.state, 'incomplete');
    seen.length = 0;
    const second = await runGUICommand(
        {
            buildPath: '/Applications/Test.app',
            pythonInterpreter: 'python',
            invocationCwd: directory,
        },
        {
            batch: createGUIRecord('boundary'),
            save: async () => {},
            output: (message) => {
                if (message.startsWith('Starting')) cancellation.request();
            },
            smokeDirectory: directory,
            cancellation,
            spawn: childFactory([passed], seen),
        },
    );
    assert.equal(second.exitCode, 1);
    assert.equal(seen.length, 0);
});

test('overflow drains both streams and requests owned cancellation once without subsequent launches', async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'gui-overflow-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    await writeFile(join(directory, 'python'), 'fixture');
    let signals = 0;
    let stdoutDrained = false;
    let stderrDrained = false;
    let launches = 0;
    const spawnChild = (() => {
        launches++;
        const child = Object.assign(new EventEmitter(), {
            stdout: new PassThrough(),
            stderr: new PassThrough(),
            kill: () => {
                signals++;
                return true;
            },
        });
        queueMicrotask(() => {
            child.stdout.write(Buffer.alloc(1_048_577, 97));
            child.stdout.end('tail', () => {
                stdoutDrained = true;
            });
            child.stderr.end('private', () => {
                stderrDrained = true;
            });
            setImmediate(() => child.emit('close', 1, null));
        });
        return child;
    }) as unknown as typeof spawn;
    const result = await runGUICommand(
        {
            buildPath: '/Applications/Test.app',
            pythonInterpreter: 'python',
            invocationCwd: directory,
        },
        {
            batch: createGUIRecord('overflow'),
            save: async () => {},
            output: () => {},
            smokeDirectory: directory,
            spawn: spawnChild,
        },
    );
    assert.equal(signals, 1);
    assert.equal(launches, 1);
    assert.ok(stdoutDrained && stderrDrained);
    assert.match(result.result.rows[0].outputError!, /exceeded/);
    assert.equal(result.result.state, 'incomplete');
});

test('active cancellation forwards once, awaits final cleanup evidence and removes subscription', async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'gui-active-cancel-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    await writeFile(join(directory, 'python'), 'fixture');
    const cancellation = new Interrupted();
    let signals = 0;
    let settled = false;
    const spawnChild = (() => {
        const child = Object.assign(new EventEmitter(), {
            stdout: new PassThrough(),
            stderr: new PassThrough(),
            kill: () => {
                signals++;
                return true;
            },
        });
        queueMicrotask(() => {
            cancellation.request();
            cancellation.request();
            setImmediate(() => {
                settled = true;
                child.stdout.end(
                    JSON.stringify({
                        ...passed,
                        outcome: 'harness_error',
                        cancellation: { reason: 'Cancelled by user' },
                        cleanup: {
                            disposition: 'retained',
                            reservationRetained: false,
                            errors: [],
                        },
                    }),
                );
                child.stderr.end();
                child.emit('close', 1, null);
            });
        });
        return child;
    }) as unknown as typeof spawn;
    const result = await runGUICommand(
        {
            buildPath: '/Applications/Test.app',
            pythonInterpreter: 'python',
            invocationCwd: directory,
        },
        {
            batch: createGUIRecord('active'),
            save: async () => {},
            output: () => {},
            smokeDirectory: directory,
            cancellation,
            spawn: spawnChild,
        },
    );
    assert.equal(signals, 1);
    assert.equal(settled, true);
    assert.equal(cancellation.listenerCount, 0);
    assert.equal(result.result.state, 'completed');
    assert.equal(
        result.result.rows[0].cancellation?.reason,
        'Cancelled by user',
    );
    assert.deepEqual(
        result.result.rows.map((row) => row.outcome),
        ['harness_error', 'not_run', 'not_run'],
    );
});

test('spawn failure and signal loss remain incomplete harness errors with no later launch', async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'gui-spawn-fail-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    await writeFile(join(directory, 'python'), 'fixture');
    for (const kind of ['throw', 'signal', 'malformed', 'unexpected-exit']) {
        let launches = 0;
        const spawnChild = (() => {
            launches++;
            if (kind === 'throw') throw new Error('private spawn details');
            const child = Object.assign(new EventEmitter(), {
                stdout: new PassThrough(),
                stderr: new PassThrough(),
                kill: () => false,
            });
            queueMicrotask(() => {
                child.stdout.end(
                    kind === 'malformed' ? 'garbage' : JSON.stringify(passed),
                );
                child.stderr.end();
                child.emit(
                    'close',
                    kind === 'signal' ? null : 7,
                    kind === 'signal' ? 'SIGTERM' : null,
                );
            });
            return child;
        }) as unknown as typeof spawn;
        const result = await runGUICommand(
            {
                buildPath: '/Applications/Test.app',
                pythonInterpreter: 'python',
                invocationCwd: directory,
            },
            {
                batch: createGUIRecord('error'),
                save: async () => {},
                output: () => {},
                smokeDirectory: directory,
                spawn: spawnChild,
            },
        );
        assert.equal(result.exitCode, 1);
        assert.equal(launches, 1);
        assert.equal(result.result.rows[0].outcome, 'harness_error');
        if (kind !== 'unexpected-exit')
            assert.equal(result.result.state, 'incomplete');
    }
});

test('child cancellation and uncertain cleanup cannot produce a successful or completed batch', async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'gui-contradiction-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    await writeFile(join(directory, 'python'), 'fixture');
    for (const response of [
        { ...passed, cancellation: { reason: 'Cancelled by user' } },
        { ...passed, cancellation: 'bad' },
        {
            ...passed,
            cleanup: {
                disposition: 'banana',
                reservationRetained: false,
                errors: [],
            },
        },
        {
            ...passed,
            outcome: 'harness_error',
            cleanup: {
                disposition: 'retained',
                reservationRetained: true,
                errors: ['exit uncertain'],
            },
        },
    ]) {
        const seen: string[][] = [];
        const result = await runGUICommand(
            {
                buildPath: '/Applications/Test.app',
                pythonInterpreter: 'python',
                invocationCwd: directory,
            },
            {
                batch: createGUIRecord('contradiction'),
                save: async () => {},
                output: () => {},
                smokeDirectory: directory,
                spawn: childFactory([response], seen),
            },
        );
        assert.equal(result.exitCode, 1);
        assert.equal(seen.length, 1);
        if (response.cleanup?.reservationRetained === true)
            assert.equal(result.result.state, 'incomplete');
    }
});

test('failed cancellation signal is retained separately from available child cleanup evidence', async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'gui-signal-fail-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    await writeFile(join(directory, 'python'), 'fixture');
    const cancellation = new Interrupted();
    const spawnChild = (() => {
        const child = Object.assign(new EventEmitter(), {
            stdout: new PassThrough(),
            stderr: new PassThrough(),
            kill: () => false,
        });
        queueMicrotask(() => {
            cancellation.request();
            child.stdout.end(JSON.stringify(passed));
            child.stderr.end();
            child.emit('close', 0, null);
        });
        return child;
    }) as unknown as typeof spawn;
    const result = await runGUICommand(
        {
            buildPath: '/Applications/Test.app',
            pythonInterpreter: 'python',
            invocationCwd: directory,
        },
        {
            batch: createGUIRecord('signal-fail'),
            save: async () => {},
            output: () => {},
            smokeDirectory: directory,
            cancellation,
            spawn: spawnChild,
        },
    );
    assert.match(result.result.rows[0].subprocessError!, /signal failed/);
    assert.equal(result.result.rows[0].cleanup?.disposition, 'removed');
    assert.equal(result.result.state, 'incomplete');
});

import { createGUIReport, saveGUIReport } from '../src/gui-report.js';
import { symlink, rename } from 'node:fs/promises';

test('real aggregate update failure after a passed suite prevents the next launch', async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'gui-durable-fail-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    await writeFile(join(directory, 'python'), 'fixture');
    const report = await createGUIReport(directory, 'durable');
    const seen: string[][] = [];
    const result = await runGUICommand(
        {
            buildPath: '/Applications/Test.app',
            pythonInterpreter: 'python',
            invocationCwd: directory,
        },
        {
            batch: report.batch,
            save: async (batch) => {
                if (batch.rows[0].outcome === 'passed') {
                    await rename(
                        report.directory,
                        report.directory + '-retained',
                    );
                    await symlink(
                        report.directory + '-retained',
                        report.directory,
                    );
                }
                await saveGUIReport(report.directory, batch);
            },
            output: () => {},
            smokeDirectory: directory,
            spawn: childFactory([passed, passed], seen),
        },
    );
    assert.equal(result.exitCode, 1);
    assert.equal(seen.length, 1);
    assert.equal(result.result.state, 'incomplete');
});

test('next child cannot start until prior child closes with complete output', async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'gui-sequential-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    await writeFile(join(directory, 'python'), 'fixture');
    let active = 0;
    let maximum = 0;
    const spawnChild = (() => {
        active++;
        maximum = Math.max(maximum, active);
        const child = Object.assign(new EventEmitter(), {
            stdout: new PassThrough(),
            stderr: new PassThrough(),
            kill: () => true,
        });
        setImmediate(() => {
            child.stdout.end(JSON.stringify(passed));
            child.stderr.end();
            active--;
            child.emit('close', 0, null);
        });
        return child;
    }) as unknown as typeof spawn;
    const result = await runGUICommand(
        {
            buildPath: '/Applications/Test.app',
            pythonInterpreter: 'python',
            invocationCwd: directory,
        },
        {
            batch: createGUIRecord('sequential'),
            save: async () => {},
            output: () => {},
            smokeDirectory: directory,
            spawn: spawnChild,
        },
    );
    assert.equal(result.exitCode, 0);
    assert.equal(maximum, 1);
    assert.equal(active, 0);
});

test('filesystem interpreter preflight preserves a space-containing symlink invocation in Python routing', async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'gui-interpreter-alias-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const target = join(directory, 'interpreter-target');
    const alias = join(directory, 'python alias with spaces');
    await writeFile(target, 'fixture');
    await symlink(target, alias);
    const seen: string[][] = [];
    const result = await runGUICommand(
        {
            buildPath: '/Applications/Test.app',
            pythonInterpreter: 'python alias with spaces',
            invocationCwd: directory,
        },
        {
            batch: createGUIRecord('symlink'),
            save: async () => {},
            output: () => {},
            smokeDirectory: directory,
            spawn: childFactory(
                [
                    { ...passed, suites: 'basic', chatBackend: 'real' },
                    { ...passed, suites: 'git', chatBackend: 'mock' },
                    { ...passed, suites: 'python', chatBackend: 'mock' },
                ],
                seen,
            ),
        },
    );
    assert.equal(result.exitCode, 0);
    const pythonArguments = seen[2];
    assert.equal(
        pythonArguments[pythonArguments.indexOf('--python-interpreter') + 1],
        alias,
    );
    assert.notEqual(pythonArguments.at(-1), target);
    assert.deepEqual(
        result.result.rows.map((row) => row.outcome),
        ['passed', 'passed', 'passed'],
    );
});
