import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Page } from '@playwright/test';
import { Workbench, PythonDeadline } from '../src/workbench.js';
import { Cancellation, CancellationError } from '../src/cancellation.js';
import { ChatFailure, type ChatEvidence } from '../src/chat.js';

test('cancelling editor input during focus prevents the subsequent driver action', async () => {
    const cancellation = new Cancellation();
    let release!: () => void;
    let started!: () => void;
    const focused = new Promise<void>((resolve) => {
        started = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
        release = resolve;
    });
    let driverCalls = 0;
    const page = {
        locator: () => ({
            focus: async () => {
                started();
                await blocked;
            },
        }),
        evaluate: async () => {
            driverCalls++;
        },
    } as unknown as Page;
    const workbench = new Workbench(page, cancellation);
    const operation = workbench.typeInEditor('.owned-editor', 'source');
    await focused;
    cancellation.request();
    release();
    await assert.rejects(operation, CancellationError);
    await cancellation.settle(1000);
    assert.equal(driverCalls, 0);
});

for (const action of [
    'ready',
    'command',
    'openFile',
    'replaceEditorText',
    'saveAs',
    'closeEditors',
    'newTextFile',
    'initializeGit',
    'stageGitFile',
    'commitGit',
    'showGitGraph',
    'chatIssue',
] as const) {
    test(`cancellation within ${action} stops the next primitive action`, async () => {
        const cancellation = new Cancellation();
        let release!: () => void;
        let started!: () => void;
        const entered = new Promise<void>((resolve) => {
            started = resolve;
        });
        const blocked = new Promise<void>((resolve) => {
            release = resolve;
        });
        let calls = 0;
        const invoke = async (): Promise<never> => {
            calls++;
            started();
            await blocked;
            throw new Error(
                'The pending primitive failed while cancellation was requested',
            );
        };
        const locator = {
            focus: invoke,
            fill: invoke,
            isVisible: invoke,
            evaluateAll: invoke,
            click: invoke,
            locator: () => locator,
            filter: () => locator,
            first: () => locator,
            getByText: () => locator,
        };
        const page = {
            keyboard: { press: invoke },
            locator: () => locator,
            waitForFunction: invoke,
            evaluate: invoke,
        } as unknown as Page;
        const workbench = new Workbench(page, cancellation);
        const operation =
            action === 'chatIssue'
                ? workbench.chatIssue()
                : action === 'stageGitFile' ||
                    action === 'closeEditors' ||
                    action === 'newTextFile'
                  ? workbench[action]()
                  : action === 'ready'
                    ? workbench.ready(1000)
                    : workbench[action]('/owned/path');
        await entered;
        cancellation.request();
        release();
        await assert.rejects(operation, CancellationError);
        await cancellation.settle(1000);
        assert.equal(calls, 1);
    });
}

test('Python cancellation wakes a pending operation and retains it for cleanup settlement', async () => {
    const cancellation = new Cancellation();
    const deadline = new PythonDeadline(1000, Date.now, cancellation);
    let release!: () => void;
    let started!: () => void;
    const entered = new Promise<void>((resolve) => {
        started = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
        release = resolve;
    });
    const operation = deadline.perform(async () => {
        started();
        await blocked;
        return 'late evidence';
    });
    await entered;
    cancellation.request();
    await assert.rejects(operation, CancellationError);
    assert.equal(deadline.expired, false);
    await assert.rejects(deadline.settle(10), /settle|timed out/);
    release();
    await deadline.settle(1000);
    await cancellation.settle(1000);
});

test('timed-out workbench restoration keeps its underlying driver promise pending', async () => {
    const cancellation = new Cancellation();
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
        release = resolve;
    });
    const page = {
        waitForFunction: async () => undefined,
        evaluate: () => blocked,
    } as unknown as Page;
    const workbench = new Workbench(page, cancellation);
    await assert.rejects(workbench.ready(10), /timed out/);
    await assert.rejects(cancellation.settle(10), /settle|timed out/);
    release();
    await cancellation.settle(1000);
});

test('cancelled real Chat session reads do not open Chat or begin fresh failure diagnostics', async () => {
    const cancellation = new Cancellation();
    let issueReads = 0;
    let commands = 0;
    let release!: (value: string) => void;
    let entered!: () => void;
    const reading = new Promise<void>((resolve) => {
        entered = resolve;
    });
    const session = new Promise<string>((resolve) => {
        release = resolve;
    });
    class SessionWorkbench extends Workbench {
        override async chatIssue(): Promise<undefined> {
            issueReads++;
            return undefined;
        }
        override async command(): Promise<void> {
            commands++;
        }
    }
    const page = { locator: () => ({}) } as unknown as Page;
    const workbench = new SessionWorkbench(page, cancellation);
    const operation = workbench.qualifyChat(
        [],
        'real',
        () => [],
        async () => {
            entered();
            return session;
        },
        1000,
        '/owned',
    );
    await reading;
    cancellation.request();
    release('vscode-chat-session://local/owned');
    await assert.rejects(operation, CancellationError);
    await cancellation.settle(1000);
    assert.equal(issueReads, 1);
    assert.equal(commands, 0);
});

test('an observed typed Chat failure retains its evidence without fresh diagnostic UI reads', async () => {
    let issueReads = 0;
    const failure = new ChatFailure(
        'failed',
        'Observed exact-response mismatch',
    );
    const evidence: ChatEvidence = { session: '', turns: [] };
    class FailedChatWorkbench extends Workbench {
        override async chatIssue(): Promise<ChatFailure | undefined> {
            issueReads++;
            return issueReads === 1
                ? undefined
                : new ChatFailure(
                      'blocked',
                      'Later diagnostic must not replace the observed failure',
                  );
        }
    }
    const page = { locator: () => ({}) } as unknown as Page;
    const workbench = new FailedChatWorkbench(page);
    await assert.rejects(
        workbench.qualifyChat(
            [],
            'real',
            () => [],
            async () => {
                throw failure;
            },
            1000,
            '/owned',
            evidence,
        ),
        (cause: unknown) => cause === failure,
    );
    assert.equal(issueReads, 1);
    assert.equal(failure.evidence, evidence);
});

test('cancellation during real Chat diagnostics preserves the preceding sanitized contract failure', async () => {
    const cancellation = new Cancellation();
    const evidence: ChatEvidence = { session: '', turns: [] };
    let issueReads = 0;
    let entered!: () => void;
    let release!: () => void;
    const diagnosing = new Promise<void>((resolve) => {
        entered = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
        release = resolve;
    });
    class DiagnosticWorkbench extends Workbench {
        override async chatIssue(): Promise<undefined> {
            if (++issueReads === 2) {
                entered();
                await blocked;
            }
            return undefined;
        }
    }
    const page = { locator: () => ({}) } as unknown as Page;
    const workbench = new DiagnosticWorkbench(page, cancellation);
    const operation = workbench.qualifyChat(
        [],
        'real',
        () => [],
        async () => {
            throw new Error('private-account-and-conversation-must-not-leak');
        },
        1000,
        '/owned',
        evidence,
    );
    await diagnosing;
    cancellation.request();
    await assert.rejects(operation, CancellationError);
    release();
    await cancellation.settle(1000);
    assert.deepEqual(evidence.originatingFailure, {
        outcome: 'harness_error',
        error: 'Chat UI/session contract failed (open-session)',
    });
    assert.doesNotMatch(
        JSON.stringify(evidence),
        /private-account-and-conversation/,
    );
    assert.equal(issueReads, 2);
});
