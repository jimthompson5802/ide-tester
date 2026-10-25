import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import {
    mkdtemp,
    readFile,
    access,
    rm,
    symlink,
    rename,
    mkdir,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRun, finishRun } from '../src/resources.js';
import { prepareProfile } from '../src/profile.js';
import { DatabaseSync } from 'node:sqlite';

async function ownedRun(t: TestContext, checkout: string) {
    const run = await createRun(checkout);
    t.after(() => rm(run.resources, { recursive: true, force: true }));
    return run;
}

test('run reservation excludes a second run and successful shutdown removes only disposable resources', async (t) => {
    const checkout = await mkdtemp(join(tmpdir(), 'smoke-resources-test-'));
    t.after(() => rm(checkout, { recursive: true, force: true }));
    const run = await ownedRun(t, checkout);
    assert.ok(
        Buffer.byteLength(join(run.userData, '1.13-main.sock')) <= 103,
        'macOS IPC path must fit sockaddr_un',
    );
    await assert.rejects(createRun(checkout), /reservation/i);
    assert.equal(
        await readFile(join(run.workspace, 'existing.txt'), 'utf8'),
        'Initial smoke fixture\n',
    );
    await assert.rejects(access(join(run.workspace, 'created.txt')));
    await finishRun(run, true, [async () => {}]);
    await assert.rejects(access(run.resources));
    await access(run.report);
    const next = await ownedRun(t, checkout);
    await finishRun(next, true, []);
});

test('fresh profile uses only loopback mock endpoints and preinitializes built-in Chat enablement', async (t) => {
    const checkout = await mkdtemp(join(tmpdir(), 'smoke-profile-test-'));
    t.after(() => rm(checkout, { recursive: true, force: true }));
    const run = await ownedRun(t, checkout);
    await assert.rejects(
        prepareProfile(run, 'https://api.githubcopilot.com'),
        /loopback/,
    );
    const env = await prepareProfile(run, 'http://127.0.0.1:12345');
    const settings = JSON.parse(
        await readFile(join(run.userData, 'User/settings.json'), 'utf8'),
    );
    assert.equal(
        settings['github.copilot.advanced.debug.overrideCapiUrl'],
        'http://127.0.0.1:12345',
    );
    assert.equal(
        settings['github.copilot.advanced.debug.overrideProxyUrl'],
        'http://127.0.0.1:12345',
    );
    assert.equal(settings['files.autoSave'], 'off');
    assert.equal(settings['editor.formatOnSave'], false);
    assert.equal(settings['files.simpleDialog.enable'], true);
    assert.equal(env.GITHUB_PAT, 'smoke-synthetic-pat');
    const token = JSON.parse(
        Buffer.from(env.VSCODE_COPILOT_CHAT_TOKEN!, 'base64').toString(),
    );
    assert.deepEqual(token.endpoints, {
        api: 'http://127.0.0.1:12345',
        proxy: 'http://127.0.0.1:12345',
    });
    assert.equal(env.COPILOT_HOME, join(run.state, '.copilot'));
    const db = new DatabaseSync(
        join(run.userData, 'User/globalStorage/state.vscdb'),
    );
    try {
        assert.equal(
            db
                .prepare('SELECT value FROM ItemTable WHERE key = ?')
                .get('builtinChatExtensionEnablementMigration')?.value,
            'true',
        );
    } finally {
        db.close();
    }
    await finishRun(run, true, []);
});

test('failed tests retain resources; failed shutdown also retains the reservation and still closes other resources', async (t) => {
    const checkout = await mkdtemp(join(tmpdir(), 'smoke-teardown-test-'));
    t.after(() => rm(checkout, { recursive: true, force: true }));
    const failed = await ownedRun(t, checkout);
    const result = await finishRun(failed, false, []);
    assert.equal(result.disposition, 'retained');
    assert.equal(result.reservationRetained, false);
    await access(failed.workspace);
    const uncertain = await ownedRun(t, checkout);
    let serverClosed = false;
    const cleanup = await finishRun(uncertain, true, [
        async () => {
            throw new Error('Application shutdown uncertain');
        },
        async () => {
            serverClosed = true;
        },
    ]);
    assert.equal(serverClosed, true);
    assert.equal(cleanup.reservationRetained, true);
    assert.match(cleanup.errors.join(), /shutdown uncertain/);
    await access(uncertain.resources);
    await assert.rejects(createRun(checkout), /reservation/i);
});

