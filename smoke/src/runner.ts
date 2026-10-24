import { writeFile, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    _electron,
    type ElectronApplication,
    type Page,
} from '@playwright/test';
import { validateBackend, type Options } from './arguments.js';
import { resolveApp, type InstalledApp } from './app.js';
import { createRun, finishRun } from './resources.js';
import { startMock } from './mock.js';
import { prepareProfile } from './profile.js';
import { bounded, Workbench } from './workbench.js';
import {
    realProfile,
    backendLaunch,
    requireClosedProfile,
    ProfilePrerequisite,
} from './real-profile.js';
import {
    ChatFailure,
    chatTurns,
    type ChatOutcome,
    type ChatEvidence,
} from './chat.js';
import { rendererLogs, readLocalSession } from './session.js';
import { checkEditing } from './editing.js';
import { gitProfile } from './git-profile.js';
import {
    prepareGit,
    gitExtensionLogs,
    requireGitExtension,
    type GitRepository,
} from './git-repository.js';
import { checkGit, GitFailure, newGitEvidence } from './git.js';

interface RunnerServices {
    startMock: typeof startMock;
    prepareGit: typeof prepareGit;
    workbench: (page: Page) => Workbench;
    editing: typeof checkEditing;
    git: typeof checkGit;
}

interface CheckResult {
    suite: 'editing' | 'git' | 'chat';
    outcome: 'not_run' | 'passed' | ChatOutcome;
    durationMs?: number;
    evidence?: unknown;
    error?: string;
}

export async function runFoundation(
    options: Options,
    checkout: string,
    launch: typeof _electron.launch = _electron.launch.bind(_electron),
) {
    return runSelected(options, checkout, true, launch);
}

export async function runSmoke(
    options: Options,
    checkout: string,
    launch: typeof _electron.launch = _electron.launch.bind(_electron),
    services: Partial<RunnerServices> = {},
) {
    return runSelected(options, checkout, false, launch, services);
}

