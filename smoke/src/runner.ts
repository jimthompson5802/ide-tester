import { writeFile, mkdir, access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    _electron,
    type ElectronApplication,
    type Page,
} from '@playwright/test';
import { validateBackend, type Options } from './arguments.js';
import { resolveApp, type InstalledApp } from './app.js';
import { createRun, finishRun, type Run } from './resources.js';
import { startMock } from './mock.js';
import { prepareProfile } from './profile.js';
import {
    bounded,
    Workbench,
    PythonDeadline,
    PythonWorkbench,
} from './workbench.js';
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

import {
    preparePythonInterpreter,
    PythonInterpreterPrerequisite,
} from './python-interpreter.js';
import {
    pythonProfile,
    pythonEnvironment,
    PythonProfileFailure,
} from './python-profile.js';
import { checkPython, PythonFailure, newPythonEvidence } from './python.js';
import {
    capturePreservation,
    requirePreservationUnchanged,
    createProtectedLaunch,
    type PreservationManifest,
} from './python-preservation.js';
import { closeOwnedApplication } from './python-shutdown.js';
import {
    Cancellation,
    CancellationError,
    ScenarioStoppedError,
} from './cancellation.js';

interface RunnerServices {
    createRun: typeof createRun;
    startMock: typeof startMock;
    prepareGit: typeof prepareGit;
    workbench: (page: Page, cancellation: Cancellation) => Workbench;
    editing: typeof checkEditing;
    git: typeof checkGit;
    python: typeof checkPython;
    pythonWorkbench: (page: Page, deadline: PythonDeadline) => PythonWorkbench;
    cleanupTimeoutMs: number;
}

interface CheckResult {
    suite: 'editing' | 'git' | 'chat' | 'python';
    outcome: 'not_run' | 'passed' | ChatOutcome;
    durationMs?: number;
    evidence?: unknown;
    error?: string;
}

export async function runFoundation(
    options: Options,
    checkout: string,
    launch: typeof _electron.launch = _electron.launch.bind(_electron),
    cancellation = new Cancellation(),
): Promise<Awaited<ReturnType<typeof runSelected>>> {
    cancellation.check();
    return runSelected(options, checkout, true, launch, {}, cancellation);
}

export async function runSmoke(
    options: Options,
    checkout: string,
    launch: typeof _electron.launch = _electron.launch.bind(_electron),
    services: Partial<RunnerServices> = {},
    cancellation = new Cancellation(),
): Promise<Awaited<ReturnType<typeof runSelected>>> {
    cancellation.check();
    return runSelected(
        options,
        checkout,
        false,
        launch,
        services,
        cancellation,
    );
}

