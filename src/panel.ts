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
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data: ${this.panel.webview.cspSource}; script-src https: ${this.panel.webview.cspSource} 'unsafe-inline'; style-src ${this.panel.webview.cspSource} 'unsafe-inline'; font-src ${this.panel.webview.cspSource};">
            <title>Floxy Flow</title>
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
    const label = step.Label || step.label || stepName;
    const stepType = step.Type || step.type || '';
    
    switch (stepType.toLowerCase()) {
      case 'condition':
        return `${this.normalizeId(stepName)}{${label}}`;
      case 'join':
        return `${this.normalizeId(stepName)}((${label}))`;
      case 'save_point':
      case 'savepoint':
        return `${this.normalizeId(stepName)}[( ${label} )]`;
      case 'human':
        return `${this.normalizeId(stepName)}[/ ${label} /]`;
      case 'fork':
        return `${this.normalizeId(stepName)}[${label}]`;
      case 'parallel':
        return `${this.normalizeId(stepName)}[${label}]`;
      case 'task':
      default:
        return `${this.normalizeId(stepName)}[${label}]`;
    }
  }

  private edge(a: string, b: string, opts?: { label?: string, style?: 'dashed'|'double'|'dotted' }) {
    const la = this.normalizeId(a);
    const lb = this.normalizeId(b);
    if (opts?.style === 'dashed') {
      // Mermaid dashed link with optional text: A -. text .-> B
      return opts.label
        ? `${la} -. ${opts.label} .-> ${lb}\n`
        : `${la} -.-> ${lb}\n`;
    } else if (opts?.style === 'double') {
      // Thick link
      return `${la} ==>${opts?.label ? '|' + opts.label + '|' : ''} ${lb}\n`;
    } else if (opts?.style === 'dotted') {
      // Mermaid dotted link (labels not officially supported like dashed)
      return `${la} -.- ${lb}\n`;
    } else {
      return `${la} -->${opts?.label ? '|' + opts.label + '|' : ''} ${lb}\n`;
    }
  }

  private convertJsonToMermaid(jsonStr: string): string {
    try {
      const def = JSON.parse(jsonStr);
      
      let steps: any = {};
      let startStep = '';
      
      if (def.steps) {
        steps = def.steps;
        startStep = def.start || '';
      } else {
        return `flowchart TD\nerror([Invalid JSON format])`;
      }

      let nodes = '';
      let links = '';

      if (startStep && steps[startStep]) {
        nodes += `${this.normalizeId('_start_')}((Start))\n`;
        links += this.edge('_start_', startStep);
      }
      
      for (const [name, step] of Object.entries<any>(steps)) {
        nodes += this.nodeLabel(name, step) + '\n';
      }

      for (const [name, step] of Object.entries<any>(steps)) {
        const type = ((step.type ?? step.Type) ?? '').toString().toLowerCase();

        if (type === 'condition') {
          const nextArr = (Array.isArray(step.next ?? step.Next) ? (step.next ?? step.Next) : []) as string[];
          if (nextArr.length > 0) {
            links += this.edge(name, nextArr[0], { label: 'yes' });
          }
          const elseTarget = (step.else ?? step.Else) as string | undefined;
          if (elseTarget) {
            links += this.edge(name, elseTarget, { label: 'no' });
          }
        } else {
          const nextSteps = (step.next ?? step.Next) as string | string[] | undefined | null;
          if (Array.isArray(nextSteps)) {
            for (const n of nextSteps) {
              if (n) links += this.edge(name, n);
            }
          } else if (nextSteps) {
            links += this.edge(name, nextSteps);
          }
        }

        const onFailure = (step.on_failure ?? step.OnFailure) as string | undefined;
        if (onFailure) {
          links += this.edge(name, onFailure, { style: 'dashed', label: 'on failure' });
        }

        const parallelSteps = (step.parallel ?? step.Parallel) as string[] | string | undefined | null;
        if (parallelSteps) {
          const arr = Array.isArray(parallelSteps) ? parallelSteps : [parallelSteps];
          for (const p of arr) {
            if (p) links += this.edge(name, p, { style: 'double' });
          }
        }

        const waitForSteps = (step.wait_for ?? step.WaitFor) as string[] | string | undefined | null;
        if (waitForSteps) {
          const arr = Array.isArray(waitForSteps) ? waitForSteps : [waitForSteps];
          for (const w of arr) {
            if (w) links += this.edge(w, name, { style: 'dotted' });
          }
        }
      }

      return `flowchart TD\n${nodes}\n${links}`;
    } catch (err) {
      return `flowchart TD\nerror([Invalid JSON: ${err}])`;
    }
  }

  private defaultGraph(): string {
    return `flowchart TD\n    step1([Start]) --> step2[Task]\n    step2 --> step3{Condition?}\n    step3 -->|yes| step4[Handler]\n    step3 -->|no| step5[Rollback]\n    step4 -.->|on failure| step7[Compensation]\n    step4 ==> step6[ParallelTask]\n    step5 --> step6 --> step8([Complete])`;
  }
}
