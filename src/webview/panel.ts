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
          this.highlight(message.elementId);
          await vscode.commands.executeCommand('visualParser.revealInCatalog', message.elementId);
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

  /** Обновить только выделение — без пересборки HTML (скролл/зум не сбрасываются). */
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
      zoomIn: t('panel.zoomIn'),
      zoomOut: t('panel.zoomOut'),
      zoomReset: t('panel.zoomReset'),
      hint: t('panel.hint'),
      hideList: t('panel.hideList'),
      showList: t('panel.showList'),
    };

    const shotDataUrl = screenshotBase64 ? `data:image/png;base64,${screenshotBase64}` : null;
    const stageContent = shotDataUrl
      ? `<canvas id="shotCanvas" aria-label="screenshot"></canvas>`
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
      user-select: none;
    }
    .layout {
      display: grid;
      grid-template-columns: 300px 1fr;
      height: calc(100vh - 37px);
    }
    .layout.list-hidden {
      grid-template-columns: 1fr;
    }
    .layout.list-hidden .list {
      display: none;
    }
    .list {
      border-right: 1px solid var(--border);
      overflow: auto;
      padding: 8px;
      min-width: 0;
    }
    .item {
      border: 1px solid transparent;
      border-radius: 6px;
      padding: 8px;
      margin-bottom: 6px;
      background: var(--card);
      cursor: pointer;
      user-select: text;
    }
    .item.active {
      border-color: #4ec9b0;
      background: rgba(78, 201, 176, 0.14);
      box-shadow: inset 3px 0 0 #4ec9b0;
    }
    .item .title { font-weight: 600; margin-bottom: 2px; }
    .item .meta { color: var(--muted); font-size: 12px; }
    .item .expr {
      font-family: var(--vscode-editor-font-family);
      font-size: 11px;
      margin-top: 4px;
      word-break: break-all;
    }
    .warn { color: #d7ba7d; font-size: 11px; margin-top: 4px; }
    .preview-wrap {
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
      background: #111;
    }
    .preview-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border-bottom: 1px solid var(--border);
      background: var(--bg);
      flex-shrink: 0;
    }
    .preview-bar .hint {
      color: var(--muted);
      font-size: 11px;
      margin-left: 4px;
    }
    #zoomLabel {
      min-width: 44px;
      text-align: center;
      font-variant-numeric: tabular-nums;
      font-size: 12px;
    }
    .viewport {
      position: relative;
      flex: 1;
      overflow: hidden;
      cursor: grab;
      background:
        linear-gradient(45deg, #1a1a1a 25%, transparent 25%),
        linear-gradient(-45deg, #1a1a1a 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #1a1a1a 75%),
        linear-gradient(-45deg, transparent 75%, #1a1a1a 75%);
      background-size: 16px 16px;
      background-position: 0 0, 0 8px, 8px -8px, -8px 0;
      background-color: #0d0d0d;
    }
    .viewport.dragging { cursor: grabbing; }
    .stage {
      position: absolute;
      left: 0;
      top: 0;
      transform-origin: 0 0;
      will-change: transform;
      line-height: 0;
    }
    /* Один bitmap: скрин + подсветка — зум/пан не разъезжаются */
    #shotCanvas {
      display: block;
      max-width: none;
      image-rendering: auto;
      pointer-events: none;
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
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
    }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
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
  <div class="layout" id="layout">
    <div class="list" id="list"></div>
    <div class="preview-wrap">
      <div class="preview-bar">
        <button type="button" class="secondary" id="toggleList" title="${ui.hideList}">${ui.hideList}</button>
        <button type="button" class="secondary" id="zoomOut" title="Zoom out">${ui.zoomOut}</button>
        <span id="zoomLabel">100%</span>
        <button type="button" class="secondary" id="zoomIn" title="Zoom in">${ui.zoomIn}</button>
        <button type="button" class="secondary" id="zoomReset">${ui.zoomReset}</button>
        <span class="hint">${ui.hint}</span>
      </div>
      <div class="viewport" id="viewport">
        <div class="stage" id="stage">
          ${stageContent}
        </div>
      </div>
    </div>
  </div>
  <script>
    const vscodeApi = acquireVsCodeApi();
    const data = ${JSON.stringify(payload)};
    const ui = ${JSON.stringify(ui)};
    const shotDataUrl = ${JSON.stringify(shotDataUrl)};
    const layout = document.getElementById('layout');
    const list = document.getElementById('list');
    const toggleListBtn = document.getElementById('toggleList');
    const canvas = document.getElementById('shotCanvas');
    const viewport = document.getElementById('viewport');
    const stage = document.getElementById('stage');
    const zoomLabel = document.getElementById('zoomLabel');
    const itemNodes = new Map();
    const ctx = canvas ? canvas.getContext('2d') : null;

    let scale = 1;
    let panX = 16;
    let panY = 16;
    let naturalW = 0;
    let naturalH = 0;
    let listHidden = false;
    let hoverId = null;
    let shotImage = null;

    const drag = { active: false, moved: false, startX: 0, startY: 0, originX: 0, originY: 0 };

    function applyListVisibility(refit) {
      layout.classList.toggle('list-hidden', listHidden);
      toggleListBtn.textContent = listHidden ? ui.showList : ui.hideList;
      toggleListBtn.title = listHidden ? ui.showList : ui.hideList;
      const prev = vscodeApi.getState() || {};
      vscodeApi.setState(Object.assign({}, prev, { listHidden: listHidden }));
      if (refit && naturalW) {
        requestAnimationFrame(function () { fitToView(); });
      }
    }

    const saved = vscodeApi.getState();
    if (saved && typeof saved.listHidden === 'boolean') {
      listHidden = saved.listHidden;
    }
    applyListVisibility(false);

    function applyTransform() {
      stage.style.transform = 'translate(' + panX + 'px,' + panY + 'px) scale(' + scale + ')';
      zoomLabel.textContent = Math.round(scale * 100) + '%';
    }

    function drawBox(b, mode) {
      if (!ctx || !b) return;
      const x = b.x;
      const y = b.y;
      const w = Math.max(8, b.width);
      const h = Math.max(8, b.height);
      if (mode === 'hover') {
        ctx.fillStyle = 'rgba(255, 200, 60, 0.12)';
        ctx.strokeStyle = 'rgba(255, 200, 60, 0.7)';
        ctx.lineWidth = 2;
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        return;
      }
      ctx.fillStyle = 'rgba(255, 204, 51, 0.2)';
      ctx.strokeStyle = '#ffcc33';
      ctx.lineWidth = 3;
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    }

    function drawLabel(el) {
      if (!ctx || !el.bbox) return;
      const label = el.label || el.role || el.id;
      const x = el.bbox.x;
      const y = el.bbox.y;
      const w = Math.max(8, el.bbox.width);
      const h = Math.max(8, el.bbox.height);
      ctx.font = 'bold 12px sans-serif';
      const padX = 6;
      const tw = Math.min(Math.max(w, 48), Math.min(280, ctx.measureText(label).width + padX * 2));
      const th = 16;
      // внутри рамки снизу — не перекрывает соседнюю строку сверху (GitHub/YouTube)
      let lx = x;
      let ly = y + h - th - 2;
      if (ly < y + 2) {
        ly = y + 2;
      }
      ctx.fillStyle = '#ffcc33';
      ctx.fillRect(lx, ly, tw, th);
      ctx.fillStyle = '#111';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, lx + padX, ly + th / 2, tw - padX * 2);
    }

    /** Скрин + подсветка в одном bitmap — зум не сдвигает рамку относительно картинки */
    function redraw() {
      if (!ctx || !canvas || !shotImage) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(shotImage, 0, 0);
      if (hoverId && hoverId !== data.selectedId) {
        const hovered = data.elements.find((e) => e.id === hoverId);
        if (hovered) drawBox(hovered.bbox, 'hover');
      }
      if (data.selectedId) {
        const selected = data.elements.find((e) => e.id === data.selectedId);
        if (selected && selected.bbox) {
          drawBox(selected.bbox, 'active');
          drawLabel(selected);
        }
      }
    }

    function setActive(elementId, fromShot) {
      data.selectedId = elementId;
      for (const [id, node] of itemNodes) {
        node.classList.toggle('active', id === elementId);
      }
      const selected = data.elements.find((e) => e.id === elementId);
      redraw();
      if (selected) {
        if (fromShot) {
          const node = itemNodes.get(elementId);
          if (node) node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else {
          ensureInView(selected);
        }
      }
    }

    function ensureInView(el) {
      if (!el.bbox || !viewport) return;
      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;
      const cx = el.bbox.x + el.bbox.width / 2;
      const cy = el.bbox.y + el.bbox.height / 2;
      const screenX = panX + cx * scale;
      const screenY = panY + cy * scale;
      const pad = 48;
      if (screenX < pad || screenX > vw - pad || screenY < pad || screenY > vh - pad) {
        panX = vw / 2 - cx * scale;
        panY = vh / 2 - cy * scale;
        applyTransform();
      }
    }

    /**
     * Координаты указателя → пиксели скриншота.
     * Через реальный box stage после transform — без рассинхрона pan/scale/DPI.
     */
    function toImagePoint(clientX, clientY) {
      if (!stage || !naturalW || !naturalH) {
        return { x: 0, y: 0 };
      }
      const r = stage.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) {
        return { x: 0, y: 0 };
      }
      return {
        x: ((clientX - r.left) / r.width) * naturalW,
        y: ((clientY - r.top) / r.height) * naturalH,
      };
    }

    function hitTest(imgX, imgY) {
      let best = null;
      let bestScore = Infinity;
      for (const el of data.elements) {
        const b = el.bbox;
        if (!b || b.width <= 0 || b.height <= 0) continue;
        if (imgX >= b.x && imgX <= b.x + b.width && imgY >= b.y && imgY <= b.y + b.height) {
          const cx = b.x + b.width / 2;
          const cy = b.y + b.height / 2;
          const dist = (imgX - cx) * (imgX - cx) + (imgY - cy) * (imgY - cy);
          const area = b.width * b.height;
          // ближе к центру важнее площади — меньше путаницы GitHub/YouTube при наложении
          const score = dist + area * 0.0001;
          if (score < bestScore) {
            bestScore = score;
            best = el;
          }
        }
      }
      return best;
    }

    function setHover(elementId) {
      if (hoverId === elementId) return;
      hoverId = elementId;
      redraw();
      viewport.style.cursor = elementId ? 'pointer' : (drag.active ? 'grabbing' : 'grab');
    }

    function renderList() {
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
        div.querySelector('.meta').textContent =
          el.role + ' · ' + el.strategy + (el.unique ? '' : ' · ' + ui.notUnique);
        div.querySelector('.expr').textContent = el.expression;
        div.querySelector('.warn').textContent = (el.warnings || []).join(' · ');
        div.addEventListener('click', (e) => {
          const target = e.target;
          const act = target && target.getAttribute ? target.getAttribute('data-act') : null;
          if (act === 'copy') {
            e.preventDefault();
            e.stopPropagation();
            vscodeApi.postMessage({ type: 'copy', elementId: el.id });
            return;
          }
          if (act === 'insert') {
            e.preventDefault();
            e.stopPropagation();
            vscodeApi.postMessage({ type: 'insert', elementId: el.id });
            return;
          }
          setActive(el.id, false);
          vscodeApi.postMessage({ type: 'select', elementId: el.id });
        });
        itemNodes.set(el.id, div);
        list.appendChild(div);
      }

      list.scrollTop = scrollTop;
    }

    function zoomAt(nextScale, clientX, clientY) {
      const rect = viewport.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const imgX = (x - panX) / scale;
      const imgY = (y - panY) / scale;
      scale = Math.min(4, Math.max(0.2, nextScale));
      panX = x - imgX * scale;
      panY = y - imgY * scale;
      applyTransform();
    }

    function fitToView() {
      if (!naturalW || !viewport.clientWidth) return;
      const pad = 24;
      const sx = (viewport.clientWidth - pad * 2) / naturalW;
      const sy = (viewport.clientHeight - pad * 2) / naturalH;
      scale = Math.min(1, sx, sy);
      panX = (viewport.clientWidth - naturalW * scale) / 2;
      panY = Math.max(12, (viewport.clientHeight - naturalH * scale) / 2);
      applyTransform();
    }

    document.getElementById('zoomIn').addEventListener('click', () => {
      const r = viewport.getBoundingClientRect();
      zoomAt(scale * 1.2, r.left + r.width / 2, r.top + r.height / 2);
    });
    document.getElementById('zoomOut').addEventListener('click', () => {
      const r = viewport.getBoundingClientRect();
      zoomAt(scale / 1.2, r.left + r.width / 2, r.top + r.height / 2);
    });
    document.getElementById('zoomReset').addEventListener('click', () => fitToView());

    toggleListBtn.addEventListener('click', () => {
      listHidden = !listHidden;
      applyListVisibility(true);
    });

    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      zoomAt(scale * factor, e.clientX, e.clientY);
    }, { passive: false });

    viewport.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      drag.active = true;
      drag.moved = false;
      drag.startX = e.clientX;
      drag.startY = e.clientY;
      drag.originX = panX;
      drag.originY = panY;
      viewport.classList.add('dragging');
      viewport.style.cursor = 'grabbing';
      viewport.setPointerCapture(e.pointerId);
    });

    viewport.addEventListener('pointermove', (e) => {
      if (drag.active) {
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
        if (drag.moved) {
          panX = drag.originX + dx;
          panY = drag.originY + dy;
          applyTransform();
        }
        return;
      }
      const p = toImagePoint(e.clientX, e.clientY);
      const el = hitTest(p.x, p.y);
      setHover(el ? el.id : null);
    });

    function endDrag(e) {
      if (!drag.active) return;
      const wasClick = !drag.moved;
      drag.active = false;
      viewport.classList.remove('dragging');
      viewport.style.cursor = 'grab';
      try { viewport.releasePointerCapture(e.pointerId); } catch (_) {}

      if (wasClick) {
        const p = toImagePoint(e.clientX, e.clientY);
        const el = hitTest(p.x, p.y);
        if (el) {
          setActive(el.id, true);
          vscodeApi.postMessage({ type: 'select', elementId: el.id });
        }
      }
    }
    viewport.addEventListener('pointerup', endDrag);
    viewport.addEventListener('pointercancel', endDrag);
    viewport.addEventListener('pointerleave', () => {
      if (!drag.active) setHover(null);
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'highlight' && msg.elementId) {
        setActive(msg.elementId, false);
      }
    });

    function onShotReady(image) {
      shotImage = image;
      naturalW = image.naturalWidth || image.width;
      naturalH = image.naturalHeight || image.height;
      canvas.width = naturalW;
      canvas.height = naturalH;
      canvas.style.width = naturalW + 'px';
      canvas.style.height = naturalH + 'px';
      stage.style.width = naturalW + 'px';
      stage.style.height = naturalH + 'px';
      redraw();
      fitToView();
      renderList();
      if (data.selectedId) {
        const selected = data.elements.find((e) => e.id === data.selectedId);
        if (selected) setActive(selected.id, false);
      }
    }

    if (shotDataUrl && canvas && ctx) {
      const image = new Image();
      image.onload = function () { onShotReady(image); };
      image.src = shotDataUrl;
    } else {
      renderList();
    }
  </script>
</body>
</html>`;
  }
}
