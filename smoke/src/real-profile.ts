import { mkdir, readFile, realpath, writeFile, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import type { ChatBackend } from './arguments.js';
import { commonSettings } from './profile.js';

export class ProfilePrerequisite extends Error {}

const owner = 'ide-tester:smoke-real-chat:v1';
export interface ProfilePaths { userData: string; extensions: string; state: string }

export async function realProfile(checkout: string, initialize = false): Promise<ProfilePaths> {
  const parent = join(await realpath(checkout), 'profiles');
  if (initialize) await mkdir(parent, { recursive: true });
  try {
    if (await realpath(parent) !== parent) throw new ProfilePrerequisite('Profile ownership mismatch');
  } catch (cause) { throw new ProfilePrerequisite('Profile ownership unavailable; run setup:real-chat', { cause }); }
  const root = join(parent, 'smoke-real-chat');
  let created = false;
  if (initialize) {
    try { await mkdir(root); created = true; }
    catch (cause) { if ((cause as NodeJS.ErrnoException).code !== 'EEXIST') throw cause; }
  }
  if (created) await writeFile(join(root, '.owner'), owner, { flag: 'wx', mode: 0o600 });
  try {
    if (await realpath(root) !== root || await readFile(join(root, '.owner'), 'utf8') !== owner) throw new ProfilePrerequisite('Profile ownership mismatch');
  } catch (cause) { throw new ProfilePrerequisite('Profile ownership missing or invalid; run setup:real-chat with an owned profile', { cause }); }
  const paths = { userData: join(root, 'user-data'), extensions: join(root, 'extensions'), state: join(root, 'state') };
  for (const dir of Object.values(paths)) {
    if (created) await mkdir(dir);
    if (await realpath(dir) !== dir) throw new ProfilePrerequisite('Profile ownership mismatch');
  }
  if (created) {
    await mkdir(join(paths.userData, 'User'));
    await writeFile(join(paths.userData, 'User/settings.json'), JSON.stringify({ ...commonSettings, 'chat.allowAnonymousAccess': false }, null, 2), { flag: 'wx' });
  }
  const settingsPath = join(paths.userData, 'User/settings.json');
  const settings = JSON.parse(await readFile(settingsPath, 'utf8')) as Record<string, unknown>;
  if (Object.keys(settings).some(key => key.startsWith('github.copilot.') && /override/i.test(key))) {
    throw new ProfilePrerequisite('Real profile contains mock endpoint/auth overrides; remove those settings before setup');
  }
  if (settings['chat.allowAnonymousAccess'] !== false) {
    if (!initialize) throw new ProfilePrerequisite('Real profile requires authenticated Chat; rerun setup:real-chat');
    await requireClosedProfile(paths);
    await writeFile(settingsPath, JSON.stringify({ ...settings, 'chat.allowAnonymousAccess': false }, null, 2));
  }
  return paths;
}

export function backendLaunch(backend: ChatBackend, profile: ProfilePaths, inherited: NodeJS.ProcessEnv = process.env) {
  const env: Record<string, string> = {};
  const normalEnvironment = new Set(['HOME', 'PATH', 'TMPDIR', 'LANG', 'LC_ALL', 'LC_CTYPE',
    'USER', 'LOGNAME', 'SHELL', 'SECURITYSESSIONID', '__CF_USER_TEXT_ENCODING']);
  for (const [key, value] of Object.entries(inherited)) {
    if (value !== undefined && (backend === 'mock' || normalEnvironment.has(key))) env[key] = value;
  }
  Object.assign(env, { XDG_STATE_HOME: profile.state, COPILOT_HOME: join(profile.state, '.copilot'), CODEX_HOME: join(profile.state, '.codex') });
  return { env, args: ['--user-data-dir', profile.userData, '--extensions-dir', profile.extensions,
    // Session identity is emitted by ChatModelSelection's debug-level binding events.
    ...(backend === 'real' ? ['--log=debug'] : []),
    ...(backend === 'mock' ? ['--use-inmemory-secretstorage', '--password-store=basic'] : [])] };
}

export async function requireClosedProfile(profile: ProfilePaths): Promise<void> {
  for (const name of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
    try { await lstat(join(profile.userData, name)); }
    catch (cause) { if ((cause as NodeJS.ErrnoException).code === 'ENOENT') continue; throw cause; }
    throw new ProfilePrerequisite('Close the dedicated setup/test instance before testing; inspect its profile lock deliberately if shutdown was abnormal');
  }
}
