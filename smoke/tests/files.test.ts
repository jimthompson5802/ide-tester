import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { requireAbsent, verifySavedFile } from '../src/files.js';

test('saved-file verification requires the exact owned destination and exact UTF-8 bytes', async (t) => {
    const workspace = await realpath(
        await mkdtemp(join(tmpdir(), 'smoke-files-test-')),
    );
    t.after(() => rm(workspace, { recursive: true, force: true }));
    await requireAbsent(workspace, 'created.txt');
    await writeFile(join(workspace, 'fixture.txt'), 'Fixture café\n');
    const result = await verifySavedFile(
        workspace,
        'fixture.txt',
        'Fixture café\n',
    );
    assert.equal(result.path, join(workspace, 'fixture.txt'));
    assert.equal(result.bytes, 14);
    await assert.rejects(
        verifySavedFile(workspace, 'fixture.txt', 'Fixture café\r\n'),
        /bytes/,
    );
    await assert.rejects(
        verifySavedFile(workspace, 'fixture.txt', 'Fixture café'),
        /bytes/,
    );
    await assert.rejects(
        requireAbsent(workspace, 'fixture.txt'),
        /already exists/,
    );
    await assert.rejects(
        verifySavedFile(workspace, '../fixture.txt', 'Fixture café\n'),
        /destination/,
    );
    await symlink(
        join(workspace, 'fixture.txt'),
        join(workspace, 'created.txt'),
    );
    await assert.rejects(
        requireAbsent(workspace, 'created.txt'),
        /already exists/,
    );
    await assert.rejects(
        verifySavedFile(workspace, 'created.txt', 'Fixture café\n'),
        /destination/,
    );
});
