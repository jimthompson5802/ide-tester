import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, access, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { realProfile, backendLaunch } from '../src/real-profile.js';
import { createRun, finishRun } from '../src/resources.js';
import { parseArguments, validateBackend } from '../src/arguments.js';

test('backend selection defaults to mock and rejects unsupported combinations', () => {
  assert.equal(parseArguments(['--build', '/a.app'], 'darwin').chatBackend, 'mock');
  for (const suite of ['chat', 'all']) {
    const options = parseArguments(['--build', '/a.app', '--suite', suite, '--chat-backend', 'real'], 'darwin');
    assert.equal(options.chatBackend, 'real');
    assert.throws(() => validateBackend(options, true), /qualification/);
  }
  assert.throws(() => parseArguments(['--build', '/a.app', '--suite', 'editing', '--chat-backend', 'real'], 'darwin'), /editing/);
  assert.throws(() => parseArguments(['--build', '/a.app', '--chat-backend', 'other'], 'darwin'), /backend/);
});

test('real profile requires setup ownership and survives disposable run cleanup', async t => {
  const root = await mkdtemp(join(tmpdir(), 'real-profile-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(realProfile(root), /setup:real-chat/);
  const profile = await realProfile(root, true);
  assert.deepEqual(await realProfile(root), profile);
  const settings = JSON.parse(await readFile(join(profile.userData, 'User/settings.json'), 'utf8'));
  assert.equal(settings['files.autoSave'], 'off');
  assert.ok(!Object.keys(settings).some(key => /override/.test(key)));
  const launch = backendLaunch('real', profile, { PRIVATE_PASSWORD: 'private', HOME: '/normal-home', GITHUB_PAT: 'private', HTTPS_PROXY: 'http://proxy', VSCODE_COPILOT_CHAT_TOKEN: 'private' });
  assert.equal(launch.env.HOME, '/normal-home');
  assert.equal(launch.env.PRIVATE_PASSWORD, undefined);
  assert.equal(launch.env.GITHUB_PAT, undefined);
  assert.equal(launch.env.VSCODE_COPILOT_CHAT_TOKEN, undefined);
  assert.equal(launch.env.HTTPS_PROXY, undefined);
  assert.ok(!launch.args.some(arg => /inmemory|password-store/.test(arg)));
  assert.ok(launch.args.includes('--log=debug'), 'Session binding diagnostics require debug logging');
  for (const passed of [true, false]) {
    const run = await createRun(root);
    const cleanup = await finishRun({ ...run, ...profile }, passed, []);
    assert.equal(cleanup.errors.length, 0);
    await access(profile.userData);
    if (!passed) await rm(run.resources, { recursive: true });
  }
});

test('setup rejects unowned or redirected profiles', async t => {
  const root = await mkdtemp(join(tmpdir(), 'real-unowned-'));
  const outside = await mkdtemp(join(tmpdir(), 'real-outside-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await mkdir(join(root, 'profiles/smoke-real-chat'), { recursive: true });
  await assert.rejects(realProfile(root, true), /ownership/);
  await rm(join(root, 'profiles'), { recursive: true });
  await symlink(outside, join(root, 'profiles'));
  await assert.rejects(realProfile(root, true), /ownership/);
});

test('setup and real backend reject invalid usage before any GUI launch', async t => {
  const { setupRealChat } = await import('../src/setup-real-chat.js');
  const { runFoundation, runSmoke } = await import('../src/runner.js');
  await assert.rejects(setupRealChat(['--build', '/a.app', '--suite', 'chat']), /only --build/);
  const root = await mkdtemp(join(tmpdir(), 'real-gate-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const execute of [runFoundation, runSmoke]) {
    const result = await execute({ build: '/missing.app', suite: 'chat', chatBackend: 'real' }, root);
    assert.equal(result.outcome, 'blocked');
    assert.match(result.error!, /qualification|ENOENT/);
    await rm(result.resourcesPath, { recursive: true });
  }
});

test('real profiles disable anonymous access and refuse an existing instance lock', async t => {
  const { writeFile } = await import('node:fs/promises');
  const { requireClosedProfile } = await import('../src/real-profile.js');
  const root = await mkdtemp(join(tmpdir(), 'real-closed-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const profile = await realProfile(root, true);
  const settings = JSON.parse(await readFile(join(profile.userData, 'User/settings.json'), 'utf8'));
  assert.equal(settings['chat.allowAnonymousAccess'], false);
  await requireClosedProfile(profile);
  await writeFile(join(profile.userData, 'SingletonLock'), 'owned setup running');
  await assert.rejects(requireClosedProfile(profile), /Close.*setup/);
});

test('setup refreshes owned older settings without losing sign-in state and real runs reject mock overrides', async t => {
  const { writeFile } = await import('node:fs/promises');
  const root = await mkdtemp(join(tmpdir(), 'real-settings-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const profile = await realProfile(root, true);
  const path = join(profile.userData, 'User/settings.json');
  await writeFile(path, JSON.stringify({ 'editor.fontSize': 15 }));
  await writeFile(join(profile.state, 'preserved'), 'owned sign-in state placeholder');
  await assert.rejects(realProfile(root), /setup:real-chat/);
  await realProfile(root, true);
  assert.equal(JSON.parse(await readFile(path, 'utf8'))['chat.allowAnonymousAccess'], false);
  assert.equal(JSON.parse(await readFile(path, 'utf8'))['editor.fontSize'], 15);
  assert.equal(await readFile(join(profile.state, 'preserved'), 'utf8'), 'owned sign-in state placeholder');
  await writeFile(path, JSON.stringify({ 'chat.allowAnonymousAccess': false, 'github.copilot.advanced.debug.overrideProxyUrl': 'http://127.0.0.1:1' }));
  await assert.rejects(realProfile(root), /mock.*override/i);
});
