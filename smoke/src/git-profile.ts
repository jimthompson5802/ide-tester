import { mkdir, readFile, writeFile, realpath, lstat, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { commonSettings, mockProfileSettings, prepareMockState } from './profile.js';
import { requireClosedProfile, type ProfilePaths } from './real-profile.js';
import { GitFailure } from './git-repository.js';

const owner = 'ide-tester:smoke-git:v1';
async function owned(path: string, directory: boolean) {
  if (await realpath(path) !== path || !(directory ? (await lstat(path)).isDirectory() : (await lstat(path)).isFile())) throw new GitFailure('harness_error', 'Git profile ownership mismatch');
}
export async function gitProfile(checkout: string, mockUrl?: string): Promise<{ profile: ProfilePaths; automation: Record<string, string> }> {
  const mockSettings = mockUrl === undefined ? undefined : mockProfileSettings(mockUrl);
  const parent = join(await realpath(checkout), 'profiles');
  await mkdir(parent, { recursive: true });await owned(parent, true);
  const root = join(parent, 'smoke-git');let created = false;
  try { await mkdir(root);created = true; }
  catch (cause) { if ((cause as NodeJS.ErrnoException).code !== 'EEXIST') throw cause; }
  if (created) await writeFile(join(root, '.owner'), owner, { flag: 'wx', mode: 0o600 });
  await owned(root, true);await owned(join(root, '.owner'), false);
  if (await readFile(join(root, '.owner'), 'utf8') !== owner) throw new GitFailure('harness_error', 'Git profile ownership mismatch');
  const profile = { userData: join(root, 'user-data'), extensions: join(root, 'extensions'), state: join(root, 'state') };
  for (const path of Object.values(profile)) { if (created) await mkdir(path);await owned(path, true); }
  try { await requireClosedProfile(profile); }
  catch { throw new GitFailure('blocked', 'Close the dedicated Git profile before testing; inspect stale locks deliberately'); }
  const user = join(profile.userData, 'User');
  if (created) await mkdir(user);await owned(user, true);
  const path = join(user, 'settings.json');let settings: Record<string, unknown> = {};
  if (!created) { await owned(path, false);settings = JSON.parse(await readFile(path, 'utf8')); }
  if (!settings || Array.isArray(settings) || typeof settings !== 'object') throw new GitFailure('harness_error', 'Invalid Git profile settings');
  settings = { ...settings, ...commonSettings, 'chat.disableAIFeatures': true, 'git.path': '/usr/bin/git' };
  for (const key of ['chat.allowAnonymousAccess', 'github.copilot.advanced.debug.overrideProxyUrl', 'github.copilot.advanced.debug.overrideCapiUrl', 'github.copilot.advanced.debug.overrideAuthType']) delete settings[key];
  if (mockSettings) settings = { ...settings, ...mockSettings };
  // Never follow links into another profile, database, or authentication state.
  for (const [item, directory] of [[join(user, 'globalStorage'), true], [join(user, 'globalStorage/state.vscdb'), false], [join(user, 'globalStorage/state.vscdb-wal'), false], [join(user, 'globalStorage/state.vscdb-shm'), false], [join(profile.state, '.copilot'), true], [join(profile.state, '.codex'), true]] as const) {
    try { await lstat(item); } catch (cause) { if ((cause as NodeJS.ErrnoException).code === 'ENOENT') continue; throw cause; }
    await owned(item, directory);
  }
  const temporary = join(user, 'settings.smoke-tmp.json');
  await writeFile(temporary, JSON.stringify(settings, null, 2), { flag: 'wx', mode: 0o600 });
  await rename(temporary, path);
  const automation = mockUrl === undefined ? {} : await prepareMockState(profile, mockUrl);
  if (mockUrl !== undefined) {
    // VS Code's first Git-only launch can migrate the built-in extension to disabled.
    // Developer-authorized repair is limited to this identifier in this owned profile.
    const db = new DatabaseSync(join(user, 'globalStorage/state.vscdb'));
    try {
      const key = 'extensionsIdentifiers/disabled';
      const value = db.prepare('SELECT value FROM ItemTable WHERE key = ?').get(key)?.value;
      if (value !== undefined) {
        let disabled: unknown;
        try { disabled = JSON.parse(String(value)); }
        catch { throw new GitFailure('harness_error', 'Malformed Git profile extension enablement state'); }
        if (!Array.isArray(disabled) || disabled.some(item => !item || typeof item.id !== 'string')) {
          throw new GitFailure('harness_error', 'Malformed Git profile extension enablement state');
        }
        const retained = disabled.filter(item => item.id.toLowerCase() !== 'github.copilot-chat');
        if (retained.length !== disabled.length) db.prepare('UPDATE ItemTable SET value = ? WHERE key = ?').run(JSON.stringify(retained), key);
      }
    } finally { db.close(); }
  }
  return { profile, automation };
}
