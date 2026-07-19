import * as fs from 'fs';
import * as path from 'path';
import type { GeneratorOptions, ScannedElement } from '../types';

const CYR_TO_LAT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Е: 'E', Ё: 'E', Ж: 'Zh', З: 'Z',
  И: 'I', Й: 'Y', К: 'K', Л: 'L', М: 'M', Н: 'N', О: 'O', П: 'P', Р: 'R',
  С: 'S', Т: 'T', У: 'U', Ф: 'F', Х: 'H', Ц: 'Ts', Ч: 'Ch', Ш: 'Sh', Щ: 'Sch',
  Ъ: '', Ы: 'Y', Ь: '', Э: 'E', Ю: 'Yu', Я: 'Ya',
};

function transliterate(value: string): string {
  return value
    .split('')
    .map((ch) => CYR_TO_LAT[ch] ?? ch)
    .join('');
}

function toPascalCase(value: string): string {
  const cleaned = transliterate(value)
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());
  return cleaned.join('') || 'Element';
}

function toCamelCase(value: string): string {
  const pascal = toPascalCase(value);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function uniqueName(base: string, used: Set<string>): string {
  let name = base || 'element';
  // нельзя начинать с цифры
  if (/^[0-9]/.test(name)) {
    name = `el${name}`;
  }
  let candidate = name;
  let i = 2;
  while (used.has(candidate)) {
    candidate = `${name}${i}`;
    i += 1;
  }
  used.add(candidate);
  return candidate;
}

function semanticLabel(el: ScannedElement): string | null {
  const raw =
    el.description ||
    el.label ||
    el.name ||
    el.roleName ||
    el.dataName ||
    el.testId ||
    el.placeholder ||
    el.text;
  if (!raw) {
    return null;
  }
  const normalized = raw.replace(/\s+/g, ' ').trim();
  if (!normalized || normalized.length > 80) {
    return null;
  }
  // отбрасываем бессмысленные «имена»
  if (/^(button|link|combobox|textbox|div|input|a)$/i.test(normalized)) {
    return null;
  }
  return normalized;
}

function hasNamedLocator(el: ScannedElement): boolean {
  if (el.dataName || el.testId || el.description) {
    return true;
  }
  const expr = el.bestLocator.expression;
  // getByRole('combobox') без name — мусор
  if (/getByRole\('(?:button|link|combobox|textbox|menuitem)'\)\s*$/.test(expr)) {
    return false;
  }
  if (el.bestLocator.warnings.includes('empty-name') && el.bestLocator.strategy === 'role') {
    return false;
  }
  return Boolean(semanticLabel(el));
}

function locatorFieldName(el: ScannedElement, used: Set<string>): string {
  const label = semanticLabel(el);
  const role = el.role || el.tag || 'el';

  if (role === 'combobox' || el.tag === 'select') {
    return uniqueName(toCamelCase(`${label || 'filter'} Select`), used);
  }
  if (role === 'textbox' || el.tag === 'textarea' || el.tag === 'input') {
    return uniqueName(toCamelCase(`${label || 'field'} Input`), used);
  }
  if (role === 'button' || el.tag === 'button') {
    return uniqueName(toCamelCase(`${label || 'action'} Button`), used);
  }
  if (role === 'link' || el.tag === 'a') {
    return uniqueName(toCamelCase(`${label || 'link'} Link`), used);
  }
  if (role === 'checkbox' || role === 'switch') {
    return uniqueName(toCamelCase(`${label || 'option'} Switch`), used);
  }
  return uniqueName(toCamelCase(`${label || role}`), used);
}

type ActionKind = 'fill' | 'check' | 'select' | 'click';

function actionForElement(el: ScannedElement): { kind: ActionKind; methodBase: string } | null {
  if (!el.interactive || el.disabled) {
    return null;
  }

  const label = semanticLabel(el);
  if (!label && !el.testId) {
    return null;
  }

  const source = label || el.testId || 'item';

  if (
    el.role === 'textbox' ||
    el.tag === 'textarea' ||
    el.inputType === 'email' ||
    el.inputType === 'password' ||
    el.inputType === 'text' ||
    el.inputType === 'search'
  ) {
    return { kind: 'fill', methodBase: toCamelCase(`fill ${source}`) };
  }

  if (el.role === 'checkbox' || el.role === 'switch' || el.inputType === 'checkbox') {
    return { kind: 'check', methodBase: toCamelCase(`toggle ${source}`) };
  }

  if (el.role === 'combobox' || el.tag === 'select') {
    return { kind: 'select', methodBase: toCamelCase(`select ${source}`) };
  }

  if (
    el.role === 'button' ||
    el.role === 'link' ||
    el.role === 'menuitem' ||
    el.tag === 'button' ||
    el.tag === 'a' ||
    el.inputType === 'submit'
  ) {
    return { kind: 'click', methodBase: toCamelCase(`click ${source}`) };
  }

  return null;
}

/** Ant Design / custom select: click → option, не native selectOption */
function methodBodyTs(fieldName: string, methodName: string, kind: ActionKind): string {
  if (kind === 'fill') {
    return `  async ${methodName}(value: string): Promise<void> {\n    await this.${fieldName}.fill(value);\n  }`;
  }
  if (kind === 'check') {
    return `  async ${methodName}(): Promise<void> {\n    await this.${fieldName}.click();\n  }`;
  }
  if (kind === 'select') {
    return [
      `  async ${methodName}(value: string): Promise<void> {`,
      `    await this.${fieldName}.click();`,
      `    await this.page.getByRole('option', { name: value }).click();`,
      `  }`,
    ].join('\n');
  }
  return `  async ${methodName}(): Promise<void> {\n    await this.${fieldName}.click();\n  }`;
}

function methodBodyJs(fieldName: string, methodName: string, kind: ActionKind): string {
  if (kind === 'fill') {
    return `  async ${methodName}(value) {\n    await this.${fieldName}.fill(value);\n  }`;
  }
  if (kind === 'check') {
    return `  async ${methodName}() {\n    await this.${fieldName}.click();\n  }`;
  }
  if (kind === 'select') {
    return [
      `  async ${methodName}(value) {`,
      `    await this.${fieldName}.click();`,
      `    await this.page.getByRole('option', { name: value }).click();`,
      `  }`,
    ].join('\n');
  }
  return `  async ${methodName}() {\n    await this.${fieldName}.click();\n  }`;
}

export function suggestClassName(pageTitle: string, pageUrl: string): string {
  try {
    const url = new URL(pageUrl);
    const last = url.pathname.split('/').filter(Boolean).pop();
    if (last) {
      return `${toPascalCase(last)}Page`;
    }
  } catch {
    // ignore
  }
  if (pageTitle) {
    return `${toPascalCase(pageTitle.split(/[|\-–]/)[0] || pageTitle)}Page`;
  }
  return 'GeneratedPage';
}

/** Элементы страницы для POM — без безымянных role и дублей. */
export function selectElementsForPageObject(elements: ScannedElement[]): ScannedElement[] {
  const filtered = elements.filter((el) => {
    // строки таблицы: только если есть стабильный data-name (глазик и т.п.) — один раз
    if (el.inDataRow && !el.dataName && !el.testId) {
      return false;
    }
    if (!hasNamedLocator(el)) {
      return false;
    }
    if (el.bestLocator.strategy === 'css') {
      const expr = el.bestLocator.expression;
      if (/nth-of-type|nth-child/i.test(expr)) {
        return false;
      }
      if (!semanticLabel(el) && !el.testId && !el.dataName) {
        return false;
      }
    }
    if (el.bestLocator.warnings.includes('nth-index') && el.bestLocator.strategy === 'css') {
      return false;
    }
    return true;
  });

  // дедуп: один combobox «РЕФ», один data-name="button_show_more"
  const seen = new Set<string>();
  const deduped: ScannedElement[] = [];
  for (const el of filtered) {
    const dataKey = el.dataName ? `data:${el.dataName}` : '';
    const label = (semanticLabel(el) || el.testId || '').toLowerCase();
    const role = el.role || el.tag;
    const key = dataKey || `${role}::${label}`;
    if (key && seen.has(key)) {
      continue;
    }
    if (key) {
      seen.add(key);
    }
    deduped.push(el);
  }

  return deduped;
}

export function generatePageObjectSource(options: GeneratorOptions): string {
  const fieldNames = new Set<string>();
  const methodNames = new Set<string>();
  const fields: string[] = [];
  const methods: string[] = [];
  const isTs = options.language === 'typescript';

  const tableRowCount = options.elements.filter((el) => el.inDataRow).length;
  const limited = selectElementsForPageObject(options.elements).slice(0, 60);

  for (const el of limited) {
    const fieldName = locatorFieldName(el, fieldNames);
    const locatorExpr = el.bestLocator.expression.replace(/^page\./, 'this.page.');
    if (isTs) {
      fields.push(`  private readonly ${fieldName} = ${locatorExpr};`);
    } else {
      fields.push(`    this.${fieldName} = ${locatorExpr};`);
    }

    const action = actionForElement(el);
    if (action) {
      const methodName = uniqueName(action.methodBase, methodNames);
      methods.push(
        isTs
          ? methodBodyTs(fieldName, methodName, action.kind)
          : methodBodyJs(fieldName, methodName, action.kind)
      );
    }
  }

  if (tableRowCount > 0 && isTs) {
    methods.push(
      [
        '  /** Строка таблицы по тексту ячейки */',
        '  rowByText(text: string) {',
        "    return this.page.getByRole('row').filter({ hasText: text });",
        '  }',
        '',
        '  async clickInRow(rowText: string, name: string | RegExp): Promise<void> {',
        "    await this.rowByText(rowText).getByRole('button', { name }).click();",
        '  }',
      ].join('\n')
    );
  }

  const header = [
    '/**',
    ' * Сгенерировано Visual Parser.',
    ` * URL: ${options.pageUrl}`,
    ` * Элементов в POM: ${limited.length}` +
      (tableRowCount ? ` (строк таблицы пропущено: ${tableRowCount})` : ''),
    ' * Локаторы private; наружу — user actions.',
    ' */',
    '',
  ].join('\n');

  if (isTs) {
    return [
      header,
      "import { type Page } from '@playwright/test';",
      '',
      `export class ${options.className} {`,
      '  constructor(private readonly page: Page) {}',
      '',
      ...fields,
      '',
      ...methods,
      '}',
      '',
    ].join('\n');
  }

  return [
    header,
    `class ${options.className} {`,
    '  /**',
    '   * @param {import("@playwright/test").Page} page',
    '   */',
    '  constructor(page) {',
    '    this.page = page;',
    ...fields,
    '  }',
    '',
    ...methods,
    '}',
    '',
    `module.exports = { ${options.className} };`,
    '',
  ].join('\n');
}

export interface WritePageObjectResult {
  filePath: string;
  className: string;
  created: boolean;
}

export function writePageObject(
  options: GeneratorOptions,
  overwrite: boolean
): WritePageObjectResult {
  const dir = path.dirname(options.filePath);
  fs.mkdirSync(dir, { recursive: true });

  const exists = fs.existsSync(options.filePath);
  if (exists && !overwrite) {
    const parsed = path.parse(options.filePath);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const alt = path.join(parsed.dir, `${parsed.name}.updated-${stamp}${parsed.ext}`);
    fs.writeFileSync(alt, generatePageObjectSource(options), 'utf8');
    return { filePath: alt, className: options.className, created: true };
  }

  fs.writeFileSync(options.filePath, generatePageObjectSource(options), 'utf8');
  return { filePath: options.filePath, className: options.className, created: !exists };
}

export function defaultPageFileName(className: string, language: 'typescript' | 'javascript'): string {
  const base = className
    .replace(/Page$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
  const ext = language === 'typescript' ? '.page.ts' : '.page.js';
  return `${base || 'generated'}${ext}`;
}
