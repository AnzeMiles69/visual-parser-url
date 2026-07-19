# Visual Parser

VS Code extension for QA: **auto-scan UI** with Playwright and generate locators / Page Objects **without hovering** elements (unlike Playwright Codegen).

[Русский](#русский) · [English](#english)

---

## Русский

### Возможности

- Скан URL в живом браузере (Chromium / Firefox / WebKit)
- Каталог элементов в Side Bar + webview со скриншотом и подсветкой
- Лучший локатор: `data-name` / `testid` → `role` → `label` → `text` → `CSS` (**XPath запрещён**)
- Поддержка Ant Design Select, icon-кнопок (`description`, `data-name`, `aria-label` у иконки)
- Дедуп: один элемент на `data-name` (не копия на каждую строку таблицы)
- Вставка / копирование локатора
- Генерация Page Object (`pages/*.page.ts`)
- Логин через `.env` → `storageState`
- Язык интерфейса: RU / EN

### Установка в текущий VS Code (без второго окна)

F5 открывает отдельное окно только для **разработки** расширений. Для обычной работы:

```bash
npm install
npx playwright install
npm run install-local
```

Затем: `Ctrl+Shift+P` → **Developer: Reload Window**.

### Как пользоваться

1. Слева иконка **Visual Parser** или команда **Open browser / Открыть браузер**
2. Вставь URL в адресную строку браузера → Enter
3. Плагин сам сканирует страницу, показывает каталог и (по настройке) генерирует Page Object

Статус внизу слева: `Visual Parser: …`

После правок кода снова:

```bash
npm run install-local
```

и **Reload Window**. Не используй F5 для ежедневной работы.

### Язык интерфейса

`Settings → Visual Parser → UI language`:

| Значение | Описание |
|----------|----------|
| `auto` | Как язык VS Code |
| `ru` | Русский |
| `en` | English |

Или команда **Visual Parser: Set UI language / Выбрать язык интерфейса**.

### Команды

| Команда | Хоткей |
|---------|--------|
| Открыть браузер (жду URL) | — |
| Сканировать URL | `Ctrl+Alt+S` |
| Обновить скан | `Ctrl+Alt+R` |
| Вставить лучший локатор | `Ctrl+Alt+I` |
| Копировать локатор | — |
| Сгенерировать Page Object | — |
| Подключиться к реальному Chrome (обход 403) | — |
| Войти и сохранить storageState | — |
| Открыть панель | — |
| Выбрать язык интерфейса | — |

### Настройки

`Settings → Visual Parser`:

| Настройка | Описание |
|-----------|----------|
| `uiLanguage` | Язык UI: `auto` / `ru` / `en` |
| `defaultBrowser` | `chromium` / `firefox` / `webkit` |
| `useSystemChrome` | Системный Google Chrome (меньше блокировок WAF) |
| `cdpEndpoint` | Например `http://127.0.0.1:9222` — подключение к уже открытому Chrome |
| `autoStartSession` | Сразу открывать браузер при старте VS Code |
| `autoGeneratePageObject` | Автогенерация POM после скана |
| `envFile` | Путь к `.env` |
| `storageStatePath` | Путь к Playwright auth state |
| `pagesDir` | Папка Page Objects |
| `preferTestId` | Предпочитать `data-testid` |
| `interactiveOnly` / `visibleOnly` | Фильтры каталога |

### Авторизация

1. Скопируй `.env.example` → `.env`, заполни `USER_EMAIL`, `USER_PASSWORD`, `LOGIN_URL`
2. При необходимости поправь селекторы логина в настройках
3. Команда **Login and save storageState**
4. Дальнейшие сканы подхватят `playwright/.auth/user.json`

### Если сайт отвечает 403

WAF часто режет Playwright. Варианты:

1. Включи `useSystemChrome` (по умолчанию уже `true`)
2. Команда **Connect to real Chrome** или `scripts/open-chrome-debug.bat`, затем `cdpEndpoint = http://127.0.0.1:9222`
3. Если 403 и в обычном Chrome — блок по IP/сети (VPN / другая сеть)

### Структура проекта

```text
src/
  extension.ts     # команды и активация
  i18n/            # RU / EN строки
  scanner/         # Playwright скан + ранжирование локаторов
  generator/       # генерация Page Object
  providers/       # Tree View каталога
  webview/         # панель со скриншотом
  config/          # настройки и .env
pages/             # сгенерированные Page Objects
```

### Что дальше

- Crawl разделов сайта
- Умный merge существующих POM
- Recorder → `test.step`
- CLI-проверка локаторов в CI

### Лицензия

MIT — см. [LICENSE](LICENSE).

---

## English

### Features

- Live URL scan (Chromium / Firefox / WebKit)
- Element catalog in the Side Bar + webview with screenshot highlight
- Best locator strategy: `data-name` / `testid` → `role` → `label` → `text` → `CSS` (**XPath forbidden**)
- Ant Design Select support, icon-only buttons (`description`, `data-name`, nested `aria-label`)
- Dedup: one catalog entry per `data-name` (not one per table row)
- Copy / insert locator
- Page Object generation (`pages/*.page.ts`)
- Auth via `.env` → `storageState`
- UI language: RU / EN

### Install into current VS Code (no second window)

F5 opens a separate Extension Host window — that is only for **extension development**. For daily use:

```bash
npm install
npx playwright install
npm run install-local
```

Then: `Ctrl+Shift+P` → **Developer: Reload Window**.

### How to use

1. Click the **Visual Parser** icon on the left, or run **Open browser (wait for URL)**
2. Paste a URL into the browser address bar → Enter
3. The extension scans the page, shows the catalog, and (if enabled) generates a Page Object

Status bar (bottom-left): `Visual Parser: …`

After code changes, run again:

```bash
npm run install-local
```

and **Reload Window**. Do not use F5 for everyday work.

### UI language

`Settings → Visual Parser → UI language`:

| Value | Meaning |
|-------|---------|
| `auto` | Follow VS Code language |
| `ru` | Russian |
| `en` | English |

Or run **Visual Parser: Set UI language**.

### Commands

| Command | Shortcut |
|---------|----------|
| Open browser (wait for URL) | — |
| Scan URL | `Ctrl+Alt+S` |
| Refresh scan | `Ctrl+Alt+R` |
| Insert best locator | `Ctrl+Alt+I` |
| Copy locator | — |
| Generate Page Object | — |
| Connect to real Chrome (bypass 403) | — |
| Login and save storageState | — |
| Open panel | — |
| Set UI language | — |

### Settings

`Settings → Visual Parser`:

| Setting | Description |
|---------|-------------|
| `uiLanguage` | UI language: `auto` / `ru` / `en` |
| `defaultBrowser` | `chromium` / `firefox` / `webkit` |
| `useSystemChrome` | Use installed Google Chrome (fewer WAF blocks) |
| `cdpEndpoint` | e.g. `http://127.0.0.1:9222` — attach to an existing Chrome |
| `autoStartSession` | Open browser when VS Code starts |
| `autoGeneratePageObject` | Auto-generate POM after scan |
| `envFile` | Path to `.env` |
| `storageStatePath` | Path to Playwright auth state |
| `pagesDir` | Page Objects folder |
| `preferTestId` | Prefer `data-testid` |
| `interactiveOnly` / `visibleOnly` | Catalog filters |

### Authentication

1. Copy `.env.example` → `.env` and set `USER_EMAIL`, `USER_PASSWORD`, `LOGIN_URL`
2. Adjust login selectors in settings if needed
3. Run **Login and save storageState**
4. Later scans reuse `playwright/.auth/user.json`

### If the site returns 403

WAFs often block Playwright. Options:

1. Keep `useSystemChrome` enabled (default `true`)
2. Use **Connect to real Chrome** or `scripts/open-chrome-debug.bat`, then set `cdpEndpoint = http://127.0.0.1:9222`
3. If regular Chrome also gets 403 — IP/network block (VPN / another network)

### Project structure

```text
src/
  extension.ts     # commands & activation
  i18n/            # RU / EN strings
  scanner/         # Playwright scan + locator ranking
  generator/       # Page Object generation
  providers/       # catalog Tree View
  webview/         # screenshot panel
  config/          # settings & .env
pages/             # generated Page Objects
```

### Roadmap

- Crawl site sections
- Smart merge of existing POMs
- Recorder → `test.step`
- CLI locator checks in CI

### License

MIT — see [LICENSE](LICENSE).