async function runSelected(
    options: Options,
    checkout: string,
    foundation: boolean,
    launch: typeof _electron.launch,
    injected: Partial<RunnerServices> = {},
    cancellation = new Cancellation(),
) {
    const services: RunnerServices = {
        createRun,
        startMock,
        prepareGit,
        cleanupTimeoutMs: 120_000,
        workbench: (page, scope) => new Workbench(page, scope),
        editing: checkEditing,
        git: checkGit,
        python: checkPython,
        pythonWorkbench: (page, deadline) =>
            new PythonWorkbench(page, deadline),
        ...injected,
    };
    const started = Date.now();
    let acquired: Run | undefined;
    let acquisitionError: unknown;
    let acquisitionCleanupEnd: number | undefined;
    try {
        await cancellation.perform(async () => {
            try {
                acquired = await services.createRun(checkout);
            } catch (cause) {
                acquisitionError = cause;
                throw cause;
            }
        });
    } catch (cause) {
        if (!(cause instanceof CancellationError)) throw cause;
        acquisitionCleanupEnd = Date.now() + services.cleanupTimeoutMs;
        await cancellation.settle(
            Math.max(1, acquisitionCleanupEnd - Date.now()),
        );
        if (!acquired) throw acquisitionError ?? cause;
    }
    if (!acquired)
        throw new Error('Run acquisition did not return owned resources');
    const run = acquired;
    const chatBackend = options.chatBackend ?? 'mock';
    const pythonSelected = !foundation && options.suite === 'python';
    const pythonDeadline = pythonSelected
        ? new PythonDeadline(480_000, Date.now, cancellation)
        : undefined;
    let interpreter:
        Awaited<ReturnType<typeof preparePythonInterpreter>> | undefined;
    let preservation: PreservationManifest | undefined;
    let pythonWorkbench: PythonWorkbench | undefined;
    let pendingPython: Promise<unknown> | undefined;
    const pythonScenarioEnd = Date.now() + 480_000;
    const pythonEvidence = newPythonEvidence();
    const gitSelected = !foundation && options.suite === 'git';
    const chatSelected =
        options.suite !== 'git' &&
        options.suite !== 'python' &&
        (foundation || options.suite === 'chat' || options.suite === 'basic');
    const mockApplicable =
        chatBackend === 'mock' &&
        options.suite !== 'git' &&
        options.suite !== 'python';
    let repository: GitRepository | undefined;
    let persistentProfilePath: string | undefined;
    let versions: InstalledApp | undefined;
    let error: string | undefined;
    let originating: { outcome: string; error?: string } | undefined;
    let outcome: 'passed' | 'failed' | 'blocked' | 'harness_error';
    let app: ElectronApplication | undefined;
    let ownedChild: ReturnType<ElectronApplication['process']> | undefined;
    let page: Page | undefined;
    let mock: Awaited<ReturnType<typeof startMock>> | undefined;
    let cleanupEnd: number | undefined = acquisitionCleanupEnd;
    let cleanupFinished = false;
    const enterCleanup = (): number => {
        cleanupEnd ??= Date.now() + services.cleanupTimeoutMs;
        cancellation.stop();
        pythonDeadline?.stop();
        return cleanupEnd;
    };
    const remainingCleanup = (maximum = Number.MAX_SAFE_INTEGER): number => {
        const remaining = enterCleanup() - Date.now();
        if (remaining <= 0)
            throw new Error(
                'Cleanup deadline expired; shutdown or settlement uncertain',
            );
        return Math.min(remaining, maximum);
    };
    const cleanupOperation = <T>(
        operation: () => Promise<T>,
        maximum: number,
        label: string,
    ): Promise<T> => {
        const budget = remainingCleanup(maximum);
        return bounded(cancellation.track(operation()), budget, label);
    };
    let launchAttempted = false;
    let pendingLaunch: Promise<ElectronApplication> | undefined;
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
        suite: suite as CheckResult['suite'],
        ...(suite === 'python' ? { evidence: pythonEvidence } : {}),
        outcome: 'not_run',
        ...(suite === 'git' ? { evidence: newGitEvidence() } : {}),
    }));
    try {
        validateBackend(options, foundation);
        if (pythonSelected) {
            interpreter = await cancellation.perform(() =>
                pythonDeadline!.perform(() =>
                    preparePythonInterpreter(options.pythonInterpreter!),
                ),
            );
        }
        versions = pythonDeadline
            ? await cancellation.perform(() =>
                  pythonDeadline.perform(() => resolveApp(options.build)),
              )
            : await cancellation.perform(() => resolveApp(options.build));
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
        if (chatSelected)
            await cancellation.perform(() =>
                access(join(helperPath, 'dist/extension.js')),
            );
        if (gitSelected) {
            stage = 'git-preflight';
            repository = await cancellation.perform(() =>
                services.prepareGit(run, '/usr/bin/git', cancellation),
            );
            await cancellation.perform(() =>
                repository!.requireUninitialized(),
            );
            const evidence = checks.find((check) => check.suite === 'git')!
                .evidence as ReturnType<typeof newGitEvidence>;
            evidence.version = repository.version;
        }
        const turns = chatTurns(chatBackend, foundation);
        let env: Record<string, string>;
        let backendArgs: string[];
        let executable = versions.executable;
        if (pythonSelected) {
            stage = 'python-prepare';
            pythonEvidence.stage = stage;
            const deadline = pythonDeadline!;
            preservation = await cancellation.perform(() =>
                deadline.perform(async () => {
                    preservation = await capturePreservation(checkout);
                    return preservation;
                }),
            );
            await cancellation.perform(() =>
                deadline.perform(() =>
                    writeFile(
                        join(run.report, 'preservation-before.json'),
                        JSON.stringify(preservation),
                        { flag: 'wx', mode: 0o600 },
                    ),
                ),
            );
            const profile = await cancellation.perform(() =>
                deadline.perform(() => pythonProfile(checkout, run.resources)),
            );
            Object.assign(run, profile);
            persistentProfilePath = profile.userData;
            await cancellation.perform(() =>
                deadline.perform(() => mkdir(join(run.resources, 'home'))),
            );
            await cancellation.perform(() =>
                deadline.perform(() => mkdir(join(run.resources, 'tmp'))),
            );
            const sentinel = join(run.resources, 'protected-sentinel');
            await cancellation.perform(() =>
                deadline.perform(() => mkdir(sentinel)),
            );
            await cancellation.perform(() =>
                deadline.perform(() =>
                    writeFile(join(sentinel, 'unchanged'), run.id, {
                        flag: 'wx',
                    }),
                ),
            );
            const guardScript = join(run.resources, 'terminal-guard.cjs');
            await cancellation.perform(() =>
                deadline.perform(() =>
                    writeFile(
                        guardScript,
                        `const fs = require('node:fs');
let denied = false;
try { fs.appendFileSync(${JSON.stringify(join(sentinel, 'unchanged'))}, 'mutation'); } catch(e) { if (e.code === 'EPERM' || e.code === 'EACCES') denied = true; else throw e; }
fs.writeFileSync(${JSON.stringify(join(run.resources, 'terminal-guard.json'))}, JSON.stringify({denied}), {flag:'wx'});
console.log(denied ? 'GUARD_DENIED ${run.id}' : 'GUARD_FAILED ${run.id}');
setTimeout(() => process.exit(0), 90000);
`,
                        { flag: 'wx' },
                    ),
                ),
            );
            const guarded = await cancellation.perform(() =>
                deadline.perform(() =>
                    createProtectedLaunch(
                        run.resources,
                        versions!.executable,
                        checkout,
                        sentinel,
                        interpreter!.canonical,
                        interpreter!.absolute,
                    ),
                ),
            );
            executable = guarded.executable;
            pythonEvidence.protectedPaths = guarded.protectedPaths;
            env = {
                ...pythonEnvironment(run.resources),
                ...guarded.environment,
                XDG_STATE_HOME: run.state,
                PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
                LANG: 'en_US.UTF-8',
            };
            backendArgs = [
                ...backendLaunch('mock', run, {}).args,
                '--no-sandbox',
                '--disable-extension',
                'github.copilot-chat',
            ];
        } else if (chatBackend === 'real') {
            try {
                const profile = await cancellation.perform(() =>
                    realProfile(checkout),
                );
                await cancellation.perform(() => requireClosedProfile(profile));
                Object.assign(run, profile);
                persistentProfilePath = profile.userData;
            } catch (cause) {
                if (
                    cause instanceof CancellationError ||
                    cause instanceof ScenarioStoppedError
                )
                    throw cause;
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
                mock = await cancellation.perform(async () => {
                    mock = await services.startMock(
                        Object.fromEntries(
                            turns.map((turn) => [turn.marker, turn.reply]),
                        ),
                    );
                    if (
                        cleanupFinished ||
                        (cleanupEnd !== undefined && Date.now() >= cleanupEnd)
                    ) {
                        void mock.close().catch(() => {});
                    }
                    return mock;
                });
            let automation: Record<string, string> = {};
            if (gitSelected) {
                const profile = await cancellation.perform(() =>
                    gitProfile(checkout),
                );
                Object.assign(run, profile);
                persistentProfilePath = profile.userData;
            } else
                automation = await cancellation.perform(() =>
                    prepareProfile(run, mock!.url),
                );
            const home = join(run.resources, 'home');
            await cancellation.perform(() => mkdir(home));
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
            await cancellation.perform(() => mkdir(env.TMPDIR));
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
            ? await cancellation.perform(() => rendererLogs(run.userData))
            : [];
        const previousGitLogs = repository
            ? await cancellation.perform(() => gitExtensionLogs(run.userData))
            : [];
        stage = 'launch';
        const launchStart = Date.now();
        pythonDeadline?.stage('launch', 60000);
        if (pythonSelected) pythonEvidence.stage = stage;
        launchAttempted = true;
        const launchOperation = async () => {
            const launched = await launch({
                executablePath: executable,
                timeout: 60000,
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
            app = launched;
            ownedChild = launched.process();
            if (
                cleanupFinished ||
                (cleanupEnd !== undefined && Date.now() >= cleanupEnd)
            ) {
                // This late handle is still ours; the uncertain run stays reserved.
                void closeOwnedApplication(launched, {
                    deadline: Date.now() + (pythonSelected ? 120_000 : 15_000),
                    closeTimeoutMs: pythonSelected ? 60_000 : 10_000,
                }).catch(() => {});
            }
            return launched;
        };
        app = await cancellation.perform(() => {
            pendingLaunch = cancellation.track(launchOperation());
            return pythonDeadline
                ? pythonDeadline.perform(() => pendingLaunch!)
                : pendingLaunch;
        });
        app.process().stdout?.on('data', () => {});
        app.process().stderr?.on('data', () => {});
        const firstWindow = () =>
            app!.firstWindow({
                timeout: Math.max(1, 60000 - (Date.now() - launchStart)),
            });
        page = pythonDeadline
            ? await cancellation.perform(() =>
                  pythonDeadline.perform(firstWindow),
              )
            : await cancellation.perform(() => firstWindow());
        page.setDefaultTimeout(15000);
        page.setDefaultNavigationTimeout(15000);
        // Real runs never record screenshots/traces: authentication may expire mid-run.
        if (chatBackend === 'mock' && !pythonSelected) {
            await cancellation.perform(() =>
                bounded(
                    cancellation.track(
                        (async () => {
                            await app!.context().tracing.start({
                                screenshots: true,
                                snapshots: true,
                                sources: true,
                            });
                            tracing = true;
                        })(),
                    ),
                    Math.max(1, 60000 - (Date.now() - launchStart)),
                    'Trace start',
                ),
            );
            tracing = true;
        }
        stage = 'driver';
        const workbench = pythonDeadline
            ? (pythonWorkbench = services.pythonWorkbench(page, pythonDeadline))
            : services.workbench(page, cancellation);
        const ready = () =>
            workbench.ready(Math.max(1, 60000 - (Date.now() - launchStart)));
        if (pythonDeadline)
            await cancellation.perform(() => pythonDeadline.perform(ready));
        else await cancellation.perform(() => ready());
        if (pythonDeadline) {
            pythonDeadline.stage('guard-inheritance', 60000);
            pythonEvidence.stage = 'guard-inheritance';
            const denied = await cancellation.perform(() =>
                pythonDeadline.perform(() =>
                    app!.evaluate(
                        (_electron, path) => {
                            const fs = process.getBuiltinModule('node:fs');
                            try {
                                fs.appendFileSync(path, 'mutation');
                                return false;
                            } catch (cause) {
                                return (
                                    cause instanceof Error &&
                                    'code' in cause &&
                                    (cause.code === 'EPERM' ||
                                        cause.code === 'EACCES')
                                );
                            }
                        },
                        join(run.resources, 'protected-sentinel/unchanged'),
                    ),
                ),
            );
            if (!denied)
                throw new PythonFailure(
                    'harness_error',
                    'Electron preservation guard did not deny sentinel mutation',
                    pythonEvidence,
                );
            await cancellation.perform(() =>
                pythonDeadline.perform(() =>
                    pythonWorkbench!.verifyTerminalGuard(
                        `GUARD_DENIED ${run.id}`,
                    ),
                ),
            );
            const guard: unknown = JSON.parse(
                await cancellation.perform(() =>
                    pythonDeadline.perform(() =>
                        readFile(
                            join(run.resources, 'terminal-guard.json'),
                            'utf8',
                        ),
                    ),
                ),
            );
            if (
                !guard ||
                typeof guard !== 'object' ||
                !('denied' in guard) ||
                guard.denied !== true ||
                (await cancellation.perform(() =>
                    pythonDeadline.perform(() =>
                        readFile(
                            join(run.resources, 'protected-sentinel/unchanged'),
                            'utf8',
                        ),
                    ),
                )) !== run.id
            )
                throw new PythonFailure(
                    'harness_error',
                    'Terminal preservation guard not established',
                    pythonEvidence,
                );
        }
        timings.launchMs = Date.now() - launchStart;
        if (repository) {
            stage = 'git-tool';
            await cancellation.perform(() =>
                requireGitExtension(
                    run.userData,
                    repository!,
                    previousGitLogs,
                    15_000,
                    cancellation,
                ),
            );
        }
        for (const check of checks) {
            cancellation.check();
            stage = check.suite;
            const checkStart = Date.now();
            const chatEvidence: ChatEvidence = { session: '', turns: [] };
            if (check.suite === 'chat') check.evidence = chatEvidence;
            try {
                const deadline =
                    check.suite === 'chat' && chatBackend === 'real'
                        ? 300000
                        : 120000;
                let operation: Promise<unknown>;
                if (check.suite === 'python')
                    operation = pendingPython = services.python(
                        pythonWorkbench!,
                        run.workspace,
                        interpreter!,
                        pythonEvidence,
                        pythonDeadline!,
                        run.extensions,
                    );
                else if (check.suite === 'editing')
                    operation = services.editing(
                        workbench,
                        run.workspace,
                        cancellation,
                    );
                else if (check.suite === 'git')
                    operation = services.git(
                        workbench,
                        repository!,
                        run.workspace,
                        check.evidence as ReturnType<typeof newGitEvidence>,
                        cancellation,
                    );
                else
                    operation = workbench.qualifyChat(
                        turns,
                        chatBackend,
                        () => mock?.requests() ?? [],
                        () => readLocalSession(run.userData, previousLogs),
                        120000,
                        run.workspace,
                        chatEvidence,
                    );
                operation = cancellation.track(operation);
                check.evidence = await cancellation.perform(() =>
                    bounded(
                        operation,
                        check.suite === 'python'
                            ? Math.max(1, pythonScenarioEnd - Date.now())
                            : deadline,
                        `${check.suite} test`,
                    ),
                );
                if (check.suite === 'python') pythonDeadline!.remaining();
                check.outcome = 'passed';
            } catch (cause) {
                if (
                    cause instanceof CancellationError ||
                    cause instanceof ScenarioStoppedError
                ) {
                    check.outcome = 'harness_error';
                    check.error = cause.message;
                    if (
                        check.suite === 'chat' &&
                        chatEvidence.originatingFailure
                    )
                        originating ??= { ...chatEvidence.originatingFailure };
                    throw cause;
                }
                check.outcome =
                    cause instanceof CancellationError ||
                    cause instanceof ScenarioStoppedError
                        ? 'harness_error'
                        : cause instanceof ChatFailure ||
                            cause instanceof GitFailure ||
                            cause instanceof PythonFailure
                          ? cause.outcome
                          : chatBackend === 'real' &&
                              check.suite === 'chat' &&
                              !String(cause).includes('test timed out')
                            ? 'harness_error'
                            : 'failed';
                if (
                    (cause instanceof ChatFailure ||
                        cause instanceof GitFailure ||
                        cause instanceof PythonFailure) &&
                    cause.evidence
                )
                    check.evidence = cause.evidence;
                check.error =
                    cause instanceof ChatFailure ||
                    cause instanceof GitFailure ||
                    cause instanceof PythonFailure ||
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
        enterCleanup();
        error =
            chatBackend === 'real' &&
            launchAttempted &&
            !(cause instanceof ChatFailure) &&
            !(cause instanceof GitFailure) &&
            !(cause instanceof PythonFailure)
                ? 'Real test application launch or driver contract failed'
                : String(cause);
        outcome =
            cause instanceof ChatFailure ||
            cause instanceof GitFailure ||
            cause instanceof PythonFailure
                ? cause.outcome
                : cause instanceof PythonProfileFailure
                  ? cause.outcome
                  : cause instanceof PythonInterpreterPrerequisite
                    ? 'blocked'
                    : pythonSelected &&
                        stage === 'python' &&
                        (pythonDeadline?.expired ||
                            String(cause).includes('python test timed out'))
                      ? 'failed'
                      : pythonSelected &&
                          !['preflight', 'launch'].includes(stage)
                        ? 'harness_error'
                        : stage === 'git-preflight'
                          ? 'harness_error'
                          : ['preflight', 'launch', 'driver'].includes(stage)
                            ? 'blocked'
                            : 'failed';
        if (cancellation.requested) {
            if (!(
                cause instanceof CancellationError ||
                cause instanceof ScenarioStoppedError
            ))
                originating = { outcome, error };
            error = 'Cancelled by user';
            outcome = 'harness_error';
        }
        if (page && chatBackend === 'mock' && !pythonSelected) {
            try {
                await cleanupOperation(
                    () =>
                        page!.screenshot({
                            path: join(run.report, 'failure.png'),
                            timeout: remainingCleanup(5000),
                        }),
                    5000,
                    'Failure screenshot',
                );
            } catch (capture) {
                diagnostics.push(`Screenshot: ${String(capture)}`);
            }
        }
    }
    enterCleanup();
    if (tracing && app) {
        try {
            await cleanupOperation(
                () =>
                    app!
                        .context()
                        .tracing.stop(
                            outcome === 'passed' && !cancellation.requested
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
    const cleanupDeadline = enterCleanup();
    const requests = mock?.requests() ?? [];
    const cleanup = await finishRun(
        run,
        outcome === 'passed',
        [
            async () => {
                if (pendingLaunch)
                    await cleanupOperation(
                        () => Promise.allSettled([pendingLaunch!]),
                        Number.MAX_SAFE_INTEGER,
                        'Launch settle',
                    );
                if (app) {
                    if (pythonDeadline) {
                        pythonEvidence.applicationExit =
                            await closeOwnedApplication(
                                {
                                    process: () => ownedChild!,
                                    close: () =>
                                        cancellation.track(app!.close()),
                                },
                                {
                                    deadline: cleanupDeadline,
                                    closeTimeoutMs: Math.min(
                                        60_000,
                                        remainingCleanup(),
                                    ),
                                },
                            );
                    } else {
                        // Preserve ordinary close/exit limits, and always observe the captured owned child.
                        await cleanupOperation(
                            () => app!.close(),
                            10_000,
                            'Application shutdown',
                        );
                        await closeOwnedApplication(
                            {
                                process: () => ownedChild!,
                                close: async () => {},
                            },
                            {
                                deadline: Date.now() + remainingCleanup(5000),
                                closeTimeoutMs: 1,
                            },
                        );
                    }
                } else if (launchAttempted)
                    throw new Error(
                        'Launch failed without an application handle; shutdown uncertain',
                    );
            },
            async () => {
                // Settlement also captures late prelaunch handles before mock/preservation cleanup.
                if (pythonDeadline)
                    await pythonDeadline.settle(remainingCleanup());
                await cancellation.settle(remainingCleanup());
                if (pendingPython)
                    await cleanupOperation(
                        () => Promise.allSettled([pendingPython!]),
                        Number.MAX_SAFE_INTEGER,
                        'Python scenario settle',
                    );
            },
            async () => {
                if (preservation) {
                    await cleanupOperation(
                        () =>
                            requirePreservationUnchanged(
                                checkout,
                                preservation!,
                            ),
                        Number.MAX_SAFE_INTEGER,
                        'Python preservation comparison',
                    );
                    pythonEvidence.preservation = {
                        unchanged: true,
                        entries: preservation.entries.length,
                    };
                }
            },
            async () => {
                if (mock)
                    await cleanupOperation(
                        () => mock!.close(),
                        5000,
                        'Mock shutdown',
                    );
            },
            async () => {
                await cancellation.settle(remainingCleanup());
            },
        ],
        { canRemove: () => !cancellation.requested, deadline: cleanupDeadline },
    );
    cleanupFinished = true;
    if (cancellation.requested) {
        if (error !== 'Cancelled by user') originating ??= { outcome, error };
        error = 'Cancelled by user';
        outcome = 'harness_error';
    }
    if (cleanup.errors.length) outcome = 'harness_error';
    const result = {
        runId: run.id,
        scope: foundation ? 'foundation' : 'selected-suites',
        suites: options.suite,
        chatBackend,
        chatSelected,
        outcome,
        error,
        ...(cancellation.requested
            ? {
                  cancellation: { reason: 'Cancelled by user' },
                  ...(originating ? { originating } : {}),
              }
            : {}),
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
    const snapshot: typeof result = JSON.parse(JSON.stringify(result));
    await writeFile(snapshot.resultPath, JSON.stringify(snapshot, null, 2));
    if (cancellation.requested && !snapshot.cancellation) {
        snapshot.originating = {
            outcome: snapshot.outcome,
            ...(snapshot.error ? { error: snapshot.error } : {}),
        };
        snapshot.cancellation = { reason: 'Cancelled by user' };
        snapshot.outcome = 'harness_error';
        snapshot.error = 'Cancelled by user';
        await writeFile(snapshot.resultPath, JSON.stringify(snapshot, null, 2));
    }
    return snapshot;
}
