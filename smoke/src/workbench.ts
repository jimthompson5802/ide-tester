import { expect, type Page, type Locator } from '@playwright/test';
import type { MockRequest } from './mock.js';
import { turnCompleted } from './turn.js';
import type { ChatBackend } from './arguments.js';
import {
    ChatFailure,
    uiIssue,
    verifyExport,
    type SubmittedTurn,
    type ChatEvidence,
} from './chat.js';
import { readFile, rm, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { basename } from 'node:path';

import { PythonFailure, pythonUiIssue } from './python.js';
import { GitFailure } from './git-repository.js';

const mainEditor = '.part.editor .monaco-editor[role="code"]';

// Only the two shipped-driver methods required by this tester are exposed.
interface SmokeDriver {
    whenWorkbenchRestored(): Promise<void>;
    typeInEditor(selector: string, text: string): Promise<void>;
    getTerminalBuffer(selector: string): Promise<string[]>;
}
declare global {
    interface Window {
        driver: SmokeDriver;
    }
}

export async function bounded<T>(
    operation: Promise<T>,
    timeout: number,
    label: string,
): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            operation,
            new Promise<never>((_, reject) => {
                timer = setTimeout(
                    () => reject(new Error(`${label} timed out`)),
                    Math.max(1, timeout),
                );
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}

export class Workbench {
    constructor(readonly page: Page) {}

    async ready(timeout: number): Promise<void> {
        const deadline = Date.now() + timeout;
        await this.page.waitForFunction(
            () => {
                const driver = window.driver;
                return (
                    typeof driver?.whenWorkbenchRestored === 'function' &&
                    typeof driver?.typeInEditor === 'function'
                );
            },
            undefined,
            { timeout },
        );
        await bounded(
            this.page.evaluate(() => window.driver.whenWorkbenchRestored()),
            deadline - Date.now(),
            'Workbench restoration',
        );
        await expect(this.page.locator('.monaco-workbench')).toBeVisible({
            timeout: Math.max(1, deadline - Date.now()),
        });
    }

    async typeInEditor(selector: string, text: string): Promise<void> {
        const input = `${selector} .native-edit-context`;
        await this.page.locator(input).focus();
        await this.page.evaluate(
            ({ selector, text }) => window.driver.typeInEditor(selector, text),
            { selector: input, text },
        );
    }

    async command(title: string, followedByPicker = false): Promise<void> {
        await this.page.keyboard.press('Meta+Shift+P');
        const input = this.page.locator(
            '.quick-input-widget .quick-input-box input',
        );
        await input.fill(`>${title}`);
        const item = this.page
            .locator('.quick-input-widget .monaco-list-row')
            .filter({ hasText: title });
        await expect(item).toHaveCount(1);
        await item.click();
        if (!followedByPicker) await expect(input).toBeHidden();
    }

    async openFile(path: string): Promise<void> {
        await this.page.keyboard.press('Meta+P');
        const input = this.page.locator(
            '.quick-input-widget .quick-input-box input',
        );
        await input.fill(path);
        const row = this.page
            .locator('.quick-input-widget .monaco-list-row')
            .filter({ hasText: basename(path) });
        await expect(row).toHaveCount(1);
        await input.press('Enter');
        await expect(input).toBeHidden();
        await expect(
            this.page.locator('.part.editor .tab.active .label-name'),
        ).toHaveText(basename(path));
        await expect(this.page.locator(mainEditor)).toBeVisible();
    }

    async replaceEditorText(text: string): Promise<void> {
        await this.page.locator(`${mainEditor} .native-edit-context`).focus();
        await this.page.keyboard.press('Meta+A');
        await this.typeInEditor(mainEditor, text);
    }

    async saveEditor(): Promise<void> {
        await this.page.keyboard.press('Meta+S');
    }

    async newTextFile(): Promise<void> {
        await this.page.keyboard.press('Meta+N');
        await expect(
            this.page.locator('.part.editor .tab.active .label-name'),
        ).toHaveText(/^Untitled-/);
        await expect(this.page.locator(mainEditor)).toBeVisible();
    }

    async saveAs(path: string): Promise<void> {
        await this.page.keyboard.press('Meta+Shift+S');
        const input = this.page.locator(
            '.quick-input-widget .quick-input-box input',
        );
        await input.fill(path);
        await input.press('Enter');
        await expect(input).toBeHidden();
        await expect(
            this.page.locator('.part.editor .tab.active .label-name'),
        ).toHaveText(basename(path));
    }

    async closeEditors(): Promise<void> {
        await this.page.locator(`${mainEditor} .native-edit-context`).focus();
        await this.page.keyboard.press('Meta+K');
        await this.page.keyboard.press('Meta+W');
        await expect(
            this.page.locator('.part.editor .tabs-container .tab'),
        ).toHaveCount(0);
    }

    async expectEditorText(text: string): Promise<string[]> {
        const lines = this.page.locator(`${mainEditor} .view-lines .view-line`);
        const readLines = async () =>
            (await lines.allTextContents()).map((line) =>
                line.replaceAll('\u00a0', ' ').trimEnd(),
            );
        await expect
            .poll(readLines, {
                message: 'Reopened editor must display the saved contents',
            })
            .toEqual(text.split('\n'));
        return readLines();
    }

    private async gitContract(
        label: string,
        action: () => Promise<void>,
    ): Promise<void> {
        try {
            if (await this.page.locator('.monaco-dialog-box').isVisible())
                throw new Error('Unexpected dialog');
            await action();
        } catch (cause) {
            if (cause instanceof GitFailure) throw cause;
            throw new GitFailure(
                'harness_error',
                `Git UI contract unavailable (${label})`,
            );
        }
    }

    async initializeGit(workspace: string): Promise<void> {
        await this.gitContract('initialization picker', async () => {
            await this.command('Git: Initialize Repository', true);
            const input = this.page.locator(
                '.quick-input-widget .quick-input-box input',
            );
            await expect(input).toHaveAttribute(
                'placeholder',
                'Pick workspace folder to initialize git repo in',
                { timeout: 15_000 },
            );
            const folder = this.page
                .locator('.quick-input-widget .monaco-list-row')
                .filter({ hasText: workspace });
            await expect(folder).toHaveCount(1, { timeout: 15_000 });
            await folder.click();
            await expect(input).toBeHidden();
        });
        try {
            await expect
                .poll(
                    async () => {
                        try {
                            return (
                                await lstat(join(workspace, '.git'))
                            ).isDirectory();
                        } catch {
                            return false;
                        }
                    },
                    { timeout: 15_000 },
                )
                .toBe(true);
        } catch {
            throw new GitFailure(
                'failed',
                'Git initialization did not create a repository',
            );
        }
    }

    private gitResource(): Locator {
        return this.page
            .locator('div[id="workbench.view.scm"] .monaco-list-row')
            .filter({
                has: this.page
                    .locator('.resource .label-name')
                    .getByText('git-smoke.txt', { exact: true }),
            });
    }

    async stageGitFile(): Promise<void> {
        const row = this.gitResource();
        await this.gitContract('target staging action', async () => {
            await this.command('Source Control: Focus on Changes View');
            await expect(row).toHaveCount(1, { timeout: 15_000 });
            await expect(row.locator('.resource')).toHaveAttribute(
                'data-tooltip',
                'Untracked',
                { timeout: 15_000 },
            );
            await row.hover();
            await row
                .locator('.action-label[aria-label="Stage Changes"]')
                .click();
        });
        try {
            await expect(row.locator('.resource')).toHaveAttribute(
                'data-tooltip',
                'Index Added',
                { timeout: 15_000 },
            );
        } catch {
            throw new GitFailure(
                'failed',
                'Git target did not become Index Added after staging',
            );
        }
    }

    async commitGit(message: string): Promise<void> {
        await this.gitContract('commit input/button', async () => {
            await this.typeInEditor(
                'div[id="workbench.view.scm"] .scm-editor',
                message,
            );
            const commit = this.page
                .locator('div[id="workbench.view.scm"] .monaco-button')
                .filter({ hasText: /^Commit$/ });
            await expect(commit).toBeVisible({ timeout: 15_000 });
            await commit.click();
        });
        try {
            await expect(this.gitResource()).toHaveCount(0, {
                timeout: 15_000,
            });
        } catch {
            throw new GitFailure(
                'failed',
                'Git commit did not remove the staged target',
            );
        }
    }

    async showGitGraph(message: string): Promise<string> {
        const scm = this.page.locator('div[id="workbench.view.scm"]');
        const graph = this.page.locator('.scm-history-view');
        await this.gitContract('Graph view/reference filter', async () => {
            await this.command('Source Control: Focus on Graph View');
            await expect(graph).toBeVisible({ timeout: 15_000 });
            // Fresh single-root workspace: installed build selects the sole provider and hides this picker.
            await expect(
                scm.locator('.scm-graph-repository-picker'),
            ).toHaveCount(0, {
                timeout: 15_000,
            });
            const picker = scm.locator('.scm-graph-history-item-picker');
            await picker.click();
            const input = this.page.locator(
                '.quick-input-widget .quick-input-box input',
            );
            await expect(input).toHaveAttribute(
                'placeholder',
                'Select one/more history item references to view, type to filter',
                { timeout: 15_000 },
            );
            const all = this.page
                .locator('.quick-input-widget .monaco-list-row')
                .filter({
                    has: this.page
                        .locator('.label-name')
                        .getByText('All', { exact: true }),
                });
            await expect(all).toHaveCount(1, { timeout: 15_000 });
            await all.click();
            await input.press('Enter');
            await expect(input).toBeHidden();
            await expect(picker).toHaveText('All');
        });
        const label = graph
            .locator('.history-item .label-name')
            .getByText(message, { exact: true });
        try {
            await expect(label).toBeVisible({ timeout: 15_000 });
            return (await label.textContent()) ?? '';
        } catch {
            throw new GitFailure(
                'failed',
                'Expected unique commit message missing from Source Control Graph',
            );
        }
    }

    private chat() {
        return this.page.locator('div[id="workbench.panel.chat"]');
    }

    async chatIssue(): Promise<ChatFailure | undefined> {
        // Never retain raw prerequisite/notification text, account names or dialogs.
        const visibleText = async (selector: string) =>
            this.page
                .locator(selector)
                .evaluateAll((elements) =>
                    elements
                        .filter(
                            (element) => element.getClientRects().length > 0,
                        )
                        .map((element) => element.textContent ?? ''),
                );
        if (
            await this.chat()
                .locator('.chat-quota-error-widget')
                .first()
                .isVisible()
        )
            return uiIssue(['quota exceeded']);
        const messages = await visibleText(
            'div[id="workbench.panel.chat"] .chat-notification-widget, div[id="workbench.panel.chat"] .chat-error-confirmation, div[id="workbench.panel.chat"] .chat-quota-error-widget, .notifications-toasts .notification-list-item:has(.notification-list-item-icon.codicon-error), .notifications-toasts .notification-list-item:has(.notification-list-item-icon.codicon-warning), .monaco-dialog-box',
        );
        const welcome = await visibleText(
            'div[id="workbench.panel.chat"] .chat-welcome-view, div[id="workbench.panel.chat"] .chat-view-welcome',
        );
        const signIn = await this.page
            .getByRole('button', { name: /^Sign In$/i })
            .first()
            .isVisible();
        const prerequisite = uiIssue([
            ...welcome,
            ...(signIn ? ['Sign in to use GitHub Copilot'] : []),
        ]);
        if (prerequisite?.outcome === 'blocked') return prerequisite;
        return uiIssue(messages);
    }

    private async exportChat(path: string): Promise<unknown> {
        // Export only the active test conversation through the shipped UI command.
        // It goes to disposable resources, never the persistent profile or raw report.
        await this.page.keyboard.press('Meta+Shift+P');
        const input = this.page.locator(
            '.quick-input-widget .quick-input-box input',
        );
        await input.fill('>Chat: Export Chat...');
        const item = this.page
            .locator('.quick-input-widget .monaco-list-row')
            .filter({ hasText: 'Chat: Export Chat...' });
        await expect(item).toHaveCount(1);
        await item.click();
        await expect(input).toHaveValue(/chat\.json$/);
        await input.fill(path);
        await input.press('Enter');
        await expect(input).toBeHidden();
        await expect
            .poll(
                async () => {
                    try {
                        JSON.parse(await readFile(path, 'utf8'));
                        return true;
                    } catch {
                        return false;
                    }
                },
                { timeout: 5000, message: 'Expected test-owned Chat export' },
            )
            .toBe(true);
        return JSON.parse(await readFile(path, 'utf8'));
    }

    async qualifyChat(
        turns: SubmittedTurn[],
        backend: ChatBackend,
        requests: () => MockRequest[],
        session: () => Promise<string>,
        timeout: number,
        exportRoot: string,
        evidence: ChatEvidence = { session: '', turns: [] },
    ) {
        const chat = this.chat();
        let diagnosticStage = 'open-session';
        try {
            if (backend === 'real') {
                const issue = await this.chatIssue();
                if (issue) throw issue;
            }
            const previousSession = await session();
            await this.command('Smoke Tester: Open Local Chat');
            if (backend === 'real') {
                // Signed-out/setup UI must block before we try to select a mode or send.
                const readyBy = Date.now() + 15_000;
                while (true) {
                    const issue = await this.chatIssue();
                    if (issue) throw issue;
                    if (
                        await chat
                            .locator('.chat-mode-picker-item [role="button"]')
                            .isVisible()
                    )
                        break;
                    if (Date.now() >= readyBy)
                        throw new ChatFailure(
                            'harness_error',
                            'Chat input readiness contract unavailable',
                        );
                    await this.page.waitForTimeout(100);
                }
            }
            diagnosticStage = 'new-session-identity';
            await expect
                .poll(
                    async () => {
                        const current = await session();
                        return !!current && current !== previousSession;
                    },
                    {
                        timeout: 15_000,
                        message:
                            'Expected a new local sidebar session identity',
                    },
                )
                .toBe(true);
            diagnosticStage = 'select-ask';
            if (backend === 'real') {
                // The authenticated build can hide legacy Ask from the mode menu.
                // Its built-in command still selects Ask through the visible command palette.
                await this.command('Chat: Open Chat (Ask)');
            } else {
                await chat
                    .locator('.chat-mode-picker-item [role="button"]')
                    .click();
                diagnosticStage = 'ask-menu-item';
                const ask = this.page
                    .locator('.action-widget')
                    .getByRole('menuitemcheckbox', { name: /^Ask,/ });
                await expect(ask).toBeVisible();
                const position = Number(await ask.getAttribute('data-index'));
                if (
                    !Number.isSafeInteger(position) ||
                    position < 0 ||
                    position > 10
                )
                    throw new Error('Invalid Ask picker position');
                await this.page.keyboard.press('Home');
                for (let i = 0; i < position; i++)
                    await this.page.keyboard.press('ArrowDown');
                await this.page.keyboard.press('Enter');
            }
            diagnosticStage = 'ask-selected-label';
            await expect(
                chat.locator('.chat-mode-picker-item .chat-input-picker-label'),
            ).toHaveText('Ask');
            const responses = chat.locator(
                '.interactive-item-container.interactive-response',
            );
            diagnosticStage = 'empty-session';
            await expect(responses).toHaveCount(0);
            const sessionId = await session();
            expect(sessionId).toMatch(/^vscode-chat-session:\/\/local\//);
            evidence.session = sessionId;
            const selector =
                'div[id="workbench.panel.chat"] .interactive-input-part .monaco-editor[role="code"]';
            for (const [index, turn] of turns.entries()) {
                diagnosticStage = `turn-${index + 1}`;
                const started = Date.now();
                const item: ChatEvidence['turns'][number] = {
                    ...turn,
                    completed: false,
                    responseCount: index,
                    durationMs: 0,
                };
                evidence.turns.push(item);
                try {
                    await bounded(
                        (async () => {
                            expect(await session()).toBe(sessionId);
                            await expect(responses).toHaveCount(index);
                            if (backend === 'real') {
                                const issue = await this.chatIssue();
                                if (issue) throw issue;
                            }
                            const before = {
                                session: sessionId,
                                responseCount: index,
                                requestSequence:
                                    requests().at(-1)?.sequence ?? 0,
                                priorTurns: turns.slice(0, index),
                            };
                            await this.typeInEditor(selector, turn.prompt);
                            const send = chat.locator(
                                '.chat-execute-toolbar .action-item:not(.disabled) .action-label.codicon-arrow-up-compact',
                            );
                            await expect(send).toBeVisible();
                            await send.click();
                            while (true) {
                                if (backend === 'real') {
                                    const issue = await this.chatIssue();
                                    if (issue) throw issue;
                                }
                                const bubbles = await responses.evaluateAll(
                                    (elements) =>
                                        elements.map((element) => ({
                                            text: Array.from(
                                                element.querySelectorAll(
                                                    '.rendered-markdown',
                                                ),
                                            )
                                                .map(
                                                    (part) =>
                                                        part.textContent ?? '',
                                                )
                                                .join(''),
                                            completed:
                                                !element.classList.contains(
                                                    'chat-response-loading',
                                                ) &&
                                                element.getAttribute(
                                                    'aria-busy',
                                                ) !== 'true',
                                        })),
                                );
                                const current = {
                                    session: await session(),
                                    prompts: await chat
                                        .locator(
                                            '.interactive-item-container.interactive-request',
                                        )
                                        .allTextContents(),
                                    responses: bubbles,
                                    requests: requests(),
                                };
                                item.responseCount = bubbles.length;
                                // Do not report content from a replaced session or an unrelated prompt.
                                if (
                                    current.session === sessionId &&
                                    current.prompts
                                        .at(-1)
                                        ?.includes(`[smoke:${turn.marker}]`)
                                ) {
                                    item.observedReply = bubbles.at(-1)?.text;
                                }
                                if (
                                    turnCompleted(
                                        before,
                                        current,
                                        turn.marker,
                                        turn.reply,
                                        backend,
                                    ) &&
                                    !(await chat
                                        .locator(
                                            '.chat-execute-toolbar .codicon-stop-circle',
                                        )
                                        .isVisible())
                                )
                                    break;
                                if (
                                    backend === 'real' &&
                                    bubbles.length === index + 1 &&
                                    bubbles.at(-1)!.completed &&
                                    !(await chat
                                        .locator(
                                            '.chat-execute-toolbar .codicon-stop-circle',
                                        )
                                        .isVisible())
                                ) {
                                    throw new ChatFailure(
                                        'failed',
                                        'Completed Chat response or transcript did not match the exact expected exchange',
                                    );
                                }
                                if (Date.now() - started >= timeout)
                                    throw new ChatFailure(
                                        'failed',
                                        'Chat response timed out',
                                    );
                                await this.page.waitForTimeout(100);
                            }
                            if (backend === 'real') {
                                let exported: unknown;
                                const path = join(
                                    exportRoot,
                                    `chat-turn-${index + 1}.json`,
                                );
                                try {
                                    exported = await this.exportChat(path);
                                } catch {
                                    throw new ChatFailure(
                                        'harness_error',
                                        'Could not export the test-owned Chat response for completion verification',
                                    );
                                } finally {
                                    await rm(path, { force: true });
                                }
                                const observed = verifyExport(
                                    exported,
                                    turns.slice(0, index + 1),
                                );
                                item.observedReply = observed.at(-1);
                                expect(await session()).toBe(sessionId);
                                const issue = await this.chatIssue();
                                if (issue) throw issue;
                            } else
                                item.requestSequence =
                                    requests().at(-1)!.sequence;
                            item.completed = true;
                        })(),
                        timeout,
                        'Chat turn',
                    );
                } finally {
                    item.durationMs = Date.now() - started;
                }
            }
            return evidence;
        } catch (cause) {
            if (backend === 'real') {
                const issue = await this.chatIssue().catch(() => undefined);
                const failure =
                    issue ??
                    (cause instanceof ChatFailure
                        ? cause
                        : new ChatFailure(
                              String(cause).includes('Chat turn timed out')
                                  ? 'failed'
                                  : 'harness_error',
                              String(cause).includes('Chat turn timed out')
                                  ? 'Chat turn timed out'
                                  : `Chat UI/session contract failed (${diagnosticStage})`,
                          ));
                if (failure.observedReplies)
                    for (const [
                        index,
                        reply,
                    ] of failure.observedReplies.entries()) {
                        if (evidence.turns[index])
                            evidence.turns[index].observedReply = reply;
                    }
                failure.evidence = evidence;
                throw failure;
            }
            throw cause;
        }
    }
}

const pythonEditor = mainEditor;
const pythonQuickInput = '.quick-input-widget .quick-input-box input';

export class PythonDeadline {
    private readonly end: number;
    private stageEnd: number;
    private label = 'prepare';
    private stopped = false;
    private timedOut = false;
    private readonly pending = new Set<Promise<unknown>>();

    constructor(
        timeoutMs: number,
        private readonly now: () => number = Date.now,
    ) {
        this.end = now() + timeoutMs;
        this.stageEnd = this.end;
    }

    get expired(): boolean {
        return this.timedOut;
    }

    remaining(limit = 15_000): number {
        if (this.now() >= Math.min(this.end, this.stageEnd)) {
            this.timedOut = true;
            this.stopped = true;
        }
        if (this.timedOut)
            throw new Error(`Python scenario expired at ${this.label}`);
        if (this.stopped) throw new Error('Python scenario stopped');
        return Math.min(
            limit,
            this.end - this.now(),
            this.stageEnd - this.now(),
        );
    }

    stage(label: string, budgetMs: number): void {
        this.remaining();
        this.label = label;
        this.stageEnd = Math.min(this.end, this.now() + budgetMs);
    }

    async perform<T>(operation: () => Promise<T>): Promise<T> {
        const timeoutMs = this.remaining(Number.MAX_SAFE_INTEGER);
        const work = Promise.resolve().then(async () => {
            this.remaining();
            const result = await operation();
            this.remaining();
            return result;
        });
        this.pending.add(work);
        // Both handlers consume completion, including after the caller timed out.
        void work.then(
            () => this.pending.delete(work),
            () => this.pending.delete(work),
        );
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            return await Promise.race([
                work,
                new Promise<never>((_, reject) => {
                    timer = setTimeout(() => {
                        this.timedOut = true;
                        this.stopped = true;
                        reject(
                            new Error(
                                `Python scenario expired at ${this.label}`,
                            ),
                        );
                    }, timeoutMs);
                }),
            ]);
        } finally {
            clearTimeout(timer);
        }
    }

    stop(): void {
        this.stopped = true;
    }

    async settle(timeoutMs: number): Promise<void> {
        this.stop();
        await bounded(
            Promise.allSettled([...this.pending]),
            timeoutMs,
            'Python scenario pending operations settle',
        );
    }
}

export class PythonWorkbench extends Workbench {
    constructor(
        page: Page,
        private readonly deadline: PythonDeadline,
    ) {
        super(page);
    }

    private step<T>(operation: () => Promise<T>): Promise<T> {
        return this.deadline.perform(operation);
    }

    private timeout(): { timeout: number } {
        return { timeout: this.deadline.remaining() };
    }

    async ready(timeout: number): Promise<void> {
        await this.step(() =>
            this.page.waitForFunction(
                () =>
                    typeof window.driver?.whenWorkbenchRestored ===
                        'function' &&
                    typeof window.driver?.typeInEditor === 'function' &&
                    typeof window.driver?.getTerminalBuffer === 'function',
                undefined,
                { timeout },
            ),
        );
        await this.step(() =>
            this.page.evaluate(() => window.driver.whenWorkbenchRestored()),
        );
        await this.step(() =>
            expect(this.page.locator('.monaco-workbench')).toBeVisible(
                this.timeout(),
            ),
        );
    }

    async typeInEditor(selector: string, text: string): Promise<void> {
        const input = `${selector} .native-edit-context`;
        await this.step(() => this.page.locator(input).focus());
        await this.step(() =>
            this.page.evaluate(
                ({ input, text }) => window.driver.typeInEditor(input, text),
                { input, text },
            ),
        );
    }

    async openFile(path: string): Promise<void> {
        await this.step(() => this.page.keyboard.press('Meta+P'));
        const input = this.page.locator(pythonQuickInput);
        await this.step(() => input.fill(path));
        const row = this.page
            .locator('.quick-input-widget .monaco-list-row')
            .filter({ hasText: basename(path) });
        await this.step(() => expect(row).toHaveCount(1, this.timeout()));
        await this.step(() => input.press('Enter'));
        await this.step(() => expect(input).toBeHidden(this.timeout()));
        await this.step(() =>
            expect(
                this.page.locator('.part.editor .tab.active .label-name'),
            ).toHaveText(basename(path), this.timeout()),
        );
        await this.step(() =>
            expect(this.page.locator(pythonEditor)).toBeVisible(this.timeout()),
        );
    }

    async replaceEditorText(text: string): Promise<void> {
        await this.step(() =>
            this.page.locator(`${pythonEditor} .native-edit-context`).focus(),
        );
        await this.step(() => this.page.keyboard.press('Meta+A'));
        await this.typeInEditor(pythonEditor, text);
    }

    async newTextFile(): Promise<void> {
        await this.step(() => this.page.keyboard.press('Meta+N'));
        await this.step(() =>
            expect(
                this.page.locator('.part.editor .tab.active .label-name'),
            ).toHaveText(/^Untitled-/, this.timeout()),
        );
        await this.step(() =>
            expect(this.page.locator(pythonEditor)).toBeVisible(this.timeout()),
        );
    }

    async saveAs(path: string): Promise<void> {
        await this.step(() => this.page.keyboard.press('Meta+Shift+S'));
        const input = this.page.locator(pythonQuickInput);
        await this.step(() => input.fill(path));
        await this.step(() => input.press('Enter'));
        await this.step(() => expect(input).toBeHidden(this.timeout()));
        await this.step(() =>
            expect(
                this.page.locator('.part.editor .tab.active .label-name'),
            ).toHaveText(basename(path), this.timeout()),
        );
    }

    async closeEditors(): Promise<void> {
        await this.step(() =>
            this.page.locator(`${pythonEditor} .native-edit-context`).focus(),
        );
        await this.step(() => this.page.keyboard.press('Meta+K'));
        await this.step(() => this.page.keyboard.press('Meta+W'));
        await this.step(() =>
            expect(
                this.page.locator('.part.editor .tabs-container .tab'),
            ).toHaveCount(0, this.timeout()),
        );
    }

    async expectEditorText(text: string): Promise<string[]> {
        const read = async (): Promise<string[]> =>
            (
                await this.step(() =>
                    this.page
                        .locator(`${pythonEditor} .view-lines .view-line`)
                        .allTextContents(),
                )
            ).map((line) => line.replaceAll('\u00a0', ' ').trimEnd());
        await this.step(() =>
            expect.poll(read, this.timeout()).toEqual(text.split('\n')),
        );
        return read();
    }

    async pythonCommand(title: string): Promise<void> {
        await this.step(() => this.page.keyboard.press('Meta+Shift+P'));
        const input = this.page.locator(pythonQuickInput);
        await this.step(() => input.fill(`>${title}`));
        const labels = [title, title.slice(title.indexOf(': ') + 2)];
        const pattern = new RegExp(
            `^(?:${labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`,
        );
        const item = this.page
            .locator('.quick-input-widget .label-name')
            .filter({ hasText: pattern });
        await this.step(() => expect(item).toHaveCount(1, this.timeout()));
        await this.step(() => item.click(this.timeout()));
    }

    private async pythonNotificationIssue(
        stage: 'installation' | 'interpreter',
    ): Promise<void> {
        const messages = await this.step(() =>
            this.page
                .locator(
                    '.notifications-toasts .notification-list-item:visible',
                )
                .allTextContents(),
        );
        const issue = pythonUiIssue(stage, messages);
        if (issue) throw issue;
    }

    async ensurePythonExtension(): Promise<{
        installed: true;
        enabled: true;
        header: string;
    }> {
        await this.pythonCommand('Extensions: Install Extensions');
        const search = '.extensions-search-container .monaco-editor';
        await this.step(() =>
            this.page.locator(`${search} .native-edit-context`).focus(),
        );
        await this.step(() => this.page.keyboard.press('Meta+A'));
        await this.typeInEditor(search, '@id:ms-python.python');
        const row = this.page
            .locator('.extensions-viewlet .monaco-list-row')
            .filter({
                has: this.page.locator('.name').filter({ hasText: /^Python$/ }),
            });
        await this.step(() => expect(row).toHaveCount(1, this.timeout()));
        await this.step(() => row.click(this.timeout()));
        const extension = this.page.locator('.extension-editor');
        await this.step(() =>
            expect(extension.locator('.header .name')).toHaveText(
                'Python',
                this.timeout(),
            ),
        );
        const header = await this.step(() =>
            extension.locator('.header').innerText(),
        );
        if (!/(?:^|\n)Microsoft(?:\n|$)/.test(header))
            throw new Error('Python extension publisher identity unavailable');
        const actions = extension.locator(
            ':scope > .header .extension-action:visible',
        );
        const install = actions.filter({ hasText: /^Install$/ });
        if (await this.step(() => install.count()))
            await this.step(() => install.click(this.timeout()));
        const enable = actions.filter({
            hasText: /^Enable(?: \(Workspace\))?$/,
        });
        if (await this.step(() => enable.count()))
            await this.step(() => enable.click(this.timeout()));
        while (true) {
            await this.pythonNotificationIssue('installation');
            const installed = await this.step(() =>
                actions.filter({ hasText: /^Uninstall$/ }).isVisible(),
            );
            const enabled = await this.step(() =>
                actions
                    .filter({ hasText: /^Disable(?: \(Workspace\))?$/ })
                    .isVisible(),
            );
            if (installed && enabled) break;
            await this.step(() => this.page.waitForTimeout(100));
        }
        const prompts = await this.step(() =>
            this.page
                .getByText(
                    /Reload Required|Restart Extensions|Sign in to|Keychain/,
                    { exact: false },
                )
                .count(),
        );
        if (prompts)
            throw new Error(
                'Unexpected reload/authentication prompt requires review',
            );
        return {
            installed: true,
            enabled: true,
            header: await this.step(() =>
                extension.locator('.header').innerText(),
            ),
        };
    }

    async selectPythonInterpreter(path: string): Promise<string> {
        await this.pythonCommand('Python: Select Interpreter');
        const row = this.page
            .locator('.quick-input-widget .label-name')
            .filter({ hasText: /^\s*Enter interpreter path\.\.\.\s*$/ });
        await this.step(() => row.click(this.timeout()));
        const input = this.page.locator(pythonQuickInput);
        await this.step(() =>
            expect(input).toHaveAttribute(
                'placeholder',
                'Enter path to a Python interpreter.',
                this.timeout(),
            ),
        );
        await this.step(() => input.fill(path));
        await this.step(() => expect(input).toHaveValue(path, this.timeout()));
        await this.step(() => input.press('Enter'));
        await this.step(() => expect(input).toBeHidden(this.timeout()));
        await this.pythonNotificationIssue('interpreter');
        await this.pythonCommand('Python: Select Interpreter');
        const selectedBy = Date.now() + this.deadline.remaining(60_000);
        while (true) {
            await this.pythonNotificationIssue('interpreter');
            const selected = await this.step(() =>
                input.getAttribute('placeholder'),
            );
            if (selected === `Selected Interpreter: ${path}`) break;
            if (Date.now() >= selectedBy)
                throw new PythonFailure(
                    'harness_error',
                    'Python interpreter selection observation unavailable',
                );
            await this.step(() => this.page.waitForTimeout(100));
        }
        await this.step(() => this.page.keyboard.press('Escape'));
        return path;
    }

    async readPythonTerminal(): Promise<string[]> {
        try {
            await this.step(() =>
                this.page.waitForFunction(
                    () => {
                        const nodes = document.querySelectorAll(
                            '#terminal .terminal-wrapper.active',
                        );
                        return (
                            nodes.length === 1 &&
                            nodes[0].getClientRects().length > 0 &&
                            'xterm' in nodes[0] &&
                            !!nodes[0].xterm
                        );
                    },
                    undefined,
                    this.timeout(),
                ),
            );
            const result: unknown = await this.step(() =>
                this.page.evaluate(async () => {
                    if (typeof window.driver?.getTerminalBuffer !== 'function')
                        throw new Error('No terminal observation driver');
                    return window.driver.getTerminalBuffer(
                        '#terminal .terminal-wrapper.active',
                    );
                }),
            );
            if (
                !Array.isArray(result) ||
                result.length > 2000 ||
                !result.every(
                    (line): line is string => typeof line === 'string',
                ) ||
                Buffer.byteLength(result.join('\n')) > 262144
            )
                throw new Error('Invalid terminal observation contract');
            return result;
        } catch (cause) {
            if (this.deadline.expired) throw cause;
            throw new PythonFailure(
                'harness_error',
                'Python terminal observation contract unavailable',
            );
        }
    }

    async pythonTerminalBaseline(): Promise<string[]> {
        await this.pythonCommand('Python: Create Terminal');
        return this.readPythonTerminal();
    }

    async runPythonFile(): Promise<void> {
        await this.pythonCommand('Python: Run Python File in Terminal');
    }

    async pythonTerminalCount(): Promise<number> {
        return this.step(() =>
            this.page.locator('#terminal .terminal-wrapper').count(),
        );
    }
    async verifyTerminalGuard(marker: string): Promise<string[]> {
        await this.pythonCommand(
            'Terminal: Create New Terminal (With Profile)',
        );
        const row = this.page
            .locator('.quick-input-widget .label-name')
            .filter({ hasText: /^\s*Guard verification\s*$/ });
        await this.step(() => row.click(this.timeout()));
        let lines: string[] = [];
        await this.step(() =>
            expect
                .poll(async () => {
                    lines = await this.readPythonTerminal();
                    return lines.includes(marker);
                }, this.timeout())
                .toBe(true),
        );
        await this.pythonCommand('Terminal: Kill All Terminals');
        return lines;
    }
}
