import { warningLabelI18n } from '../i18n';
import type { LocatorCandidate, LocatorStrategy, ScannedElement, WarningCode } from '../types';

interface RawSignals {
  tag: string;
  role: string | null;
  name: string | null;
  roleName: string | null;
  label: string | null;
  placeholder: string | null;
  testId: string | null;
  dataName: string | null;
  description: string | null;
  text: string | null;
  cssPath: string;
  inputType: string | null;
  inIframe: boolean;
  inShadow: boolean;
}

function escapeForSingleQuotes(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function looksDynamicClass(cssPath: string): boolean {
  return /(?:^|[.#])(?:css-|sc-|jsx-|emotion-|svelte-|ng-|v-|_)/i.test(cssPath)
    || /[a-z]+-[a-z0-9]{5,}/i.test(cssPath);
}

function roleExpression(role: string, name: string | null): string {
  if (name && name.trim()) {
    return `page.getByRole('${escapeForSingleQuotes(role)}', { name: '${escapeForSingleQuotes(name.trim())}' })`;
  }
  return `page.getByRole('${escapeForSingleQuotes(role)}')`;
}

function buildCandidates(signals: RawSignals, preferTestId: boolean): LocatorCandidate[] {
  const warningsBase: WarningCode[] = [];
  if (signals.inIframe) {
    warningsBase.push('iframe');
  }
  if (signals.inShadow) {
    warningsBase.push('shadow');
  }

  const candidates: LocatorCandidate[] = [];

  if (signals.testId) {
    candidates.push({
      strategy: 'testid',
      expression: `page.getByTestId('${escapeForSingleQuotes(signals.testId)}')`,
      score: preferTestId ? 100 : 90,
      unique: true,
      warnings: [...warningsBase],
    });
  }

  // data-name="button_show_more" — лучший выбор для icon-only кнопок
  if (signals.dataName) {
    candidates.push({
      strategy: 'data-name',
      expression: `page.locator('[data-name="${escapeForSingleQuotes(signals.dataName)}"]')`,
      score: preferTestId ? 92 : 96,
      unique: true,
      warnings: [...warningsBase],
    });
    // иногда name= дублирует data-name
    if (signals.dataName.startsWith('button_') || signals.dataName.startsWith('btn_')) {
      candidates.push({
        strategy: 'data-name',
        expression: `page.locator('[name="${escapeForSingleQuotes(signals.dataName)}"]')`,
        score: 88,
        unique: true,
        warnings: [...warningsBase],
      });
    }
  }

  const roleAccessibleName = signals.roleName || signals.label || null;
  if (signals.role) {
    const textDependent = Boolean(roleAccessibleName?.trim());
    const warnings: WarningCode[] = [...warningsBase];
    if (textDependent) {
      warnings.push('text-dependent');
    } else {
      warnings.push('empty-name');
    }
    candidates.push({
      strategy: 'role',
      expression: roleExpression(signals.role, roleAccessibleName),
      score: roleAccessibleName ? (preferTestId ? 80 : 90) : 20,
      unique: true,
      warnings,
    });
  }

  if (signals.label) {
    candidates.push({
      strategy: 'label',
      expression: `page.getByLabel('${escapeForSingleQuotes(signals.label)}')`,
      score: 85,
      unique: true,
      warnings: [...warningsBase, 'text-dependent'],
    });
  }

  if (signals.placeholder) {
    candidates.push({
      strategy: 'placeholder',
      expression: `page.getByPlaceholder('${escapeForSingleQuotes(signals.placeholder)}')`,
      score: 75,
      unique: true,
      warnings: [...warningsBase, 'text-dependent'],
    });
  }

  if (signals.text && signals.text.trim().length > 0 && signals.text.trim().length <= 60) {
    candidates.push({
      strategy: 'text',
      expression: `page.getByText('${escapeForSingleQuotes(signals.text.trim())}', { exact: true })`,
      score: 55,
      unique: true,
      warnings: [...warningsBase, 'text-dependent'],
    });
  }

  if (signals.cssPath) {
    const warnings: WarningCode[] = [...warningsBase, 'css-fallback'];
    if (looksDynamicClass(signals.cssPath)) {
      warnings.push('dynamic-class');
    }
    if (/:nth-of-type\(|:nth-child\(/i.test(signals.cssPath)) {
      warnings.push('nth-index');
    }
    const nth = /:nth-of-type\(|:nth-child\(/i.test(signals.cssPath);
    candidates.push({
      strategy: 'css',
      expression: `page.locator('${escapeForSingleQuotes(signals.cssPath)}')`,
      score: nth ? 5 : 25,
      unique: true,
      warnings,
    });
  }

  return candidates.sort((a, b) => b.score - a.score);
}

export function pickBestLocator(candidates: LocatorCandidate[]): LocatorCandidate {
  const preferred = candidates.find(
    (c) =>
      c.unique &&
      (c.strategy === 'data-name' || c.strategy === 'testid') &&
      !c.warnings.includes('empty-name')
  );
  if (preferred) {
    return preferred;
  }
  const named = candidates.find(
    (c) => c.unique && c.strategy !== 'css' && !c.warnings.includes('empty-name')
  );
  if (named) {
    return named;
  }
  const uniqueNonCss = candidates.find((c) => c.unique && c.strategy !== 'css');
  if (uniqueNonCss) {
    return uniqueNonCss;
  }
  const unique = candidates.find((c) => c.unique && !c.warnings.includes('nth-index'));
  return unique ?? candidates[0] ?? {
    strategy: 'css' as LocatorStrategy,
    expression: "page.locator('body')",
    score: 0,
    unique: false,
    warnings: ['not-unique', 'css-fallback'],
  };
}

function wrapForFrame(expression: string, framePath: string[]): string {
  if (!framePath.length) {
    return expression;
  }
  const frame = framePath[0];
  const frameExpr = frame.startsWith('http')
    ? `page.frameLocator('iframe[src="${escapeForSingleQuotes(frame)}"]')`
    : `page.frameLocator('iframe[name="${escapeForSingleQuotes(frame)}"]')`;
  return expression.replace(/^page\./, `${frameExpr}.`);
}

export function enrichWithLocators(
  element: Omit<ScannedElement, 'candidates' | 'bestLocator'>,
  preferTestId: boolean
): ScannedElement {
  const candidates = buildCandidates(element, preferTestId).map((candidate) => ({
    ...candidate,
    expression: wrapForFrame(candidate.expression, element.framePath),
  }));
  return {
    ...element,
    candidates,
    bestLocator: pickBestLocator(candidates),
  };
}

export function markUniqueness(elements: ScannedElement[]): ScannedElement[] {
  const expressionCounts = new Map<string, number>();

  for (const el of elements) {
    for (const candidate of el.candidates) {
      expressionCounts.set(
        candidate.expression,
        (expressionCounts.get(candidate.expression) ?? 0) + 1
      );
    }
  }

  return elements.map((el) => {
    const candidates = el.candidates.map((candidate) => {
      const count = expressionCounts.get(candidate.expression) ?? 0;
      // data-name в строках таблицы повторяется намеренно — это шаблон, не ошибка
      const isRowTemplate =
        candidate.strategy === 'data-name' ||
        (Boolean(el.dataName) && el.inDataRow) ||
        (el.inDataRow && count > 1 && candidate.strategy !== 'css');

      const unique = count === 1 || isRowTemplate;
      const warnings: WarningCode[] = unique
        ? candidate.warnings.filter((w) => w !== 'not-unique')
        : Array.from(new Set<WarningCode>([...candidate.warnings, 'not-unique']));

      if (isRowTemplate && count > 1 && !warnings.includes('row-template')) {
        warnings.push('row-template');
      }

      return {
        ...candidate,
        unique,
        score:
          unique || isRowTemplate
            ? candidate.score
            : Math.max(0, candidate.score - 40),
        warnings,
      };
    }).sort((a, b) => b.score - a.score);

    return {
      ...el,
      candidates,
      bestLocator: pickBestLocator(candidates),
    };
  });
}

/**
 * Один элемент в каталоге на смысл: data-name / testid / описание.
 * Строки таблицы не плодят 20 одинаковых «глазиков» и nth-switch.
 */
export function dedupeCatalogElements(elements: ScannedElement[]): ScannedElement[] {
  const quality = (el: ScannedElement): number => {
    let score = el.bestLocator.score;
    if (el.dataName) {
      score += 80;
    }
    if (el.testId) {
      score += 70;
    }
    if (el.description) {
      score += 40;
    }
    if (el.roleName || el.label || el.name) {
      score += 20;
    }
    if (el.bestLocator.strategy === 'css') {
      score -= 60;
    }
    if (el.bestLocator.warnings.includes('nth-index')) {
      score -= 80;
    }
    if (el.inDataRow && !el.dataName && !el.testId) {
      score -= 100;
    }
    return score;
  };

  const sorted = [...elements].sort((a, b) => quality(b) - quality(a));
  const seen = new Set<string>();
  const result: ScannedElement[] = [];

  for (const el of sorted) {
    // мусор: свитчи/кнопки строк только через nth-css
    if (
      el.inDataRow &&
      !el.dataName &&
      !el.testId &&
      !el.description &&
      (el.bestLocator.strategy === 'css' || el.bestLocator.warnings.includes('nth-index'))
    ) {
      continue;
    }

    // безымянный css на странице — не показываем
    if (
      el.bestLocator.strategy === 'css' &&
      !el.dataName &&
      !el.testId &&
      !el.description &&
      !el.label &&
      !el.roleName &&
      (!el.name || /^(button|link|a|div)$/i.test(el.name))
    ) {
      continue;
    }

    let key: string | null = null;
    if (el.dataName) {
      key = `data:${el.dataName}`;
    } else if (el.testId) {
      key = `testid:${el.testId}`;
    } else if (el.description) {
      key = `desc:${el.role || el.tag}:${el.description.toLowerCase()}`;
    } else if (
      el.bestLocator.strategy === 'data-name' ||
      el.bestLocator.strategy === 'testid' ||
      el.bestLocator.strategy === 'label' ||
      (el.bestLocator.strategy === 'role' && !el.bestLocator.warnings.includes('empty-name'))
    ) {
      key = `expr:${el.bestLocator.expression}`;
    } else if (el.name || el.label || el.roleName) {
      key = `named:${el.role || el.tag}:${(el.name || el.label || el.roleName || '').toLowerCase()}`;
    } else {
      continue;
    }

    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    // в каталоге — один шаблон; убираем «не уникален» у data-name строк
    if (el.dataName || el.bestLocator.warnings.includes('row-template')) {
      const warnings: WarningCode[] = el.bestLocator.warnings.filter((w) => w !== 'not-unique');
      if ((el.inDataRow || el.dataName) && !warnings.includes('row-template')) {
        warnings.push('row-template');
      }

      result.push({
        ...el,
        bestLocator: {
          ...el.bestLocator,
          unique: true,
          warnings,
        },
      });
    } else {
      result.push(el);
    }
  }

  // сначала контролы страницы, потом шаблоны строк
  return result.sort((a, b) => Number(a.inDataRow) - Number(b.inDataRow));
}

export function warningLabel(code: WarningCode): string {
  return warningLabelI18n(code);
}
