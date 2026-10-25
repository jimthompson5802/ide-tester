import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    Cancellation,
    CancellationError,
    ScenarioStoppedError,
    installCancellationHandlers,
} from '../src/cancellation.js';

test('cancellation stops admission before an operation starts', async () => {
    const cancellation = new Cancellation();
    assert.equal(cancellation.request(), true);
    assert.equal(cancellation.request(), false);
    let started = false;
    await assert.rejects(
        cancellation.perform(async () => {
            started = true;
        }),
        CancellationError,
    );
    assert.equal(started, false);
});

test('cancellation wakes the caller but retains raw work until actual settlement', async () => {
    const cancellation = new Cancellation();
    let finish!: () => void;
    let admitted!: () => void;
    const started = new Promise<void>((resolve) => {
        admitted = resolve;
    });
    const raw = new Promise<void>((resolve) => {
        finish = resolve;
    });
    const waiting = cancellation.perform(async () => {
        admitted();
        await raw;
    });
    await started;
    cancellation.request();
    await assert.rejects(waiting, CancellationError);
    await assert.rejects(cancellation.settle(10), /settle.*timed out/i);
    finish();
    await cancellation.settle(100);
});

test('stopping admission distinguishes scenario stop from user cancellation', async () => {
    const cancellation = new Cancellation();
    cancellation.stop();
    assert.equal(cancellation.requested, false);
    assert.throws(() => cancellation.check(), ScenarioStoppedError);
    await assert.rejects(
        cancellation.perform(async () => 1),
        ScenarioStoppedError,
    );
});

test('signal adapter requests cancellation and removes its listeners after repeated signals', () => {
    const cancellation = new Cancellation();
    const messages: string[] = [];
    const before = ['SIGINT', 'SIGTERM'].map((signal) =>
        process.listenerCount(signal),
    );
    const remove = installCancellationHandlers(cancellation, (message) =>
        messages.push(message),
    );
    process.emit('SIGINT');
    process.emit('SIGTERM');
    assert.equal(cancellation.requested, true);
    assert.equal(messages.length, 2);
    assert.match(messages[0], /cancellation requested/i);
    assert.match(messages[1], /shutdown.*pending/i);
    remove();
    remove();
    assert.deepEqual(
        ['SIGINT', 'SIGTERM'].map((signal) => process.listenerCount(signal)),
        before,
    );
});

test('actual repeated process signals keep orderly work alive until settlement', async (t) => {
    const { spawn } = await import('node:child_process');
    const moduleURL = new URL('../src/cancellation.js', import.meta.url).href;
    const child = spawn(
        process.execPath,
        [
            '--input-type=module',
            '-e',
            `
        import { Cancellation, installCancellationHandlers } from ${JSON.stringify(moduleURL)};
        const cancellation = new Cancellation();
        const before = process.listenerCount('SIGINT');
        const remove = installCancellationHandlers(cancellation, (message) => console.log(message));
        const work = cancellation.perform(() => new Promise((resolve) => setTimeout(resolve, 300)));
        console.log('ready');
        try { await work; } catch {}
        await cancellation.settle(1000);
        remove();
        console.log(JSON.stringify({requested: cancellation.requested, listeners: process.listenerCount('SIGINT') - before}));
    `,
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const exited = new Promise<number | null>((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', resolve);
    });
    t.after(async () => {
        if (child.exitCode === null && child.signalCode === null)
            child.kill('SIGKILL');
        await exited;
    });
    let stdout = '';
    let stderr = '';
    let sentFirst = false;
    let sentSecond = false;
    child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
    });
    child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
        if (!sentFirst && stdout.includes('ready')) {
            sentFirst = true;
            child.kill('SIGINT');
        }
        if (!sentSecond && stdout.includes('Cancellation requested')) {
            sentSecond = true;
            child.kill('SIGTERM');
        }
    });
    assert.equal(await exited, 0, stderr);
    assert.equal(sentFirst, true);
    assert.equal(sentSecond, true);
    assert.match(stdout, /shutdown is pending/);
    assert.match(stdout, /"requested":true,"listeners":0/);
});
