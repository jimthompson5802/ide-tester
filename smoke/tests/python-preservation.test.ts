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
import { preparePythonInterpreter } from '../src/python-interpreter.js';
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

test('external interpreter launch does not require a retained virtual environment', async (t) => {
    const root = await fixture();
    t.after(() => rm(root, { recursive: true }));
    await rm(join(root, '.venv'), { recursive: true });
    const installation = join(root, 'external-python');
    await mkdir(join(installation, 'bin'), { recursive: true });
    const python = join(installation, 'bin', 'python');
    await writeFile(python, 'not executed');
    const interpreter = await preparePythonInterpreter(python);
    const before = await capturePreservation(root);
    await requirePreservationUnchanged(root, before);
    const resources = join(root, 'owned');
    const sentinel = join(resources, 'sentinel');
    await mkdir(sentinel, { recursive: true });
    const launch = await createProtectedLaunch(
        resources,
        '/Applications/Test.app/Code',
        root,
        sentinel,
        interpreter.canonical,
        interpreter.absolute,
    );
    const policy = await readFile(
        launch.environment.IDE_PYTHON_SANDBOX_POLICY,
        'utf8',
    );
    assert.ok(policy.includes(`(subpath ${JSON.stringify(installation)})`));
    assert.ok(policy.includes(`(literal ${JSON.stringify(python)})`));
    assert.ok(
        policy.includes(`(subpath ${JSON.stringify(join(root, '.venv'))})`),
    );
    await mkdir(join(root, '.venv'));
    await assert.rejects(
        requirePreservationUnchanged(root, before),
        /Preserved resources changed/,
    );
});

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

test('preservation allows a retained environment without a Python executable', async (t) => {
    const root = await fixture();
    t.after(() => rm(root, { recursive: true }));
    await rm(join(root, '.venv', 'bin', 'python'));
    const before = await capturePreservation(root);
    assert.ok(before.entries.some((item) => item.path === '.venv'));
    await requirePreservationUnchanged(root, before);
    await rm(join(root, '.venv'), { recursive: true });
    await assert.rejects(
        requirePreservationUnchanged(root, before),
        /Preserved resources changed/,
    );
});

test('preservation records missing metadata and detects its subsequent creation', async (t) => {
    const root = await fixture();
    t.after(() => rm(root, { recursive: true }));
    await rm(join(root, 'uv.lock'));
    const before = await capturePreservation(root);
    assert.ok(before.missingRoots.includes('uv.lock'));
    await requirePreservationUnchanged(root, before);
    await writeFile(join(root, 'uv.lock'), 'new metadata');
    await assert.rejects(
        requirePreservationUnchanged(root, before),
        /Preserved resources changed/,
    );
});

test('preservation rejects a broken retained interpreter symlink', async (t) => {
    const root = await fixture();
    t.after(() => rm(root, { recursive: true }));
    const interpreter = join(root, '.venv', 'bin', 'python');
    await rm(interpreter);
    await symlink('missing-python', interpreter);
    await assert.rejects(capturePreservation(root), /ENOENT/);
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

test('supplied arbitrary interpreter path is protected literally without denying its unrelated parent tree', async (t) => {
    const root = await fixture();
    t.after(() => rm(root, { recursive: true }));
    const resources = join(root, 'owned');
    await mkdir(resources);
    const sentinel = join(resources, 'sentinel');
    await mkdir(sentinel);
    const supplied = join(root, 'ordinary-file');
    await writeFile(supplied, 'not Python');
    const launch = await createProtectedLaunch(
        resources,
        '/Applications/Test.app/Code',
        root,
        sentinel,
        supplied,
    );
    const policy = await readFile(
        launch.environment.IDE_PYTHON_SANDBOX_POLICY,
        'utf8',
    );
    assert.ok(
        policy.includes(
            `(deny file-write* (literal ${JSON.stringify(supplied)}))`,
        ),
    );
    assert.ok(!policy.includes('(subpath "/private/tmp")'));
    assert.ok(!policy.includes(`(subpath ${JSON.stringify(root)})`));
});

test('protected launch guards supplied virtual environment invocation as well as shared canonical installation', async (t) => {
    const root = await fixture();
    t.after(() => rm(root, { recursive: true }));
    const resources = join(root, 'owned');
    const sentinel = join(resources, 'sentinel');
    await mkdir(sentinel, { recursive: true });
    const externalEnvironment = join(root, 'other-environment');
    await mkdir(join(externalEnvironment, 'bin'), { recursive: true });
    const invocation = join(externalEnvironment, 'bin/python');
    const canonical = join(root, '.venv/bin/python');
    await symlink(canonical, invocation);
    const launch = await createProtectedLaunch(
        resources,
        '/Applications/Test.app/Code',
        root,
        sentinel,
        canonical,
        invocation,
    );
    const policy = await readFile(
        launch.environment.IDE_PYTHON_SANDBOX_POLICY,
        'utf8',
    );
    assert.ok(
        policy.includes(`(subpath ${JSON.stringify(externalEnvironment)})`),
    );
    assert.ok(policy.includes(`(literal ${JSON.stringify(invocation)})`));
});
