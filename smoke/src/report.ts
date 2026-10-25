import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { GitEvidence } from './git-repository.js';
import type { Cancellation } from './cancellation.js';

export interface ReportResult {
    chatSelected?: boolean;
    mockRequestEvidence?: string;
    mockRequestCount?: number | null;
    requests?: unknown;
    runId?: string;
    scope?: string;
    chatBackend?: 'mock' | 'real';
    outcome: string;
    error?: string;
    cancellation?: { reason: string };
    originating?: { outcome: string; error?: string };
    durationMs?: number;
    checks?: {
        suite: string;
        outcome: string;
        durationMs?: number;
        error?: string;
        evidence?: unknown;
    }[];
    cleanup?: {
        disposition?: string;
        reservationRetained?: boolean;
        errors?: string[];
    };
    resourcesPath?: string;
    resultPath?: string;
}

const labels: Record<string, string> = {
    passed: 'PASSED',
    failed: 'FAILED',
    blocked: 'BLOCKED',
    harness_error: 'HARNESS ERROR',
    not_run: 'NOT RUN',
};
const status = (value?: string) =>
    value ? (labels[value] ?? 'Unavailable') : 'Unavailable';
const duration = (ms?: number) =>
    ms === undefined ? 'Unavailable' : `${(ms / 1000).toFixed(3)} seconds`;

export function formatResult(result: ReportResult): string {
    const lines = [
        `Smoke test: ${status(result.outcome)}`,
        `Run ID: ${result.runId ?? 'Unavailable'}`,
        `Scope: ${result.scope === 'foundation' ? 'Foundation' : result.scope === 'selected-suites' ? 'Selected suites' : 'Unavailable'}`,
        ...(result.chatSelected === false
            ? ['Chat: Not selected']
            : result.chatBackend
              ? [`Chat backend: ${result.chatBackend}`]
              : []),
        ...(result.mockRequestEvidence === 'inapplicable' &&
        result.chatSelected === false
            ? ['Mock request evidence: Inapplicable']
            : []),
        '',
        'Suite       Result        Duration',
    ];
    if (!result.checks?.length) lines.push('Suite information: Unavailable');
    for (const check of result.checks ?? []) {
        const name = check.suite.charAt(0).toUpperCase() + check.suite.slice(1);
        lines.push(
            `${name.padEnd(12)}${status(check.outcome).padEnd(14)}${duration(check.durationMs)}`,
        );
        if (
            check.suite === 'git' &&
            check.evidence &&
            typeof check.evidence === 'object'
        ) {
            const git = check.evidence as Partial<GitEvidence>;
            if (git.stage) lines.push(`  Git stage: ${git.stage}`);
            if (git.hash && git.message)
                lines.push(`  Git commit: ${git.hash} ${git.message}`);
            if (git.log) lines.push(`  Git log: ${git.log}`);
        }
        if (
            check.suite === 'python' &&
            check.evidence &&
            typeof check.evidence === 'object'
        ) {
            const evidence = check.evidence;
            if ('stage' in evidence && typeof evidence.stage === 'string')
                lines.push(`  Python stage: ${evidence.stage}`);
            if (
                'installMode' in evidence &&
                typeof evidence.installMode === 'string'
            )
                lines.push(`  Python installation: ${evidence.installMode}`);
            if (
                'identity' in evidence &&
                evidence.identity &&
                typeof evidence.identity === 'object'
            ) {
                const identity = evidence.identity;
                if (
                    'invocation' in identity &&
                    typeof identity.invocation === 'string' &&
                    'version' in identity &&
                    typeof identity.version === 'string'
                )
                    lines.push(
                        `  Python runtime: ${identity.invocation} (${identity.version})`,
                    );
            }
        }
        if (check.error) lines.push(`  Reason: ${check.error}`);
    }
    lines.push(
        '',
        `Harness disposition: ${status(result.outcome)}`,
        `Resources: ${result.cleanup?.disposition === 'removed' ? 'Removed' : result.cleanup?.disposition === 'retained' ? 'Retained' : 'Unavailable'}`,
        `Reservation: ${result.cleanup?.reservationRetained === true ? 'Retained' : result.cleanup?.reservationRetained === false ? 'Released' : 'Unavailable'}`,
        `Duration: ${duration(result.durationMs)}`,
    );
    if (result.error) lines.push(`Failure reason: ${result.error}`);
    if (result.cancellation)
        lines.push(`Cancellation: ${result.cancellation.reason}`);
    if (result.originating) {
        lines.push(
            `Originating disposition: ${status(result.originating.outcome)}`,
        );
        if (result.originating.error)
            lines.push(`Originating reason: ${result.originating.error}`);
    }
    for (const error of result.cleanup?.errors ?? [])
        lines.push(`Cleanup error: ${error}`);
    if (result.cleanup?.disposition === 'retained' && result.resourcesPath)
        lines.push(`Resource path: ${result.resourcesPath}`);
    lines.push(`JSON report: ${result.resultPath ?? 'Unavailable'}`);
    return lines.join('\n');
}

