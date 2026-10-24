import { expect, type Page } from '@playwright/test';
import { basename } from 'node:path';
import type { WalkthroughDeadline } from './python-deadline.js';

const editor = '.part.editor .monaco-editor[role="code"]';
const quickInput = '.quick-input-widget .quick-input-box input';

// Mirrors only the proven walkthrough operations. Each awaited UI action has
// its own fence so an expired compound operation cannot dispatch its next step.
export class DeadlineWorkbench {
    constructor(
        private readonly page: Page,
        private readonly deadline: WalkthroughDeadline,
    ) {}

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
                    typeof window.driver?.typeInEditor === 'function',
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
        const input = this.page.locator(quickInput);
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
            expect(this.page.locator(editor)).toBeVisible(this.timeout()),
        );
    }

    async replaceEditorText(text: string): Promise<void> {
        await this.step(() =>
            this.page.locator(`${editor} .native-edit-context`).focus(),
        );
        await this.step(() => this.page.keyboard.press('Meta+A'));
        await this.typeInEditor(editor, text);
    }

    async newTextFile(): Promise<void> {
        await this.step(() => this.page.keyboard.press('Meta+N'));
        await this.step(() =>
            expect(
                this.page.locator('.part.editor .tab.active .label-name'),
            ).toHaveText(/^Untitled-/, this.timeout()),
        );
        await this.step(() =>
            expect(this.page.locator(editor)).toBeVisible(this.timeout()),
        );
    }

    async saveAs(path: string): Promise<void> {
        await this.step(() => this.page.keyboard.press('Meta+Shift+S'));
        const input = this.page.locator(quickInput);
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
            this.page.locator(`${editor} .native-edit-context`).focus(),
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
                        .locator(`${editor} .view-lines .view-line`)
                        .allTextContents(),
                )
            ).map((line) => line.replaceAll('\u00a0', ' ').trimEnd());
        await this.step(() =>
            expect.poll(read, this.timeout()).toEqual(text.split('\n')),
        );
        return read();
    }
}
