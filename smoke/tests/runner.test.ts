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
  assert.deepEqual(result.checks.map(check => check.outcome), ['not_run', 'not_run', 'not_run']);
  assert.equal(result.cleanup.reservationRetained, true);
  await access(profile.userData);
  const saved = JSON.parse(await readFile(result.resultPath, 'utf8'));
  assert.equal(saved.chatBackend, 'real');
  assert.equal(saved.persistentProfilePath, profile.userData);
  assert.equal(saved.requests, null);
});

test('Git-only launches with no mock/Chat initialization and preserves its dedicated profile',async t=>{
  const checkout=await mkdtemp(join(tmpdir(),'git-only-runner-'));t.after(()=>rm(checkout,{recursive:true,force:true}));
  const build=await fixtureApp(checkout);let called=false;
  const result=await runSmoke({build,suite:'git'},checkout,async options=>{
    called=true;const env=options!.env!;const args=options!.args!;
    assert.equal(env.VSCODE_COPILOT_CHAT_TOKEN,undefined);assert.equal(env.GITHUB_PAT,undefined);
    assert.equal(env.HTTP_PROXY,undefined);assert.equal(env.COPILOT_HOME,undefined);
    assert.ok(args.includes('--use-inmemory-secretstorage'));
    assert.ok(args.includes('--disable-extension'));assert.ok(args.includes('github.copilot-chat'));
    assert.ok(!args.some(x=>x.startsWith('--extensionDevelopmentPath')));
    const userData=args[args.indexOf('--user-data-dir')+1];
    await assert.rejects(access(join(userData,'User/globalStorage/state.vscdb')));
    assert.match(userData,/profiles\/smoke-git\/user-data$/);
    throw new Error('Simulated uncertain launch');
  },{startMock:async()=>assert.fail('Git-only must never start mock Chat')});
  t.after(()=>rm(result.resourcesPath,{recursive:true,force:true}));
  assert.ok(called);assert.equal(result.mockRequestEvidence,'inapplicable');assert.equal(result.mockRequestCount,null);assert.equal(result.requests,null);
  assert.deepEqual(result.checks.map(c=>c.suite),['git']);await access(result.persistentProfilePath!);
});

async function applicationFixture(options?: {args?: string[]}, closeFails=false) {
  if (options?.args) {
    const userData=options.args[options.args.indexOf('--user-data-dir')+1];
    const dir=join(userData,'logs/fixture/window1/exthost/vscode.git');await mkdir(dir,{recursive:true});
    const {promisify}=await import('node:util');const {execFile}=await import('node:child_process');
    const version=(await promisify(execFile)('/usr/bin/git',['--version'])).stdout.trim().replace('git version ','');
    await writeFile(join(dir,'Git.log'),`Using git "${version}" from "/usr/bin/git"\n`);
  }
  const page={setDefaultTimeout(){},setDefaultNavigationTimeout(){},async screenshot(){}};
  const app={firstWindow:async()=>page,process:()=>({exitCode:0,signalCode:null}),
    context:()=>({tracing:{async start(){},async stop(){}}}),
    async close(){if(closeFails)throw new Error('Owned shutdown uncertain');}};
  return app as never;
}

test('all dispatches editing/Git/Chat in order and a Git failure leaves Chat not_run',async t=>{
  const {GitFailure}=await import('../src/git.js');
  for (const backend of ['mock','real'] as const) for (const failure of [undefined,'failed','blocked','harness_error'] as const) {
    const checkout=await mkdtemp(join(tmpdir(),'git-order-runner-'));t.after(()=>rm(checkout,{recursive:true,force:true}));
    const build=await fixtureApp(checkout);if(backend==='real')await realProfile(checkout,true);
    const order:string[]=[];let mockStarted=0;let mockClosed=0;
    const result=await runSmoke({build,suite:'all',chatBackend:backend},checkout,async options=>applicationFixture(options),{
      startMock:async()=>{mockStarted++;return {url:'http://127.0.0.1:12345',requests:()=>[],close:async()=>{mockClosed++;}};},
      workbench:()=>({ready:async()=>{},qualifyChat:async()=>{order.push('chat');return {session:'test',turns:[]};}} as never),
      editing:async()=>{order.push('editing');return {files:[],createdInitiallyAbsent:true};},
      git:async(_wb,_repo,_workspace,evidence)=>{order.push('git');evidence!.stage='graph';if(failure)throw new GitFailure(failure,'Injected Git outcome',evidence);return evidence!;},
    });
    t.after(()=>rm(result.resourcesPath,{recursive:true,force:true}));
    assert.deepEqual(order,failure?['editing','git']:['editing','git','chat']);
    assert.equal(result.outcome,failure??'passed');
    assert.deepEqual(result.checks.map(c=>c.outcome),failure?['passed',failure,'not_run']:['passed','passed','passed']);
    assert.equal(mockStarted,backend==='mock'?1:0);assert.equal(mockClosed,mockStarted);
    if(failure){assert.match(result.error!,/Injected Git outcome/);assert.equal((result.checks[1].evidence as any).stage,'graph');}
    assert.equal(result.cleanup.reservationRetained,false);await access(result.persistentProfilePath!);
  }
});

test('missing Git blocks before launcher or mock and cleanup uncertainty dominates Git outcome',async t=>{
  const {prepareGit}=await import('../src/git-repository.js');const {GitFailure}=await import('../src/git.js');
  const root=await mkdtemp(join(tmpdir(),'git-preflight-runner-'));t.after(()=>rm(root,{recursive:true,force:true}));const build=await fixtureApp(root);
  const blocked=await runSmoke({build,suite:'git'},root,async()=>assert.fail('Must not launch'),{
    prepareGit:run=>prepareGit(run,join(run.resources,'missing-git')),startMock:async()=>assert.fail('Must not start mock'),
  });
  t.after(()=>rm(blocked.resourcesPath,{recursive:true,force:true}));
  assert.equal(blocked.outcome,'blocked');assert.equal(blocked.mockRequestCount,null);
  assert.equal((blocked.checks[0].evidence as any).hash,undefined);
  const failed=await runSmoke({build,suite:'git'},root,async options=>applicationFixture(options,true),{
    startMock:async()=>assert.fail('Must not start mock'),workbench:()=>({ready:async()=>{}} as never),
    git:async(_wb,_repo,_workspace,evidence)=>{throw new GitFailure('failed','Git functional mismatch',evidence);},
  });
  t.after(()=>rm(failed.resourcesPath,{recursive:true,force:true}));
  assert.equal(failed.checks[0].outcome,'failed');assert.equal(failed.outcome,'harness_error');assert.equal(failed.cleanup.reservationRetained,true);
});