export async function reportResult(
    result: ReportResult,
    mode: 'text' | 'json',
    output: (message: string) => void,
    cancellation?: Cancellation,
): Promise<number> {
    // The result may contain suite-specific fields outside the presentation contract.
    let presented = { ...result };
    const applyCancellation = (): boolean => {
        if (!cancellation?.requested || presented.cancellation) return false;
        presented = {
            ...presented,
            originating: presented.originating ?? {
                outcome: presented.outcome,
                ...(presented.error ? { error: presented.error } : {}),
            },
            outcome: 'harness_error',
            error: 'Cancelled by user',
            cancellation: { reason: 'Cancelled by user' },
        };
        return true;
    };
    let cancellationChanged = applyCancellation();
    let summary = formatResult(presented);
    let reportTarget = 'result.txt';
    try {
        if (presented.resultPath) {
            // Ordinary results retain their existing JSON persistence behavior.
            // A late cancellation must reconcile both saved reports before output.
            if (cancellationChanged) {
                reportTarget = 'result.json';
                await writeFile(
                    presented.resultPath,
                    JSON.stringify(presented, null, 2),
                );
            }
            reportTarget = 'result.txt';
            await writeFile(
                join(dirname(presented.resultPath), 'result.txt'),
                summary + '\n',
            );
            cancellationChanged = applyCancellation();
            if (cancellationChanged) {
                summary = formatResult(presented);
                reportTarget = 'result.json';
                await writeFile(
                    presented.resultPath,
                    JSON.stringify(presented, null, 2),
                );
                reportTarget = 'result.txt';
                await writeFile(
                    join(dirname(presented.resultPath), 'result.txt'),
                    summary + '\n',
                );
            }
        }
    } catch (error) {
        const changedOnFailure = applyCancellation();
        let reconciliationError = '';
        if (changedOnFailure && presented.resultPath) {
            try {
                await writeFile(
                    presented.resultPath,
                    JSON.stringify(presented, null, 2),
                );
            } catch (cause) {
                reconciliationError = `; cancellation JSON reconciliation failed: ${String(cause)}`;
            }
        }
        summary = formatResult(presented);
        const reportingError = `Reporting error: could not write ${reportTarget}: ${String(error)}; JSON report: ${presented.resultPath}${reconciliationError}`;
        output(
            mode === 'json'
                ? JSON.stringify({ ...presented, reportingError })
                : summary + '\n' + reportingError,
        );
        return 1;
    }
    // No awaited work separates this final cancellation check from output commitment.
    applyCancellation();
    summary = formatResult(presented);
    output(mode === 'json' ? JSON.stringify(presented) : summary);
    return presented.outcome === 'passed' && !cancellation?.requested ? 0 : 1;
}
