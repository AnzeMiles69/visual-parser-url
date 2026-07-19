/**
 * Runs inside the browser via page.evaluate.
 * Kept as a stringifiable function body shape through a regular function export.
 */
export function extractDomElements(): Array<{
  id: string;
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
  href: string | null;
  inputType: string | null;
  interactive: boolean;
  visible: boolean;
  disabled: boolean;
  inIframe: boolean;
  inShadow: boolean;
  inDataRow: boolean;
  framePath: string[];
  section: string | null;
  bbox: { x: number; y: number; width: number; height: number } | null;
  cssPath: string;
}> {
  const INTERACTIVE_SELECTOR = [
    'a[href]',
    'button',
    'input:not([type="hidden"])',
    'select',
    'textarea',
    'summary',
    '[role="button"]',
    '[role="link"]',
    '[role="textbox"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="combobox"]',
    '[role="listbox"]',
    '[role="menuitem"]',
    '[role="tab"]',
    '[role="switch"]',
    '[role="searchbox"]',
    '[aria-haspopup="listbox"]',
    '[aria-haspopup="menu"]',
    '[aria-autocomplete="list"]',
    '[aria-autocomplete="both"]',
    '[contenteditable="true"]',
    '[data-testid]',
    // Ant Design / MUI / custom selects — видимая оболочка
    '.ant-select',
    '.ant-select-selector',
    '.ant-picker',
    '.ant-cascader-picker',
    '.MuiSelect-select',
    '.MuiAutocomplete-root',
    '[class*="select-selector"]',
    '[class*="SelectTrigger"]',
  ].join(',');

  const ROLE_MAP: Record<string, string> = {
    A: 'link',
    BUTTON: 'button',
    INPUT: 'textbox',
    SELECT: 'combobox',
    TEXTAREA: 'textbox',
    SUMMARY: 'button',
  };

  function isVisible(el: Element): boolean {
    const htmlEl = el as HTMLElement;
    const style = window.getComputedStyle(htmlEl);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
    const rect = htmlEl.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  /** Для Ant Select input часто opacity:0 / height:0 — смотрим видимого родителя. */
  function getVisibleTarget(el: Element): HTMLElement | null {
    const htmlEl = el as HTMLElement;
    if (isVisible(htmlEl) && Number(window.getComputedStyle(htmlEl).opacity) > 0.01) {
      return htmlEl;
    }

    const shell = htmlEl.closest(
      '.ant-select, .ant-select-selector, .ant-picker, .MuiSelect-root, .MuiAutocomplete-root, [class*="select-selector"], [aria-haspopup="listbox"]'
    ) as HTMLElement | null;

    if (shell && isVisible(shell)) {
      return shell;
    }

    let parent: HTMLElement | null = htmlEl.parentElement;
    for (let i = 0; i < 4 && parent; i += 1) {
      if (isVisible(parent) && parent.getBoundingClientRect().height >= 20) {
        return parent;
      }
      parent = parent.parentElement;
    }

    return isVisible(htmlEl) ? htmlEl : null;
  }

  function cssEscapeIdent(value: string): string {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(value);
    }
    return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  function buildCssPath(el: Element): string {
    const parts: string[] = [];
    let current: Element | null = el;
    let depth = 0;
    while (current && current.nodeType === 1 && depth < 6) {
      const tag = current.tagName.toLowerCase();
      if (current.id) {
        parts.unshift(`#${cssEscapeIdent(current.id)}`);
        break;
      }
      const testId = current.getAttribute('data-testid');
      if (testId) {
        parts.unshift(`[data-testid="${testId.replace(/"/g, '\\"')}"]`);
        break;
      }
      const parent: Element | null = current.parentElement;
      if (!parent) {
        parts.unshift(tag);
        break;
      }
      const siblings = Array.from(parent.children).filter((c) => c.tagName === current!.tagName);
      const part =
        siblings.length > 1
          ? `${tag}:nth-of-type(${siblings.indexOf(current) + 1})`
          : tag;
      parts.unshift(part);
      current = parent;
      depth += 1;
    }
    return parts.join(' > ');
  }

  function normalizeLabelText(value: string): string {
    return value.replace(/\s+/g, ' ').replace(/[：:]\s*$/, '').trim();
  }

  function getNearbyFieldLabel(el: Element): string | null {
    const htmlEl = el as HTMLElement;

    // Ant Design Form.Item
    const formItem = htmlEl.closest('.ant-form-item, .ant-row, [class*="FormItem"], [class*="form-item"]');
    if (formItem) {
      const antLabel = formItem.querySelector(
        '.ant-form-item-label label, .ant-form-item-label, label, [class*="FormLabel"], legend'
      );
      const text = antLabel?.textContent ? normalizeLabelText(antLabel.textContent) : '';
      if (text && text.length <= 80) {
        return text;
      }
    }

    // label выше контрола в одной колонке фильтра
    const container = htmlEl.closest('div, td, li, fieldset') ?? htmlEl.parentElement;
    if (container) {
      const directLabel = container.querySelector(':scope > label, :scope > .label, :scope > span.label');
      if (directLabel?.textContent) {
        const text = normalizeLabelText(directLabel.textContent);
        if (text && text.length <= 80 && !directLabel.contains(htmlEl)) {
          return text;
        }
      }

      let prev = container.previousElementSibling;
      for (let i = 0; i < 2 && prev; i += 1) {
        const text = normalizeLabelText(prev.textContent || '');
        if (
          text &&
          text.length > 0 &&
          text.length <= 60 &&
          !prev.querySelector('input,select,textarea,[role="combobox"],.ant-select')
        ) {
          return text;
        }
        prev = prev.previousElementSibling;
      }
    }

    // родитель с подписью-первым ребёнком
    const parent = htmlEl.parentElement;
    if (parent) {
      const first = parent.firstElementChild;
      if (first && first !== htmlEl && !first.contains(htmlEl)) {
        const tag = first.tagName.toLowerCase();
        if (tag === 'label' || tag === 'span' || tag === 'p' || tag === 'div') {
          const text = normalizeLabelText(first.textContent || '');
          if (text && text.length <= 60 && !first.querySelector('input,select,.ant-select')) {
            return text;
          }
        }
      }
    }

    return null;
  }

  function getLabel(el: Element): string | null {
    const htmlEl = el as HTMLElement;
    if (htmlEl.id) {
      const label = document.querySelector(`label[for="${cssEscapeIdent(htmlEl.id)}"]`);
      if (label?.textContent?.trim()) {
        return normalizeLabelText(label.textContent);
      }
    }
    const wrapped = htmlEl.closest('label');
    if (wrapped?.textContent?.trim()) {
      const clone = wrapped.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('input,select,textarea,.ant-select').forEach((n) => n.remove());
      const text = normalizeLabelText(clone.textContent || '');
      if (text) {
        return text;
      }
    }
    const aria = htmlEl.getAttribute('aria-label');
    if (aria?.trim()) {
      return normalizeLabelText(aria);
    }
    return getNearbyFieldLabel(el);
  }

  function getDataName(el: Element): string | null {
    const htmlEl = el as HTMLElement;
    const fromData =
      htmlEl.getAttribute('data-name') ||
      htmlEl.getAttribute('data-testid') ||
      htmlEl.getAttribute('data-qa') ||
      htmlEl.getAttribute('data-test');
    if (fromData?.trim()) {
      return fromData.trim();
    }
    // name="button_show_more" на button/a (не путать с input name формы без смысла)
    const nameAttr = htmlEl.getAttribute('name');
    if (nameAttr && /^(button_|btn_|link_|action_|icon_)/i.test(nameAttr)) {
      return nameAttr.trim();
    }
    return null;
  }

  function getDescription(el: Element): string | null {
    const htmlEl = el as HTMLElement;
    const desc =
      htmlEl.getAttribute('description') ||
      htmlEl.getAttribute('data-description') ||
      htmlEl.getAttribute('title') ||
      htmlEl.getAttribute('aria-description');
    if (desc?.trim()) {
      return normalizeLabelText(desc);
    }
    return null;
  }

  /** aria-label у потомка: <span role="img" aria-label="eye"> */
  function getNestedAriaLabel(el: Element): string | null {
    const nested = el.querySelector(
      '[aria-label], img[alt], svg[aria-label], [role="img"][aria-label]'
    );
    if (!nested) {
      return null;
    }
    const aria = nested.getAttribute('aria-label')?.trim();
    if (aria) {
      return normalizeLabelText(aria);
    }
    const alt = nested.getAttribute('alt')?.trim();
    if (alt) {
      return normalizeLabelText(alt);
    }
    return null;
  }

  function getAccessibleName(el: Element, label: string | null): string | null {
    const htmlEl = el as HTMLElement;

    // 1) человекочитаемое description (глазик → «Детали по аномалиям»)
    const description = getDescription(el);
    if (description) {
      return description;
    }

    if (label) {
      return label;
    }

    const aria = htmlEl.getAttribute('aria-label')?.trim();
    if (aria) {
      return normalizeLabelText(aria);
    }

    // 2) иконка внутри: aria-label="eye"
    const nestedAria = getNestedAriaLabel(el);
    if (nestedAria) {
      return nestedAria;
    }

    const labelledBy = htmlEl.getAttribute('aria-labelledby');
    if (labelledBy) {
      const text = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
        .filter(Boolean)
        .join(' ');
      if (text) {
        return normalizeLabelText(text);
      }
    }

    if (htmlEl.tagName === 'INPUT' || htmlEl.tagName === 'BUTTON') {
      const value = (htmlEl as HTMLInputElement).value?.trim();
      if (htmlEl.tagName === 'BUTTON' && value) {
        return value;
      }
      if ((htmlEl as HTMLInputElement).type === 'submit' && value) {
        return value;
      }
    }

    const title = htmlEl.getAttribute('title')?.trim();
    if (title) {
      return normalizeLabelText(title);
    }

    // data-name как последний смысловой fallback для каталога
    const dataName = getDataName(el);
    if (dataName) {
      return dataName.replace(/^button_/, '').replace(/_/g, ' ');
    }

    const isSelectShell =
      htmlEl.classList.contains('ant-select') ||
      htmlEl.classList.contains('ant-select-selector') ||
      htmlEl.getAttribute('role') === 'combobox' ||
      htmlEl.tagName === 'SELECT';

    if (!isSelectShell) {
      const text = htmlEl.innerText?.trim() || htmlEl.textContent?.trim() || '';
      if (text && text.length <= 80) {
        return normalizeLabelText(text);
      }
    }

    return null;
  }

  function inferRole(el: Element): string | null {
    const explicit = el.getAttribute('role');
    if (explicit) {
      return explicit;
    }

    const className = typeof (el as HTMLElement).className === 'string'
      ? (el as HTMLElement).className
      : '';

    if (
      el.classList.contains('ant-select') ||
      el.classList.contains('ant-select-selector') ||
      el.classList.contains('MuiSelect-select') ||
      /select-selector|SelectTrigger/i.test(className) ||
      el.getAttribute('aria-haspopup') === 'listbox' ||
      el.getAttribute('aria-autocomplete')
    ) {
      return 'combobox';
    }

    if (el.classList.contains('ant-picker')) {
      return 'textbox';
    }

    const tag = el.tagName;
    if (tag === 'INPUT') {
      const type = ((el as HTMLInputElement).type || 'text').toLowerCase();
      if (type === 'checkbox') {
        return 'checkbox';
      }
      if (type === 'radio') {
        return 'radio';
      }
      if (type === 'submit' || type === 'button' || type === 'reset') {
        return 'button';
      }
      if (type === 'search') {
        return 'searchbox';
      }
      // Ant select search input
      if (el.classList.contains('ant-select-selection-search-input') || el.closest('.ant-select')) {
        return 'combobox';
      }
      return 'textbox';
    }
    return ROLE_MAP[tag] ?? null;
  }

  function findSection(el: Element): string | null {
    const landmark = el.closest(
      'form, nav, header, footer, main, section, article, [role="dialog"], [aria-label], .ant-collapse-item, [class*="Filter"]'
    );
    if (!landmark) {
      return null;
    }
    const aria = landmark.getAttribute('aria-label')?.trim();
    if (aria) {
      return aria;
    }
    const heading = landmark.querySelector(
      'h1,h2,h3,h4,legend,.ant-collapse-header, [class*="filter"] > span, [class*="Filter"] > span'
    );
    if (heading?.textContent?.trim()) {
      return heading.textContent.trim().slice(0, 80);
    }
    return landmark.tagName.toLowerCase();
  }

  function inShadow(el: Element): boolean {
    const root = el.getRootNode();
    return root instanceof ShadowRoot;
  }

  function isInDataRow(el: Element): boolean {
    const row = el.closest(
      'tbody tr, .ant-table-tbody tr, .ant-table-row, [class*="table-row"], [role="row"]'
    );
    if (!row) {
      return false;
    }
    // header rows не считаем data-row
    if (row.closest('thead') || row.getAttribute('aria-rowindex') === '1') {
      const th = row.querySelector('th');
      if (th) {
        return false;
      }
    }
    return Boolean(row.closest('table, .ant-table, [role="table"], [class*="Table"]'));
  }

  function dedupeKey(target: HTMLElement, role: string | null, label: string | null): string {
    const shell = target.closest('.ant-select, .ant-picker, .MuiAutocomplete-root') as HTMLElement | null;
    if (shell) {
      return `shell:${shell.getBoundingClientRect().x}|${shell.getBoundingClientRect().y}|${label || role}`;
    }
    const rect = target.getBoundingClientRect();
    return `box:${Math.round(rect.x)}|${Math.round(rect.y)}|${Math.round(rect.width)}|${label || role || target.tagName}`;
  }

  const nodeList = Array.from(document.querySelectorAll(INTERACTIVE_SELECTOR));
  const results: ReturnType<typeof extractDomElements> = [];
  const seen = new Set<string>();
  let index = 0;

  for (const el of nodeList) {
    const target = getVisibleTarget(el);
    if (!target) {
      continue;
    }

    const role = inferRole(el) || inferRole(target);
    const label = getLabel(el) || getLabel(target);
    const descriptionEarly = getDescription(target) || getDescription(el);
    const nestedAria = getNestedAriaLabel(target) || getNestedAriaLabel(el);
    const selfAria =
      (target as HTMLElement).getAttribute('aria-label')?.trim() ||
      (el as HTMLElement).getAttribute('aria-label')?.trim() ||
      null;
    // для getByRole — только то, что в a11y tree (не кастомный description=)
    const roleName =
      (selfAria && normalizeLabelText(selfAria)) ||
      nestedAria ||
      label ||
      null;
    // для каталога — человекочитаемое название глазика и т.п.
    const name =
      descriptionEarly ||
      getAccessibleName(target, label) ||
      getAccessibleName(el, label) ||
      roleName;
    const key = dedupeKey(target, role, label || name || descriptionEarly);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const htmlEl = target;
    const tag = htmlEl.tagName.toLowerCase();
    const placeholder =
      htmlEl.getAttribute('placeholder') ||
      el.getAttribute('placeholder') ||
      htmlEl.querySelector?.('.ant-select-selection-placeholder')?.textContent?.trim() ||
      null;
    const testId =
      htmlEl.getAttribute('data-testid') ||
      el.getAttribute('data-testid') ||
      htmlEl.closest('[data-testid]')?.getAttribute('data-testid') ||
      null;
    const dataName = getDataName(htmlEl) || getDataName(el);
    const description = getDescription(htmlEl) || getDescription(el);
    const text =
      role === 'combobox'
        ? null
        : (htmlEl.innerText || htmlEl.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80) || null;
    const href = tag === 'a' ? htmlEl.getAttribute('href') : null;
    const inputType = tag === 'input' ? ((htmlEl as HTMLInputElement).type || 'text') : null;
    const disabled =
      htmlEl.hasAttribute('disabled') ||
      htmlEl.getAttribute('aria-disabled') === 'true' ||
      el.hasAttribute('disabled') ||
      el.getAttribute('aria-disabled') === 'true' ||
      Boolean(htmlEl.closest('.ant-select-disabled'));

    const rect = htmlEl.getBoundingClientRect();
    // document-координаты в CSS px (как у Playwright fullPage + scale:'css')
    const bbox = {
      x: Math.round(rect.left + window.scrollX),
      y: Math.round(rect.top + window.scrollY),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };

    const interactive = true;

    const inDataRow = isInDataRow(target) || isInDataRow(el);
    const id = `el-${index++}`;
    // для пересчёта bbox перед скриншотом (после scrollTo 0,0)
    try {
      htmlEl.setAttribute('data-vp-id', id);
    } catch {
      // ignore non-HTML / sealed nodes
    }

    results.push({
      id,
      tag,
      role,
      name,
      roleName,
      label,
      placeholder,
      testId,
      dataName,
      description,
      text,
      href,
      inputType,
      interactive,
      visible: true,
      disabled,
      inIframe: false,
      inShadow: inShadow(el) || inShadow(target),
      inDataRow,
      framePath: [],
      section: inDataRow ? '__table_rows__' : findSection(target),
      bbox,
      cssPath: buildCssPath(htmlEl),
    });
  }

  return results;
}
