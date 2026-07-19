import * as fs from 'fs';
import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserContext,
  type Page,
} from 'playwright';
import { t } from '../i18n';
import type { BrowserName, ScanPageResult, ScannedElement } from '../types';
import { extractDomElements } from './extractScript';
import { dedupeCatalogElements, enrichWithLocators, markUniqueness } from './locatorRanker';

export interface SessionScanOptions {
  interactiveOnly: boolean;
  visibleOnly: boolean;
  preferTestId: boolean;
}

export interface BrowserSessionOptions {
  browser: BrowserName;
  timeoutMs: number;
  storageStatePath?: string;
  /** Использовать установленный Google Chrome вместо Playwright Chromium */
  useSystemChrome: boolean;
  /** Подключиться к уже запущенному Chrome (например порт 9222) */
  cdpEndpoint?: string;
  locale: string;
  timezoneId: string;
  onStatus: (message: string) => void;
  onScanned: (result: ScanPageResult) => void | Promise<void>;
  onError: (message: string) => void;
  scanOptions: SessionScanOptions;
}

const STEALTH_INIT = `
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
window.chrome = window.chrome || { runtime: {} };
Object.defineProperty(navigator, 'languages', { get: () => ['ru-RU', 'ru', 'en-US', 'en'] });
Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
`;

