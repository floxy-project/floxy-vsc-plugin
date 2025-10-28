import * as vscode from 'vscode';
import { FloxyPanel } from './panel';


export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('floxy.showFlow', () => {
      FloxyPanel.createOrShow(context.extensionUri);
    })
  );


  context.subscriptions.push(
    vscode.commands.registerCommand('floxy.showFlowFromFile', async (uri?: vscode.Uri) => {
      if (!uri) {
        const selected = await vscode.window.showOpenDialog({ filters: { 'Floxy JSON': ['json'] } });
        if (!selected || selected.length === 0) return;
        uri = selected[0];
      }
      const doc = await vscode.workspace.openTextDocument(uri);
      FloxyPanel.createOrShow(context.extensionUri, doc.getText());
    })
  );
}


export function deactivate() {}