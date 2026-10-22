import { expect, type Page } from '@playwright/test';
import type { MockRequest } from './mock.js';
import { turnCompleted, type ChatTurn } from './turn.js';
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

  async qualifyChat(marker: string, reply: string, requests: () => MockRequest[], session: () => Promise<string>, timeout: number, followUp?: ChatTurn) {
    const chat = this.page.locator('div[id="workbench.panel.chat"]');
    const previousSession = await session();
    await this.command('Smoke Tester: Open Local Chat');
    await expect.poll(async () => {
      const current = await session();
      return !!current && current !== previousSession;
    }, { timeout: 15_000, message: 'Expected a new local sidebar session identity' }).toBe(true);
    await chat.locator('.chat-mode-picker-item [role="button"]').click();
    const ask = this.page.locator('.action-widget').getByRole('menuitemcheckbox', { name: /^Ask,/ });
    await expect(ask).toBeVisible();
    const index = Number(await ask.getAttribute('data-index'));
    if (!Number.isSafeInteger(index) || index < 0 || index > 10) throw new Error('Invalid Ask picker position');
    await this.page.keyboard.press('Home');
    for (let i = 0; i < index; i++) await this.page.keyboard.press('ArrowDown');
    await this.page.keyboard.press('Enter');
    await expect(chat.locator('.chat-mode-picker-item .chat-input-picker-label')).toHaveText('Ask');
    const responses = chat.locator('.interactive-item-container.interactive-response');
    await expect(responses).toHaveCount(0);
    const sessionId = await session();
    expect(sessionId).toMatch(/^vscode-chat-session:\/\/local\//);
    const turns = [{ marker, reply }, ...(followUp ? [followUp] : [])];
    const evidence: { marker: string; reply: string; completed: boolean; responseCount: number; requestSequence: number }[] = [];
    const selector = 'div[id="workbench.panel.chat"] .interactive-input-part .monaco-editor[role="code"]';
    for (const [index, turn] of turns.entries()) {
      expect(await session()).toBe(sessionId);
      await expect(responses).toHaveCount(index);
      const before = { session: sessionId, responseCount: index,
        requestSequence: requests().at(-1)?.sequence ?? 0, priorTurns: turns.slice(0, index) };
      await this.typeInEditor(selector, `${index ? 'Follow up: ' : ''}Reply briefly without tools or edits. [smoke:${turn.marker}]`);
      const send = chat.locator('.chat-execute-toolbar .action-item:not(.disabled) .action-label.codicon-arrow-up-compact');
      await expect(send).toBeVisible();
      await send.click();
      await expect.poll(async () => {
        const bubbles = await responses.evaluateAll(elements => elements.map(element => ({
          text: Array.from(element.querySelectorAll('.rendered-markdown')).map(part => part.textContent ?? '').join(''),
          completed: !element.classList.contains('chat-response-loading') && element.getAttribute('aria-busy') !== 'true',
        })));
        return turnCompleted(before, {
          session: await session(),
          prompts: await chat.locator('.interactive-item-container.interactive-request').allTextContents(),
          responses: bubbles, requests: requests(),
        }, turn.marker, turn.reply);
      }, { timeout, message: `Expected fresh complete mocked reply for turn ${index + 1} in the same local Chat session` }).toBe(true);
      evidence.push({ ...turn, completed: true, responseCount: index + 1, requestSequence: requests().at(-1)!.sequence });
    }
    return { session: sessionId, turns: evidence };
  }
}
