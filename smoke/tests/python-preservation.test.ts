import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    mkdtemp,
    mkdir,
    writeFile,
    readFile,
    rm,
    symlink,
    link,
} from 'node:fs/promises';
import { join } from 'node:path';
import {
    capturePreservation,
    requirePreservationUnchanged,
    createProtectedLaunch,
} from '../gui/python-preservation.js';

async function fixture(): Promise<string> {
    const root = await mkdtemp('/private/tmp/python-preservation-test-');
    await mkdir(join(root, '.venv', 'bin'), { recursive: true });
    await writeFile(
        join(root, '.venv', 'bin', 'python'),
        'disposable executable',
    );
    for (const name of ['pyproject.toml', 'uv.lock', '.python-version'])
        await writeFile(join(root, name), name);
    return root;
}

test('preservation captures exact contents, metadata, directory membership and symlink text', async (t) => {
    const root = await fixture();
    t.after(() => rm(root, { recursive: true }));
    await symlink('python', join(root, '.venv', 'bin', 'python3'));
    const manifest = await capturePreservation(root);
    assert.equal(
        manifest.entries.find((item) => item.path === '.venv/bin/python3')
            ?.link,
        'python',
    );
    await requirePreservationUnchanged(root, manifest);
    await writeFile(join(root, '.venv', 'created'), 'changed');
    await assert.rejects(
        requirePreservationUnchanged(root, manifest),
        /Preserved resources changed/,
    );
});

test('preservation rejects redirected retained roots and unreviewed external symlink targets', async (t) => {
    const root = await fixture();
    t.after(() => rm(root, { recursive: true }));
    await symlink('/private/tmp', join(root, '.venv', 'outside'));
    await assert.rejects(
        capturePreservation(root),
        /Unreviewed external symlink/,
    );
    await rm(join(root, '.venv', 'outside'));
    await rm(join(root, 'uv.lock'));
    await symlink(join(root, 'pyproject.toml'), join(root, 'uv.lock'));
    await assert.rejects(capturePreservation(root), /Redirected retained root/);
});

test('preservation does not ignore broken links within an optional retained directory', async (t) => {
    const root = await fixture();
    t.after(() => rm(root, { recursive: true }));
    await mkdir(join(root, '.vscode'));
    await symlink('missing', join(root, '.vscode', 'broken'));
    await assert.rejects(capturePreservation(root), /ENOENT/);
});

test('preservation refuses unenumerated hardlink aliases', async (t) => {
    const root = await fixture();
    t.after(() => rm(root, { recursive: true }));
    await link(join(root, 'uv.lock'), join(root, 'outside-alias'));
    await assert.rejects(capturePreservation(root), /Unreviewed hardlink/);
});

test('protected launch uses fixed shell text and escaped lexical/canonical policies without invoking Python', async (t) => {
    const root = await fixture();
    t.after(() => rm(root, { recursive: true }));
    const resources = join(root, 'owned');
    await mkdir(resources);
    const sentinel = join(resources, 'sentinel');
    await mkdir(sentinel);
    await writeFile(join(sentinel, 'original'), 'unchanged');
    const launch = await createProtectedLaunch(
        resources,
        '/Applications/Test app.app/Code',
        root,
        sentinel,
    );
    assert.equal(
        launch.invocationInterpreter,
        join(root, '.venv', 'bin', 'python'),
    );
    const source = await readFile(launch.executable, 'utf8');
    assert.ok(source.includes('"$IDE_PYTHON_EXECUTABLE" "$@"'));
    assert.ok(!source.includes(root));
    const policy = await readFile(
        launch.environment.IDE_PYTHON_SANDBOX_POLICY,
        'utf8',
    );
    for (const target of [
        '.venv',
        'pyproject.toml',
        'uv.lock',
        '.python-version',
    ])
        assert.ok(policy.includes(JSON.stringify(join(root, target))));
    assert.ok(policy.includes(JSON.stringify(sentinel)));
    assert.ok(policy.startsWith('(version 1)\n(allow default)'));
});
