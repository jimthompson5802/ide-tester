import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WalkthroughDeadline } from '../gui/python-deadline.js';

test('expired walkthrough refuses new UI work and stage renewal', async () => {
    let now = 0;
    const deadline = new WalkthroughDeadline(100, () => now);
    deadline.stage('selection', 20);
    assert.equal(deadline.remaining(50), 20);
    now = 20;
    let actions = 0;
    await assert.rejects(
        deadline.perform(async () => {
            actions++;
        }),
        /expired/,
    );
    assert.throws(() => deadline.stage('execution', 60), /expired/);
    assert.equal(actions, 0);
    assert.equal(deadline.expired, true);
});

test('timeout rejects late successful evidence and prevents a queued UI continuation', async () => {
    const deadline = new WalkthroughDeadline(20);
    let release!: () => void;
    const blocked = new Promise<void>((done) => {
        release = done;
    });
    let nextUi = 0;
    let accepted = false;
    const operation = deadline
        .perform(async () => {
            await blocked;
            await deadline.perform(async () => {
                nextUi++;
            });
            return { complete: true };
        })
        .then(() => {
            accepted = true;
        });
    await assert.rejects(operation, /expired/);
    release();
    await deadline.settle(1000);
    assert.equal(nextUi, 0);
    assert.equal(accepted, false);
});

test('late result without any further UI action is also rejected before acceptance', async () => {
    const deadline = new WalkthroughDeadline(20);
    let release!: (value: string) => void;
    const evidence = new Promise<string>((done) => {
        release = done;
    });
    let accepted = false;
    const result = deadline
        .perform(() => evidence)
        .then(() => {
            accepted = true;
        });
    await assert.rejects(result, /expired/);
    release('valid-looking complete evidence');
    await deadline.settle(1000);
    assert.equal(accepted, false);
});

test('cleanup has its own budget and refuses to silently abandon unsettled operations', async () => {
    const deadline = new WalkthroughDeadline(20);
    let release!: () => void;
    const blocked = new Promise<void>((done) => {
        release = done;
    });
    await assert.rejects(
        deadline.perform(() => blocked),
        /expired/,
    );
    await assert.rejects(deadline.settle(20), /unsettled|settle/);
    release();
    await deadline.settle(1000);
});

test('stage budgets cannot extend the scenario and stopping prevents later work', async () => {
    let now = 0;
    const deadline = new WalkthroughDeadline(100, () => now);
    deadline.stage('launch', 60);
    now = 50;
    deadline.stage('execution', 60);
    assert.equal(deadline.remaining(1000), 50);
    assert.equal(await deadline.perform(async () => 'observed'), 'observed');
    deadline.stop();
    await assert.rejects(
        deadline.perform(async () => 'late'),
        /stopped/,
    );
    await deadline.settle(1000);
});
