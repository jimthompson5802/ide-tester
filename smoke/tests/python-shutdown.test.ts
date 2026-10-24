import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import {
    access,
    mkdir,
    mkdtemp,
    readFile,
    rm,
    writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { createRun, finishRun, type Run } from '../src/resources.js';
import { closeOwnedApplication } from '../gui/python-shutdown.js';

async function fixture(t: TestContext): Promise<{
    checkout: string;
    run: Run;
    child: ChildProcess;
    exited: Promise<void>;
    profileState: string;
}> {
    const checkout = await mkdtemp('/private/tmp/python-shutdown-test-');
    const recovery: {
        run?: Run;
        child?: ChildProcess;
        exited?: Promise<void>;
    } = {};
    t.after(async () => {
        // Recover only the fixture child, and observe its actual exit before
        // deleting the disposable paths whose retention was just asserted.
        if (
            recovery.child?.exitCode === null &&
            recovery.child.signalCode === null
        )
            recovery.child.kill('SIGKILL');
        if (recovery.exited) await recovery.exited;
        if (recovery.run)
            await rm(recovery.run.resources, { recursive: true, force: true });
        await rm(checkout, { recursive: true });
    });
    const run = await createRun(checkout);
    recovery.run = run;
    const profile = join(checkout, 'profiles', 'smoke-python-feasibility');
    await mkdir(profile, { recursive: true });
    await writeFile(
        join(profile, '.owner'),
        'ide-tester:smoke-python-feasibility:v1',
    );
    const profileState = join(profile, 'retained-state');
    await writeFile(profileState, 'preserve profile bytes');
    const child = spawn(
        process.execPath,
        ['-e', 'setInterval(() => {}, 1000)'],
        {
            stdio: 'ignore',
            env: { PATH: '/usr/bin:/bin' },
        },
    );
    recovery.child = child;
    const exited = new Promise<void>((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', () => resolve());
    });
    recovery.exited = exited;
    await new Promise<void>((resolve, reject) => {
        child.once('spawn', resolve);
        child.once('error', reject);
    });
    return { checkout, run, child, exited, profileState };
}

test('Python shutdown confirms actual main-process exit before successful disposable cleanup', async (t) => {
    const { run, child, profileState } = await fixture(t);
    const cleanup = await finishRun(run, true, [
        async () => {
            const observed = await closeOwnedApplication(
                {
                    process: () => child,
                    close: async () => {
                        child.kill('SIGTERM');
                    },
                },
                { deadline: Date.now() + 1000, closeTimeoutMs: 500 },
            );
            assert.equal(observed.exitCode, null);
            assert.equal(observed.signalCode, 'SIGTERM');
        },
    ]);
    assert.deepEqual(cleanup, {
        disposition: 'removed',
        errors: [],
        reservationRetained: false,
    });
    await assert.rejects(access(run.resources));
    await assert.rejects(access(run.reservation));
    assert.equal(
        await readFile(profileState, 'utf8'),
        'preserve profile bytes',
    );
    assert.equal(child.listenerCount('exit'), 0);
});

test('Python shutdown accepts already observed main exit without issuing another close', async (t) => {
    const { child, exited } = await fixture(t);
    child.kill('SIGTERM');
    await exited;
    let closeCalls = 0;
    const observed = await closeOwnedApplication({
        process: () => child,
        close: async () => {
            closeCalls++;
        },
    });
    assert.equal(closeCalls, 0);
    assert.equal(observed.signalCode, 'SIGTERM');
    assert.equal(child.listenerCount('exit'), 0);
});

test('Python shutdown observes an exit occurring before the close promise resolves', async (t) => {
    const { child, exited } = await fixture(t);
    const observed = await closeOwnedApplication(
        {
            process: () => child,
            close: async () => {
                child.kill('SIGTERM');
                await exited;
            },
        },
        { deadline: Date.now() + 1000, closeTimeoutMs: 500 },
    );
    assert.equal(observed.signalCode, 'SIGTERM');
    assert.equal(child.listenerCount('exit'), 0);
});

test('Python shutdown does not start a queued close after the cleanup deadline expires', async (t) => {
    const { child } = await fixture(t);
    let closeCalls = 0;
    const deadline = Date.now() + 10;
    const closing = closeOwnedApplication(
        {
            process: () => child,
            close: async () => {
                closeCalls++;
            },
        },
        { deadline, closeTimeoutMs: 100 },
    );
    // Model an event-loop stall before the queued close callback can run.
    while (Date.now() <= deadline) {
        /* Synchronous stall is the exposing condition. */
    }
    await assert.rejects(closing, /expired|timed out/);
    assert.equal(closeCalls, 0);
    assert.equal(child.listenerCount('exit'), 1);
});

for (const failure of [
    'close-rejected',
    'close-resolved-without-exit',
    'close-hung',
    'cleanup-already-expired',
] as const) {
    test(`Python shutdown retains resources, profile and exact reservation when ${failure}`, async (t) => {
        const { checkout, run, child, profileState } = await fixture(t);
        const reservation = await readFile(run.reservation);
        const resourceOwner = await readFile(join(run.resources, '.owner'));
        const workspaceBytes = await readFile(
            join(run.workspace, 'existing.txt'),
        );
        let closeCalls = 0;
        const cleanup = await finishRun(run, true, [
            async () => {
                await closeOwnedApplication(
                    {
                        process: () => child,
                        close: async () => {
                            closeCalls++;
                            if (failure === 'close-rejected')
                                throw new Error('Injected owned close failure');
                            if (failure === 'close-hung')
                                await new Promise<void>(() => {});
                        },
                    },
                    {
                        deadline:
                            Date.now() +
                            (failure === 'cleanup-already-expired' ? -1 : 80),
                        closeTimeoutMs: 30,
                    },
                );
            },
        ]);
        assert.equal(cleanup.disposition, 'retained');
        assert.equal(cleanup.reservationRetained, true);
        assert.equal(cleanup.errors.length, 1);
        assert.match(
            cleanup.errors[0],
            failure === 'close-rejected'
                ? /Injected owned close failure/
                : /timed out|expired/,
        );
        assert.deepEqual(await readFile(run.reservation), reservation);
        assert.deepEqual(
            await readFile(join(run.resources, '.owner')),
            resourceOwner,
        );
        assert.deepEqual(
            await readFile(join(run.workspace, 'existing.txt')),
            workspaceBytes,
        );
        assert.equal(
            await readFile(profileState, 'utf8'),
            'preserve profile bytes',
        );
        assert.equal(
            await readFile(
                join(checkout, 'profiles/smoke-python-feasibility/.owner'),
                'utf8',
            ),
            'ide-tester:smoke-python-feasibility:v1',
        );
        assert.equal(child.exitCode, null);
        assert.equal(child.signalCode, null);
        // One listener belongs to fixture recovery; the helper must remove its own.
        assert.equal(child.listenerCount('exit'), 1);
        assert.equal(closeCalls, failure === 'cleanup-already-expired' ? 0 : 1);
        await assert.rejects(createRun(checkout), /reservation/);
    });
}
