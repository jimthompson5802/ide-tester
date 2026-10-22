import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionFromLog } from '../src/session.js';

test('session tracking uses the latest workbench view identity and fails closed on a replaced or unbound session', () => {
  const first = '2026-10-22 [info] [ChatModelSelection] event=compatibility-check surface="workbench" sessionKey="local" conversationKey="vscode-chat-session://local/first" widgetViewKind="view"';
  const replaced = first.replace('/first', '/second');
  assert.equal(sessionFromLog(first), 'vscode-chat-session://local/first');
  assert.equal(sessionFromLog(first + '\n' + replaced), 'vscode-chat-session://local/second');
  assert.equal(sessionFromLog(first + '\n' + replaced.replace('widgetViewKind="view"', 'widgetViewKind="editor"')), 'vscode-chat-session://local/first');
  assert.equal(sessionFromLog(first + '\n' + replaced.replace('conversationKey="vscode-chat-session://local/second"', 'conversationKey=undefined')), '');
  assert.equal(sessionFromLog(first + '\n' + replaced.replace('sessionKey="local"', 'sessionKey="copilotcli"')), '');
  assert.equal(sessionFromLog('unrelated log line'), '');
});

test('persistent profiles bind only a new launch log and ignore earlier sessions', async t => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { rendererLogs, readLocalSession } = await import('../src/session.js');
  const root = await mkdtemp(join(tmpdir(), 'session-logs-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const line = '[ChatModelSelection] surface="workbench" sessionKey="local" conversationKey="vscode-chat-session://local/current" widgetViewKind="view"';
  await mkdir(join(root, 'logs/old/window1'), { recursive: true });
  await writeFile(join(root, 'logs/old/window1/renderer.log'), line.replace('/current', '/stale'));
  const previous = await rendererLogs(root);
  assert.equal(await readLocalSession(root, previous), '');
  await mkdir(join(root, 'logs/new/window1'), { recursive: true });
  await writeFile(join(root, 'logs/new/window1/renderer.log'), line);
  assert.equal(await readLocalSession(root, previous), 'vscode-chat-session://local/current');
  await mkdir(join(root, 'logs/ambiguous/window1'), { recursive: true });
  await writeFile(join(root, 'logs/ambiguous/window1/renderer.log'), line);
  assert.equal(await readLocalSession(root, previous), '');
});
