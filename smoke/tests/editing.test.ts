import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkEditing } from '../src/editing.js';
import type { Workbench } from '../src/workbench.js';

test('editing completes its file verification with all editors closed', async (t) => {
    const workspace = await realpath(
        await mkdtemp(join(tmpdir(), 'smoke-editing-test-')),
    );
    t.after(() => rm(workspace, { recursive: true, force: true }));
    await writeFile(join(workspace, 'existing.txt'), 'Initial fixture\n');
    const open = new Set<string>();
    let active = '';
    let text = '';
    const workbench = {
        async openFile(path: string) {
            active = path;
            open.add(path);
        },
        async replaceEditorText(value: string) {
            text = value;
        },
        async saveEditor() {
            await writeFile(active, text);
        },
        async newTextFile() {
            active = 'untitled';
            open.add(active);
        },
        async saveAs(path: string) {
            open.delete(active);
            active = path;
            open.add(path);
            await writeFile(path, text);
        },
        async closeEditors() {
            open.clear();
            active = '';
        },
        async expectEditorText(value: string) {
            return value.trimEnd().split('\n');
        },
    };
    const evidence = await checkEditing(workbench as Workbench, workspace);
    assert.equal(evidence.files.length, 2);
    assert.ok(evidence.files.every((file) => file.reopened));
    assert.equal(
        open.size,
        0,
        'No verified file should remain open when the suite completes',
    );
});
