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
      return `${la} -.->|${opts.label || ''}| ${lb}\n`;
    } else if (opts?.style === 'double') {
      return `${la} ==> ${lb}\n`;
    } else if (opts?.style === 'dotted') {
      return `${la} -.- ${lb}\n`;
    } else {
      return `${la} -->${opts?.label ? '|' + opts.label + '|' : ''} ${lb}\n`;
    }
  }

  private convertJsonToMermaid(jsonStr: string): string {
    try {
      const def = JSON.parse(jsonStr);
      
      // Поддержка как старого формата (Definition.Steps), так и нового (steps)
      let steps: any = {};
      let startStep = '';
      
      if (def.Definition?.Steps) {
        // Старый формат
        steps = def.Definition.Steps;
        startStep = def.Definition.Start || '';
      } else if (def.steps) {
        // Новый формат
        steps = def.steps;
        startStep = def.start || '';
      } else {
        return `flowchart TD\nerror([Invalid JSON format])`;
      }

      let nodes = '';
      let links = '';

      // Добавляем стартовый узел если есть
      if (startStep && steps[startStep]) {
        nodes += `${this.normalizeId('_start_')}((Start))\n`;
        links += this.edge('_start_', startStep);
      }

      // Создаем узлы
      for (const [name, step] of Object.entries<any>(steps)) {
        nodes += this.nodeLabel(name, step) + '\n';
      }

      // Создаем связи
      for (const [name, step] of Object.entries<any>(steps)) {
        // Обработка условий
        if (step.type === 'condition' || step.Type === 'condition' || step.Type === 'Condition' || step.Type === 'StepTypeCondition') {
          if (step.next && step.next.length > 0) {
            links += this.edge(name, step.next[0], { label: 'yes' });
          }
          if (step.else || step.Else) {
            links += this.edge(name, step.else || step.Else, { label: 'no' });
          }
        } 
        // Обработка обычных шагов
        else if (step.next || step.Next) {
          const nextSteps = step.next || step.Next;
          if (Array.isArray(nextSteps)) {
            for (const n of nextSteps) {
              if (n) links += this.edge(name, n);
            }
          } else if (nextSteps) {
            links += this.edge(name, nextSteps);
          }
        }

        // Обработка компенсации (OnFailure)
        if (step.on_failure || step.OnFailure) {
          links += this.edge(name, step.on_failure || step.OnFailure, { style: 'dashed', label: 'on failure' });
        }

        // Обработка параллельных шагов
        if (step.parallel || step.Parallel) {
          const parallelSteps = step.parallel || step.Parallel;
          if (Array.isArray(parallelSteps)) {
            for (const p of parallelSteps) {
              if (p) links += this.edge(name, p, { style: 'double' });
            }
          }
        }

        // Обработка join шагов (WaitFor)
        if (step.wait_for || step.WaitFor) {
          const waitForSteps = step.wait_for || step.WaitFor;
          if (Array.isArray(waitForSteps)) {
            for (const w of waitForSteps) {
              if (w) links += this.edge(w, name, { style: 'dotted' });
            }
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
