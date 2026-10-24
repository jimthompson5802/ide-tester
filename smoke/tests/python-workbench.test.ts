import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Page } from '@playwright/test';
import { WalkthroughDeadline } from '../gui/python-deadline.js';
import { DeadlineWorkbench } from '../gui/python-workbench.js';

for (const action of [
    'openFile',
    'replaceEditorText',
    'saveAs',
    'newTextFile',
    'closeEditors',
    'typeInEditor',
] as const) {
    test(`expired ${action} cannot resume with a second UI action`, async () => {
        const deadline = new WalkthroughDeadline(20);
        let release!: () => void;
        const blocked = new Promise<void>((done) => {
            release = done;
        });
        let uiCalls = 0;
        const invoke = async (): Promise<void> => {
            uiCalls++;
            await blocked;
        };
        const fake = {
            keyboard: { press: invoke },
            locator: () => ({ focus: invoke, fill: invoke }),
            evaluate: invoke,
        };
        // Only the first externally awaited action is reached by these tests.
        const workbench = new DeadlineWorkbench(
            fake as unknown as Page,
            deadline,
        );
        const operation =
            action === 'typeInEditor'
                ? workbench.typeInEditor('.editor', 'source')
                : action === 'newTextFile' || action === 'closeEditors'
                  ? workbench[action]()
                  : workbench[action]('/owned/hello.py');
        await assert.rejects(operation, /expired/);
        release();
        await deadline.settle(1000);
        assert.equal(uiCalls, 1);
    });
}
