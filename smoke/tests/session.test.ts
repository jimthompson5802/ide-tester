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
