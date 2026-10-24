import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import {
    mkdir,
    mkdtemp,
    readFile,
    rename,
    rm,
    symlink,
    writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
    createTerminalFixture,
    prepareObservationProfile,
    validateTerminalLines,
    verifyTerminalBatch,
    verifyWriteGuard,
} from '../gui/issue-40-python-feasibility.js';

test('feasibility guard denies mutations and inherited writes while allowing owned output', async () => {
    const result = await verifyWriteGuard();
    assert.equal(result.protectedContentsUnchanged, true);
    assert.equal(result.allowedWriteSucceeded, true);
    assert.deepEqual(result.deniedOperations, [
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
    ]);
});

test('feasibility probe refuses incomplete observation invocation before GUI launch', async () => {
    const probe = fileURLToPath(
        new URL('../gui/issue-40-python-feasibility.js', import.meta.url),
    );
    await assert.rejects(
        promisify(execFile)(process.execPath, [
            probe,
            '--build',
            '/unused.app',
        ]),
        (error: unknown) =>
            error instanceof Error &&
            error.message.includes(
                'Use --self-check or --observe-terminal --build <app>',
            ),
    );
});

test('terminal buffer validation accepts bounded strings and rejects malformed or oversized observations', () => {
    assert.deepEqual(validateTerminalLines([]), []);
    assert.deepEqual(validateTerminalLines(['first', '', 'last']), [
        'first',
        '',
        'last',
    ]);
    assert.equal(
        validateTerminalLines(Array.from({ length: 2000 }, () => '')).length,
        2000,
    );
    for (const invalid of [
        null,
        'line',
        {},
        [1],
        ['line', null],
        Array.from({ length: 2001 }, () => ''),
        ['é'.repeat(131_073)],
    ]) {
        assert.throws(() => validateTerminalLines(invalid));
    }
});

test('terminal batch verification requires all exact current-process lines without duplicates', () => {
    const token = 'test-run';
    const pid = 123;
    const complete = [
        'Hello, world! test-run 1',
        'OBS_ID test-run 1 123',
        'OBS_DONE test-run 1',
    ];
    assert.doesNotThrow(() => verifyTerminalBatch(complete, token, 1, pid));
    for (const invalid of [
        [],
        complete.slice(0, 2),
        complete.map((line) => `echo '${line}'`),
        complete.map((line) => line.replace('test-run', 'stale-run')),
        complete.map((line) => line.replace('123', '456')),
        [...complete, complete[2]],
    ]) {
        assert.throws(() => verifyTerminalBatch(invalid, token, 1, pid));
    }
    assert.throws(() => verifyTerminalBatch(complete, token, 2, pid));
});

async function waitFor(check: () => Promise<boolean>): Promise<void> {
    const deadline = Date.now() + 5000;
    while (!(await check())) {
        if (Date.now() >= deadline)
            throw new Error('Fixture observation timed out');
        await setTimeout(20);
    }
}

test('real terminal fixture emits two fresh stdout batches only after separate triggers and stops on request', async (t) => {
    const root = await mkdtemp('/private/tmp/ide-terminal-fixture-test-');
    const fixtureState: {
        child?: ReturnType<typeof spawn>;
        exit?: Promise<void>;
    } = {};
    t.after(async () => {
        if (
            fixtureState.child?.exitCode === null &&
            fixtureState.child.signalCode === null
        )
            fixtureState.child.kill('SIGKILL');
        if (fixtureState.exit) await fixtureState.exit;
        await rm(root, { recursive: true });
    });
    const token = 'fixture-run';
    const fixture = await createTerminalFixture(root, token);
    const child = spawn(process.execPath, [fixture.script], {
        env: { PATH: '/usr/bin:/bin', HOME: root, TMPDIR: root },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    fixtureState.child = child;
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
    });
    const exited = new Promise<void>((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', () => resolve());
    });
    fixtureState.exit = exited;
    await waitFor(async () => {
        try {
            const ready: unknown = JSON.parse(
                await readFile(fixture.ready, 'utf8'),
            );
            assert.deepEqual(ready, { pid: child.pid, token });
            return true;
        } catch (error) {
            if (
                error instanceof SyntaxError ||
                (error instanceof Error &&
                    'code' in error &&
                    error.code === 'ENOENT')
            )
                return false;
            throw error;
        }
    });
    assert.equal(stdout, '');
    await writeFile(fixture.trigger(1), '', { flag: 'wx' });
    await waitFor(async () => stdout.includes(`OBS_DONE ${token} 1`));
    assert.ok(child.pid);
    verifyTerminalBatch(stdout.trimEnd().split(/\r?\n/), token, 1, child.pid);
    assert.equal(stdout.includes(`OBS_DONE ${token} 2`), false);
    await writeFile(fixture.trigger(2), '', { flag: 'wx' });
    await waitFor(async () => stdout.includes(`OBS_DONE ${token} 2`));
    const lines = stdout.trimEnd().split(/\r?\n/);
    verifyTerminalBatch(lines, token, 1, child.pid);
    verifyTerminalBatch(lines, token, 2, child.pid);
    await writeFile(fixture.stop, '', { flag: 'wx' });
    await waitFor(
        async () => child.exitCode !== null || child.signalCode !== null,
    );
    await exited;
    assert.equal(child.exitCode, 0);
    assert.equal(stderr, '');
});

