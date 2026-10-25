import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
    createGUIReport,
    saveGUIReport,
    formatGUISummary,
} from '../src/gui-report.js';

test('aggregate creates incomplete durable evidence and atomically updates all rows', async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'gui-report-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const { directory, batch } = await createGUIReport(root, 'batch-test');
    assert.equal(
        JSON.parse(await readFile(join(directory, 'result.json'), 'utf8'))
            .state,
        'incomplete',
    );
    assert.deepEqual(
        batch.rows.map((row) => row.outcome),
        ['not_run', 'not_run', 'not_run'],
    );
    batch.state = 'completed';
    batch.error = 'Build did not complete';
    await saveGUIReport(directory, batch);
    assert.equal(
        JSON.parse(await readFile(join(directory, 'result.json'), 'utf8'))
            .error,
        'Build did not complete',
    );
    assert.equal(
        await readFile(join(directory, 'result.txt'), 'utf8'),
        formatGUISummary(batch),
    );
});

test('aggregate refuses redirected storage, identifier escape and unrelated writes', async (t) => {
    const { mkdir, symlink } = await import('node:fs/promises');
    const root = await mkdtemp(join(tmpdir(), 'gui-report-safety-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    await mkdir(join(root, 'private'));
    await symlink(join(root, 'private'), join(root, 'reports'));
    await assert.rejects(createGUIReport(root, 'redirected'), /canonical/);
    await assert.rejects(createGUIReport(root, '../escape'), /identifier/);
    const batch = { batchId: 'private' } as Parameters<typeof saveGUIReport>[1];
    await assert.rejects(
        saveGUIReport(join(root, 'private'), batch),
        /outside|canonical/,
    );
});

test('aggregate summary preserves reporting and cleanup failures with cancellation and all suite columns', async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'gui-report-summary-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const { directory, batch } = await createGUIReport(root, 'summary');
    batch.state = 'completed';
    batch.cancellation = { reason: 'Cancelled by user' };
    batch.rows[0] = {
        suite: 'basic',
        backend: 'real',
        outcome: 'passed',
        durationMs: 1500,
        resultPath: '/individual/result.json',
        reportingError: 'Text report unavailable',
        outputError: 'Output limit exceeded',
        subprocessError: 'Signal forwarding failed',
        originatingOutcome: 'failed',
        cleanup: {
            disposition: 'retained',
            reservationRetained: false,
            errors: ['Shutdown uncertain'],
        },
    };
    batch.reportingErrors.push('Aggregate persistence interrupted');
    await saveGUIReport(directory, batch);
    const text = await readFile(join(directory, 'result.txt'), 'utf8');
    for (const expected of [
        'basic  real  passed  1.500s  /individual/result.json',
        'git  inapplicable  not_run  Unavailable',
        'python  inapplicable  not_run  Unavailable',
        'Text report unavailable',
        'Output limit exceeded',
        'Signal forwarding failed',
        'Originating outcome: failed',
        'Cleanup: retained; reservation released',
        'Shutdown uncertain',
        'Cancelled by user',
        'Aggregate persistence interrupted',
    ])
        assert.ok(text.includes(expected), expected);
    assert.equal(
        JSON.parse(await readFile(join(directory, 'result.json'), 'utf8'))
            .rows[0].reportingError,
        'Text report unavailable',
    );
});

test('failed replacement leaves the prior JSON parseable and explicitly unfinished', async (t) => {
    const { mkdir, unlink } = await import('node:fs/promises');
    const root = await mkdtemp(join(tmpdir(), 'gui-report-replace-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const { directory, batch } = await createGUIReport(root, 'replace');
    await unlink(join(directory, 'result.txt'));
    await mkdir(join(directory, 'result.txt'));
    batch.state = 'completed';
    batch.outcome = 'passed';
    await assert.rejects(saveGUIReport(directory, batch));
    const retained = JSON.parse(
        await readFile(join(directory, 'result.json'), 'utf8'),
    );
    assert.equal(retained.state, 'incomplete');
    assert.equal(retained.outcome, 'harness_error');
});
