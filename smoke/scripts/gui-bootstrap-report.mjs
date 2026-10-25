import { randomUUID } from 'node:crypto';
import {
    lstat,
    mkdir,
    realpath,
    rename,
    writeFile,
    unlink,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';

export function createGUIRecord(batchId) {
    return {
        batchId,
        state: 'incomplete',
        outcome: 'harness_error',
        build: { state: 'not_run' },
        preflight: { state: 'not_run' },
        rows: ['basic', 'git', 'python'].map((suite) => ({
            suite,
            backend: suite === 'basic' ? 'real' : 'inapplicable',
            outcome: 'not_run',
        })),
        durationMs: 0,
        reportingErrors: [],
    };
}

async function requireDirectory(path) {
    const info = await lstat(path);
    if (
        !info.isDirectory() ||
        info.isSymbolicLink() ||
        (await realpath(path)) !== resolve(path)
    ) {
        throw new Error(
            'Aggregate storage must use canonical directories without symlinks',
        );
    }
}

export async function createGUIReport(
    checkoutRoot,
    batchId = `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}`,
) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/.test(batchId)) {
        throw new Error('Invalid aggregate batch identifier');
    }
    const root = await realpath(checkoutRoot);
    let parent = root;
    for (const component of ['reports', 'smoke-batches']) {
        parent = join(parent, component);
        await mkdir(parent).catch((error) => {
            if (error.code !== 'EEXIST') throw error;
        });
        await requireDirectory(parent);
    }
    const directory = join(parent, batchId);
    await mkdir(directory);
    await requireDirectory(directory);
    const batch = createGUIRecord(batchId);
    await saveGUIReport(directory, batch);
    return { directory, batch };
}

async function replaceFile(directory, name, contents) {
    const temporary = join(directory, `.${name}-${randomUUID()}.tmp`);
    try {
        await writeFile(temporary, contents, { flag: 'wx', mode: 0o600 });
        await rename(temporary, join(directory, name));
    } finally {
        await unlink(temporary).catch((error) => {
            if (error.code !== 'ENOENT') throw error;
        });
    }
}

export async function saveGUIReport(directory, batch) {
    const path = resolve(directory);
    await requireDirectory(path);
    if (
        path.split('/').at(-2) !== 'smoke-batches' ||
        path.split('/').at(-3) !== 'reports' ||
        path.split('/').at(-1) !== batch.batchId
    ) {
        throw new Error('Refusing aggregate write outside its batch directory');
    }
    // Each replacement is atomic. JSON and text are deliberately not a transaction.
    await replaceFile(path, 'result.txt', formatGUISummary(batch));
    await replaceFile(
        path,
        'result.json',
        `${JSON.stringify(batch, null, 2)}\n`,
    );
}

export function formatGUISummary(batch) {
    const duration = (value) =>
        value === undefined ? 'Unavailable' : `${(value / 1000).toFixed(3)}s`;
    const lines = [
        `GUI batch: ${batch.outcome.toUpperCase()}`,
        `Batch ID: ${batch.batchId}`,
        `State: ${batch.state}`,
        `Build: ${batch.build.state}`,
        `Preflight: ${batch.preflight.state}`,
        '',
        'Suite  Backend  Outcome  Duration  Report',
    ];
    for (const row of batch.rows) {
        lines.push(
            `${row.suite}  ${row.backend}  ${row.outcome}  ${duration(row.durationMs)}  ${row.resultPath ?? 'Unavailable'}`,
        );
        if (row.error) lines.push(`  Reason: ${row.error}`);
        if (row.originating?.error)
            lines.push(`  Originating reason: ${row.originating.error}`);
        if (row.originating && !row.originatingOutcome)
            lines.push(`  Originating outcome: ${row.originating.outcome}`);
        if (row.originatingOutcome)
            lines.push(`  Originating outcome: ${row.originatingOutcome}`);
        if (row.outputError) lines.push(`  Output error: ${row.outputError}`);
        if (row.subprocessError)
            lines.push(`  Subprocess error: ${row.subprocessError}`);
        if (row.cleanup)
            lines.push(
                `  Cleanup: ${row.cleanup.disposition ?? 'Unavailable'}; reservation ${row.cleanup.reservationRetained === false ? 'released' : row.cleanup.reservationRetained === true ? 'retained' : 'Unavailable'}`,
            );
        if (row.reportingError)
            lines.push(`  Reporting error: ${row.reportingError}`);
        for (const error of row.cleanup?.errors ?? [])
            lines.push(`  Cleanup error: ${error}`);
    }
    lines.push('', `Duration: ${duration(batch.durationMs)}`);
    for (const stage of ['build', 'preflight'])
        if (batch[stage].error) lines.push(`${stage}: ${batch[stage].error}`);
    if (batch.cancellation)
        lines.push(
            `Cancellation: ${typeof batch.cancellation === 'string' ? batch.cancellation : JSON.stringify(batch.cancellation)}`,
        );
    if (batch.error) lines.push(`Reason: ${batch.error}`);
    for (const error of batch.reportingErrors)
        lines.push(`Reporting error: ${error}`);
    return `${lines.join('\n')}\n`;
}
