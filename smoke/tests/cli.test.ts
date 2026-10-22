import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeCLI } from '../src/cli.js';

test('CLI reports invalid arguments and missing installed apps as nonzero without GUI execution', async t => {
  const checkout = await mkdtemp(join(tmpdir(), 'smoke-cli-test-'));
  t.after(() => rm(checkout, { recursive: true, force: true }));
  const messages: string[] = [];
  for (const args of [[], ['--build', join(checkout, 'Missing.app'), '--suite', 'all']]) {
    assert.equal(await executeCLI([...args, '--output', 'json'], checkout, false, message => messages.push(message)), 1);
    const message = messages.at(-1)!;
    assert.match(message, /blocked/);
    const output = JSON.parse(message);
    const result = JSON.parse(await readFile(output.resultPath, 'utf8'));
    t.after(() => rm(result.resourcesPath, { recursive: true, force: true }));
    assert.equal(await readFile(output.resultPath.replace(/result.json$/, 'result.txt'), 'utf8'),
      (await import('../src/report.js')).formatResult(result) + '\n');
    assert.equal(result.outcome, 'blocked');
    assert.equal(result.mockRequestCount, 0);
    assert.equal(result.cleanup.reservationRetained, false);
  }
  assert.match(messages[1], /ENOENT/);
  assert.equal(JSON.parse(messages[1]).scope, 'selected-suites');
});

test('default summary is saved beside unchanged JSON for both commands', async t => {
  const checkout = await mkdtemp(join(tmpdir(), 'smoke-text-test-'));
  t.after(() => rm(checkout, { recursive: true, force: true }));
  for (const qualify of [false, true]) {
    let message = '';
    assert.equal(await executeCLI([], checkout, qualify, text => { message = text; }), 1);
    assert.match(message, /Smoke test: BLOCKED/);
    const path = message.match(/JSON report: (.+)/)![1];
    assert.equal(await readFile(path.replace(/result.json$/, 'result.txt'), 'utf8'), message + '\n');
    const saved = JSON.parse(await readFile(path, 'utf8'));
    t.after(() => rm(saved.resourcesPath, { recursive: true, force: true }));
    assert.equal(saved.scope, qualify ? 'foundation' : 'selected-suites');
    assert.equal(saved.checks, undefined);
    assert.equal(saved.output, undefined);
  }
});

test('an existing reservation produces an honest early harness error in both modes', async t => {
  const { mkdir, writeFile } = await import('node:fs/promises');
  const checkout = await mkdtemp(join(tmpdir(), 'smoke-reserved-test-'));
  t.after(() => rm(checkout, { recursive: true, force: true }));
  await mkdir(join(checkout, 'reports/smoke'), { recursive: true });
  await writeFile(join(checkout, 'reports/smoke/.reservation'), 'owned elsewhere');
  for (const mode of ['text', 'json']) {
    let message = '';
    assert.equal(await executeCLI(['--output', mode], checkout, false, value => { message = value; }), 1);
    if (mode === 'json') assert.equal(JSON.parse(message).outcome, 'harness_error');
    else assert.match(message, /Smoke test: HARNESS ERROR/);
  }
});

test('invalid output is blocked and still saves both reports', async t => {
  const checkout = await mkdtemp(join(tmpdir(), 'smoke-output-test-'));
  t.after(() => rm(checkout, { recursive: true, force: true }));
  let message = '';
  assert.equal(await executeCLI(['--build', '/a.app', '--output', 'xml'], checkout, false,
    value => { message = value; }), 1);
  assert.match(message, /--output must be text or json/);
  const path = message.match(/JSON report: (.+)/)![1];
  const result = JSON.parse(await readFile(path, 'utf8'));
  t.after(() => rm(result.resourcesPath, { recursive: true, force: true }));
  assert.equal(result.outcome, 'blocked');
  assert.equal(await readFile(path.replace(/result.json$/, 'result.txt'), 'utf8'), message + '\n');
});

test('early argument failures retain the requested real backend and inapplicable mock evidence', async t => {
  const root = await mkdtemp(join(tmpdir(), 'real-cli-report-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let message = '';
  const code = await executeCLI(['--build', '/missing.app', '--suite', 'editing', '--chat-backend', 'real', '--output', 'json'], root, false, value => { message = value; });
  assert.equal(code, 1);
  const result = JSON.parse(message);
  t.after(() => rm(result.resourcesPath, { recursive: true, force: true }));
  assert.equal(result.outcome, 'blocked');
  assert.equal(result.chatBackend, 'real');
  assert.equal(result.mockRequestEvidence, 'inapplicable');
  assert.equal(result.mockRequestCount, null);
});
