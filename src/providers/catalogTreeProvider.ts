import * as vscode from 'vscode';
import { t } from '../i18n';
import { warningLabel } from '../scanner/locatorRanker';
import { scanStore } from '../state/scanStore';
import type { ScannedElement } from '../types';

function sectionTitle(section: string | null): string {
  if (!section || section === '__table_rows__') {
    return section === '__table_rows__' ? t('tree.tableRows') : t('tree.noSection');
  }
  return section;
}

export class ElementTreeItem extends vscode.TreeItem {
  constructor(public readonly element: ScannedElement) {
    const label =
      element.description ||
      element.name ||
      element.roleName ||
      element.dataName ||
      element.label ||
      element.testId ||
      element.text ||
      element.tag;
    super(label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'element';
    this.id = element.id;
    this.description = [
      element.role || element.tag,
      element.bestLocator.strategy,
      element.bestLocator.unique ? 'unique' : 'NOT UNIQUE',
    ].join(' · ');

    const warnings = element.bestLocator.warnings.map(warningLabel).join('\n');
    this.tooltip = [
      element.bestLocator.expression,
      warnings ? `\nПредупреждения:\n${warnings}` : '',
      element.section ? `\nСекция: ${element.section}` : '',
      element.inIframe ? '\niframe: да' : '',
    ]
      .filter(Boolean)
      .join('');

    this.iconPath = new vscode.ThemeIcon(
      element.bestLocator.unique ? 'symbol-field' : 'warning'
    );
  }
}

export class SectionTreeItem extends vscode.TreeItem {
  constructor(
    public readonly sectionName: string,
    public readonly children: ElementTreeItem[]
  ) {
    super(sectionName, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'section';
    this.id = `section:${sectionName}`;
    this.description = `${children.length}`;
    this.iconPath = new vscode.ThemeIcon('folder');
  }
}

type CatalogNode = SectionTreeItem | ElementTreeItem;

export class CatalogTreeProvider implements vscode.TreeDataProvider<CatalogNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<CatalogNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: CatalogNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: CatalogNode): CatalogNode[] {
    if (element instanceof SectionTreeItem) {
      return element.children;
    }

    const elements = scanStore.getElements();
    if (elements.length === 0) {
      return [];
    }

    const groups = new Map<string, ScannedElement[]>();
    for (const el of elements) {
      const key = sectionTitle(el.section);
      const list = groups.get(key) ?? [];
      list.push(el);
      groups.set(key, list);
    }

    return Array.from(groups.entries()).map(
      ([name, items]) => new SectionTreeItem(name, items.map((item) => new ElementTreeItem(item)))
    );
  }
}
