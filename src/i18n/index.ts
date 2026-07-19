import * as vscode from 'vscode';
import type { WarningCode } from '../types';

export type UiLanguage = 'ru' | 'en';
export type UiLanguageSetting = 'auto' | UiLanguage;

type Dict = Record<string, string>;

const ru: Dict = {
  'status.ready': 'готов',
  'status.browserAlreadyOpen': 'Браузер уже открыт — вставьте URL',
  'status.waitingChrome': 'Жду Chrome на порту 9222…',
  'status.openingBrowser': 'Открываю браузер…',
  'status.pasteUrl': 'Вставьте URL в адресную строку браузера и нажмите Enter',
  'status.connectedChrome': 'Подключено к вашему Chrome — откройте нужный URL',
  'status.scanning': 'Сканирую: {url}',
  'status.scanDone': 'Готово: {count} элементов · можно открыть другую страницу',
  'status.browserClosed': 'Браузер закрыт',
  'status.disconnectedChrome': 'Отключено от Chrome',
  'status.browserError': 'Ошибка запуска браузера',
  'status.rescan': 'Обновляю скан…',
  'status.chromeMissing': 'Chrome не найден, пробую Playwright Chromium…',
  'status.pageObject': 'Page Object: {name} · {count} эл.',

  'msg.scanReady': 'Скан готов: {count} эл., в POM отмечено {selected}{warnings}',
  'msg.noSelectionForPom': 'Ничего не отмечено. Поставь галочки в каталоге и снова сгенерируй Page Object.',
  'msg.warningsSuffix': ' · предупреждений: {count}',
  'msg.browserAlreadyOpen':
    'Браузер уже открыт. Вставьте URL в адресную строку и нажмите Enter.',
  'msg.browserOpened':
    'Браузер открыт. Вставьте URL в адресную строку и нажмите Enter — дальше Visual Parser сделает сам.',
  'msg.browserConnected': 'Подключено к Chrome. Открой нужную страницу — скан запустится сам.',
  'msg.browserLaunchFailed':
    'Не удалось открыть браузер: {error}. Для 403: команда «Подключиться к реальному Chrome».',
  'msg.chromeNotFound':
    'Google Chrome не найден. Установи Chrome или запусти scripts/open-chrome-debug.bat',
  'msg.connectChromeHint':
    'Открыл Chrome. Если сайт снова 403 — это блок IP/сети (нужен VPN или офисная сеть). Если сайт открылся нормально — нажми OK, и плагин подключится.',
  'msg.connect': 'Подключиться',
  'msg.locatorCopied': 'Локатор скопирован',
  'msg.noElement': 'Нет выбранного элемента. Сначала выполните скан.',
  'msg.noScanData': 'Нет данных скана. Сначала откройте браузер и вставьте URL.',
  'msg.noEditor': 'Нет активного редактора — локатор скопирован в буфер',
  'msg.scanFirst': 'Сначала выполните сканирование',
  'msg.openWorkspace': 'Откройте папку workspace',
  'msg.poFailed': 'Не удалось сгенерировать Page Object: {error}',
  'msg.scanFailed': 'Ошибка сканирования: {error}',
  'msg.loginFailed': 'Ошибка логина: {error}',
  'msg.envCredentials': 'Укажите USER_EMAIL и USER_PASSWORD в {file}',
  'msg.storageSaved': 'storageState сохранён: {path}',
  'msg.pickBrowser': 'Выберите браузер',
  'msg.browserNow': 'Сейчас: {browser}',
  'msg.scanUrlTitle': 'Visual Parser: Сканировать URL',
  'msg.scanUrlPrompt': 'Вставьте URL страницы',
  'msg.urlRequired': 'URL обязателен',
  'msg.urlInvalid': 'Некорректный URL',
  'msg.scanningProgress': 'Visual Parser сканирует страницу…',
  'msg.savingAuth': 'Visual Parser: сохранение storageState…',
  'msg.loginUrlTitle': 'URL страницы логина',
  'msg.pickLocator': 'Выберите элемент для вставки локатора',
  'msg.languageChanged': 'Язык интерфейса: {lang}. Перезагрузите окно, если заголовки команд не обновились.',
  'msg.pickLanguage': 'Visual Parser: язык интерфейса',

  'panel.header': 'Скриншот: колесо — зум, перетаскивание — панорама, клик — элемент в каталоге',
  'panel.emptyShot': 'Нет скриншота. Запустите сканирование.',
  'panel.copy': 'Копировать',
  'panel.insert': 'Вставить',
  'panel.notUnique': 'не уникален',
  'panel.zoomIn': '+',
  'panel.zoomOut': '−',
  'panel.zoomReset': '100%',
  'panel.hint': 'Клик по кнопке на скрине → подсветка в списке и в каталоге слева',
  'panel.hideList': 'Скрыть список',
  'panel.showList': 'Показать список',

  'tree.noSection': 'Без секции',
  'tree.tableRows': 'Строки таблицы (не в Page Object)',
  'tree.selectionCount': 'в POM: {included}/{total}',
  'tree.checkboxHint': 'Галочка = включить в Page Object',
  'tree.sectionAllSelected': 'Вся секция в Page Object · клик снимет всё',
  'tree.sectionNoneSelected': 'Секция не выбрана · клик отметит всё',
  'tree.sectionPartialSelected': 'Частично: {included}/{total} · клик отметит всё',
  'tree.toggleSection': 'Переключить секцию для Page Object',

  'warn.text-dependent': 'Зависит от текста (хрупко при переименовании)',
  'warn.not-unique': 'Локатор не уникален на странице',
  'warn.dynamic-class': 'Похоже на динамический CSS-класс',
  'warn.nth-index': 'Использует индекс nth-*',
  'warn.iframe': 'Элемент внутри iframe',
  'warn.shadow': 'Элемент в Shadow DOM',
  'warn.css-fallback': 'CSS fallback (хуже role/testid)',
  'warn.empty-name': 'У role нет accessible name',
  'warn.row-template': 'Шаблон в строках таблицы — используй с rowByText(...)',

  'scan.shadowWarning': 'На странице есть элементы в Shadow DOM — проверьте локаторы вручную',
  'scan.iframeFound': 'Обнаружен iframe: {name}',
  'scan.iframeFailed': 'Не удалось просканировать iframe: {name}',
  'scan.blocked403':
    'Сайт вернул 403 Forbidden. WAF блокирует автоматический браузер или IP. Запусти scripts/open-chrome-debug.bat, открой сайт там, затем команду «Visual Parser: Подключиться к реальному Chrome».',
  'scan.error': 'Ошибка скана: {error}',

  'lang.ru': 'Русский',
  'lang.en': 'English',
};

