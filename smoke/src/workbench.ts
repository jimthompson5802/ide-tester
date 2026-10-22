import { expect, type Page } from '@playwright/test';
import type { MockRequest } from './mock.js';
import { turnCompleted } from './turn.js';
import type { ChatBackend } from './arguments.js';
import { ChatFailure, uiIssue, verifyExport, type SubmittedTurn, type ChatEvidence } from './chat.js';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { basename } from 'node:path';

const mainEditor = '.part.editor .monaco-editor[role="code"]';

// Only the two shipped-driver methods required by this tester are exposed.
interface SmokeDriver {
  whenWorkbenchRestored(): Promise<void>;
  typeInEditor(selector: string, text: string): Promise<void>;
}
declare global { interface Window { driver: SmokeDriver } }

export async function bounded<T>(operation: Promise<T>, timeout: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), Math.max(1, timeout));
    })]);
  } finally { clearTimeout(timer); }
}

export class Workbench {
  constructor(readonly page: Page) {}

  async ready(timeout: number): Promise<void> {
    const deadline = Date.now() + timeout;
    await this.page.waitForFunction(() => {
      const driver = window.driver;
      return typeof driver?.whenWorkbenchRestored === 'function' && typeof driver?.typeInEditor === 'function';
    }, undefined, { timeout });
    await bounded(this.page.evaluate(() => window.driver.whenWorkbenchRestored()), deadline - Date.now(), 'Workbench restoration');
    await expect(this.page.locator('.monaco-workbench')).toBeVisible({ timeout: Math.max(1, deadline - Date.now()) });
  }

  async typeInEditor(selector: string, text: string): Promise<void> {
    const input = `${selector} .native-edit-context`;
    await this.page.locator(input).focus();
    await this.page.evaluate(({ selector, text }) => window.driver.typeInEditor(selector, text), { selector: input, text });
  }

  async command(title: string): Promise<void> {
    await this.page.keyboard.press('Meta+Shift+P');
    const input = this.page.locator('.quick-input-widget .quick-input-box input');
    await input.fill(`>${title}`);
    const item = this.page.locator('.quick-input-widget .monaco-list-row').filter({ hasText: title });
    await expect(item).toHaveCount(1);
    await item.click();
    await expect(input).toBeHidden();
  }

  async openFile(path: string): Promise<void> {
    await this.page.keyboard.press('Meta+P');
    const input = this.page.locator('.quick-input-widget .quick-input-box input');
    await input.fill(path);
    const row = this.page.locator('.quick-input-widget .monaco-list-row').filter({ hasText: basename(path) });
    await expect(row).toHaveCount(1);
    await input.press('Enter');
    await expect(input).toBeHidden();
    await expect(this.page.locator('.part.editor .tab.active .label-name')).toHaveText(basename(path));
    await expect(this.page.locator(mainEditor)).toBeVisible();
  }

  async replaceEditorText(text: string): Promise<void> {
    await this.page.locator(`${mainEditor} .native-edit-context`).focus();
    await this.page.keyboard.press('Meta+A');
    await this.typeInEditor(mainEditor, text);
  }

  async saveEditor(): Promise<void> { await this.page.keyboard.press('Meta+S'); }

  async newTextFile(): Promise<void> {
    await this.page.keyboard.press('Meta+N');
    await expect(this.page.locator('.part.editor .tab.active .label-name')).toHaveText(/^Untitled-/);
    await expect(this.page.locator(mainEditor)).toBeVisible();
  }

  async saveAs(path: string): Promise<void> {
    await this.page.keyboard.press('Meta+Shift+S');
    const input = this.page.locator('.quick-input-widget .quick-input-box input');
    await input.fill(path);
    await input.press('Enter');
    await expect(input).toBeHidden();
    await expect(this.page.locator('.part.editor .tab.active .label-name')).toHaveText(basename(path));
  }

  async closeEditors(): Promise<void> {
    await this.page.locator(`${mainEditor} .native-edit-context`).focus();
    await this.page.keyboard.press('Meta+K');
    await this.page.keyboard.press('Meta+W');
    await expect(this.page.locator('.part.editor .tabs-container .tab')).toHaveCount(0);
  }

  async expectEditorText(text: string): Promise<string[]> {
    const lines = this.page.locator(`${mainEditor} .view-lines .view-line`);
    const readLines = async () => (await lines.allTextContents()).map(line => line.replaceAll('\u00a0', ' ').trimEnd());
    await expect.poll(readLines, { message: 'Reopened editor must display the saved contents' }).toEqual(text.split('\n'));
    return readLines();
  }

