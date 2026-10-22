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
    assert.equal(await executeCLI(args, checkout, false, message => messages.push(message)), 1);
    const message = messages.at(-1)!;
    assert.match(message, /blocked/);
    const output = JSON.parse(message);
    const result = JSON.parse(await readFile(output.resultPath, 'utf8'));
    t.after(() => rm(result.resourcesPath, { recursive: true, force: true }));
    assert.equal(result.outcome, 'blocked');
    assert.equal(result.mockRequestCount, 0);
    assert.equal(result.cleanup.reservationRetained, false);
  }
  assert.match(messages[1], /ENOENT/);
  assert.equal(JSON.parse(messages[1]).scope, 'selected-suites');
});
