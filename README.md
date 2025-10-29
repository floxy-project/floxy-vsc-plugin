# Floxy Flow Viewer (VS Code)

VS Code extension that visualizes Floxy workflows as Mermaid flowcharts directly in the editor.

## Features
- Renders steps and transitions from a Floxy JSON definition (`start`, `steps`).
- Supported step types:
  - task (rectangle), human (parallelogram), condition (diamond), join (double circle), save_point/savepoint (cylinder), fork/parallel (rectangle).
- Links:
  - next: solid arrow `-->`
  - on_failure: dashed arrow with label `-. on failure .->`
  - parallel: thick arrow `==>` to each parallel step
  - wait_for: dotted arrow `-.-` from the awaited step to the current one
- Automatic `Start` node pointing to `start`.

## Installation
1. Download the `.vsix` file (from GitHub Actions artifacts or build it locally, see below).
2. In VS Code: Extensions -> "..." menu → Install from VSIX... -> select the `.vsix` file.
   - Via CLI: `code --install-extension floxy-vscode-<version>.vsix`

## Usage
- Open the Command Palette (Cmd/Ctrl+Shift+P) and run one of:
  - Floxy: Show Example Flow Diagram — render a sample diagram.
  - Floxy: Show Flow From JSON File — pick a JSON file and render the diagram.
- Example files in the repo: `example_human.floxy.json`, `example_dlq.floxy.json`, `example_new.floxy.json`.

Minimal JSON example:
```json
{
  "start": "first",
  "steps": {
    "first": { "type": "task", "next": ["second"] },
    "second": { "type": "task" }
  }
}
```

## Build from source
- Prerequisites: Node.js 20+, npm
- Commands:
  - `npm ci`
  - `npm run compile`
  - `npm run package` -> produces a `.vsix`

## CI
Pushing a tag that matches `v*` automatically builds a `.vsix` (see `.github/workflows/build-vsix-on-tag.yml`). The resulting package is available as a build artifact; it can also be attached to a GitHub Release if desired.