test('cleanup refuses resources redirected through a symlinked report directory', async (t) => {
    const checkout = await mkdtemp(join(tmpdir(), 'smoke-ownership-test-'));
    t.after(() => rm(checkout, { recursive: true, force: true }));
    const run = await ownedRun(t, checkout);
    const moved = join(checkout, 'preserved');
    await rename(run.report, moved);
    await symlink(moved, run.report);
    const result = await finishRun(run, true, []);
    assert.equal(result.reservationRetained, true);
    await access(join(run.workspace, 'existing.txt'));
});

test('run creation rejects a reports directory redirected outside the checkout', async (t) => {
    const checkout = await mkdtemp(join(tmpdir(), 'smoke-root-test-'));
    const outside = await mkdtemp(join(tmpdir(), 'smoke-outside-test-'));
    t.after(() => rm(checkout, { recursive: true, force: true }));
    t.after(() => rm(outside, { recursive: true, force: true }));
    await mkdir(join(outside, 'smoke'));
    await symlink(outside, join(checkout, 'reports'));
    await assert.rejects(createRun(checkout), /ownership/);
    await assert.rejects(access(join(outside, 'smoke/.reservation')));
});

test('cancellation during shutdown retains successful resources but releases a safely settled reservation', async (t) => {
    const checkout = await mkdtemp(join(tmpdir(), 'smoke-cancel-cleanup-'));
    t.after(() => rm(checkout, { recursive: true, force: true }));
    const run = await ownedRun(t, checkout);
    let cancelled = false;
    const result = await finishRun(
        run,
        true,
        [
            async () => {
                cancelled = true;
            },
        ],
        { canRemove: () => !cancelled, deadline: Date.now() + 1000 },
    );
    assert.equal(result.disposition, 'retained');
    assert.equal(result.reservationRetained, false);
    await access(run.resources);
    await assert.rejects(access(run.reservation));
});

test('expired cleanup admission retains exact reservation and disposable resources', async (t) => {
    const checkout = await mkdtemp(join(tmpdir(), 'smoke-cleanup-expired-'));
    t.after(() => rm(checkout, { recursive: true, force: true }));
    const run = await ownedRun(t, checkout);
    const reservation = await readFile(run.reservation);
    const cleanup = await finishRun(run, true, [], {
        deadline: Date.now() - 1,
    });
    assert.equal(cleanup.disposition, 'retained');
    assert.equal(cleanup.reservationRetained, true);
    assert.match(cleanup.errors.join(), /deadline expired/i);
    assert.deepEqual(await readFile(run.reservation), reservation);
    await access(run.workspace);
});

test('a stalled ownership read expires without admitting late deletion', async (t) => {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const { writeFile } = await import('node:fs/promises');
    const checkout = await mkdtemp(
        join(tmpdir(), 'smoke-ownership-read-expiry-'),
    );
    t.after(() => rm(checkout, { recursive: true, force: true }));
    const run = await ownedRun(t, checkout);
    const owner = join(run.resources, '.owner');
    await rm(owner);
    await promisify(execFile)('/usr/bin/mkfifo', [owner]);
    // A FIFO makes the public cleanup seam wait on actual owned filesystem I/O.
    // The fallback releases the read even against the pre-fix implementation.
    let fallbackReleased = false;
    let releaseWrite: Promise<void> | undefined;
    const fallback = setTimeout(() => {
        fallbackReleased = true;
        releaseWrite = writeFile(owner, run.id);
        releaseWrite.catch(() => {});
    }, 500);
    const cleanup = await finishRun(run, true, [], {
        deadline: Date.now() + 50,
    });
    clearTimeout(fallback);
    if (!fallbackReleased) await writeFile(owner, run.id);
    else await releaseWrite;
    assert.equal(
        fallbackReleased,
        false,
        'cleanup must return before the stalled ownership read is released',
    );
    assert.equal(cleanup.disposition, 'retained');
    assert.equal(cleanup.reservationRetained, true);
    assert.match(cleanup.errors.join(), /deadline expired/i);
    await access(run.reservation);
    await access(run.workspace);
});