function getLauncher(browserName: BrowserName) {
  switch (browserName) {
    case 'firefox':
      return firefox;
    case 'webkit':
      return webkit;
    default:
      return chromium;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isScannableUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

async function waitForPageSettle(page: Page): Promise<void> {
  try {
    await page.waitForLoadState('domcontentloaded');
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    await delay(400);
  } catch {
    // ignore
  }
}

async function extractFrames(
  page: Page,
  preferTestId: boolean
): Promise<{ elements: ScannedElement[]; warnings: string[] }> {
  const warnings: string[] = [];
  const elements: ScannedElement[] = [];

  const main = await page.evaluate(extractDomElements);
  for (const item of main) {
    elements.push(enrichWithLocators({ ...item, inIframe: false, framePath: [] }, preferTestId));
  }

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

export class BrowserSession {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private disposed = false;
  private scanning = false;
  private lastScannedUrl: string | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private attachedViaCdp = false;

  constructor(private readonly options: BrowserSessionOptions) {}

  get isRunning(): boolean {
    return Boolean(this.browser && this.page && !this.disposed);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      await this.page?.bringToFront();
      this.options.onStatus(t('status.browserAlreadyOpen'));
      return;
    }

    this.disposed = false;
    this.options.onStatus(t('status.openingBrowser'));

    if (this.options.cdpEndpoint) {
      this.attachedViaCdp = true;
      this.browser = await chromium.connectOverCDP(this.options.cdpEndpoint);
      const contexts = this.browser.contexts();
      this.context = contexts[0] ?? (await this.browser.newContext());
      const pages = this.context.pages();
      this.page = pages[0] ?? (await this.context.newPage());
      this.options.onStatus(t('status.connectedChrome'));
    } else {
      this.attachedViaCdp = false;
      const launcher = getLauncher(this.options.browser);
      const launchOptions: Parameters<typeof chromium.launch>[0] = {
        headless: false,
        args: [
          '--start-maximized',
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--no-default-browser-check',
          '--disable-infobars',
        ],
        ignoreDefaultArgs: ['--enable-automation'],
      };

      if (this.options.browser === 'chromium' && this.options.useSystemChrome) {
        launchOptions.channel = 'chrome';
      }

      try {
        this.browser = await launcher.launch(launchOptions);
      } catch (error) {
        if (this.options.useSystemChrome && this.options.browser === 'chromium') {
          this.options.onStatus(t('status.chromeMissing'));
          delete launchOptions.channel;
          this.browser = await launcher.launch(launchOptions);
        } else {
          throw error;
        }
      }

      const contextOptions: Parameters<Browser['newContext']>[0] = {
        viewport: null,
        locale: this.options.locale,
        timezoneId: this.options.timezoneId,
        colorScheme: 'light',
        javaScriptEnabled: true,
        ignoreHTTPSErrors: true,
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        extraHTTPHeaders: {
          'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        },
      };
      if (this.options.storageStatePath && fs.existsSync(this.options.storageStatePath)) {
        contextOptions.storageState = this.options.storageStatePath;
      }

      this.context = await this.browser.newContext(contextOptions);
      await this.context.addInitScript(STEALTH_INIT);
      this.page = await this.context.newPage();
      await this.page.goto('about:blank');
      this.options.onStatus(t('status.pasteUrl'));
    }

    this.context.setDefaultTimeout(this.options.timeoutMs);

    this.page.on('framenavigated', (frame) => {
      if (frame === this.page?.mainFrame()) {
        this.scheduleScan(frame.url());
      }
    });

    this.page.on('close', () => {
      void this.dispose();
    });

    this.browser.on('disconnected', () => {
      void this.dispose();
    });
  }

  private scheduleScan(url: string): void {
    if (!isScannableUrl(url) || this.disposed) {
      return;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      void this.scanCurrentPage(url);
    }, 800);
  }

  async scanCurrentPage(expectedUrl?: string): Promise<ScanPageResult | null> {
    if (!this.page || this.disposed) {
      return null;
    }

    const url = this.page.url();
    if (!isScannableUrl(url)) {
      return null;
    }

    if (this.scanning) {
      return null;
    }

    if (expectedUrl && url !== expectedUrl) {
      // navigation already moved on
    }

    if (this.lastScannedUrl === url) {
      return null;
    }

    this.scanning = true;
    this.options.onStatus(t('status.scanning', { url }));

    try {
      await waitForPageSettle(this.page);

      const blocked = await this.page.evaluate(() => {
        const text = document.body?.innerText ?? '';
        return (
          /403\s*Error|Forbidden|доступ к сайту.*запрещен|доступ запрещ/i.test(text) ||
          document.title.toLowerCase().includes('403')
        );
      });

      if (blocked) {
        this.lastScannedUrl = url;
        const message = t('scan.blocked403');
        this.options.onError(message);
        const blockedResult: ScanPageResult = {
          url,
          title: '403 Forbidden',
          scannedAt: new Date().toISOString(),
          screenshotBase64: (await this.page.screenshot({ fullPage: true, type: 'png' })).toString(
            'base64'
          ),
          elements: [],
          warnings: [message],
        };
        await this.options.onScanned(blockedResult);
        return blockedResult;
      }

      const { elements: rawElements, warnings } = await extractFrames(
        this.page,
        this.options.scanOptions.preferTestId
      );
      const filtered = applyFilters(
        rawElements,
        this.options.scanOptions.interactiveOnly,
        this.options.scanOptions.visibleOnly
      );
      const elements = dedupeCatalogElements(markUniqueness(filtered));
      const screenshot = await this.page.screenshot({ fullPage: true, type: 'png' });
      const title = await this.page.title();

      if (elements.some((e) => e.inShadow)) {
        warnings.push(t('scan.shadowWarning'));
      }

      const result: ScanPageResult = {
        url: this.page.url(),
        title,
        scannedAt: new Date().toISOString(),
        screenshotBase64: screenshot.toString('base64'),
        elements,
        warnings,
      };

      this.lastScannedUrl = result.url;
      await this.options.onScanned(result);
      this.options.onStatus(t('status.scanDone', { count: result.elements.length }));
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.options.onError(t('scan.error', { error: message }));
      return null;
    } finally {
      this.scanning = false;
    }
  }

  async forceRescan(): Promise<ScanPageResult | null> {
    this.lastScannedUrl = null;
    return this.scanCurrentPage();
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    try {
      if (this.attachedViaCdp) {
        // Не закрываем пользовательский Chrome — только отключаемся
        this.browser?.close().catch(() => undefined);
      } else {
        await this.context?.close();
        await this.browser?.close();
      }
    } catch {
      // ignore
    }

    this.page = null;
    this.context = null;
    this.browser = null;
    this.options.onStatus(
      this.attachedViaCdp ? t('status.disconnectedChrome') : t('status.browserClosed')
    );
  }
}
