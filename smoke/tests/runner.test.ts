import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, access, mkdir, writeFile, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { realProfile } from '../src/real-profile.js';
import { runSmoke, runFoundation } from '../src/runner.js';

test('a missing app produces a blocked JSON result without launching the GUI', async t => {
  const checkout = await mkdtemp(join(tmpdir(), 'smoke-runner-test-'));
  t.after(() => rm(checkout, { recursive: true, force: true }));
  const result = await runFoundation({ build: join(checkout, 'Missing.app'), suite: 'chat' }, checkout);
  t.after(() => rm(result.resourcesPath, { recursive: true, force: true }));
  assert.equal(result.outcome, 'blocked');
  assert.equal(result.scope, 'foundation');
  assert.equal(result.mockRequestCount, 0);
  assert.match(result.error ?? '', /ENOENT/);
  assert.equal(result.cleanup.reservationRetained, false);
  const saved = JSON.parse(await readFile(result.resultPath, 'utf8'));
  assert.equal(saved.outcome, 'blocked');
  assert.ok(saved.durationMs >= 0);
  await access(result.resultPath);
});

test('uncertain Electron launch retains the reservation and closes the owned mock', async t => {
  const checkout = await mkdtemp(join(tmpdir(), 'smoke-launch-test-'));
  t.after(() => rm(checkout, { recursive: true, force: true }));
  const app = await fixtureApp(checkout);
  let mockUrl = '';
  const previous = process.env.UNRELATED_PRIVATE_TOKEN;
  process.env.UNRELATED_PRIVATE_TOKEN = 'must-not-reach-test-app';
  t.after(() => {
    if (previous === undefined) delete process.env.UNRELATED_PRIVATE_TOKEN;
    else process.env.UNRELATED_PRIVATE_TOKEN = previous;
  });
  const result = await runFoundation({ build: app, suite: 'chat' }, checkout, async options => {
    const token = JSON.parse(Buffer.from(options!.env!.VSCODE_COPILOT_CHAT_TOKEN, 'base64').toString());
    mockUrl = token.endpoints.api;
    assert.equal(options?.timeout, 60000);
    assert.equal(options?.env?.UNRELATED_PRIVATE_TOKEN, undefined);
    throw new Error('Electron launch interrupted');
  });
  t.after(() => rm(result.resourcesPath, { recursive: true, force: true }));
  assert.equal(result.outcome, 'harness_error');
  assert.equal(result.cleanup.reservationRetained, true);
  assert.match(result.error ?? '', /Electron launch interrupted/);
  await access(join(checkout, 'reports/smoke/.reservation'));
  await assert.rejects(fetch(mockUrl, { signal: AbortSignal.timeout(1000) }));
});

async function fixtureApp(checkout: string) {
  const app = join(checkout, 'Code.app');
  const resources = join(app, 'Contents/Resources/app');
  await mkdir(join(resources, 'extensions/copilot'), { recursive: true });
  await mkdir(join(app, 'Contents/MacOS'), { recursive: true });
  await writeFile(join(app, 'Contents/Info.plist'), '<plist><dict><key>CFBundleExecutable</key><string>Electron</string></dict></plist>');
  await writeFile(join(resources, 'package.json'), '{"version":"1.135.0"}');
  await writeFile(join(resources, 'extensions/copilot/package.json'), '{"name":"copilot-chat","version":"0.63.0"}');
  await writeFile(join(app, 'Contents/MacOS/Electron'), 'fixture; never executed');
  await chmod(join(app, 'Contents/MacOS/Electron'), 0o700);
  return app;
}

test('real runs block missing setup and launch only with persistent storage and inapplicable mock evidence', async t => {
  const checkout = await mkdtemp(join(tmpdir(), 'smoke-real-launch-'));
  t.after(() => rm(checkout, { recursive: true, force: true }));
  const app = await fixtureApp(checkout);
  const blocked = await runSmoke({ build: app, suite: 'chat', chatBackend: 'real' }, checkout, async () => {
    assert.fail('Missing setup must never launch');
  });
  t.after(() => rm(blocked.resourcesPath, { recursive: true, force: true }));
  assert.equal(blocked.outcome, 'blocked');
  assert.match(blocked.error!, /setup:real-chat/);
  assert.equal(blocked.chatBackend, 'real');
  assert.equal(blocked.mockRequestCount, null);
  const profile = await realProfile(checkout, true);
  const settingsPath = join(profile.userData, 'User/settings.json');
  const settings = await readFile(settingsPath, 'utf8');
  await writeFile(settingsPath, '{invalid settings');
  const invalid = await runSmoke({ build: app, suite: 'chat', chatBackend: 'real' }, checkout, async () => assert.fail('Invalid configuration must never launch'));
  t.after(() => rm(invalid.resourcesPath, { recursive: true, force: true }));
  assert.equal(invalid.outcome, 'harness_error');
  await writeFile(settingsPath, settings);
  let launched = false;
  const result = await runSmoke({ build: app, suite: 'all', chatBackend: 'real' }, checkout, async options => {
    launched = true;
    assert.ok(options!.args!.includes(profile.userData));
    assert.ok(options!.args!.includes(profile.extensions));
    assert.ok(!options!.args!.some(arg => /inmemory|password-store/.test(arg)));
    assert.equal(options!.env!.VSCODE_COPILOT_CHAT_TOKEN, undefined);
    assert.equal(options!.env!.GITHUB_PAT, undefined);
    assert.equal(options!.env!.HTTP_PROXY, undefined);
    assert.equal(options!.env!.HOME, process.env.HOME);
    throw new Error('Simulated uncertain launch; no application executed');
  });
  t.after(() => rm(result.resourcesPath, { recursive: true, force: true }));
  assert.equal(launched, true);
  assert.equal(result.outcome, 'harness_error');
  assert.equal(result.mockRequestEvidence, 'inapplicable');
  assert.equal(result.requests, null);
  assert.equal(result.mockRequestCount, null);
  assert.deepEqual(result.checks.map(check => check.outcome), ['not_run', 'not_run']);
  assert.equal(result.cleanup.reservationRetained, true);
  await access(profile.userData);
  const saved = JSON.parse(await readFile(result.resultPath, 'utf8'));
  assert.equal(saved.chatBackend, 'real');
  assert.equal(saved.persistentProfilePath, profile.userData);
  assert.equal(saved.requests, null);
});