  private chat() { return this.page.locator('div[id="workbench.panel.chat"]'); }

  async chatIssue(): Promise<ChatFailure | undefined> {
    // Never retain raw prerequisite/notification text, account names or dialogs.
    const visibleText = async (selector: string) => this.page.locator(selector).evaluateAll(elements =>
      elements.filter(element => element.getClientRects().length > 0).map(element => element.textContent ?? ''));
    if (await this.chat().locator('.chat-quota-error-widget').first().isVisible()) return uiIssue(['quota exceeded']);
    const messages = await visibleText('div[id="workbench.panel.chat"] .chat-notification-widget, div[id="workbench.panel.chat"] .chat-error-confirmation, div[id="workbench.panel.chat"] .chat-quota-error-widget, .notifications-toasts .notification-list-item:has(.notification-list-item-icon.codicon-error), .notifications-toasts .notification-list-item:has(.notification-list-item-icon.codicon-warning), .monaco-dialog-box');
    const welcome = await visibleText('div[id="workbench.panel.chat"] .chat-welcome-view, div[id="workbench.panel.chat"] .chat-view-welcome');
    const signIn = await this.page.getByRole('button', { name: /^Sign In$/i }).first().isVisible();
    const prerequisite = uiIssue([...welcome, ...(signIn ? ['Sign in to use GitHub Copilot'] : [])]);
    if (prerequisite?.outcome === 'blocked') return prerequisite;
    return uiIssue(messages);
  }

  private async exportChat(path: string): Promise<unknown> {
    // Export only the active test conversation through the shipped UI command.
    // It goes to disposable resources, never the persistent profile or raw report.
    await this.page.keyboard.press('Meta+Shift+P');
    const input = this.page.locator('.quick-input-widget .quick-input-box input');
    await input.fill('>Chat: Export Chat...');
    const item = this.page.locator('.quick-input-widget .monaco-list-row').filter({ hasText: 'Chat: Export Chat...' });
    await expect(item).toHaveCount(1);
    await item.click();
    await expect(input).toHaveValue(/chat\.json$/);
    await input.fill(path);
    await input.press('Enter');
    await expect(input).toBeHidden();
    await expect.poll(async () => {
      try { JSON.parse(await readFile(path, 'utf8')); return true; }
      catch { return false; }
    }, { timeout: 5000, message: 'Expected test-owned Chat export' }).toBe(true);
    return JSON.parse(await readFile(path, 'utf8'));
  }

