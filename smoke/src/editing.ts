import { expect } from '@playwright/test';
import { join } from 'node:path';
import type { Workbench } from './workbench.js';
import { requireAbsent, verifySavedFile } from './files.js';

export const editedText = 'Edited in VS Code.\nSmoke check: café ✓\n';
export const createdText = 'Created in VS Code.\nSaved through Save As.\n';

export async function checkEditing(workbench: Workbench, workspace: string) {
  await requireAbsent(workspace, 'created.txt');
  await workbench.openFile(join(workspace, 'existing.txt'));
  await workbench.replaceEditorText(editedText);
  await workbench.saveEditor();
  await expect(async () => { await verifySavedFile(workspace, 'existing.txt', editedText); }).toPass({ timeout: 15_000 });
  const existing = await verifySavedFile(workspace, 'existing.txt', editedText);

  await workbench.newTextFile();
  await workbench.replaceEditorText(createdText);
  await requireAbsent(workspace, 'created.txt');
  await workbench.saveAs(join(workspace, 'created.txt'));
  await expect(async () => { await verifySavedFile(workspace, 'created.txt', createdText); }).toPass({ timeout: 15_000 });
  const created = await verifySavedFile(workspace, 'created.txt', createdText);

  const files = [];
  for (const [file, text] of [[existing, editedText], [created, createdText]] as const) {
    await workbench.closeEditors();
    await workbench.openFile(file.path);
    const displayedLines = await workbench.expectEditorText(text);
    await verifySavedFile(workspace, file.name, text);
    files.push({ ...file, reopened: true, displayedLines });
  }
  return { createdInitiallyAbsent: true, files };
}
