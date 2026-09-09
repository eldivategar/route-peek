import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel | undefined;

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel('Route Peek');
  outputChannel.appendLine('Route Peek activated');

  context.subscriptions.push(outputChannel);
}

// no-op — resource disposal handled by context.subscriptions
export function deactivate(): void {
  outputChannel = undefined;
}