  async qualifyChat(turns: SubmittedTurn[], backend: ChatBackend, requests: () => MockRequest[], session: () => Promise<string>, timeout: number, exportRoot: string, evidence: ChatEvidence = { session: '', turns: [] }) {
    const chat = this.chat();
    let diagnosticStage = 'open-session';
    try {
      if (backend === 'real') { const issue = await this.chatIssue(); if (issue) throw issue; }
      const previousSession = await session();
      await this.command('Smoke Tester: Open Local Chat');
      if (backend === 'real') {
        // Signed-out/setup UI must block before we try to select a mode or send.
        const readyBy = Date.now() + 15_000;
        while (true) {
          const issue = await this.chatIssue();
          if (issue) throw issue;
          if (await chat.locator('.chat-mode-picker-item [role="button"]').isVisible()) break;
          if (Date.now() >= readyBy) throw new ChatFailure('harness_error', 'Chat input readiness contract unavailable');
          await this.page.waitForTimeout(100);
        }
      }
      diagnosticStage = 'new-session-identity';
      await expect.poll(async () => {
        const current = await session();
        return !!current && current !== previousSession;
      }, { timeout: 15_000, message: 'Expected a new local sidebar session identity' }).toBe(true);
      diagnosticStage = 'select-ask';
      if (backend === 'real') {
        // The authenticated build can hide legacy Ask from the mode menu.
        // Its built-in command still selects Ask through the visible command palette.
        await this.command('Chat: Open Chat (Ask)');
      } else {
        await chat.locator('.chat-mode-picker-item [role="button"]').click();
        diagnosticStage = 'ask-menu-item';
        const ask = this.page.locator('.action-widget').getByRole('menuitemcheckbox', { name: /^Ask,/ });
        await expect(ask).toBeVisible();
        const position = Number(await ask.getAttribute('data-index'));
        if (!Number.isSafeInteger(position) || position < 0 || position > 10) throw new Error('Invalid Ask picker position');
        await this.page.keyboard.press('Home');
        for (let i = 0; i < position; i++) await this.page.keyboard.press('ArrowDown');
        await this.page.keyboard.press('Enter');
      }
      diagnosticStage = 'ask-selected-label';
      await expect(chat.locator('.chat-mode-picker-item .chat-input-picker-label')).toHaveText('Ask');
      const responses = chat.locator('.interactive-item-container.interactive-response');
      diagnosticStage = 'empty-session';
      await expect(responses).toHaveCount(0);
      const sessionId = await session();
      expect(sessionId).toMatch(/^vscode-chat-session:\/\/local\//);
      evidence.session = sessionId;
      const selector = 'div[id="workbench.panel.chat"] .interactive-input-part .monaco-editor[role="code"]';
      for (const [index, turn] of turns.entries()) {
        diagnosticStage = `turn-${index + 1}`;
        const started = Date.now();
        const item: ChatEvidence['turns'][number] = { ...turn, completed: false, responseCount: index, durationMs: 0 };
        evidence.turns.push(item);
        try {
          await bounded((async () => {
            expect(await session()).toBe(sessionId);
            await expect(responses).toHaveCount(index);
            if (backend === 'real') { const issue = await this.chatIssue(); if (issue) throw issue; }
            const before = { session: sessionId, responseCount: index,
              requestSequence: requests().at(-1)?.sequence ?? 0, priorTurns: turns.slice(0, index) };
            await this.typeInEditor(selector, turn.prompt);
            const send = chat.locator('.chat-execute-toolbar .action-item:not(.disabled) .action-label.codicon-arrow-up-compact');
            await expect(send).toBeVisible();
            await send.click();
            while (true) {
              if (backend === 'real') { const issue = await this.chatIssue(); if (issue) throw issue; }
              const bubbles = await responses.evaluateAll(elements => elements.map(element => ({
                text: Array.from(element.querySelectorAll('.rendered-markdown')).map(part => part.textContent ?? '').join(''),
                completed: !element.classList.contains('chat-response-loading') && element.getAttribute('aria-busy') !== 'true',
              })));
              const current = { session: await session(),
                prompts: await chat.locator('.interactive-item-container.interactive-request').allTextContents(),
                responses: bubbles, requests: requests() };
              item.responseCount = bubbles.length;
              // Do not report content from a replaced session or an unrelated prompt.
              if (current.session === sessionId && current.prompts.at(-1)?.includes(`[smoke:${turn.marker}]`)) {
                item.observedReply = bubbles.at(-1)?.text;
              }
              if (turnCompleted(before, current, turn.marker, turn.reply, backend) &&
                  !(await chat.locator('.chat-execute-toolbar .codicon-stop-circle').isVisible())) break;
              if (backend === 'real' && bubbles.length === index + 1 && bubbles.at(-1)!.completed &&
                  !(await chat.locator('.chat-execute-toolbar .codicon-stop-circle').isVisible())) {
                throw new ChatFailure('failed', 'Completed Chat response or transcript did not match the exact expected exchange');
              }
              if (Date.now() - started >= timeout) throw new ChatFailure('failed', 'Chat response timed out');
              await this.page.waitForTimeout(100);
            }
            if (backend === 'real') {
              let exported: unknown;
              const path = join(exportRoot, `chat-turn-${index + 1}.json`);
              try { exported = await this.exportChat(path); }
              catch { throw new ChatFailure('harness_error', 'Could not export the test-owned Chat response for completion verification'); }
              finally { await rm(path, { force: true }); }
              const observed = verifyExport(exported, turns.slice(0, index + 1));
              item.observedReply = observed.at(-1);
              expect(await session()).toBe(sessionId);
              const issue = await this.chatIssue();
              if (issue) throw issue;
            } else item.requestSequence = requests().at(-1)!.sequence;
            item.completed = true;
          })(), timeout, 'Chat turn');
        } finally { item.durationMs = Date.now() - started; }
      }
      return evidence;
    } catch (cause) {
      if (backend === 'real') {
        const issue = await this.chatIssue().catch(() => undefined);
        const failure = issue ?? (cause instanceof ChatFailure ? cause :
          new ChatFailure(String(cause).includes('Chat turn timed out') ? 'failed' : 'harness_error',
            String(cause).includes('Chat turn timed out') ? 'Chat turn timed out' : `Chat UI/session contract failed (${diagnosticStage})`));
        if (failure.observedReplies) for (const [index, reply] of failure.observedReplies.entries()) {
          if (evidence.turns[index]) evidence.turns[index].observedReply = reply;
        }
        failure.evidence = evidence;
        throw failure;
      }
      throw cause;
    }
  }
}
