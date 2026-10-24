import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, access, symlink, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { gitProfile } from '../src/git-profile.js';
import { createRun, finishRun } from '../src/resources.js';

test('fresh persistent Git-only profile has no Chat state, retains unrelated state and survives run cleanup', async t => {
  const root = await mkdtemp(join(tmpdir(), 'git-profile-test-'));t.after(() => rm(root,{recursive:true,force:true}));
  const { profile, automation } = await gitProfile(root);
  assert.deepEqual(automation, {});
  const path = join(profile.userData,'User/settings.json');
  const settings = JSON.parse(await readFile(path,'utf8'));
  assert.equal(settings['chat.disableAIFeatures'],true);
  assert.equal(settings['git.path'],'/usr/bin/git');
  await assert.rejects(access(join(profile.userData,'User/globalStorage/state.vscdb')));
  await writeFile(join(profile.state,'retained'),'owned state');
  await writeFile(path,JSON.stringify({...settings,'editor.fontSize':17}));
  for (const passed of [true,false]) {
    const run=await createRun(root);t.after(()=>rm(run.resources,{recursive:true,force:true}));
    await gitProfile(root);const cleanup=await finishRun({...run,...profile},passed,[]);
    assert.equal(cleanup.errors.length,0);await access(profile.userData);
  }
  assert.equal(await readFile(join(profile.state,'retained'),'utf8'),'owned state');
  assert.equal(JSON.parse(await readFile(path,'utf8'))['editor.fontSize'],17);
});

test('mock combined refreshes endpoints, preserves state and returns to mock-free Git-only', async t => {
  const root = await mkdtemp(join(tmpdir(),'git-profile-transition-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const first=await gitProfile(root,'http://127.0.0.1:12345');
  const path=join(first.profile.userData,'User/settings.json');
  assert.ok(first.automation.VSCODE_COPILOT_CHAT_TOKEN);
  const dbPath=join(first.profile.userData,'User/globalStorage/state.vscdb');
  const db=new DatabaseSync(dbPath);
  db.prepare('INSERT INTO ItemTable (key,value) VALUES (?,?)').run('unrelated-state','retained');db.close();
  const gitOnly=await gitProfile(root);
  assert.deepEqual(gitOnly.automation,{});
  const settings=JSON.parse(await readFile(path,'utf8'));
  assert.equal(settings['chat.disableAIFeatures'],true);
  assert.ok(!Object.keys(settings).some(key=>key.includes('override')));
  assert.equal(settings['chat.allowAnonymousAccess'],undefined);
  const again=await gitProfile(root,'http://127.0.0.1:23456');
  const refreshed=JSON.parse(await readFile(path,'utf8'));
  assert.equal(refreshed['github.copilot.advanced.debug.overrideCapiUrl'],'http://127.0.0.1:23456');
  assert.equal(refreshed['chat.disableAIFeatures'],false);
  const token=JSON.parse(Buffer.from(again.automation.VSCODE_COPILOT_CHAT_TOKEN,'base64').toString());
  assert.equal(token.endpoints.api,'http://127.0.0.1:23456');
  const retained=new DatabaseSync(dbPath);
  assert.equal(retained.prepare('SELECT value FROM ItemTable WHERE key=?').get('unrelated-state')?.value,'retained');
  assert.equal(retained.prepare('SELECT value FROM ItemTable WHERE key=?').get('builtinChatExtensionEnablementMigration')?.value,'true');retained.close();
});

test('open, unowned, symlinked or malformed profiles stop before settings/state mutation', async t => {
  const root=await mkdtemp(join(tmpdir(),'git-profile-refusal-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const {profile}=await gitProfile(root);const path=join(profile.userData,'User/settings.json');
  const before=await readFile(path,'utf8');
  for (const marker of ['SingletonLock','SingletonSocket','SingletonCookie']) {
    await writeFile(join(profile.userData,marker),'active');
    await assert.rejects(gitProfile(root,'http://127.0.0.1:12345'),/Close/);
    assert.equal(await readFile(path,'utf8'),before);await rm(join(profile.userData,marker));
  }
  await assert.rejects(gitProfile(root,'https://example.com'),/loopback/);
  assert.equal(await readFile(path,'utf8'),before);
  await rename(path,join(profile.state,'saved-settings'));await symlink(join(profile.state,'saved-settings'),path);
  await assert.rejects(gitProfile(root),/ownership/);assert.equal(await readFile(path,'utf8'),before);
  await rm(path);await writeFile(path,'{bad json');await assert.rejects(gitProfile(root));
  assert.equal(await readFile(path,'utf8'),'{bad json');await writeFile(path,before);
  await writeFile(join(root,'profiles/smoke-git/.owner'),'other owner');await assert.rejects(gitProfile(root),/ownership/);
  await rename(join(root,'profiles/smoke-git'),join(root,'saved-profile'));await symlink(join(root,'saved-profile'),join(root,'profiles/smoke-git'));
  await assert.rejects(gitProfile(root),/ownership/);
  await rm(join(root,'profiles/smoke-git'));
  await rename(join(root,'profiles'),join(root,'saved-profiles'));await symlink(join(root,'saved-profiles'),join(root,'profiles'));
  await assert.rejects(gitProfile(root),/ownership/);
});

test('mock refresh refuses redirected databases and preserves real and personal profile files', async t => {
  const root=await mkdtemp(join(tmpdir(),'git-profile-real-preserve-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const { realProfile }=await import('../src/real-profile.js');
  const real=await realProfile(root,true);const realPath=join(real.userData,'User/settings.json');const realBefore=await readFile(realPath,'utf8');
  const {profile}=await gitProfile(root,'http://127.0.0.1:12345');
  await writeFile(join(root,'personal-settings'),'personal state');
  const db=join(profile.userData,'User/globalStorage/state.vscdb');await rename(db,join(profile.state,'saved-db'));await symlink(join(profile.state,'saved-db'),db);
  const settingsPath=join(profile.userData,'User/settings.json');const settingsBefore=await readFile(settingsPath,'utf8');
  await assert.rejects(gitProfile(root,'http://127.0.0.1:23456'),/ownership/);
  assert.equal(await readFile(settingsPath,'utf8'),settingsBefore);
  assert.equal(await readFile(realPath,'utf8'),realBefore);
  assert.equal(await readFile(join(root,'personal-settings'),'utf8'),'personal state');
});