const en: Dict = {
  'status.ready': 'ready',
  'status.browserAlreadyOpen': 'Browser already open — paste a URL',
  'status.waitingChrome': 'Waiting for Chrome on port 9222…',
  'status.openingBrowser': 'Opening browser…',
  'status.pasteUrl': 'Paste a URL into the address bar and press Enter',
  'status.connectedChrome': 'Connected to your Chrome — open the target URL',
  'status.scanning': 'Scanning: {url}',
  'status.scanDone': 'Done: {count} elements · you can open another page',
  'status.browserClosed': 'Browser closed',
  'status.disconnectedChrome': 'Disconnected from Chrome',
  'status.browserError': 'Failed to launch browser',
  'status.rescan': 'Refreshing scan…',
  'status.chromeMissing': 'Chrome not found, trying Playwright Chromium…',
  'status.pageObject': 'Page Object: {name} · {count} els',

  'msg.scanReady': 'Scan complete: {count} els, {selected} checked for POM{warnings}',
  'msg.noSelectionForPom': 'Nothing selected. Check items in the catalog, then generate the Page Object again.',
  'msg.warningsSuffix': ' · warnings: {count}',
  'msg.browserAlreadyOpen': 'Browser is already open. Paste a URL into the address bar and press Enter.',
  'msg.browserOpened':
    'Browser opened. Paste a URL into the address bar and press Enter — Visual Parser will continue.',
  'msg.browserConnected': 'Connected to Chrome. Open the page — scan will start automatically.',
  'msg.browserLaunchFailed':
    'Failed to open browser: {error}. For 403 use “Connect to real Chrome”.',
  'msg.chromeNotFound':
    'Google Chrome not found. Install Chrome or run scripts/open-chrome-debug.bat',
  'msg.connectChromeHint':
    'Chrome launched. If you still get 403 — IP/network block (use VPN). If the site loads — click OK to connect.',
  'msg.connect': 'Connect',
  'msg.locatorCopied': 'Locator copied',
  'msg.noElement': 'No element selected. Run a scan first.',
  'msg.noScanData': 'No scan data. Open the browser and paste a URL first.',
  'msg.noEditor': 'No active editor — locator copied to clipboard',
  'msg.scanFirst': 'Run a scan first',
  'msg.openWorkspace': 'Open a workspace folder',
  'msg.poFailed': 'Failed to generate Page Object: {error}',
  'msg.scanFailed': 'Scan failed: {error}',
  'msg.loginFailed': 'Login failed: {error}',
  'msg.envCredentials': 'Set USER_EMAIL and USER_PASSWORD in {file}',
  'msg.storageSaved': 'storageState saved: {path}',
  'msg.pickBrowser': 'Select browser',
  'msg.browserNow': 'Current: {browser}',
  'msg.scanUrlTitle': 'Visual Parser: Scan URL',
  'msg.scanUrlPrompt': 'Paste page URL',
  'msg.urlRequired': 'URL is required',
  'msg.urlInvalid': 'Invalid URL',
  'msg.scanningProgress': 'Visual Parser is scanning the page…',
  'msg.savingAuth': 'Visual Parser: saving storageState…',
  'msg.loginUrlTitle': 'Login page URL',
  'msg.pickLocator': 'Select element to insert locator',
  'msg.languageChanged':
    'UI language: {lang}. Reload the window if command titles did not update.',
  'msg.pickLanguage': 'Visual Parser: UI language',

  'panel.header': 'Screenshot: wheel = zoom, drag = pan, click = select in catalog',
  'panel.emptyShot': 'No screenshot. Start a scan.',
  'panel.copy': 'Copy',
  'panel.insert': 'Insert',
  'panel.notUnique': 'not unique',
  'panel.zoomIn': '+',
  'panel.zoomOut': '−',
  'panel.zoomReset': '100%',
  'panel.hint': 'Click a control on the screenshot → highlight in the list and side catalog',
  'panel.hideList': 'Hide list',
  'panel.showList': 'Show list',

  'tree.noSection': 'No section',
  'tree.tableRows': 'Table rows (not in Page Object)',
  'tree.selectionCount': 'for POM: {included}/{total}',
  'tree.checkboxHint': 'Checkbox = include in Page Object',
  'tree.sectionAllSelected': 'Entire section in Page Object · click to clear',
  'tree.sectionNoneSelected': 'Section not selected · click to select all',
  'tree.sectionPartialSelected': 'Partial: {included}/{total} · click to select all',
  'tree.toggleSection': 'Toggle section for Page Object',

  'warn.text-dependent': 'Depends on visible text (fragile when renamed)',
  'warn.not-unique': 'Locator is not unique on the page',
  'warn.dynamic-class': 'Looks like a dynamic CSS class',
  'warn.nth-index': 'Uses nth-* index',
  'warn.iframe': 'Element is inside an iframe',
  'warn.shadow': 'Element is in Shadow DOM',
  'warn.css-fallback': 'CSS fallback (worse than role/testid)',
  'warn.empty-name': 'Role has no accessible name',
  'warn.row-template': 'Row template — use with rowByText(...)',

  'scan.shadowWarning': 'Page has Shadow DOM elements — verify locators manually',
  'scan.iframeFound': 'iframe detected: {name}',
  'scan.iframeFailed': 'Failed to scan iframe: {name}',
  'scan.blocked403':
    'Site returned 403 Forbidden. WAF blocked automation or IP. Run scripts/open-chrome-debug.bat, open the site there, then use “Connect to real Chrome”.',
  'scan.error': 'Scan error: {error}',

  'lang.ru': 'Русский',
  'lang.en': 'English',
};

const dictionaries: Record<UiLanguage, Dict> = { ru, en };

export function resolveUiLanguage(setting?: UiLanguageSetting): UiLanguage {
  const cfg = setting ?? vscode.workspace.getConfiguration('visualParser').get<UiLanguageSetting>('uiLanguage', 'auto');
  if (cfg === 'ru' || cfg === 'en') {
    return cfg;
  }
  const envLang = vscode.env.language.toLowerCase();
  return envLang.startsWith('ru') ? 'ru' : 'en';
}

export function t(key: string, params?: Record<string, string | number>): string {
  const lang = resolveUiLanguage();
  let text = dictionaries[lang][key] ?? dictionaries.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return text;
}

export function warningLabelI18n(code: WarningCode): string {
  return t(`warn.${code}`);
}
