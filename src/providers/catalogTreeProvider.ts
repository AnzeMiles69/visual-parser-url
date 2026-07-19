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

function elementLabel(element: ScannedElement): string {
  return (
    element.description ||
    element.name ||
    element.roleName ||
    element.dataName ||
    element.label ||
    element.testId ||
    element.text ||
    element.tag
  );
}

function checkboxIcon(
  extensionUri: vscode.Uri,
  kind: 'checked' | 'unchecked' | 'mixed'
): vscode.Uri {
  return vscode.Uri.joinPath(extensionUri, 'media', `checkbox-${kind}.svg`);
}

export class ElementTreeItem extends vscode.TreeItem {
  constructor(public readonly element: ScannedElement) {
    super(elementLabel(element), vscode.TreeItemCollapsibleState.None);
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
      warnings ? `\n${warnings}` : '',
      element.section ? `\n${element.section}` : '',
      element.inIframe ? '\niframe' : '',
      `\n${t('tree.checkboxHint')}`,
    ]
      .filter(Boolean)
      .join('');

    this.checkboxState = scanStore.isIncluded(element.id)
      ? vscode.TreeItemCheckboxState.Checked
      : vscode.TreeItemCheckboxState.Unchecked;

    this.iconPath = new vscode.ThemeIcon(
      element.bestLocator.unique ? 'symbol-field' : 'warning'
    );
  }
}

/**
 * Секции: свой tri-state чекбокс (SVG), т.к. TreeItemCheckboxState
 * поддерживает только Checked/Unchecked и ломается на mixed.
 */
export class SectionTreeItem extends vscode.TreeItem {
  constructor(
    public readonly sectionName: string,
    public readonly children: ElementTreeItem[],
    extensionUri: vscode.Uri
  ) {
    super(sectionName, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'section';
    this.id = `section:${sectionName}`;

    const childIds = children.map((c) => c.element.id);
    const includedCount = childIds.filter((id) => scanStore.isIncluded(id)).length;
    const total = childIds.length;
    const allOn = total > 0 && includedCount === total;
    const noneOn = includedCount === 0;
    const partial = !allOn && !noneOn;

    this.description = `${includedCount}/${total}`;
    this.iconPath = checkboxIcon(
      extensionUri,
      allOn ? 'checked' : partial ? 'mixed' : 'unchecked'
    );

    this.tooltip = partial
      ? t('tree.sectionPartialSelected', { included: includedCount, total })
      : allOn
        ? t('tree.sectionAllSelected')
        : t('tree.sectionNoneSelected');

    // Клик по названию секции = переключить всю группу (chevron слева — раскрыть/свернуть)
    this.command = {
      command: 'visualParser.toggleSectionForPom',
      title: t('tree.toggleSection'),
      arguments: [childIds],
    };
  }

  get childElementIds(): string[] {
    return this.children.map((c) => c.element.id);
  }
}

export type CatalogNode = SectionTreeItem | ElementTreeItem;

export class CatalogTreeProvider implements vscode.TreeDataProvider<CatalogNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<CatalogNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly extensionUri: vscode.Uri) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: CatalogNode): vscode.TreeItem {
    return element;
  }

  getParent(element: CatalogNode): CatalogNode | undefined {
    if (!(element instanceof ElementTreeItem)) {
      return undefined;
    }
    const name = sectionTitle(element.element.section);
    const kids = scanStore
      .getElements()
      .filter((el) => sectionTitle(el.section) === name)
      .map((el) => new ElementTreeItem(el));
    return new SectionTreeItem(name, kids, this.extensionUri);
  }

  /** Элемент дерева для TreeView.reveal */
  findElementItem(elementId: string): ElementTreeItem | undefined {
    const el = scanStore.findById(elementId);
    return el ? new ElementTreeItem(el) : undefined;
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
      ([name, items]) =>
        new SectionTreeItem(
          name,
          items.map((item) => new ElementTreeItem(item)),
          this.extensionUri
        )
    );
  }
}
