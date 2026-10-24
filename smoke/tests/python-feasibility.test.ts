import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { verifyWriteGuard } from '../gui/issue-40-python-feasibility.js';

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

test('feasibility probe refuses GUI invocation while containment is unresolved', async () => {
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
                'GUI launch is blocked pending descendant containment',
            ),
    );
});
