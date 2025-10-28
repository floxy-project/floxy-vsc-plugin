import * as vscode from 'vscode';

export class FloxyPanel {
  public static currentPanel: FloxyPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private graphJson?: string;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, graphJson?: string) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.graphJson = graphJson;

    this.update();
  }

  public static createOrShow(extensionUri: vscode.Uri, graphJson?: string) {
    const column = vscode.window.activeTextEditor?.viewColumn;

    if (FloxyPanel.currentPanel) {
      FloxyPanel.currentPanel.panel.reveal(column);
      FloxyPanel.currentPanel.graphJson = graphJson;
      FloxyPanel.currentPanel.update();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'floxyView',
      'Floxy Flow Diagram',
      column || vscode.ViewColumn.One,
      { enableScripts: true }
    );

    FloxyPanel.currentPanel = new FloxyPanel(panel, extensionUri, graphJson);

    panel.onDidDispose(() => {
      FloxyPanel.currentPanel = undefined;
    });
  }

  private update() {
    this.panel.webview.html = this.getHtml();
  }

  private getHtml(): string {
    const graph = this.graphJson ? this.convertJsonToMermaid(this.graphJson) : this.defaultGraph();
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>Floxy Flow</title>
            <script type="module" src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs"></script>
            <style>
                body { background: #1e1e1e; color: #ddd; padding: 0; margin: 0; }
                .mermaid { text-align: center; }
            </style>
        </head>
        <body>
            <div class="mermaid">${graph}</div>
            <script type="module">
                import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
                mermaid.initialize({ startOnLoad: true, theme: 'dark' });
            </script>
        </body>
        </html>`;
  }

  private normalizeId(name: string): string {
    return name.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  private nodeLabel(stepName: string, step: any): string {
    const label = step.Label || stepName;
    switch (step.Type) {
      case 'condition':
      case 'Condition':
      case 'StepTypeCondition':
        return `${this.normalizeId(stepName)}{${label}}`;
      case 'join':
      case 'Join':
        return `${this.normalizeId(stepName)}((${label}))`;
      case 'savepoint':
      case 'SavePoint':
        return `${this.normalizeId(stepName)}[( ${label} )]`;
      case 'human':
      case 'Human':
        return `${this.normalizeId(stepName)}[/ ${label} /]`;
      default:
        return `${this.normalizeId(stepName)}[${label}]`;
    }
  }

  private edge(a: string, b: string, opts?: { label?: string, style?: 'dashed'|'double' }) {
    const la = this.normalizeId(a);
    const lb = this.normalizeId(b);
    if (opts?.style === 'dashed') {
      return `${la} -.->|${opts.label || ''}| ${lb}\n`;
    } else if (opts?.style === 'double') {
      return `${la} ==> ${lb}\n`;
    } else {
      return `${la} -->${opts?.label ? '|' + opts.label + '|' : ''} ${lb}\n`;
    }
  }

  private convertJsonToMermaid(jsonStr: string): string {
    try {
      const def = JSON.parse(jsonStr);
      const steps = def.Definition?.Steps || {};
      let nodes = '';
      let links = '';

      for (const [name, step] of Object.entries<any>(steps)) {
        nodes += this.nodeLabel(name, step) + '\n';
      }

      for (const [name, step] of Object.entries<any>(steps)) {
        if (step.Type === 'condition' || step.Type === 'Condition' || step.Type === 'StepTypeCondition') {
          if (step.Next) {
            links += this.edge(name, step.Next, { label: 'yes' });
          }
          if (step.Else) {
            links += this.edge(name, step.Else, { label: 'no' });
          }
        } else if (step.Next) {
          if (Array.isArray(step.Next)) {
            for (const n of step.Next) {
              links += this.edge(name, n);
            }
          } else {
            links += this.edge(name, step.Next);
          }
        }

        if (step.OnFailure) {
          links += this.edge(name, step.OnFailure, { style: 'dashed', label: 'on failure' });
        }

        if (step.Parallel && Array.isArray(step.Parallel)) {
          for (const p of step.Parallel) {
            links += this.edge(name, p, { style: 'double' });
          }
        }
      }

      return `flowchart TD\n${nodes}\n${links}`;
    } catch (err) {
      return `flowchart TD\nerror([Invalid JSON])`;
    }
  }

  private defaultGraph(): string {
    return `flowchart TD\n    step1([Start]) --> step2[Task]\n    step2 --> step3{Condition?}\n    step3 -->|yes| step4[Handler]\n    step3 -->|no| step5[Rollback]\n    step4 -.->|on failure| step7[Compensation]\n    step4 ==> step6[ParallelTask]\n    step5 --> step6 --> step8([Complete])`;
  }
}
