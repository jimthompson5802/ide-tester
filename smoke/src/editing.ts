import { Cancellation } from './cancellation.js';
import { expect } from '@playwright/test';
import { join } from 'node:path';
import type { Workbench } from './workbench.js';
import { requireAbsent, verifySavedFile } from './files.js';

export const editedText = 'Edited in VS Code.\nSmoke check: café ✓\n';
export const createdText = 'Created in VS Code.\nSaved through Save As.\n';

interface EditingEvidence {
    createdInitiallyAbsent: boolean;
    files: (Awaited<ReturnType<typeof verifySavedFile>> & {
        reopened: boolean;
        displayedLines: string[];
    })[];
}

export async function checkEditing(
    workbench: Workbench,
    workspace: string,
    cancellation = new Cancellation(),
): Promise<EditingEvidence> {
    await cancellation.perform(async () =>
        requireAbsent(workspace, 'created.txt'),
    );
    await cancellation.perform(async () =>
        workbench.openFile(join(workspace, 'existing.txt')),
    );
    await cancellation.perform(async () =>
        workbench.replaceEditorText(editedText),
    );
    await cancellation.perform(async () => workbench.saveEditor());
    await cancellation.perform(async () =>
        expect(async () => {
            await cancellation.perform(async () =>
                verifySavedFile(workspace, 'existing.txt', editedText),
            );
        }).toPass({ timeout: 15_000 }),
    );
    const existing = await cancellation.perform(async () =>
        verifySavedFile(workspace, 'existing.txt', editedText),
    );

    await cancellation.perform(async () => workbench.newTextFile());
    await cancellation.perform(async () =>
        workbench.replaceEditorText(createdText),
    );
    await cancellation.perform(async () =>
        requireAbsent(workspace, 'created.txt'),
    );
    await cancellation.perform(async () =>
        workbench.saveAs(join(workspace, 'created.txt')),
    );
    await cancellation.perform(async () =>
        expect(async () => {
            await cancellation.perform(async () =>
                verifySavedFile(workspace, 'created.txt', createdText),
            );
        }).toPass({ timeout: 15_000 }),
    );
    const created = await cancellation.perform(async () =>
        verifySavedFile(workspace, 'created.txt', createdText),
    );

    const files = [];
    for (const [file, text] of [
        [existing, editedText],
        [created, createdText],
    ] as const) {
        await cancellation.perform(async () => workbench.closeEditors());
        await cancellation.perform(async () => workbench.openFile(file.path));
        const displayedLines = await cancellation.perform(async () =>
            workbench.expectEditorText(text),
        );
        await cancellation.perform(async () =>
            verifySavedFile(workspace, file.name, text),
        );
        files.push({ ...file, reopened: true, displayedLines });
    }
    await cancellation.perform(async () => workbench.closeEditors());
    return { createdInitiallyAbsent: true, files };
}
