import type { ReportResult } from './report.js';

export interface CLIStartup {
    args: string[];
    checkout: string;
    cancelled: boolean;
}

export function isCLIStartup(value: unknown): value is CLIStartup {
    if (!value || typeof value !== 'object') return false;
    const item = value as Record<string, unknown>;
    return (
        Array.isArray(item.args) &&
        item.args.every((arg: unknown) => typeof arg === 'string') &&
        typeof item.checkout === 'string' &&
        typeof item.cancelled === 'boolean'
    );
}

export function isCLIResult(value: unknown): value is ReportResult {
    if (!value || typeof value !== 'object') return false;
    const item = value as Record<string, unknown>;
    if (
        !['passed', 'failed', 'blocked', 'harness_error'].includes(
            String(item.outcome),
        )
    )
        return false;
    for (const key of [
        'error',
        'runId',
        'resultPath',
        'resourcesPath',
        'scope',
    ]) {
        if (item[key] !== undefined && typeof item[key] !== 'string')
            return false;
    }
    if (
        item.durationMs !== undefined &&
        (typeof item.durationMs !== 'number' ||
            !Number.isFinite(item.durationMs) ||
            item.durationMs < 0)
    )
        return false;
    if (
        item.chatBackend !== undefined &&
        item.chatBackend !== 'real' &&
        item.chatBackend !== 'mock'
    )
        return false;
    if (
        item.chatSelected !== undefined &&
        typeof item.chatSelected !== 'boolean'
    )
        return false;
    for (const key of ['cancellation', 'originating']) {
        if (item[key] !== undefined) {
            const nested = item[key];
            if (!nested || typeof nested !== 'object') return false;
            const fields = nested as Record<string, unknown>;
            if (
                key === 'cancellation'
                    ? typeof fields.reason !== 'string'
                    : typeof fields.outcome !== 'string' ||
                      (fields.error !== undefined &&
                          typeof fields.error !== 'string')
            )
                return false;
        }
    }
    if (item.cleanup !== undefined) {
        if (!item.cleanup || typeof item.cleanup !== 'object') return false;
        const cleanup = item.cleanup as Record<string, unknown>;
        if (
            !['removed', 'retained'].includes(String(cleanup.disposition)) ||
            typeof cleanup.reservationRetained !== 'boolean' ||
            !Array.isArray(cleanup.errors) ||
            !cleanup.errors.every((error: unknown) => typeof error === 'string')
        )
            return false;
    }
    if (
        item.checks !== undefined &&
        (!Array.isArray(item.checks) ||
            !item.checks.every((check: unknown) => {
                if (!check || typeof check !== 'object') return false;
                const fields = check as Record<string, unknown>;
                return (
                    typeof fields.suite === 'string' &&
                    typeof fields.outcome === 'string' &&
                    (fields.error === undefined ||
                        typeof fields.error === 'string') &&
                    (fields.durationMs === undefined ||
                        typeof fields.durationMs === 'number')
                );
            }))
    )
        return false;
    if (item.outcome === 'passed') {
        if (
            item.cancellation ||
            !item.cleanup ||
            typeof item.cleanup !== 'object'
        )
            return false;
        const cleanup = item.cleanup as Record<string, unknown>;
        if (
            cleanup.disposition !== 'removed' ||
            cleanup.reservationRetained !== false ||
            !Array.isArray(cleanup.errors) ||
            cleanup.errors.length !== 0
        )
            return false;
    }
    return true;
}
