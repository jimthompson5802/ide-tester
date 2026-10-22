import { writeFile, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron, type ElectronApplication, type Page } from '@playwright/test';
import { validateBackend, type Options } from './arguments.js';
import { resolveApp, type InstalledApp } from './app.js';
import { createRun, finishRun } from './resources.js';
import { startMock } from './mock.js';
import { prepareProfile } from './profile.js';
import { bounded, Workbench } from './workbench.js';
import { realProfile, backendLaunch, requireClosedProfile, ProfilePrerequisite } from './real-profile.js';
import { ChatFailure, chatTurns, type ChatOutcome, type ChatEvidence } from './chat.js';
import { rendererLogs, readLocalSession } from './session.js';
import { checkEditing } from './editing.js';

interface CheckResult {
  suite: 'editing' | 'chat'; outcome: 'not_run' | 'passed' | ChatOutcome;
  durationMs?: number; evidence?: unknown; error?: string;
}

export async function runFoundation(options: Options, checkout: string, launch: typeof _electron.launch = _electron.launch.bind(_electron)) {
  return runSelected(options, checkout, true, launch);
}

export async function runSmoke(options: Options, checkout: string, launch: typeof _electron.launch = _electron.launch.bind(_electron)) {
  return runSelected(options, checkout, false, launch);
}