async function runSelected(
    options: Options,
    checkout: string,
    foundation: boolean,
    launch: typeof _electron.launch,
    injected: Partial<RunnerServices> = {},
) {
    const services: RunnerServices = {
        startMock,
        prepareGit,
        workbench: (page) => new Workbench(page),
        editing: checkEditing,
        git: checkGit,
        ...injected,
    };
    const started = Date.now();
    const run = await createRun(checkout);
    const chatBackend = options.chatBackend ?? 'mock';
    const gitSelected = !foundation && options.suite === 'git';
    const chatSelected =
        options.suite !== 'git' &&
        (foundation || options.suite === 'chat' || options.suite === 'basic');
    const mockApplicable = chatBackend === 'mock' && options.suite !== 'git';
    let repository: GitRepository | undefined;
    let persistentProfilePath: string | undefined;
    let versions: InstalledApp | undefined;
    let error: string | undefined;
    let outcome: 'passed' | 'failed' | 'blocked' | 'harness_error';
    let app: ElectronApplication | undefined;
    let page: Page | undefined;
    let mock: Awaited<ReturnType<typeof startMock>> | undefined;
    let launchAttempted = false;
    let tracing = false;
    let stage = 'preflight';
    const timings: Record<string, number> = {};
    const diagnostics: string[] = [];
    const checks: CheckResult[] = (
        foundation
            ? ['chat']
            : options.suite === 'basic'
              ? ['editing', 'chat']
              : [options.suite]
    ).map((suite) => ({
        suite: suite as 'editing' | 'git' | 'chat',
        outcome: 'not_run',
        ...(suite === 'git' ? { evidence: newGitEvidence() } : {}),
    }));
    try {
        validateBackend(options, foundation);
        versions = await resolveApp(options.build);
        if (
            process.platform !== 'darwin' ||
            process.arch !== 'arm64' ||
            process.version !== 'v26.3.1'
        ) {
            throw new Error('Tester requires macOS arm64 with Node 26.3.1');
        }
        if (versions.vscode !== '1.135.0' || versions.copilot !== '0.63.0') {
            throw new Error(
                `Compatibility checkpoint requires VS Code 1.135.0 / Copilot Chat 0.63.0; found ${versions.vscode} / ${versions.copilot}`,
            );
        }
        if (foundation && options.suite === 'editing')
            throw new Error(
                'Foundation qualification covers one Chat exchange; use smoke for the editing suite',
            );
        // runner is compiled to smoke/dist/src; helper lives at smoke/helper.
        const helperPath = fileURLToPath(
            new URL('../../helper/', import.meta.url),
        );
        if (chatSelected) await access(join(helperPath, 'dist/extension.js'));
        if (gitSelected) {
            stage = 'git-preflight';
            repository = await services.prepareGit(run);
            await repository.requireUninitialized();
            const evidence = checks.find((check) => check.suite === 'git')!
                .evidence as ReturnType<typeof newGitEvidence>;
            evidence.version = repository.version;
        }
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
                if (!(cause instanceof ProfilePrerequisite))
                    throw new ChatFailure(
                        'harness_error',
                        'Real profile configuration or filesystem error',
                    );
                throw new ChatFailure(
                    'blocked',
                    'Real Chat profile unavailable, contains mock overrides, or is still open. Rerun npm --prefix smoke run setup:real-chat -- --build <app>, resolve profile prerequisites, complete sign-in, and close setup before testing.',
                );
            }
            const config = backendLaunch('real', run);
            env = config.env;
            backendArgs = config.args;
        } else {
            if (mockApplicable)
                mock = await services.startMock(
                    Object.fromEntries(
                        turns.map((turn) => [turn.marker, turn.reply]),
                    ),
                );
            let automation: Record<string, string> = {};
            if (gitSelected) {
                const profile = await gitProfile(checkout);
                Object.assign(run, profile);
                persistentProfilePath = profile.userData;
            } else automation = await prepareProfile(run, mock!.url);
            const home = join(run.resources, 'home');
            await mkdir(home);
            env = {
                ...automation,
                HOME: home,
                PATH: process.env.PATH ?? '/usr/bin:/bin',
                TMPDIR: join(run.resources, 'tmp'),
                LANG: 'en_US.UTF-8',
                XDG_STATE_HOME: run.state,
                ...(mock
                    ? { HTTP_PROXY: mock.url, HTTPS_PROXY: mock.url }
                    : {}),
                NO_PROXY: '127.0.0.1,localhost',
                ELECTRON_ENABLE_LOGGING: '1',
            };
            await mkdir(env.TMPDIR);
            backendArgs = backendLaunch('mock', run, {}).args;
        }
        if (repository) {
            // Config isolation applies to the extension as well as verifier subprocesses.
            Object.assign(env, repository.env, {
                HOME: env.HOME,
                TMPDIR: env.TMPDIR,
                PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
            });
            if (!chatSelected)
                backendArgs.push('--disable-extension', 'github.copilot-chat');
        }
        const previousLogs = chatSelected
            ? await rendererLogs(run.userData)
            : [];
        const previousGitLogs = repository
            ? await gitExtensionLogs(run.userData)
            : [];
        stage = 'launch';
        const launchStart = Date.now();
        launchAttempted = true;
        app = await launch({
            executablePath: versions.executable,
            timeout: 60_000,
            env,
            args: [
                run.workspace,
                '--new-window',
                ...backendArgs,
                ...(chatSelected
                    ? [`--extensionDevelopmentPath=${helperPath}`]
                    : []),
                '--enable-smoke-test-driver',
                '--skip-welcome',
                '--skip-release-notes',
                '--disable-telemetry',
                '--disable-experiments',
                '--locale=en',
            ],
        });
        app.process().stdout?.on('data', () => {});
        app.process().stderr?.on('data', () => {});
        page = await app.firstWindow({
            timeout: Math.max(1, 60_000 - (Date.now() - launchStart)),
        });
        page.setDefaultTimeout(15_000);
        page.setDefaultNavigationTimeout(15_000);
        // Real runs never record screenshots/traces: authentication may expire mid-run.
        if (chatBackend === 'mock') {
            await bounded(
                app.context().tracing.start({
                    screenshots: true,
                    snapshots: true,
                    sources: true,
                }),
                Math.max(1, 60_000 - (Date.now() - launchStart)),
                'Trace start',
            );
            tracing = true;
        }
        stage = 'driver';
        const workbench = services.workbench(page);
        await workbench.ready(Math.max(1, 60_000 - (Date.now() - launchStart)));
        timings.launchMs = Date.now() - launchStart;
        if (repository) {
            stage = 'git-tool';
            await requireGitExtension(
                run.userData,
                repository,
                previousGitLogs,
            );
        }
        for (const check of checks) {
            stage = check.suite;
            const checkStart = Date.now();
            const chatEvidence: ChatEvidence = { session: '', turns: [] };
            if (check.suite === 'chat') check.evidence = chatEvidence;
            try {
                const deadline =
                    check.suite === 'chat' && chatBackend === 'real'
                        ? 300_000
                        : 120_000;
                let operation: Promise<unknown>;
                if (check.suite === 'editing')
                    operation = services.editing(workbench, run.workspace);
                else if (check.suite === 'git')
                    operation = services.git(
                        workbench,
                        repository!,
                        run.workspace,
                        check.evidence as ReturnType<typeof newGitEvidence>,
                    );
                else
                    operation = workbench.qualifyChat(
                        turns,
                        chatBackend,
                        () => mock?.requests() ?? [],
                        () => readLocalSession(run.userData, previousLogs),
                        120_000,
                        run.workspace,
                        chatEvidence,
                    );
                check.evidence = await bounded(
                    operation,
                    deadline,
                    `${check.suite} test`,
                );
                check.outcome = 'passed';
            } catch (cause) {
                check.outcome =
                    cause instanceof ChatFailure || cause instanceof GitFailure
                        ? cause.outcome
                        : chatBackend === 'real' &&
                            check.suite === 'chat' &&
                            !String(cause).includes('test timed out')
                          ? 'harness_error'
                          : 'failed';
                if (
                    (cause instanceof ChatFailure ||
                        cause instanceof GitFailure) &&
                    cause.evidence
                )
                    check.evidence = cause.evidence;
                check.error =
                    cause instanceof ChatFailure ||
                    cause instanceof GitFailure ||
                    chatBackend === 'mock'
                        ? String(cause)
                        : `${check.suite} test failed or timed out`;
                if (
                    chatBackend === 'real' &&
                    check.suite === 'chat' &&
                    !(cause instanceof ChatFailure)
                )
                    throw new ChatFailure(
                        check.outcome as ChatOutcome,
                        check.error,
                    );
                throw cause;
            } finally {
                check.durationMs = Date.now() - checkStart;
                timings[`${check.suite}Ms`] = check.durationMs;
            }
        }
        outcome = 'passed';
    } catch (cause) {
        error =
            chatBackend === 'real' &&
            launchAttempted &&
            !(cause instanceof ChatFailure) &&
            !(cause instanceof GitFailure)
                ? 'Real test application launch or driver contract failed'
                : String(cause);
        outcome =
            cause instanceof ChatFailure || cause instanceof GitFailure
                ? cause.outcome
                : stage === 'git-preflight'
                  ? 'harness_error'
                  : ['preflight', 'launch', 'driver'].includes(stage)
                    ? 'blocked'
                    : 'failed';
        if (page && chatBackend === 'mock') {
            try {
                await bounded(
                    page.screenshot({
                        path: join(run.report, 'failure.png'),
                        timeout: 5000,
                    }),
                    5000,
                    'Failure screenshot',
                );
            } catch (capture) {
                diagnostics.push(`Screenshot: ${String(capture)}`);
            }
        }
    }
    if (tracing && app) {
        try {
            await bounded(
                app
                    .context()
                    .tracing.stop(
                        outcome === 'passed'
                            ? {}
                            : { path: join(run.report, 'trace.zip') },
                    ),
                5000,
                'Trace collection',
            );
        } catch (capture) {
            diagnostics.push(`Trace: ${String(capture)}`);
        }
    }
    const requests = mock?.requests() ?? [];
    const cleanup = await finishRun(run, outcome === 'passed', [
        async () => {
            if (app) {
                const process = app.process();
                await bounded(app.close(), 10_000, 'Application shutdown');
                if (process.exitCode === null && process.signalCode === null) {
                    await bounded(
                        new Promise<void>((resolve) =>
                            process.once('exit', () => resolve()),
                        ),
                        5000,
                        'Owned process exit',
                    );
                }
            } else if (launchAttempted)
                throw new Error(
                    'Launch failed without an application handle; shutdown uncertain',
                );
        },
        async () => {
            if (mock) await bounded(mock.close(), 5000, 'Mock shutdown');
        },
    ]);
    if (cleanup.errors.length) outcome = 'harness_error';
    const result = {
        runId: run.id,
        scope: foundation ? 'foundation' : 'selected-suites',
        suites: options.suite,
        chatBackend,
        chatSelected,
        outcome,
        error,
        stage,
        execution: { workers: 1, retries: 0 },
        versions: {
            node: process.version,
            architecture: process.arch,
            platform: process.platform,
            typescript: '6.0.2',
            playwright: '1.61.1',
            vscode: versions?.vscode,
            copilot: versions?.copilot,
        },
        startedAt: new Date(started).toISOString(),
        durationMs: Date.now() - started,
        mockRequestEvidence: mockApplicable ? 'applicable' : 'inapplicable',
        mockRequestCount: mockApplicable ? requests.length : null,
        requests: mockApplicable ? requests : null,
        checks,
        timings,
        diagnostics,
        cleanup,
        resourcesPath: run.resources,
        ...(persistentProfilePath ? { persistentProfilePath } : {}),
        resultPath: join(run.report, 'result.json'),
    };
    await writeFile(result.resultPath, JSON.stringify(result, null, 2));
    return result;
}
