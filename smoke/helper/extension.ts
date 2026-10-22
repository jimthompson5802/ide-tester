import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(vscode.commands.registerCommand('ideTester.openLocalChat', async () => {
    const command = 'workbench.action.chat.newLocalChat';
    if (!(await vscode.commands.getCommands(true)).includes(command)) {
      throw new Error('Installed VS Code does not expose New Local Chat');
    }
    await vscode.commands.executeCommand(command);
  }));
}
