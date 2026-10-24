import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    mkdtemp,
    readFile,
    writeFile,
    rm,
    access,
    symlink,
    rename,
    mkdir,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { gitProfile } from '../src/git-profile.js';
import { createRun, finishRun } from '../src/resources.js';

test('fresh persistent Git-only profile has no Chat state, retains unrelated state and survives run cleanup', async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'git-profile-test-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const profile = await gitProfile(root);
    const path = join(profile.userData, 'User/settings.json');
    const settings = JSON.parse(await readFile(path, 'utf8'));
    assert.equal(settings['chat.disableAIFeatures'], true);
    assert.equal(settings['git.path'], '/usr/bin/git');
    await assert.rejects(
        access(join(profile.userData, 'User/globalStorage/state.vscdb')),
    );
    await writeFile(join(profile.state, 'retained'), 'owned state');
    await writeFile(
        path,
        JSON.stringify({ ...settings, 'editor.fontSize': 17 }),
    );
    for (const passed of [true, false]) {
        const run = await createRun(root);
        t.after(() => rm(run.resources, { recursive: true, force: true }));
        await gitProfile(root);
        const cleanup = await finishRun({ ...run, ...profile }, passed, []);
        assert.equal(cleanup.errors.length, 0);
        await access(profile.userData);
    }
    assert.equal(
        await readFile(join(profile.state, 'retained'), 'utf8'),
        'owned state',
    );
    assert.equal(
        JSON.parse(await readFile(path, 'utf8'))['editor.fontSize'],
        17,
    );
});

test('standalone reuse removes stale mock settings and preserves existing Chat and extension state', async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'git-profile-reuse-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const profile = await gitProfile(root);
    const path = join(profile.userData, 'User/settings.json');
    const settings = JSON.parse(await readFile(path, 'utf8'));
    const staleKeys = {
        'chat.allowAnonymousAccess': true,
        'github.copilot.advanced.debug.overrideProxyUrl':
            'http://127.0.0.1:12345',
        'github.copilot.advanced.debug.overrideCapiUrl':
            'http://127.0.0.1:12345',
        'github.copilot.advanced.debug.overrideAuthType': 'token',
    };
    await writeFile(
        path,
        JSON.stringify({
            ...settings,
            ...staleKeys,
            'chat.disableAIFeatures': false,
            'editor.fontSize': 17,
        }),
    );
    const storage = join(profile.userData, 'User/globalStorage');
    await mkdir(storage);
    const dbPath = join(storage, 'state.vscdb');
    const db = new DatabaseSync(dbPath);
    db.exec(
        'CREATE TABLE ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)',
    );
    db.prepare('INSERT INTO ItemTable (key,value) VALUES (?,?)').run(
        'extensionsIdentifiers/disabled',
        JSON.stringify([
            { id: 'github.copilot-chat' },
            { id: 'test.unrelated-extension' },
        ]),
    );
    db.prepare('INSERT INTO ItemTable (key,value) VALUES (?,?)').run(
        'builtinChatExtensionEnablementMigration',
        'true',
    );
    db.prepare('INSERT INTO ItemTable (key,value) VALUES (?,?)').run(
        'unrelated-state',
        'retained',
    );
    db.close();
    const before = await readFile(dbPath);
    for (const dir of ['.copilot', '.codex']) {
        await mkdir(join(profile.state, dir));
        await writeFile(join(profile.state, dir, 'retained'), 'existing state');
    }
    assert.deepEqual(await gitProfile(root), profile);
    const after = JSON.parse(await readFile(path, 'utf8'));
    for (const key of Object.keys(staleKeys))
        assert.equal(after[key], undefined);
    assert.equal(after['chat.disableAIFeatures'], true);
    assert.equal(after['editor.fontSize'], 17);
    assert.deepEqual(await readFile(dbPath), before);
    for (const dir of ['.copilot', '.codex'])
        assert.equal(
            await readFile(join(profile.state, dir, 'retained'), 'utf8'),
            'existing state',
        );
});

test('open, unowned, symlinked or malformed profiles stop before settings/state mutation', async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'git-profile-refusal-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const profile = await gitProfile(root);
    const path = join(profile.userData, 'User/settings.json');
    const before = await readFile(path, 'utf8');
    for (const marker of [
        'SingletonLock',
        'SingletonSocket',
        'SingletonCookie',
    ]) {
        await writeFile(join(profile.userData, marker), 'active');
        await assert.rejects(gitProfile(root), /Close/);
        assert.equal(await readFile(path, 'utf8'), before);
        await rm(join(profile.userData, marker));
    }
    await rename(path, join(profile.state, 'saved-settings'));
    await symlink(join(profile.state, 'saved-settings'), path);
    await assert.rejects(gitProfile(root), /ownership/);
    assert.equal(await readFile(path, 'utf8'), before);
    await rm(path);
    await writeFile(path, '{bad json');
    await assert.rejects(gitProfile(root));
    assert.equal(await readFile(path, 'utf8'), '{bad json');
    await writeFile(path, before);
    await writeFile(join(root, 'profiles/smoke-git/.owner'), 'other owner');
    await assert.rejects(gitProfile(root), /ownership/);
    await rename(join(root, 'profiles/smoke-git'), join(root, 'saved-profile'));
    await symlink(
        join(root, 'saved-profile'),
        join(root, 'profiles/smoke-git'),
    );
    await assert.rejects(gitProfile(root), /ownership/);
    await rm(join(root, 'profiles/smoke-git'));
    await rename(join(root, 'profiles'), join(root, 'saved-profiles'));
    await symlink(join(root, 'saved-profiles'), join(root, 'profiles'));
    await assert.rejects(gitProfile(root), /ownership/);
});

test('standalone preparation refuses redirected databases and preserves real and personal profile files', async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'git-profile-real-preserve-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const { realProfile } = await import('../src/real-profile.js');
    const real = await realProfile(root, true);
    const realPath = join(real.userData, 'User/settings.json');
    const realBefore = await readFile(realPath, 'utf8');
    const profile = await gitProfile(root);
    await writeFile(join(root, 'personal-settings'), 'personal state');
    const storage = join(profile.userData, 'User/globalStorage');
    await mkdir(storage);
    const db = join(storage, 'state.vscdb');
    await writeFile(join(profile.state, 'saved-db'), 'preserved database');
    await symlink(join(profile.state, 'saved-db'), db);
    const settingsPath = join(profile.userData, 'User/settings.json');
    const settingsBefore = await readFile(settingsPath, 'utf8');
    await assert.rejects(gitProfile(root), /ownership/);
    assert.equal(await readFile(settingsPath, 'utf8'), settingsBefore);
    assert.equal(await readFile(db, 'utf8'), 'preserved database');
    assert.equal(await readFile(realPath, 'utf8'), realBefore);
    assert.equal(
        await readFile(join(root, 'personal-settings'), 'utf8'),
        'personal state',
    );
});
