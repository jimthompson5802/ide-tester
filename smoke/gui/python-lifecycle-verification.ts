import { _electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveApp } from '../src/app.js';
import { createRun, finishRun } from '../src/resources.js';
import { bounded, Workbench } from '../src/workbench.js';
import { prepareObservationProfile } from './issue-40-python-feasibility.js';
import { WalkthroughDeadline } from './python-deadline.js';
import {
    closeOwnedApplication,
    type OwnedApplication,
} from './python-shutdown.js';
import {
    capturePreservation,
    createProtectedLaunch,
    requirePreservationUnchanged,
} from './python-preservation.js';

export async function verifyPythonLifecycle(build: string): Promise<boolean> {
    const installed = await resolveApp(build);
    if (
        process.platform !== 'darwin' ||
        process.arch !== 'arm64' ||
        process.version !== 'v26.3.1' ||
        installed.vscode !== '1.135.0'
    )
        throw new Error('Unqualified host/application');
    const checkout = await realpath(
        fileURLToPath(new URL('../../../', import.meta.url)),
    );
    const run = await createRun(checkout);
    const evidence: Record<string, unknown> = {
        scope: 'python-lifecycle-qualification',
        runId: run.id,
        versions: installed,
    };
    let application: Awaited<ReturnType<typeof _electron.launch>> | undefined;
    let attempted = false;
    let ownedApplication: OwnedApplication | undefined;
    let passed = false;
    let error: string | undefined;
    let deadline: WalkthroughDeadline | undefined;
    let manifest: Awaited<ReturnType<typeof capturePreservation>> | undefined;
    try {
        manifest = await capturePreservation(checkout);
        await requirePreservationUnchanged(checkout, manifest);
        const home = join(run.resources, 'home');
        const temporary = join(run.resources, 'tmp');
        const sentinel = join(run.resources, 'protected-sentinel');
        for (const path of [home, temporary, sentinel]) await mkdir(path);
        const launch = await createProtectedLaunch(
            run.resources,
            installed.executable,
            checkout,
            sentinel,
        );
        const profile = await prepareObservationProfile(checkout, {});
        evidence.profile = profile;
        evidence.protectedPaths = launch.protectedPaths;
        attempted = true;
        const launchEnd = Date.now() + 60_000;
        application = await _electron.launch({
            executablePath: launch.executable,
            timeout: 60_000,
            env: {
                ...launch.environment,
                HOME: home,
                TMPDIR: temporary,
                XDG_STATE_HOME: profile.state,
                PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
                LANG: 'en_US.UTF-8',
                PYTHONDONTWRITEBYTECODE: '1',
                PYTHONNOUSERSITE: '1',
                PIP_NO_INDEX: '1',
                PIP_DISABLE_PIP_VERSION_CHECK: '1',
            },
            args: [
                run.workspace,
                '--new-window',
                '--no-sandbox',
                '--user-data-dir',
                profile.userData,
                '--extensions-dir',
                profile.extensions,
                '--disable-extensions',
                '--use-inmemory-secretstorage',
                '--password-store=basic',
                '--enable-smoke-test-driver',
                '--skip-welcome',
                '--skip-release-notes',
                '--disable-telemetry',
                '--disable-experiments',
                '--locale=en',
            ],
        });
        application.process().stdout?.on('data', () => {});
        application.process().stderr?.on('data', () => {});
        evidence.applicationPid = application.process().pid;
        // Keep the child handle independently: Playwright's application object
        // may dispose its backing channel after close and cannot be re-queried.
        const ownedChild = application.process();
        const launchedApplication = application;
        ownedApplication = {
            process: () => ownedChild,
            close: () => launchedApplication.close(),
        };
        const page = await application.firstWindow({
            timeout: Math.max(1, launchEnd - Date.now()),
        });
        await new Workbench(page).ready(Math.max(1, launchEnd - Date.now()));
        assert.equal(application.windows().length, 1);
        const operationDeadline = new WalkthroughDeadline(75);
        deadline = operationDeadline;
        let lateValueReturned = false;
        let accepted = false;
        let newUiCalls = 0;
        let operationStarted = false;
        const wait = operationDeadline
            .perform(async () => {
                operationStarted = true;
                const value: unknown = await page.evaluate(
                    () =>
                        new Promise<string>((resolve) =>
                            setTimeout(
                                () => resolve('late-renderer-result'),
                                300,
                            ),
                        ),
                );
                lateValueReturned = true;
                return value;
            })
            .then(() => {
                accepted = true;
            });
        await assert.rejects(wait, /expired/);
        await assert.rejects(
            operationDeadline.perform(async () => {
                newUiCalls++;
                await page.keyboard.press('Meta+N');
            }),
            /expired/,
        );
        assert.equal(operationStarted, true);
        assert.equal(accepted, false);
        assert.equal(newUiCalls, 0);
        evidence.deadline = {
            expired: operationDeadline.expired,
            operationStarted,
            lateEvidenceAccepted: accepted,
            subsequentUiCalls: newUiCalls,
        };
        const reservationBefore = await readFile(run.reservation);
        const markerBefore = await readFile(join(run.resources, '.owner'));
        const child = application.process();
        assert.equal(child.exitCode, null);
        assert.equal(child.signalCode, null);
        const uncertain = await finishRun(run, true, [
            async () => {
                await closeOwnedApplication(
                    { process: () => child, close: async () => {} },
                    { deadline: Date.now() + 75, closeTimeoutMs: 25 },
                );
            },
        ]);
        assert.equal(uncertain.disposition, 'retained');
        assert.equal(uncertain.reservationRetained, true);
        assert.ok(uncertain.errors.length);
        assert.deepEqual(await readFile(run.reservation), reservationBefore);
        assert.deepEqual(
            await readFile(join(run.resources, '.owner')),
            markerBefore,
        );
        await assert.rejects(createRun(checkout), /reservation/);
        evidence.uncertainShutdown = {
            simulatedCloseObservation: true,
            cleanup: uncertain,
            reservationBytesPreserved: true,
            resourceMarkerPreserved: true,
            secondRunRefused: true,
        };
        // Real cleanup uses the original handle, never the uncertain adapter.
        const recoveryEnd = Date.now() + 120_000;
        evidence.applicationExit = await closeOwnedApplication(
            ownedApplication,
            {
                deadline: recoveryEnd,
            },
        );
        operationDeadline.stop();
        await operationDeadline.settle(Math.max(1, recoveryEnd - Date.now()));
        assert.equal(accepted, false);
        assert.equal(newUiCalls, 0);
        evidence.deadline = {
            ...(evidence.deadline as Record<string, unknown>),
            lateValueReturned,
            pendingOperationsSettled: true,
            lateEvidenceAccepted: accepted,
            subsequentUiCalls: newUiCalls,
        };
        await bounded(
            requirePreservationUnchanged(checkout, manifest),
            Math.max(1, recoveryEnd - Date.now()),
            'Lifecycle preservation comparison',
        );
        evidence.preservation = {
            unchanged: true,
            entries: manifest.entries.length,
        };
        if (Date.now() >= recoveryEnd)
            throw new Error('Recovery budget expired');
        passed = true;
    } catch (cause) {
        error = cause instanceof Error ? cause.message : String(cause);
    }
    const cleanupEnd = Date.now() + 120_000;
    const cleanup = await finishRun(run, passed, [
        async () => {
            deadline?.stop();
            if (ownedApplication)
                evidence.applicationExit = await closeOwnedApplication(
                    ownedApplication,
                    { deadline: cleanupEnd },
                );
            else if (attempted)
                throw new Error(
                    'Application launch uncertain; retain reservation',
                );
            if (deadline)
                await deadline.settle(Math.max(1, cleanupEnd - Date.now()));
            if (manifest)
                await bounded(
                    requirePreservationUnchanged(checkout, manifest),
                    Math.max(1, cleanupEnd - Date.now()),
                    'Lifecycle preservation comparison',
                );
            if (Date.now() >= cleanupEnd)
                throw new Error('Lifecycle cleanup budget expired');
        },
    ]);
    const result = {
        ...evidence,
        outcome: passed && !cleanup.errors.length ? 'passed' : 'harness_error',
        error,
        cleanup,
        report: run.report,
        limitations: [
            'Shutdown uncertainty was injected; VS Code was not made unkillable',
            'Extensions disabled; no Python execution',
            'Independent descendant termination not verified',
        ],
    };
    await writeFile(
        join(run.report, 'python-lifecycle-verification.json'),
        JSON.stringify(result, null, 2),
        { flag: 'wx', mode: 0o600 },
    );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return passed && cleanup.errors.length === 0;
}
