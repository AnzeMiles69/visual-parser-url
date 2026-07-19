import * as vscode from 'vscode';
import { t } from '../i18n';
import { warningLabel } from '../scanner/locatorRanker';
import { scanStore } from '../state/scanStore';
import type { ScannedElement } from '../types';

export class VisualParserPanel {
  public static current: VisualParserPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private hasContent = false;

  private constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      async (message: { type: string; elementId?: string }) => {
        if (message.type === 'select' && message.elementId) {
          scanStore.select(message.elementId);
          // Только подсветка — без полного refresh и без reveal панели
          this.highlight(message.elementId);
          return;
        }
        if (message.type === 'copy' && message.elementId) {
          await vscode.commands.executeCommand('visualParser.copyLocator', message.elementId);
          return;
        }
        if (message.type === 'insert' && message.elementId) {
          scanStore.select(message.elementId);
          await vscode.commands.executeCommand('visualParser.insertLocator');
        }
      },
      null,
      this.disposables
    );
  }

  static show(extensionUri: vscode.Uri, options?: { reveal?: boolean; refresh?: boolean }): VisualParserPanel {
    const reveal = options?.reveal !== false;
    const shouldRefresh = options?.refresh !== false;

    if (VisualParserPanel.current) {
      if (reveal) {
        VisualParserPanel.current.panel.reveal(vscode.ViewColumn.Beside, true);
      }
      if (shouldRefresh || !VisualParserPanel.current.hasContent) {
        VisualParserPanel.current.refresh();
      }
      return VisualParserPanel.current;
    }

    const panel = vscode.window.createWebviewPanel(
      'visualParserPanel',
      'Visual Parser',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
      }
    );

    VisualParserPanel.current = new VisualParserPanel(panel);
    VisualParserPanel.current.refresh();
    return VisualParserPanel.current;
  }

  refresh(selectedId?: string): void {
    const result = scanStore.getResult();
    this.panel.webview.html = this.getHtml(
      result?.screenshotBase64 ?? null,
      result?.elements ?? [],
      selectedId ?? scanStore.getSelected()?.id
    );
    this.hasContent = true;
  }

  /** Обновить только выделение — без пересборки HTML (скролл не сбрасывается). */
  highlight(elementId: string): void {
    scanStore.select(elementId);
    if (!this.hasContent) {
      this.refresh(elementId);
      return;
    }
    void this.panel.webview.postMessage({ type: 'highlight', elementId });
  }

  dispose(): void {
    VisualParserPanel.current = undefined;
    this.hasContent = false;
    this.panel.dispose();
    while (this.disposables.length) {
      const d = this.disposables.pop();
      d?.dispose();
    }
  }

  private getHtml(
    screenshotBase64: string | null,
    elements: ScannedElement[],
    selectedId?: string
  ): string {
    const payload = {
      selectedId: selectedId ?? null,
      elements: elements.map((el) => ({
        id: el.id,
        label:
          el.description ||
          el.name ||
          el.roleName ||
          el.dataName ||
          el.label ||
          el.testId ||
          el.text ||
          el.tag,
        role: el.role || el.tag,
        strategy: el.bestLocator.strategy,
        expression: el.bestLocator.expression,
        unique: el.bestLocator.unique,
        warnings: el.bestLocator.warnings.map(warningLabel),
        section: el.section,
        bbox: el.bbox,
      })),
    };

    const ui = {
      header: t('panel.header'),
      emptyShot: t('panel.emptyShot'),
      copy: t('panel.copy'),
      insert: t('panel.insert'),
      notUnique: t('panel.notUnique'),
    };

    const img = screenshotBase64
      ? `<img id="shot" src="data:image/png;base64,${screenshotBase64}" alt="screenshot" />`
      : `<div class="empty">${ui.emptyShot}</div>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --muted: var(--vscode-descriptionForeground);
      --border: var(--vscode-panel-border);
      --accent: var(--vscode-focusBorder);
      --card: var(--vscode-sideBar-background);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: var(--vscode-font-family);
      color: var(--fg);
      background: var(--bg);
    }
    .layout {
      display: grid;
      grid-template-columns: 320px 1fr;
      height: calc(100vh - 37px);
    }
    .list {
      border-right: 1px solid var(--border);
      overflow: auto;
      padding: 8px;
    }
    .item {
      border: 1px solid transparent;
      border-radius: 6px;
      padding: 8px;
      margin-bottom: 6px;
      background: var(--card);
      cursor: pointer;
    }
    .item.active { border-color: var(--accent); }
    .item .title { font-weight: 600; margin-bottom: 2px; }
    .item .meta { color: var(--muted); font-size: 12px; }
    .item .expr {
      font-family: var(--vscode-editor-font-family);
      font-size: 11px;
      margin-top: 4px;
      word-break: break-all;
    }
    .warn { color: #d7ba7d; font-size: 11px; margin-top: 4px; }
    .preview {
      position: relative;
      overflow: auto;
      padding: 8px;
      background: #111;
    }
    #shot { max-width: 100%; display: block; }
    .overlay {
      position: absolute;
      border: 2px solid #4ec9b0;
      background: rgba(78, 201, 176, 0.2);
      pointer-events: none;
      display: none;
    }
    .toolbar {
      display: flex;
      gap: 6px;
      margin-top: 6px;
    }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
    }
    .empty { padding: 24px; color: var(--muted); }
    .header {
      padding: 8px 10px;
      border-bottom: 1px solid var(--border);
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="header">${ui.header}</div>
  <div class="layout">
    <div class="list" id="list"></div>
    <div class="preview" id="preview">
      ${img}
      <div class="overlay" id="overlay"></div>
    </div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const data = ${JSON.stringify(payload)};
    const ui = ${JSON.stringify(ui)};
    const list = document.getElementById('list');
    const overlay = document.getElementById('overlay');
    const shot = document.getElementById('shot');
    const preview = document.getElementById('preview');
    const itemNodes = new Map();

    function setActive(elementId) {
      data.selectedId = elementId;
      for (const [id, node] of itemNodes) {
        node.classList.toggle('active', id === elementId);
      }
      const selected = data.elements.find((e) => e.id === elementId);
      if (selected) {
        highlight(selected);
      }
    }

    function render() {
      const scrollTop = list.scrollTop;
      list.innerHTML = '';
      itemNodes.clear();

      for (const el of data.elements) {
        const div = document.createElement('div');
        div.className = 'item' + (el.id === data.selectedId ? ' active' : '');
        div.dataset.id = el.id;
        div.innerHTML = \`
          <div class="title"></div>
          <div class="meta"></div>
          <div class="expr"></div>
          <div class="warn"></div>
          <div class="toolbar">
            <button type="button" data-act="copy"></button>
            <button type="button" data-act="insert"></button>
          </div>
        \`;
        div.querySelector('.title').textContent = el.label;
        div.querySelector('[data-act="copy"]').textContent = ui.copy;
        div.querySelector('[data-act="insert"]').textContent = ui.insert;
        div.querySelector('.meta').textContent = el.role + ' · ' + el.strategy + (el.unique ? '' : ' · ' + ui.notUnique);
        div.querySelector('.expr').textContent = el.expression;
        div.querySelector('.warn').textContent = (el.warnings || []).join(' · ');
        div.addEventListener('click', (e) => {
          const target = e.target;
          const act = target && target.getAttribute ? target.getAttribute('data-act') : null;
          if (act === 'copy') {
            e.preventDefault();
            e.stopPropagation();
            vscode.postMessage({ type: 'copy', elementId: el.id });
            return;
          }
          if (act === 'insert') {
            e.preventDefault();
            e.stopPropagation();
            vscode.postMessage({ type: 'insert', elementId: el.id });
            return;
          }
          setActive(el.id);
          vscode.postMessage({ type: 'select', elementId: el.id });
        });
        itemNodes.set(el.id, div);
        list.appendChild(div);
      }

      list.scrollTop = scrollTop;
      if (data.selectedId) {
        const selected = data.elements.find((e) => e.id === data.selectedId);
        if (selected) highlight(selected);
      }
    }

    function highlight(el) {
      if (!shot || !el.bbox) {
        overlay.style.display = 'none';
        return;
      }
      const naturalW = shot.naturalWidth || shot.width;
      if (!naturalW) {
        return;
      }
      const displayW = shot.clientWidth;
      const scale = displayW / naturalW;
      overlay.style.display = 'block';
      overlay.style.left = (shot.offsetLeft + el.bbox.x * scale) + 'px';
      overlay.style.top = (el.bbox.y * scale + shot.offsetTop) + 'px';
      overlay.style.width = Math.max(4, el.bbox.width * scale) + 'px';
      overlay.style.height = Math.max(4, el.bbox.height * scale) + 'px';
    }

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'highlight' && msg.elementId) {
        setActive(msg.elementId);
      }
    });

    if (shot) {
      shot.addEventListener('load', () => {
        if (data.selectedId) {
          const selected = data.elements.find((e) => e.id === data.selectedId);
          if (selected) highlight(selected);
        }
      });
    }
    render();
  </script>
</body>
</html>`;
  }
}