test('observation profile preserves unrelated settings and state while leaving production untouched', async (t) => {
    const root = await mkdtemp('/private/tmp/ide-observation-profile-test-');
    t.after(() => rm(root, { recursive: true }));
    const profile = await prepareObservationProfile(root, {
        'terminal.integrated.shellIntegration.enabled': false,
    });
    const settings = join(profile.userData, 'User/settings.json');
    await writeFile(
        settings,
        JSON.stringify({
            unrelated: 'keep',
            'terminal.integrated.shellIntegration.enabled': true,
        }),
    );
    const state = join(profile.state, 'retained.bin');
    await writeFile(state, Buffer.from([0, 1, 255]));
    const production = join(root, 'profiles/smoke-python');
    await mkdir(production);
    await writeFile(join(production, 'retained'), 'production');
    assert.deepEqual(
        await prepareObservationProfile(root, {
            'terminal.integrated.shellIntegration.enabled': false,
        }),
        profile,
    );
    assert.deepEqual(JSON.parse(await readFile(settings, 'utf8')), {
        unrelated: 'keep',
        'terminal.integrated.shellIntegration.enabled': false,
    });
    assert.deepEqual(await readFile(state), Buffer.from([0, 1, 255]));
    assert.equal(
        await readFile(join(production, 'retained'), 'utf8'),
        'production',
    );
});

test('observation profile refuses open locks, malformed settings and wrong owners without adopting state', async (t) => {
    const root = await mkdtemp('/private/tmp/ide-observation-refusal-test-');
    t.after(() => rm(root, { recursive: true }));
    const profile = await prepareObservationProfile(root, {});
    const settings = join(profile.userData, 'User/settings.json');
    const before = await readFile(settings);
    const lock = join(profile.userData, 'SingletonLock');
    await writeFile(lock, 'owned fixture lock');
    await assert.rejects(prepareObservationProfile(root, { changed: true }));
    assert.deepEqual(await readFile(settings), before);
    assert.equal(await readFile(lock, 'utf8'), 'owned fixture lock');
    await rm(lock);
    await writeFile(settings, '{malformed');
    await assert.rejects(prepareObservationProfile(root, {}));
    assert.equal(await readFile(settings, 'utf8'), '{malformed');
    await writeFile(settings, '{}');
    await writeFile(
        join(root, 'profiles/smoke-python-feasibility/.owner'),
        'someone else',
    );
    await assert.rejects(prepareObservationProfile(root, { changed: true }));
    assert.equal(await readFile(settings, 'utf8'), '{}');
});

test('observation profile refuses redirected settings without changing the target', async (t) => {
    const root = await mkdtemp('/private/tmp/ide-observation-redirect-test-');
    t.after(() => rm(root, { recursive: true }));
    const profile = await prepareObservationProfile(root, {});
    const settings = join(profile.userData, 'User/settings.json');
    const target = join(root, 'target.json');
    await rename(settings, target);
    const before = await readFile(target);
    await symlink(target, settings);
    await assert.rejects(prepareObservationProfile(root, { changed: true }));
    assert.deepEqual(await readFile(target), before);
});
