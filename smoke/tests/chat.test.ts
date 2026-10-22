import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatTurns } from '../src/chat.js';

test('real Chat prompts test context with one token and distinct markers', () => {
  const turns = chatTurns('real');
  assert.equal(turns.length, 2);
  assert.match(turns[0].reply, /^SMOKE_[0-9a-f-]{36}$/);
  assert.equal(turns[1].reply, turns[0].reply);
  assert.notEqual(turns[1].marker, turns[0].marker);
  assert.ok(turns[0].prompt.includes(`Reply with exactly this token and nothing else: ${turns[0].reply}. Do not use tools.`));
  assert.ok(!turns[0].prompt.includes('`'), 'Prompt must survive rendered-text comparison on the follow-up');
  assert.ok(turns[1].prompt.includes('Repeat the token from your previous answer exactly, and nothing else. Do not use tools.'));
  assert.ok(!turns[1].prompt.includes(turns[0].reply));
  for (const turn of turns) assert.ok(turn.prompt.includes(`[smoke:${turn.marker}]`));
});

test('authentication, entitlement and quota UI block; service failures fail without retaining UI text', async () => {
  const { uiIssue } = await import('../src/chat.js');
  for (const text of ['Sign in to use GitHub Copilot', 'Your token has expired', 'Your Copilot subscription has ended', 'You are not signed in to GitHub', 'Unauthorized (401)',
    'Copilot subscription required', 'You do not have access to Copilot', 'Chat quota exceeded', 'You have reached your chat limit']) {
    const issue = uiIssue([text]);
    assert.equal(issue?.outcome, 'blocked', text);
    assert.match(issue!.message, /setup:real-chat/);
  }
  for (const text of ['Authentication service unavailable', 'Service unavailable (503)', 'Rate limit exceeded. Try again later.', 'Request failed: private@example.com']) {
    const issue = uiIssue([text]);
    assert.equal(issue?.outcome, 'failed', text);
    assert.ok(!issue!.message.includes(text));
  }
  assert.equal(uiIssue([]), undefined);
});

test('export verification rejects cancellation, errors and Markdown that renders as the token', async () => {
  const { verifyExport, ChatFailure } = await import('../src/chat.js');
  const turns = [{ marker: 'first', prompt: 'First [smoke:first]', reply: 'SMOKE_token' },
    { marker: 'second', prompt: 'Second [smoke:second]', reply: 'SMOKE_token' }];
  const requests = turns.map(turn => ({ message: { text: turn.prompt }, response: [{ value: '\nSMOKE_token\n' }],
    modelState: { value: 1 } }));
  assert.deepEqual(verifyExport({ requests }, turns), ['\nSMOKE_token\n', '\nSMOKE_token\n']);
  for (const replacement of [
    { ...requests[1], modelState: { value: 2 } },
    { ...requests[1], modelState: { value: 0 } },
    { ...requests[1], modelState: { value: 3 } },
    { ...requests[1], result: { errorDetails: { message: 'Service unavailable' } } },
    { ...requests[1], response: [{ value: '`SMOKE_token`' }] },
    { ...requests[1], response: [{ value: '**SMOKE_token**' }] },
    { ...requests[1], response: [{ value: '' }] },
    { ...requests[1], response: [{ value: 'SMOKE_token extra' }] },
    { ...requests[1], message: { text: 'stale [smoke:first]' } },
    { ...requests[1], message: { text: 'Changed prompt [smoke:second]' } },
  ]) assert.throws(() => verifyExport({ requests: [requests[0], replacement] }, turns),
    error => error instanceof ChatFailure && error.outcome === 'failed');
  assert.throws(() => verifyExport({ requests: [requests[0]] }, turns), /transcript/);
  assert.throws(() => verifyExport({ requests: [{ ...requests[0], response: [{ value: 'changed' }] }, requests[1]] }, turns), /exact/);
  assert.throws(() => verifyExport({ wrong: true }, turns), error => error instanceof ChatFailure && error.outcome === 'harness_error');
});

test('export verification accepts empty MCP startup bookkeeping alongside exact Markdown', async () => {
  const { verifyExport } = await import('../src/chat.js');
  const turn = { marker: 'first', prompt: 'First [smoke:first]', reply: 'SMOKE_token' };
  const request = { message: { text: turn.prompt }, modelState: { value: 1 },
    response: [{ kind: 'mcpServersStarting', didStartServerIds: [] }, { value: 'SMOKE_token' }] };
  assert.deepEqual(verifyExport({ requests: [request] }, [turn]), ['SMOKE_token']);
  for (const part of [{ kind: 'unknown' }, { kind: 'mcpServersStarting', didStartServerIds: ['server'] }]) {
    assert.throws(() => verifyExport({ requests: [{ ...request, response: [part, { value: 'SMOKE_token' }] }] }, [turn]));
  }
});

test('export verification compares final Markdown and excludes thinking parts from evidence', async () => {
  const { verifyExport } = await import('../src/chat.js');
  const turn = { marker: 'first', prompt: 'First [smoke:first]', reply: 'SMOKE_token' };
  const response = [{ kind: 'thinking', value: {}, id: 'reasoning' },
    { kind: 'thinking', value: 'private reasoning', id: 'reasoning', metadata: {} }, { value: 'SMOKE_token' }];
  assert.deepEqual(verifyExport({ requests: [{ message: { text: turn.prompt }, modelState: { value: 1 }, response }] }, [turn]), ['SMOKE_token']);
});
