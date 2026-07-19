# Visual Parser

<p align="center">
  <img src="media/icon.svg" alt="Visual Parser" width="72" height="72">
</p>

<p align="center">
  <strong>Сканируй живую страницу → получи локаторы и Page Object</strong><br>
  без наведения мышкой, как в Playwright Codegen
</p>

<p align="center">
  <a href="#-быстрый-старт">Русский</a> ·
  <a href="#-quick-start">English</a>
  &nbsp;·&nbsp;
  <code>VS Code</code> / <code>Cursor</code>
  &nbsp;·&nbsp;
  <a href="LICENSE">MIT</a>
</p>

---

## Зачем это нужно

Playwright Codegen заставляет кликать по каждому элементу.  
**Visual Parser** открывает браузер, сам обходит UI и собирает каталог локаторов + Page Object.

| | Codegen | Visual Parser |
|--|---------|---------------|
| Как собираешь локаторы | Клики / hover вручную | Автоскан страницы |
| Каталог элементов | Нет | Side Bar + скриншот |
| Page Object | Пишешь сам | Генерируется (`readonly` поля) |
| XPath | Можно | Запрещён |

**Приоритет локаторов:**  
`data-name` / `testid` → `role` → `label` → `text` → `CSS`

---

## Как это выглядит в работе

```text
1. Открыть браузер          →  вставить URL
2. Автоскан                 →  каталог слева + подсветка на скрине
3. Copy / Insert / POM      →  локаторы в коде и pages/*.page.ts
```

В тесте используешь поля напрямую:

```ts
const pom = new LoginPage(page);

await pom.signInButton.click();
await pom.emailInput.fill('qa@example.com');
await expect(pom.signInButton).toBeVisible();
```

---

## Быстрый старт

### 1. Установка

```bash
npm install
npx playwright install
npm run install-local
```

Скрипт ставит расширение и в **Cursor**, и в **VS Code**.

Затем: `Ctrl+Shift+P` → **Developer: Reload Window**.

> F5 нужен только для разработки самого расширения.  
> Для ежедневной работы — `install-local` + Reload.

### 2. Первый скан

1. Слева иконка **Visual Parser** (или команда **Open browser**)
2. Вставь URL в адресную строку браузера → Enter
3. Плагин сканирует страницу и показывает каталог
4. При необходимости: **Generate Page Object**

Статус внизу слева: `Visual Parser: …`

После правок кода расширения снова: `npm run install-local` → Reload Window.

---

## Каталог элементов

После скана слева — список найденных элементов:

- название и роль (`button`, `link`, …)
- готовый локатор Playwright
- подсказка, если локатор хрупкий (завязан на текст)
- **Copy** / **Insert** — в буфер или в открытый файл
- клик по строке — подсветка на скриншоте

Это «меню» локаторов. Page Object собирается из тех же элементов.

---

## Page Object

Генерируется в `pages/*.page.ts`:

- только `readonly` локаторы (без авто-`clickXxx()`)
- короткие понятные имена (`followButton`, `avatarLink`, …)
- в тесте: `await pom.signInButton.click()` / `.fill()` / `expect(...)`

---

## Команды и хоткеи

| Действие | Команда / хоткей |
|----------|------------------|
| Открыть браузер | Visual Parser: Open browser |
| Сканировать URL | `Ctrl+Alt+S` |
| Обновить скан | `Ctrl+Alt+R` |
| Вставить локатор | `Ctrl+Alt+I` |
| Копировать локатор | Visual Parser: Copy locator |
| Сгенерировать POM | Visual Parser: Generate Page Object |
| Реальный Chrome (обход 403) | Visual Parser: Connect to real Chrome |
| Логин → storageState | Visual Parser: Login and save storageState |
| Язык UI | Visual Parser: Set UI language |

---

## Настройки

`Settings → Extensions → Visual Parser`

| Настройка | Зачем |
|-----------|--------|
| `uiLanguage` | `auto` / `ru` / `en` |
| `defaultBrowser` | `chromium` / `firefox` / `webkit` |
| `useSystemChrome` | Системный Chrome — меньше блокировок WAF (по умолчанию вкл.) |
| `cdpEndpoint` | Подключение к уже открытому Chrome, напр. `http://127.0.0.1:9222` |
| `autoGeneratePageObject` | Авто-POM после скана |
| `pagesDir` | Папка для Page Objects |
| `preferTestId` | Предпочитать `data-testid` |
| `envFile` / `storageStatePath` | Пути к `.env` и auth state |
| `interactiveOnly` / `visibleOnly` | Фильтры каталога |

---

## Авторизация на сайте

1. Скопируй `.env.example` → `.env`
2. Заполни `USER_EMAIL`, `USER_PASSWORD`, `LOGIN_URL`
3. При необходимости поправь селекторы логина в настройках
4. Команда **Login and save storageState**
5. Дальше сканы используют `playwright/.auth/user.json`

---

## Сайт отдаёт 403

WAF часто режет автоматизацию. Попробуй по порядку:

1. Оставь `useSystemChrome = true` (уже по умолчанию)
2. **Connect to real Chrome** или `scripts/open-chrome-debug.bat`, затем  
   `cdpEndpoint = http://127.0.0.1:9222`
3. Если 403 и в обычном Chrome — блок по IP/сети (VPN / другая сеть)

---

## Структура репозитория

