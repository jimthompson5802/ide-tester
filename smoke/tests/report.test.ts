import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatResult } from '../src/report.js';

test('successful selected suites show outcomes, timings and final disposition', () => {
    assert.equal(
        formatResult({
            runId: 'run-1',
            scope: 'selected-suites',
            outcome: 'passed',
            checks: [
                { suite: 'editing', outcome: 'passed', durationMs: 1200 },
                { suite: 'chat', outcome: 'passed' },
            ],
            durationMs: 4924,
            cleanup: {
                disposition: 'removed',
                reservationRetained: false,
                errors: [],
            },
            resultPath: '/reports/result.json',
        }),
        [
            'Smoke test: PASSED',
            'Run ID: run-1',
            'Scope: Selected suites',
            '',
            'Suite       Result        Duration',
            'Editing     PASSED        1.200 seconds',
            'Chat        PASSED        Unavailable',
            '',
            'Harness disposition: PASSED',
            'Resources: Removed',
            'Reservation: Released',
            'Duration: 4.924 seconds',
            'JSON report: /reports/result.json',
        ].join('\n'),
    );
});

test('single-suite and foundation results preserve scope and available durations', () => {
    for (const [scope, suite] of [
        ['selected-suites', 'editing'],
        ['selected-suites', 'chat'],
        ['foundation', 'chat'],
    ]) {
        const text = formatResult({
            scope,
            outcome: 'passed',
            checks: [{ suite, outcome: 'passed', durationMs: 25 }],
        });
        assert.match(text, /PASSED\s+0.025 seconds/);
        assert.match(
            text,
            scope === 'foundation'
                ? /Scope: Foundation/
                : /Scope: Selected suites/,
        );
        assert.doesNotMatch(text, suite === 'chat' ? /Editing/ : /Chat/);
    }
});

test('failed checks and checks not run remain distinct from blocked prerequisites', () => {
    const failed = formatResult({
        outcome: 'failed',
        error: 'assertion failed',
        checks: [
            { suite: 'editing', outcome: 'failed' },
            { suite: 'chat', outcome: 'not_run' },
        ],
    });
    assert.match(failed, /Editing\s+FAILED/);
    assert.match(failed, /Chat\s+NOT RUN/);
    assert.match(failed, /Failure reason: assertion failed/);
    const blocked = formatResult({
        outcome: 'blocked',
        checks: [{ suite: 'chat', outcome: 'not_run' }],
    });
    assert.match(blocked, /Smoke test: BLOCKED/);
    assert.match(blocked, /Chat\s+NOT RUN/);
});

test('cleanup failure leaves suite visibly passed and identifies retained resources', () => {
    const text = formatResult({
        outcome: 'harness_error',
        checks: [{ suite: 'chat', outcome: 'passed' }],
        cleanup: {
            disposition: 'retained',
            reservationRetained: true,
            errors: ['shutdown uncertain'],
        },
        resourcesPath: '/owned/resources',
    });
    assert.match(text, /Chat\s+PASSED/);
    assert.match(text, /Harness disposition: HARNESS ERROR/);
    assert.match(text, /Cleanup error: shutdown uncertain/);
    assert.match(text, /Resources: Retained\nReservation: Retained/);
    assert.match(text, /Resource path: \/owned\/resources/);
});

test('early errors never invent check or cleanup outcomes', () => {
    const text = formatResult({
        outcome: 'harness_error',
        error: 'reservation exists',
    });
    assert.match(text, /Suite information: Unavailable/);
    assert.match(
        text,
        /Resources: Unavailable\nReservation: Unavailable\nDuration: Unavailable/,
    );
    assert.doesNotMatch(text, /NOT RUN|Removed|Released/);
});

test('text write failure returns nonzero, identifies reporting error and preserves JSON', async (t) => {
    const { mkdtemp, mkdir, writeFile, readFile, rm } =
        await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { reportResult } = await import('../src/report.js');
    const root = await mkdtemp(join(tmpdir(), 'smoke-report-test-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const result = { outcome: 'passed', resultPath: join(root, 'result.json') };
    const json = JSON.stringify(result, null, 2);
    await writeFile(result.resultPath, json);
    await mkdir(join(root, 'result.txt'));
    for (const mode of ['text', 'json'] as const) {
        let message = '';
        assert.equal(
            await reportResult(result, mode, (value) => {
                message = value;
            }),
            1,
        );
        assert.match(message, /Reporting error: could not write result.txt/);
        if (mode === 'json')
            assert.match(JSON.parse(message).reportingError, /result.txt/);
        assert.equal(await readFile(result.resultPath, 'utf8'), json);
    }
});

test('reports identify real and mock backends including blocked Chat prerequisites', () => {
    for (const chatBackend of ['mock', 'real'] as const) {
        const text = formatResult({
            chatBackend,
            outcome: 'blocked',
            checks: [
                {
                    suite: 'chat',
                    outcome: 'blocked',
                    error: 'Rerun setup:real-chat',
                },
            ],
        });
        assert.match(text, new RegExp(`Chat backend: ${chatBackend}`));
        assert.match(text, /Chat\s+BLOCKED/);
        assert.match(text, /Rerun setup:real-chat/);
    }
});

test('Git confirmation shows the full independent hash/message/log and Git-only Chat selection truthfully', () => {
    const hash = '0123456789abcdef0123456789abcdef01234567';
    const result = {
        outcome: 'passed',
        chatBackend: 'mock' as const,
        chatSelected: false,
        mockRequestEvidence: 'inapplicable',
        mockRequestCount: null,
        requests: null,
        checks: [
            {
                suite: 'git',
                outcome: 'passed',
                evidence: {
                    stage: 'complete',
                    hash,
                    message: 'Smoke Git unique',
                    log: `${hash} Smoke Git unique`,
                    graphVisible: true,
                },
            },
        ],
    };
    const text = formatResult(result);
    assert.match(text, /Chat: Not selected/);
    assert.match(text, /Mock request evidence: Inapplicable/);
    assert.match(text, new RegExp(`Git commit: ${hash} Smoke Git unique`));
    assert.match(text, new RegExp(`Git log: ${hash} Smoke Git unique`));
    assert.doesNotMatch(text, /Chat backend: mock/);
    const blocked = formatResult({
        outcome: 'blocked',
        checks: [
            {
                suite: 'git',
                outcome: 'not_run',
                evidence: { stage: 'preflight' },
            },
        ],
    });
    assert.match(blocked, /Git stage: preflight/);
    assert.doesNotMatch(blocked, /Git commit:|Git log:/);
});

test('partial Graph failure retains independent Git confirmation without claiming a passing suite', () => {
    const text = formatResult({
        outcome: 'failed',
        checks: [
            {
                suite: 'git',
                outcome: 'failed',
                error: 'Graph message missing',
                evidence: {
                    stage: 'graph',
                    hash: '0123456789abcdef0123456789abcdef01234567',
                    message: 'Smoke Git partial',
                    log: 'owned commit evidence',
                },
            },
        ],
    });
    assert.match(text, /Git\s+FAILED/);
    assert.match(text, /Git stage: graph/);
    assert.match(
        text,
        /Git commit: 0123456789abcdef0123456789abcdef01234567 Smoke Git partial/,
    );
    assert.match(text, /Reason: Graph message missing/);
});
