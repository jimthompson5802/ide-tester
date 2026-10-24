import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import {
    preparePythonInterpreter,
    PythonInterpreterPrerequisite,
} from './python-interpreter.js';
import {
    formatGUISummary,
    type GUIBatch,
    type GUIRow,
    type GUIOutcome,
} from './gui-report.js';

export interface GUICommandCancellation {
    readonly requested: boolean;
    subscribe(listener: () => void): () => void;
}
export interface GUICommandOptions {
    buildPath: string;
    pythonInterpreter: string;
    invocationCwd: string;
}
export interface GUICommandServices {
    batch: GUIBatch;
    save(batch: GUIBatch): Promise<void>;
    output(message: string): void;
    smokeDirectory: string;
    cancellation?: GUICommandCancellation;
    spawn?: typeof nodeSpawn;
}
export async function runGUICommand(
    options: GUICommandOptions,
    services: GUICommandServices,
): Promise<{ exitCode: number; result: GUIBatch }> {
    const batch = services.batch;
    const started = Date.now() - batch.durationMs;
    let lifecycleComplete = true;
    const cancel = (): void => {
        if (services.cancellation?.requested) {
            batch.cancellation = { reason: 'Cancelled by user' };
            batch.outcome = 'harness_error';
            batch.error = 'Cancelled by user';
        }
    };
    try {
        cancel();
        if (!batch.cancellation) {
            batch.preflight.state = 'running';
            batch.activeStage = 'preflight';
            await services.save(batch);
            cancel();
            if (!batch.cancellation) {
                const interpreter = await preparePythonInterpreter(
                    options.pythonInterpreter,
                    options.invocationCwd,
                );
                batch.preflight.state = 'passed';
                await services.save(batch);
                for (const row of batch.rows) {
                    cancel();
                    if (batch.cancellation) break;
                    batch.state = 'running';
                    batch.activeStage = row.suite;
                    await services.save(batch);
                    cancel();
                    if (batch.cancellation) break;
                    services.output(`Starting ${row.suite}`);
                    cancel();
                    if (batch.cancellation) break;
                    const args = [
                        join(services.smokeDirectory, 'dist/src/cli.js'),
                        '--build',
                        options.buildPath,
                        '--output',
                        'json',
                        '--suite',
                        row.suite,
                    ];
                    if (row.suite === 'basic')
                        args.push('--chat-backend', 'real');
                    if (row.suite === 'python')
                        args.push('--python-interpreter', interpreter.absolute);
                    const child = await collectChild(args, services);
                    applyChild(row, child);
                    lifecycleComplete =
                        lifecycleComplete &&
                        child.complete &&
                        row.cleanup !== undefined &&
                        row.cleanup.reservationRetained === false &&
                        row.cleanup.errors?.length === 0;
                    batch.outcome = row.outcome;
                    if (row.cancellation) batch.cancellation = row.cancellation;
                    batch.durationMs = Date.now() - started;
                    cancel();
                    await services.save(batch);
                    services.output(
                        `${row.suite}: ${row.outcome} (${row.durationMs ?? 0} ms), ${row.resultPath ?? 'report unavailable'}`,
                    );
                    if (row.outcome !== 'passed' || batch.cancellation) break;
                }
            }
        }
    } catch (error: unknown) {
        if (error instanceof PythonInterpreterPrerequisite) {
            batch.outcome = 'blocked';
            batch.preflight.state = 'blocked';
            batch.error = 'Python interpreter unavailable';
        } else {
            batch.outcome = 'harness_error';
            batch.error =
                'Aggregate stage or reporting failed; inspect existing owned evidence before recovery';
            batch.reportingErrors.push('Aggregate update or stage failed');
            lifecycleComplete = false;
        }
    }
    batch.state = lifecycleComplete ? 'completed' : 'incomplete';
    if (lifecycleComplete) delete batch.activeStage;
    batch.durationMs = Date.now() - started;
    cancel();
    try {
        await services.save(batch);
        // Successful final persistence plus this synchronous check is the commitment cutoff.
        if (services.cancellation?.requested && !batch.cancellation) {
            cancel();
            await services.save(batch);
        }
    } catch {
        batch.state = 'incomplete';
        batch.outcome = 'harness_error';
        batch.reportingErrors.push('Final aggregate persistence failed');
    }
    cancel();
    const exitCode =
        batch.outcome === 'passed' &&
        batch.rows.every((row) => row.outcome === 'passed') &&
        batch.reportingErrors.length === 0 &&
        batch.state === 'completed'
            ? 0
            : 1;
    services.output(formatGUISummary(batch));
    return { exitCode, result: batch };
}
interface ChildEvidence {
    stdout: string;
    durationMs: number;
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    outputError?: string;
    subprocessError?: string;
    complete: boolean;
}
async function collectChild(
    args: string[],
    services: GUICommandServices,
): Promise<ChildEvidence> {
    const started = Date.now();
    return new Promise((resolve) => {
        let child: ChildProcess;
        const chunks: Buffer[] = [];
        let bytes = 0;
        let outputError: string | undefined;
        let subprocessError: string | undefined;
        let signalled = false;
        let remove = (): void => {};
        const signal = (): void => {
            if (signalled) return;
            signalled = true;
            try {
                if (!child.kill('SIGINT'))
                    subprocessError = 'Owned child cancellation signal failed';
            } catch {
                subprocessError = 'Owned child cancellation signal failed';
            }
        };
        try {
            child = (services.spawn ?? nodeSpawn)(process.execPath, args, {
                cwd: services.smokeDirectory,
                detached: true,
                stdio: ['ignore', 'pipe', 'pipe'],
            });
        } catch {
            resolve({
                stdout: '',
                durationMs: Date.now() - started,
                exitCode: null,
                signal: null,
                subprocessError: 'Owned child spawn failed',
                complete: false,
            });
            return;
        }
        child.stdout?.on('data', (chunk: Buffer | string) => {
            bytes += Buffer.byteLength(chunk);
            if (bytes > 1_048_576) {
                outputError = 'Child stdout exceeded 1048576 bytes';
                signal();
            } else if (!outputError)
                chunks.push(
                    Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk),
                );
        });
        child.stderr?.on('data', () => {});
        child.on('error', () => {
            subprocessError = 'Owned child process failed';
        });
        child.once(
            'close',
            (exitCode: number | null, childSignal: NodeJS.Signals | null) => {
                remove();
                resolve({
                    stdout: Buffer.concat(chunks).toString('utf8'),
                    durationMs: Date.now() - started,
                    exitCode,
                    signal: childSignal,
                    outputError,
                    subprocessError,
                    complete:
                        !childSignal && exitCode !== null && !subprocessError,
                });
            },
        );
        remove = services.cancellation?.subscribe(signal) ?? remove;
        if (services.cancellation?.requested) signal();
    });
}
const outcomes = new Set(['passed', 'failed', 'blocked', 'harness_error']);
function object(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function applyChild(row: GUIRow, child: ChildEvidence): void {
    row.durationMs = child.durationMs;
    row.outcome = 'harness_error';
    if (child.outputError) row.outputError = child.outputError;
    if (child.subprocessError) row.subprocessError = child.subprocessError;
    let value: unknown;
    try {
        value = JSON.parse(child.stdout);
    } catch {
        row.error =
            'Malformed child result; shutdown evidence unavailable; inspect owned reservation before recovery';
        return;
    }
    if (
        !object(value) ||
        typeof value.outcome !== 'string' ||
        !outcomes.has(value.outcome) ||
        (value.suites !== undefined && value.suites !== row.suite) ||
        (value.chatBackend !== undefined &&
            value.chatBackend !== (row.suite === 'basic' ? 'real' : 'mock')) ||
        (value.durationMs !== undefined &&
            (typeof value.durationMs !== 'number' ||
                !Number.isFinite(value.durationMs) ||
                value.durationMs < 0)) ||
        (value.resultPath !== undefined &&
            typeof value.resultPath !== 'string') ||
        (value.reportingError !== undefined &&
            typeof value.reportingError !== 'string') ||
        (value.cancellation !== undefined &&
            (!object(value.cancellation) ||
                typeof value.cancellation.reason !== 'string'))
    ) {
        row.error = 'Invalid or contradictory child result';
        return;
    }
    row.originatingOutcome = value.outcome;
    if (
        object(value.originating) &&
        typeof value.originating.outcome === 'string' &&
        outcomes.has(value.originating.outcome)
    ) {
        row.originating = {
            outcome: value.originating.outcome,
            ...(typeof value.originating.error === 'string'
                ? { error: value.originating.error }
                : {}),
        };
    }
    if (
        object(value.cancellation) &&
        typeof value.cancellation.reason === 'string'
    )
        row.cancellation = { reason: value.cancellation.reason };
    if (typeof value.durationMs === 'number') row.durationMs = value.durationMs;
    if (typeof value.resultPath === 'string') row.resultPath = value.resultPath;
    if (typeof value.reportingError === 'string')
        row.reportingError = value.reportingError;
    if (value.cleanup !== undefined) {
        if (
            !object(value.cleanup) ||
            (value.cleanup.disposition !== 'removed' &&
                value.cleanup.disposition !== 'retained') ||
            typeof value.cleanup.reservationRetained !== 'boolean' ||
            !Array.isArray(value.cleanup.errors) ||
            !value.cleanup.errors.every((error) => typeof error === 'string')
        ) {
            row.error = 'Invalid child cleanup evidence';
            return;
        }
        row.cleanup = {
            disposition: value.cleanup.disposition,
            reservationRetained: value.cleanup.reservationRetained,
            errors: value.cleanup.errors,
        };
    }
    if (
        row.cancellation ||
        child.signal ||
        child.subprocessError ||
        child.outputError ||
        child.exitCode === null ||
        (value.outcome === 'passed' && child.exitCode !== 0) ||
        (value.outcome !== 'passed' && child.exitCode !== 1) ||
        row.reportingError
    ) {
        row.error =
            'Child command or reporting unsuccessful; inspect individual evidence and owned reservation before recovery';
        return;
    }
    if (
        value.outcome === 'passed' &&
        (!row.cleanup ||
            row.cleanup.disposition !== 'removed' ||
            row.cleanup.reservationRetained !== false ||
            row.cleanup.errors?.length)
    ) {
        row.error =
            'Successful shutdown and disposable cleanup were not confirmed';
        return;
    }
    row.outcome = value.outcome as GUIOutcome;
    if (row.outcome !== 'passed')
        row.error =
            typeof value.error === 'string'
                ? value.error
                : 'Suite unsuccessful; inspect individual report';
}
