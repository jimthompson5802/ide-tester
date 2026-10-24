import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Run } from './resources.js';
import { syntheticToken } from './mock.js';

export const commonSettings = {
    'files.autoSave': 'off', 'editor.formatOnSave': false, 'files.simpleDialog.enable': true,
    'workbench.startupEditor': 'none', 'workbench.tips.enabled': false,
    'window.restoreWindows': 'none', 'security.workspace.trust.enabled': false,
    'update.mode': 'none', 'extensions.autoUpdate': false, 'extensions.autoCheckUpdates': false,
    'telemetry.telemetryLevel': 'off', 'chat.disableAIFeatures': false,
};

export function mockProfileSettings(mockUrl: string) {
  const endpoint = new URL(mockUrl);
  if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || !endpoint.port || endpoint.origin !== mockUrl) {
    throw new Error('Mock URL must be a loopback HTTP origin with an explicit port');
  }
  return {
    ...commonSettings,
    'chat.allowAnonymousAccess': true,
    'github.copilot.advanced.debug.overrideProxyUrl': mockUrl,
    'github.copilot.advanced.debug.overrideCapiUrl': mockUrl,
    'github.copilot.advanced.debug.overrideAuthType': 'token',
    'github.copilot.chat.githubMcpServer.enabled': false,
    'chat.mcp.discovery.enabled': false, 'chat.mcp.enabled': false,
    'github.copilot.chat.backgroundAgent.enabled': false,
    'chat.agentHost.enabled': false,
  };
}

export async function prepareProfile(run: Run, mockUrl: string): Promise<Record<string, string>> {
  const settings = mockProfileSettings(mockUrl);
  await mkdir(join(run.userData, 'User/globalStorage'), { recursive: true });
  await writeFile(join(run.userData, 'User/settings.json'), JSON.stringify(settings, null, 2), { flag: 'wx' });
  return prepareMockState(run, mockUrl);
}

// Call only after the caller has established ownership and closed-profile state.
export async function prepareMockState(run: Pick<Run, 'userData' | 'state'>, mockUrl: string): Promise<Record<string, string>> {
  mockProfileSettings(mockUrl);
  const storage = join(run.userData, 'User/globalStorage');
  await mkdir(storage, { recursive: true });
  const db = new DatabaseSync(join(storage, 'state.vscdb'));
  try {
    db.exec('CREATE TABLE IF NOT EXISTS ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)');
    db.prepare('INSERT INTO ItemTable (key, value) VALUES (?, ?)').run('builtinChatExtensionEnablementMigration', 'true');
  } finally { db.close(); }
  for (const dir of ['.copilot', '.codex']) await mkdir(join(run.state, dir), { recursive: true });
  return {
    GITHUB_PAT: 'smoke-synthetic-pat', IS_SCENARIO_AUTOMATION: '1',
    VSCODE_COPILOT_CHAT_TOKEN: Buffer.from(JSON.stringify(syntheticToken(mockUrl))).toString('base64'),
    XDG_STATE_HOME: run.state, COPILOT_HOME: join(run.state, '.copilot'), CODEX_HOME: join(run.state, '.codex'),
  };
}
