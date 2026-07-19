import * as fs from 'fs';
import * as path from 'path';
import { chromium, firefox, webkit, type Browser, type BrowserContext, type Page } from 'playwright';
import { t } from '../i18n';
import type { AuthOptions, ScanOptions, ScanPageResult, ScannedElement } from '../types';
import { extractDomElements } from './extractScript';
import { dedupeCatalogElements, enrichWithLocators, markUniqueness } from './locatorRanker';
import { screenshotFullPageAligned } from './screenshotAlign';

function getLauncher(browserName: ScanOptions['browser']) {
  switch (browserName) {
    case 'firefox':
      return firefox;
    case 'webkit':
      return webkit;
    default:
      return chromium;
  }
}

async function createContext(options: ScanOptions): Promise<{ browser: Browser; context: BrowserContext }> {
  const launcher = getLauncher(options.browser);
  const browser = await launcher.launch({ headless: options.headless });
  const contextOptions: Parameters<Browser['newContext']>[0] = {
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  };

  if (options.storageStatePath && fs.existsSync(options.storageStatePath)) {
    contextOptions.storageState = options.storageStatePath;
  }

  const context = await browser.newContext(contextOptions);
  context.setDefaultTimeout(options.timeoutMs);
  return { browser, context };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPageSettle(page: Page): Promise<void> {
  try {
    await page.waitForLoadState('domcontentloaded');
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    await delay(300);
  } catch {
    // SPA may never reach networkidle — ignore
  }
}

async function extractFromPage(
  page: Page,
  preferTestId: boolean,
  framePath: string[] = [],
  inIframe = false
): Promise<ScannedElement[]> {
  const raw = await page.evaluate(extractDomElements);
  return raw.map((item) =>
    enrichWithLocators(
      {
        ...item,
        inIframe,
        framePath,
      },
      preferTestId
    )
  );
}

async function extractFrames(
  page: Page,
  preferTestId: boolean
): Promise<{ elements: ScannedElement[]; warnings: string[] }> {
  const warnings: string[] = [];
  const elements: ScannedElement[] = [];

  const main = await extractFromPage(page, preferTestId);
  elements.push(...main);

  const frames = page.frames().filter((f) => f !== page.mainFrame());
  for (const frame of frames) {
    const name = frame.name() || frame.url();
    warnings.push(t('scan.iframeFound', { name }));
    try {
      const frameElements = await frame.evaluate(extractDomElements);
      for (const item of frameElements) {
        elements.push(
          enrichWithLocators(
            {
              ...item,
              id: `iframe-${elements.length}-${item.id}`,
              inIframe: true,
              framePath: [name],
            },
            preferTestId
          )
        );
      }
    } catch {
      warnings.push(t('scan.iframeFailed', { name }));
    }
  }

  return { elements, warnings };
}

function applyFilters(
  elements: ScannedElement[],
  interactiveOnly: boolean,
  visibleOnly: boolean
): ScannedElement[] {
  return elements.filter((el) => {
    if (interactiveOnly && !el.interactive) {
      return false;
    }
    if (visibleOnly && !el.visible) {
      return false;
    }
    return true;
  });
}

export async function scanUrl(options: ScanOptions): Promise<ScanPageResult> {
  const { browser, context } = await createContext(options);
  try {
    const page = await context.newPage();
    await page.goto(options.url, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
    await waitForPageSettle(page);

    const { elements: rawElements, warnings } = await extractFrames(page, options.preferTestId);
    const filtered = applyFilters(rawElements, options.interactiveOnly, options.visibleOnly);
    const elements = dedupeCatalogElements(markUniqueness(filtered));

    const screenshot = await screenshotFullPageAligned(page, elements);
    const title = await page.title();

    if (elements.some((e) => e.inShadow)) {
      warnings.push(t('scan.shadowWarning'));
    }

    return {
      url: page.url(),
      title,
      scannedAt: new Date().toISOString(),
      screenshotBase64: screenshot.toString('base64'),
      elements,
      warnings,
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

export async function loginAndSaveStorageState(options: AuthOptions): Promise<string> {
  const launcher = getLauncher(options.browser);
  const browser = await launcher.launch({ headless: options.headless });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  context.setDefaultTimeout(options.timeoutMs);

  try {
    const page = await context.newPage();
    await page.goto(options.loginUrl, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
    await waitForPageSettle(page);

    await page.locator(options.emailSelector).first().fill(options.email);
    await page.locator(options.passwordSelector).first().fill(options.password);
    await page.locator(options.submitSelector).first().click();
    await waitForPageSettle(page);

    const dir = path.dirname(options.storageStatePath);
    fs.mkdirSync(dir, { recursive: true });
    await context.storageState({ path: options.storageStatePath });
    return options.storageStatePath;
  } finally {
    await context.close();
    await browser.close();
  }
}
