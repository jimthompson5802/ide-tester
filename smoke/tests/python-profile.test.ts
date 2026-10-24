import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    mkdtemp,
    realpath,
    rm,
    readFile,
    writeFile,
    mkdir,
    symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    pythonProfile,
    pythonEnvironment,
    PythonProfileFailure,
} from '../src/python-profile.js';

test('production Python profile preserves unrelated settings, state and feasibility profile', async (t) => {
    const root = await realpath(
        await mkdtemp(join(tmpdir(), 'python-profile-')),
    );
    t.after(() => rm(root, { recursive: true, force: true }));
    const resources = join(root, 'resources');
    await mkdir(resources);
    const profile = await pythonProfile(root, resources);
    const path = join(profile.userData, 'User/settings.json');
    const settings = JSON.parse(await readFile(path, 'utf8'));
    settings['unrelated.setting'] = 'preserve';
    settings['python.terminal.activateEnvironment'] = true;
    await writeFile(path, JSON.stringify(settings));
    await writeFile(join(profile.state, 'private-state'), 'unchanged');
    await mkdir(join(profile.userData, 'User/globalStorage'));
    const database = join(profile.userData, 'User/globalStorage/state.vscdb');
    await writeFile(database, Buffer.from([0, 255, 2, 8]));
    await mkdir(join(root, 'profiles/smoke-python-feasibility'));
    await writeFile(
        join(root, 'profiles/smoke-python-feasibility/.owner'),
        'feasibility',
    );
    assert.deepEqual(await pythonProfile(root, resources), profile);
    const merged = JSON.parse(await readFile(path, 'utf8'));
    assert.equal(merged['unrelated.setting'], 'preserve');
    assert.deepEqual(await readFile(database), Buffer.from([0, 255, 2, 8]));
    assert.equal(merged['python.terminal.activateEnvironment'], false);
    assert.deepEqual(
        merged['terminal.integrated.profiles.osx']['Guard verification'].args,
        [join(resources, 'terminal-guard.cjs')],
    );
    assert.equal(pythonEnvironment(resources).PYTHONDONTWRITEBYTECODE, '1');
    assert.equal(
        await readFile(join(profile.state, 'private-state'), 'utf8'),
        'unchanged',
    );
    assert.equal(
        await readFile(
            join(root, 'profiles/smoke-python-feasibility/.owner'),
            'utf8',
        ),
        'feasibility',
    );
    await symlink('/absent', join(profile.userData, 'SingletonLock'));
    await assert.rejects(pythonProfile(root, resources), /Close/);
    await rm(join(profile.userData, 'SingletonLock'));
    await writeFile(path, '[]');
    await assert.rejects(pythonProfile(root, resources), /settings/);
    await writeFile(path, '{}');
    await writeFile(join(root, 'profiles/smoke-python/.owner'), 'wrong');
    await assert.rejects(pythonProfile(root, resources), /ownership/);
});

test('production profile refuses redirected roots without writing their target', async (t) => {
    const root = await realpath(
        await mkdtemp(join(tmpdir(), 'python-profile-')),
    );
    t.after(() => rm(root, { recursive: true, force: true }));
    const external = join(root, 'external');
    await mkdir(external);
    await symlink(external, join(root, 'profiles'));
    await assert.rejects(pythonProfile(root, root), /ownership/);
});

test('Python profile rejects redirected workspace storage before changing settings or external state', async (t) => {
    const root = await realpath(
        await mkdtemp(join(tmpdir(), 'python-profile-')),
    );
    t.after(() => rm(root, { recursive: true, force: true }));
    const profile = await pythonProfile(root, root);
    const settings = join(profile.userData, 'User/settings.json');
    const originalSettings = '{"unrelated.setting":"preserve"}';
    await writeFile(settings, originalSettings);
    const external = join(root, 'external-workspace-storage');
    await mkdir(external);
    const state = join(external, 'state.vscdb');
    await writeFile(state, 'private workspace state');
    await symlink(external, join(profile.userData, 'User/workspaceStorage'));

    await assert.rejects(
        pythonProfile(root, root),
        (error: unknown) =>
            error instanceof PythonProfileFailure &&
            error.outcome === 'harness_error',
    );
    assert.equal(await readFile(settings, 'utf8'), originalSettings);
    assert.equal(await readFile(state, 'utf8'), 'private workspace state');
});

test('Python profile refuses redirected settings and user-data without changing targets', async (t) => {
    const root = await realpath(
        await mkdtemp(join(tmpdir(), 'python-profile-')),
    );
    t.after(() => rm(root, { recursive: true, force: true }));
    const profile = await pythonProfile(root, root);
    const settings = join(profile.userData, 'User/settings.json');
    const external = join(root, 'unowned.json');
    await writeFile(external, '{"private":true}');
    await rm(settings);
    await symlink(external, settings);
    await assert.rejects(pythonProfile(root, root), /ownership/);
    assert.equal(await readFile(external, 'utf8'), '{"private":true}');
    await rm(settings);
    await writeFile(settings, '{');
    await assert.rejects(pythonProfile(root, root), SyntaxError);
    const user = join(profile.userData, 'User');
    await rm(user, { recursive: true });
    await symlink(root, user);
    await assert.rejects(pythonProfile(root, root), /ownership/);
});

for (const area of ['userData', 'extensions', 'state'] as const) {
    test(`Python profile rejects deeply nested links in ${area} without changing settings or targets`, async (t) => {
        const root = await realpath(
            await mkdtemp(join(tmpdir(), 'python-profile-')),
        );
        t.after(() => rm(root, { recursive: true, force: true }));
        const profile = await pythonProfile(root, root);
        const settings = join(profile.userData, 'User/settings.json');
        const originalSettings = '{"unrelated.setting":"preserve"}';
        await writeFile(settings, originalSettings);
        const external = join(root, 'external-state');
        await writeFile(external, 'private state');
        const nested = join(profile[area], 'nested', 'deeper');
        await mkdir(nested, { recursive: true });
        await symlink(external, join(nested, 'redirect'));

        await assert.rejects(
            pythonProfile(root, root),
            (error: unknown) =>
                error instanceof PythonProfileFailure &&
                error.outcome === 'harness_error',
        );
        assert.equal(await readFile(settings, 'utf8'), originalSettings);
        assert.equal(await readFile(external, 'utf8'), 'private state');
    });
}
