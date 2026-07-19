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

/** Имя из выражения локатора — обычно короче и точнее, чем сырой accessible name. */
function nameFromLocatorExpression(expr: string): string | null {
  const patterns = [
    /getByRole\([^)]*name:\s*['"]([^'"]+)['"]/,
    /getByLabel\(\s*['"]([^'"]+)['"]/,
    /getByPlaceholder\(\s*['"]([^'"]+)['"]/,
    /getByText\(\s*['"]([^'"]+)['"]/,
    /getByTestId\(\s*['"]([^'"]+)['"]/,
  ];
  for (const re of patterns) {
    const m = expr.match(re);
    if (m?.[1]) {
      return m[1].replace(/\s+/g, ' ').trim();
    }
  }
  return null;
}

const NAME_STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'to', 'of', 'in', 'for', 'with', 'on', 'at',
  'by', 'from', 'full', 'sized', 'size', 'your', 'my', 'our', 'this', 'that',
]);

/**
 * Сжимает длинный accessible name в короткое человекочитаемое имя поля.
 * "Follow 0 followers · 1 following Netherlands" → "follow"
 * "Contribution activity in 2026, 1 of 9" → "contribution 2026"
 */
function beautifyNameSource(raw: string): string {
  let s = raw.replace(/\s+/g, ' ').trim();

  const contrib = s.match(/contribution\s+activity\s+in\s+(\d{4})/i);
  if (contrib) {
    return `contribution ${contrib[1]}`;
  }

  if (/^follow\b/i.test(s) && /follower/i.test(s)) {
    return 'follow';
  }

  if (/\bavatar\b/i.test(s)) {
    return 'avatar';
  }

  if (/^overview\b/i.test(s) && /repositor/i.test(s)) {
    return 'profile nav';
  }

  // убрать глаголы-префиксы
  s = s.replace(/^(view|go to|open|click|show|hide|toggle|visit|see)\s+/i, '');

  // счётчики и «1 of 9»
  s = s.replace(/,?\s*\d+\s+of\s+\d+/gi, '');
  s = s.replace(
    /\b\d+\s*(followers?|following|projects?|packages?|stars?|repositories|repos?)\b/gi,
    ''
  );
  s = s.replace(/[·•|]+/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();

  // data-name / testid style
  if (/^[a-z0-9]+(?:[_-][a-z0-9]+)+$/i.test(s)) {
    s = s.replace(/^(btn|button|link|input|field)_?/i, '').replace(/[_-]+/g, ' ');
  }

  const words = s
    .split(/[^a-zA-Z0-9а-яА-ЯёЁ]+/)
    .filter(Boolean)
    .filter((w) => !NAME_STOPWORDS.has(w.toLowerCase()))
    .slice(0, 3);

  if (words.length === 0) {
    return 'element';
  }

  return words.join(' ');
}

function roleSuffix(el: ScannedElement): string {
  const role = el.role || el.tag || '';
  if (role === 'combobox' || el.tag === 'select') {
    return 'Select';
  }
  if (
    role === 'textbox' ||
    role === 'searchbox' ||
    el.tag === 'textarea' ||
    el.tag === 'input' ||
    el.inputType === 'text' ||
    el.inputType === 'search' ||
    el.inputType === 'email' ||
    el.inputType === 'password'
  ) {
    return 'Input';
  }
  if (role === 'checkbox' || role === 'switch') {
    return 'Switch';
  }
  if (role === 'button' || el.tag === 'button' || el.inputType === 'submit') {
    return 'Button';
  }
  if (role === 'link' || el.tag === 'a') {
    return 'Link';
  }
  return '';
}

function locatorFieldName(el: ScannedElement, used: Set<string>): string {
  // приоритет коротких стабильных имён
  const fromData = el.dataName || el.testId;
  const fromLocator = nameFromLocatorExpression(el.bestLocator.expression);
  const fromSemantics =
    el.description || el.label || el.placeholder || el.roleName || el.name || el.text;

  const candidates = [fromData, fromLocator, fromSemantics].filter(
    (v): v is string => Boolean(v && String(v).trim())
  );

  // берём самый короткий осмысленный источник (после beautify), но не пустой
  let bestBase = 'element';
  let bestLen = Infinity;
  for (const c of candidates) {
    const nice = beautifyNameSource(c);
    if (!nice || nice === 'element') {
      continue;
    }
    if (nice.length < bestLen) {
      bestLen = nice.length;
      bestBase = nice;
    }
  }

  const suffix = roleSuffix(el);
  let field = toCamelCase(bestBase);

  // не дублировать Link/Button в конце
  if (suffix) {
    const lower = field.toLowerCase();
    const suf = suffix.toLowerCase();
    if (!lower.endsWith(suf)) {
      field = toCamelCase(`${bestBase} ${suffix}`);
    }
  }

  // жёсткий потолок длины имени
  if (field.length > 40) {
    field = field.slice(0, 40);
    // не резать посередине так, чтобы осталась цифра в конце без букв — просто trim
    field = field.replace(/[0-9]+$/, '');
    if (!field) {
      field = 'element';
    }
  }

  return uniqueName(field, used);
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

function tableHelpersTs(): string {
  return [
    '  /** Строка таблицы по тексту ячейки */',
    '  rowByText(text: string) {',
    "    return this.page.getByRole('row').filter({ hasText: text });",
    '  }',
    '',
    '  /** Кнопка внутри строки таблицы */',
    '  buttonInRow(rowText: string, name: string | RegExp) {',
    "    return this.rowByText(rowText).getByRole('button', { name });",
    '  }',
  ].join('\n');
}

function tableHelpersJs(): string {
  return [
    '  /** Строка таблицы по тексту ячейки */',
    '  rowByText(text) {',
    "    return this.page.getByRole('row').filter({ hasText: text });",
    '  }',
    '',
    '  /** Кнопка внутри строки таблицы */',
    '  buttonInRow(rowText, name) {',
    "    return this.rowByText(rowText).getByRole('button', { name });",
    '  }',
  ].join('\n');
}

export function generatePageObjectSource(options: GeneratorOptions): string {
  const fieldNames = new Set<string>();
  const fields: string[] = [];
  const isTs = options.language === 'typescript';

  const tableRowCount = options.elements.filter((el) => el.inDataRow).length;
  const limited = (
    options.fromSelection ? options.elements : selectElementsForPageObject(options.elements)
  ).slice(0, 60);

  for (const el of limited) {
    const fieldName = locatorFieldName(el, fieldNames);
    const locatorExpr = el.bestLocator.expression.replace(/^page\./, 'this.page.');
    if (isTs) {
      fields.push(`  readonly ${fieldName} = ${locatorExpr};`);
    } else {
      fields.push(`    this.${fieldName} = ${locatorExpr};`);
    }
  }

  const helpers: string[] = [];
  if (tableRowCount > 0 || limited.some((el) => el.inDataRow)) {
    helpers.push(isTs ? tableHelpersTs() : tableHelpersJs());
  }

  const header = [
    '/**',
    ' * Сгенерировано Visual Parser.',
    ` * URL: ${options.pageUrl}`,
    ` * Элементов в POM: ${limited.length}` +
      (options.fromSelection ? ' (выбраны галочками в каталоге)' : '') +
      (!options.fromSelection && tableRowCount ? ` (строк таблицы пропущено: ${tableRowCount})` : ''),
    ' * Локаторы — readonly; в тесте: await pom.signInButton.click() / .fill() / expect(...).',
    ' */',
    '',
  ].join('\n');

  if (isTs) {
    return [
      header,
      "import { type Page } from '@playwright/test';",
      '',
      `export class ${options.className} {`,
      '  constructor(readonly page: Page) {}',
      '',
      ...fields,
      ...(helpers.length ? ['', ...helpers] : []),
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
    ...(helpers.length ? ['', ...helpers] : []),
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