```text
src/
  extension.ts      команды и активация
  scanner/          Playwright-скан и ранжирование локаторов
  generator/        генерация Page Object
  providers/        дерево каталога
  webview/          скриншот и подсветка
  i18n/             RU / EN
  config/           настройки и .env
pages/              сгенерированные POM (в git не коммитятся)
scripts/            install-local, open-chrome-debug
```

---

## Roadmap

- Crawl разделов сайта
- Умный merge существующих POM
- Recorder → `test.step`
- CLI-проверка локаторов в CI

---

## Лицензия

[MIT](LICENSE) © [AnzeMiles69](https://github.com/AnzeMiles69)

Репозиторий: [visual-parser-url](https://github.com/AnzeMiles69/visual-parser-url)

---

<br>

# English

<p align="center">
  <strong>Scan a live page → get locators and a Page Object</strong><br>
  without hover/click recording like Playwright Codegen
</p>

---

## Why Visual Parser

Playwright Codegen makes you click every element.  
**Visual Parser** opens a browser, scans the UI, and builds a locator catalog + Page Object for you.

| | Codegen | Visual Parser |
|--|---------|---------------|
| Collect locators | Manual clicks / hover | Auto page scan |
| Element catalog | No | Side Bar + screenshot |
| Page Object | Hand-written | Generated (`readonly` fields) |
| XPath | Allowed | Banned |

**Locator priority:**  
`data-name` / `testid` → `role` → `label` → `text` → `CSS`

---

## Flow

```text
1. Open browser             →  paste URL
2. Auto-scan                →  catalog + screenshot highlight
3. Copy / Insert / POM      →  locators in code & pages/*.page.ts
```

```ts
const pom = new LoginPage(page);

await pom.signInButton.click();
await pom.emailInput.fill('qa@example.com');
await expect(pom.signInButton).toBeVisible();
```

---

## Quick start

### 1. Install

```bash
npm install
npx playwright install
npm run install-local
```

Installs into both **Cursor** and **VS Code**.

Then: `Ctrl+Shift+P` → **Developer: Reload Window**.

> F5 is only for developing the extension itself.  
> Day-to-day: `install-local` + Reload.

### 2. First scan

1. Click **Visual Parser** in the activity bar (or **Open browser**)
2. Paste a URL → Enter
3. The extension scans and fills the catalog
4. Optionally: **Generate Page Object**

Status bar: `Visual Parser: …`

After extension code changes: `npm run install-local` → Reload Window.

---

## Element catalog

After a scan, the Side Bar lists discovered elements:

- label + role
- ready Playwright locator
- warning when the locator is text-fragile
- **Copy** / **Insert**
- click a row to highlight it on the screenshot

Same elements feed Page Object generation.

---

## Page Objects

Written to `pages/*.page.ts`:

- `readonly` locators only (no auto-`clickXxx()` wrappers)
- short field names (`followButton`, `avatarLink`, …)
- in tests: `await pom.signInButton.click()` / `.fill()` / `expect(...)`

---

## Commands & shortcuts

| Action | Command / shortcut |
|--------|--------------------|
| Open browser | Visual Parser: Open browser |
| Scan URL | `Ctrl+Alt+S` |
| Rescan | `Ctrl+Alt+R` |
| Insert locator | `Ctrl+Alt+I` |
| Copy locator | Visual Parser: Copy locator |
| Generate POM | Visual Parser: Generate Page Object |
| Real Chrome (403 bypass) | Visual Parser: Connect to real Chrome |
| Login → storageState | Visual Parser: Login and save storageState |
| UI language | Visual Parser: Set UI language |

---

## Settings

`Settings → Extensions → Visual Parser`

| Setting | Purpose |
|---------|---------|
| `uiLanguage` | `auto` / `ru` / `en` |
| `defaultBrowser` | `chromium` / `firefox` / `webkit` |
| `useSystemChrome` | System Chrome — fewer WAF blocks (on by default) |
| `cdpEndpoint` | Attach to existing Chrome, e.g. `http://127.0.0.1:9222` |
| `autoGeneratePageObject` | Auto-POM after scan |
| `pagesDir` | Page Objects folder |
| `preferTestId` | Prefer `data-testid` |
| `envFile` / `storageStatePath` | Paths to `.env` and auth state |
| `interactiveOnly` / `visibleOnly` | Catalog filters |

---

## Authentication

1. Copy `.env.example` → `.env`
2. Set `USER_EMAIL`, `USER_PASSWORD`, `LOGIN_URL`
3. Tweak login selectors in settings if needed
4. Run **Login and save storageState**
5. Later scans reuse `playwright/.auth/user.json`

---

## Getting HTTP 403

WAFs often block automation. Try in order:

1. Keep `useSystemChrome = true` (default)
2. **Connect to real Chrome** or `scripts/open-chrome-debug.bat`, then  
   `cdpEndpoint = http://127.0.0.1:9222`
3. If normal Chrome also gets 403 — IP/network block (VPN / another network)

---

## Project layout

```text
src/
  extension.ts      commands & activation
  scanner/          Playwright scan + locator ranking
  generator/        Page Object generation
  providers/        catalog tree
  webview/          screenshot panel
  i18n/             RU / EN
  config/           settings & .env
pages/              generated POMs (gitignored)
scripts/            install-local, open-chrome-debug
```

---

## Roadmap

- Crawl site sections
- Smart merge of existing POMs
- Recorder → `test.step`
- CLI locator checks in CI

---

## License

[MIT](LICENSE) © [AnzeMiles69](https://github.com/AnzeMiles69)

Repo: [visual-parser-url](https://github.com/AnzeMiles69/visual-parser-url)
