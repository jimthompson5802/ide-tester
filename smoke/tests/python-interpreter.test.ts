import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    mkdtemp,
    writeFile,
    mkdir,
    symlink,
    rm,
    realpath,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    preparePythonInterpreter,
    PythonInterpreterPrerequisite,
} from '../src/python-interpreter.js';

test('presence-only interpreter preparation preserves supplied symlink path without executing files', async (t) => {
    const root = await realpath(
        await mkdtemp(join(tmpdir(), 'python-interpreter-')),
    );
    t.after(() => rm(root, { recursive: true, force: true }));
    const target = join(root, 'ordinary file');
    await writeFile(target, 'not Python', { mode: 0o600 });
    await symlink(target, join(root, 'venv python'));
    assert.deepEqual(await preparePythonInterpreter('venv python', root), {
        supplied: 'venv python',
        absolute: join(root, 'venv python'),
        canonical: target,
    });
    assert.equal((await preparePythonInterpreter(target)).canonical, target);
    await mkdir(join(root, 'directory'));
    await symlink(join(root, 'absent'), join(root, 'broken'));
    for (const name of ['absent', 'directory', 'broken']) {
        await assert.rejects(
            preparePythonInterpreter(name, root),
            PythonInterpreterPrerequisite,
        );
    }
});