async function runSelected(options: Options, checkout: string, foundation: boolean, launch: typeof _electron.launch) {
  const started = Date.now();
  const run = await createRun(checkout);
  const chatBackend = options.chatBackend ?? 'mock';
  let persistentProfilePath: string | undefined;
  let versions: InstalledApp | undefined;
  let error: string | undefined;
  let outcome: 'passed' | 'failed' | 'blocked' | 'harness_error' = 'blocked';
  let app: ElectronApplication | undefined;
  let page: Page | undefined;
  let mock: Awaited<ReturnType<typeof startMock>> | undefined;
  let launchAttempted = false;
  let tracing = false;
  let stage = 'preflight';
  const timings: Record<string, number> = {};
  const diagnostics: string[] = [];
  const checks: CheckResult[] = (foundation ? ['chat'] : options.suite === 'all' ? ['editing', 'chat'] : [options.suite])
    .map(suite => ({ suite: suite as 'editing' | 'chat', outcome: 'not_run' }));
  try {
    validateBackend(options, foundation);
    versions = await resolveApp(options.build);
    if (process.platform !== 'darwin' || process.arch !== 'arm64' || process.version !== 'v26.3.1') {
      throw new Error('Tester requires macOS arm64 with Node 26.3.1');
    }
    if (versions.vscode !== '1.135.0' || versions.copilot !== '0.63.0') {
      throw new Error(`Compatibility checkpoint requires VS Code 1.135.0 / Copilot Chat 0.63.0; found ${versions.vscode} / ${versions.copilot}`);
    }
    if (foundation && options.suite === 'editing') throw new Error('Foundation qualification covers one Chat exchange; use smoke for the editing suite');
    // runner is compiled to smoke/dist/src; helper lives at smoke/helper.
    const helperPath = fileURLToPath(new URL('../../helper/', import.meta.url));
    await access(join(helperPath, 'dist/extension.js'));
    const turns = chatTurns(chatBackend, foundation);
    let env: Record<string, string>;
    let backendArgs: string[];
    if (chatBackend === 'real') {
      try {
        const profile = await realProfile(checkout);
        await requireClosedProfile(profile);
        Object.assign(run, profile);
        persistentProfilePath = profile.userData;
      } catch (cause) {
        if (!(cause instanceof ProfilePrerequisite)) throw new ChatFailure('harness_error', 'Real profile configuration or filesystem error');
        throw new ChatFailure('blocked', 'Real Chat profile unavailable, contains mock overrides, or is still open. Rerun npm --prefix smoke run setup:real-chat -- --build <app>, resolve profile prerequisites, complete sign-in, and close setup before testing.');
      }
      const config = backendLaunch('real', run);
      env = config.env;
      backendArgs = config.args;
    } else {
      mock = await startMock(Object.fromEntries(turns.map(turn => [turn.marker, turn.reply])));
      const automation = await prepareProfile(run, mock.url);
      const home = join(run.resources, 'home');
      await mkdir(home);
      env = { ...automation, HOME: home,
        PATH: process.env.PATH ?? '/usr/bin:/bin', TMPDIR: join(run.resources, 'tmp'),
        LANG: 'en_US.UTF-8', HTTP_PROXY: mock.url, HTTPS_PROXY: mock.url,
        NO_PROXY: '127.0.0.1,localhost', ELECTRON_ENABLE_LOGGING: '1',
      };
      await mkdir(env.TMPDIR);
      backendArgs = backendLaunch('mock', run, {}).args;
    }
    const previousLogs = await rendererLogs(run.userData);
    stage = 'launch';
    const launchStart = Date.now();
    launchAttempted = true;
    app = await launch({ executablePath: versions.executable, timeout: 60_000, env,
      args: [run.workspace, '--new-window', ...backendArgs,
        `--extensionDevelopmentPath=${helperPath}`, '--enable-smoke-test-driver',
        '--skip-welcome', '--skip-release-notes', '--disable-telemetry', '--disable-experiments', '--locale=en'],
    });
    app.process().stdout?.on('data', () => {});
    app.process().stderr?.on('data', () => {});
    page = await app.firstWindow({ timeout: Math.max(1, 60_000 - (Date.now() - launchStart)) });
    page.setDefaultTimeout(15_000);
    page.setDefaultNavigationTimeout(15_000);
    // Real runs never record screenshots/traces: authentication may expire mid-run.
    if (chatBackend === 'mock') {
      await bounded(app.context().tracing.start({ screenshots: true, snapshots: true, sources: true }),
        Math.max(1, 60_000 - (Date.now() - launchStart)), 'Trace start');
      tracing = true;
    }
    stage = 'driver';
    const workbench = new Workbench(page);
    await workbench.ready(Math.max(1, 60_000 - (Date.now() - launchStart)));
    timings.launchMs = Date.now() - launchStart;
    for (const check of checks) {
      stage = check.suite;
      const checkStart = Date.now();
      const chatEvidence: ChatEvidence = { session: '', turns: [] };
      if (check.suite === 'chat') check.evidence = chatEvidence;
      try {
        const deadline = check.suite === 'chat' && chatBackend === 'real' ? 300_000 : 120_000;
        check.evidence = await bounded<unknown>(check.suite === 'editing' ? checkEditing(workbench, run.workspace) :
          workbench.qualifyChat(turns, chatBackend, () => mock?.requests() ?? [],
            () => readLocalSession(run.userData, previousLogs), 120_000, run.workspace, chatEvidence),
        deadline, `${check.suite} test`);
        check.outcome = 'passed';
      } catch (cause) {
        check.outcome = cause instanceof ChatFailure ? cause.outcome : chatBackend === 'real' && check.suite === 'chat' && !String(cause).includes('test timed out') ? 'harness_error' : 'failed';
        if (cause instanceof ChatFailure && cause.evidence) check.evidence = cause.evidence;
        check.error = cause instanceof ChatFailure || chatBackend === 'mock' ? String(cause) : `${check.suite} test failed or timed out`;
        if (chatBackend === 'real' && !(cause instanceof ChatFailure)) throw new ChatFailure(check.outcome as ChatOutcome, check.error);
        throw cause;
      }
      finally { check.durationMs = Date.now() - checkStart; timings[`${check.suite}Ms`] = check.durationMs; }
    }
    outcome = 'passed';
  } catch (cause) {
    error = chatBackend === 'real' && launchAttempted && !(cause instanceof ChatFailure) ? 'Real test application launch or driver contract failed' : String(cause);
    outcome = cause instanceof ChatFailure ? cause.outcome : ['preflight', 'launch', 'driver'].includes(stage) ? 'blocked' : 'failed';
    if (page && chatBackend === 'mock') {
      try { await bounded(page.screenshot({ path: join(run.report, 'failure.png'), timeout: 5000 }), 5000, 'Failure screenshot'); }
      catch (capture) { diagnostics.push(`Screenshot: ${String(capture)}`); }
    }
  }
  if (tracing && app) {
    try { await bounded(app.context().tracing.stop(outcome === 'passed' ? {} : { path: join(run.report, 'trace.zip') }), 5000, 'Trace collection'); }
    catch (capture) { diagnostics.push(`Trace: ${String(capture)}`); }
  }
  const requests = mock?.requests() ?? [];
  const cleanup = await finishRun(run, outcome === 'passed', [
    async () => {
      if (app) {
        const process = app.process();
        await bounded(app.close(), 10_000, 'Application shutdown');
        if (process.exitCode === null && process.signalCode === null) {
          await bounded(new Promise<void>(resolve => process.once('exit', () => resolve())), 5000, 'Owned process exit');
        }
      } else if (launchAttempted) throw new Error('Launch failed without an application handle; shutdown uncertain');
    },
    async () => { if (mock) await bounded(mock.close(), 5000, 'Mock shutdown'); },
  ]);
  if (cleanup.errors.length) outcome = 'harness_error';
  const result = {
    runId: run.id, scope: foundation ? 'foundation' : 'selected-suites', suites: options.suite, chatBackend, outcome, error, stage,
    execution: { workers: 1, retries: 0 },
    versions: { node: process.version, architecture: process.arch, platform: process.platform,
      typescript: '6.0.2', playwright: '1.61.1', vscode: versions?.vscode, copilot: versions?.copilot },
    startedAt: new Date(started).toISOString(), durationMs: Date.now() - started,
    mockRequestEvidence: chatBackend === 'mock' ? 'applicable' : 'inapplicable',
    mockRequestCount: chatBackend === 'mock' ? requests.length : null, requests: chatBackend === 'mock' ? requests : null, checks, timings, diagnostics, cleanup, resourcesPath: run.resources, ...(persistentProfilePath ? { persistentProfilePath } : {}), resultPath: join(run.report, 'result.json'),
  };
  await writeFile(result.resultPath, JSON.stringify(result, null, 2));
  return result;
}
