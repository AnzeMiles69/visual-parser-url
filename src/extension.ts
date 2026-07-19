import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  detectLanguage,
  getSettings,
  getWorkspaceRoot,
  readEnvFile,
  resolveWorkspacePath,
  storageStateExists,
} from './config/settings';
import {
  defaultPageFileName,
  suggestClassName,
  writePageObject,
} from './generator/pageObjectGenerator';
import { t, type UiLanguage } from './i18n';
import { CatalogTreeProvider, ElementTreeItem } from './providers/catalogTreeProvider';
import { BrowserSession } from './scanner/browserSession';
import { loginAndSaveStorageState, scanUrl } from './scanner/scanner';
import { scanStore } from './state/scanStore';
import type { BrowserName, ScanPageResult, ScannedElement } from './types';
import { VisualParserPanel } from './webview/panel';

let treeProvider: CatalogTreeProvider;
let extensionUriRef: vscode.Uri | undefined;
let session: BrowserSession | null = null;
let statusBar: vscode.StatusBarItem;

function setStatus(message: string): void {
  statusBar.text = `$(browser) Visual Parser: ${message}`;
  statusBar.tooltip = message;
  statusBar.show();
}

async function applyScanResult(result: ScanPageResult): Promise<void> {
  scanStore.setResult(result);
  treeProvider.refresh();

  if (extensionUriRef) {
    VisualParserPanel.show(extensionUriRef, { reveal: true, refresh: true });
  }

  if (result.elements.length === 0 && result.warnings.some((w) => w.includes('403'))) {
    return;
  }

  const warnText = result.warnings.length
    ? t('msg.warningsSuffix', { count: result.warnings.length })
    : '';
  void vscode.window.showInformationMessage(
    t('msg.scanReady', { count: result.elements.length, warnings: warnText })
  );

  const settings = getSettings();
  if (settings.autoGeneratePageObject && result.elements.length > 0) {
    await generatePageObjectSilent(result);
  }
}

function findChromePath(): string | undefined {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')
      : '',
  ].filter(Boolean);

  return candidates.find((p) => fs.existsSync(p));
}

async function connectRealChrome(): Promise<void> {
  const endpoint = 'http://127.0.0.1:9222';
  const cfg = vscode.workspace.getConfiguration('visualParser');
  await cfg.update('cdpEndpoint', endpoint, vscode.ConfigurationTarget.Workspace);
  await cfg.update('autoStartSession', false, vscode.ConfigurationTarget.Workspace);

  const chromePath = findChromePath();
  if (!chromePath) {
    void vscode.window.showErrorMessage(t('msg.chromeNotFound'));
    return;
  }

  const profileDir = path.join(
    process.env.TEMP || process.env.TMP || 'C:\\Temp',
    'visual-parser-chrome-profile'
  );
  fs.mkdirSync(profileDir, { recursive: true });

  spawn(
    chromePath,
    [
      `--remote-debugging-port=9222`,
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      'https://example.com',
    ],
    { detached: true, stdio: 'ignore' }
  ).unref();

  setStatus(t('status.waitingChrome'));
  const connectLabel = t('msg.connect');
  void vscode.window.showInformationMessage(t('msg.connectChromeHint'), connectLabel).then(
    async (choice) => {
    if (choice !== connectLabel) {
      return;
    }
    if (session) {
      await session.dispose();
      session = null;
    }
    const active = await startBrowserSession();
    if (active?.isRunning) {
      await active.forceRescan();
    }
  });
}

async function generatePageObjectSilent(result: ScanPageResult): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) {
    return;
  }

  const settings = getSettings();
  const language = detectLanguage(root);
  const className = suggestClassName(result.title, result.url);
  const fileName = defaultPageFileName(className, language);
  const pagesDir = resolveWorkspacePath(settings.pagesDir) ?? path.join(root, 'pages');
  const filePath = path.join(pagesDir, fileName);

  try {
    const written = writePageObject(
      {
        className,
        filePath,
        pageUrl: result.url,
        elements: result.elements,
        language,
      },
      true
    );
    const doc = await vscode.workspace.openTextDocument(written.filePath);
    await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.One });
    setStatus(t('status.pageObject', { name: written.className }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void vscode.window.showWarningMessage(t('msg.poFailed', { error: message }));
  }
}

async function startBrowserSession(): Promise<BrowserSession | null> {
  const settings = getSettings();
  const storagePath = resolveWorkspacePath(settings.storageStatePath);
  const useStorage = storagePath && storageStateExists(settings.storageStatePath);

  if (session?.isRunning) {
    setStatus(t('status.browserAlreadyOpen'));
    void vscode.window.showInformationMessage(t('msg.browserAlreadyOpen'));
    return session;
  }

  if (session) {
    await session.dispose();
    session = null;
  }

  const next = new BrowserSession({
    browser: settings.defaultBrowser,
    timeoutMs: settings.navigationTimeoutMs,
    storageStatePath: useStorage ? storagePath : undefined,
    useSystemChrome: settings.useSystemChrome,
    cdpEndpoint: settings.cdpEndpoint.trim() || undefined,
    locale: settings.locale,
    timezoneId: settings.timezoneId,
    scanOptions: {
      interactiveOnly: settings.interactiveOnly,
      visibleOnly: settings.visibleOnly,
      preferTestId: settings.preferTestId,
    },
    onStatus: (message) => setStatus(message),
    onError: (message) => {
      setStatus(message);
      void vscode.window.showErrorMessage(message);
    },
    onScanned: async (result) => {
      await applyScanResult(result);
    },
  });

  try {
    await next.start();
    session = next;
    void vscode.window.showInformationMessage(
      settings.cdpEndpoint.trim() ? t('msg.browserConnected') : t('msg.browserOpened')
    );
    return session;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(t('status.browserError'));
    void vscode.window.showErrorMessage(t('msg.browserLaunchFailed', { error: message }));
    session = null;
    return null;
  }
}

async function pickBrowser(defaultBrowser: BrowserName): Promise<BrowserName | undefined> {
  const picked = await vscode.window.showQuickPick(
    [
      { label: 'Chromium', description: 'default', browser: 'chromium' as const },
      { label: 'Firefox', browser: 'firefox' as const },
      { label: 'WebKit', browser: 'webkit' as const },
    ],
    {
      title: t('msg.pickBrowser'),
      placeHolder: t('msg.browserNow', { browser: defaultBrowser }),
    }
  );
  return picked?.browser ?? defaultBrowser;
}

async function pickUiLanguage(): Promise<void> {
  const picked = await vscode.window.showQuickPick(
    [
      { label: t('lang.ru'), description: 'ru', value: 'ru' as UiLanguage },
      { label: t('lang.en'), description: 'en', value: 'en' as UiLanguage },
      { label: 'Auto', description: 'VS Code', value: 'auto' as const },
    ],
    { title: t('msg.pickLanguage') }
  );
  if (!picked) {
    return;
  }
  await vscode.workspace
    .getConfiguration('visualParser')
    .update('uiLanguage', picked.value, vscode.ConfigurationTarget.Global);
  void vscode.window.showInformationMessage(t('msg.languageChanged', { lang: picked.label }));
  treeProvider.refresh();
  if (VisualParserPanel.current) {
    VisualParserPanel.current.refresh();
  }
}

function resolveElement(arg?: string | ElementTreeItem | ScannedElement): ScannedElement | undefined {
  if (!arg) {
    return scanStore.getSelected() ?? scanStore.getElements()[0];
  }
  if (typeof arg === 'string') {
    return scanStore.findById(arg) ?? scanStore.select(arg);
  }
  if (arg instanceof ElementTreeItem) {
    return scanStore.select(arg.element.id);
  }
  if ('id' in arg && 'bestLocator' in arg) {
    return scanStore.select(arg.id);
  }
  return scanStore.getSelected();
}

async function runScan(url?: string): Promise<void> {
  const settings = getSettings();
  const targetUrl =
    url ||
    (await vscode.window.showInputBox({
      title: t('msg.scanUrlTitle'),
      prompt: t('msg.scanUrlPrompt'),
      placeHolder: 'https://example.com/login',
      ignoreFocusOut: true,
      validateInput: (value) => {
        if (!value.trim()) {
          return t('msg.urlRequired');
        }
        try {
          new URL(value.trim());
          return undefined;
        } catch {
          return t('msg.urlInvalid');
        }
      },
    }));

  if (!targetUrl) {
    return;
  }

  const browser = await pickBrowser(settings.defaultBrowser);
  if (!browser) {
    return;
  }

  const storagePath = resolveWorkspacePath(settings.storageStatePath);
  const useStorage = storagePath && storageStateExists(settings.storageStatePath);

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: t('msg.scanningProgress'),
      cancellable: false,
    },
    async () => {
      try {
        const result = await scanUrl({
          url: targetUrl.trim(),
          browser,
          headless: settings.headless,
          timeoutMs: settings.navigationTimeoutMs,
          storageStatePath: useStorage ? storagePath : undefined,
          interactiveOnly: settings.interactiveOnly,
          visibleOnly: settings.visibleOnly,
          preferTestId: settings.preferTestId,
        });
        await applyScanResult(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(t('msg.scanFailed', { error: message }));
      }
    }
  );
}

export function activate(context: vscode.ExtensionContext): void {
  extensionUriRef = context.extensionUri;
  treeProvider = new CatalogTreeProvider();

  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.command = 'visualParser.startSession';
  setStatus(t('status.ready'));
  context.subscriptions.push(statusBar);

  const catalogView = vscode.window.createTreeView('visualParser.catalog', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(catalogView);

  context.subscriptions.push(
    catalogView.onDidChangeSelection((event) => {
      const selected = event.selection[0];
      if (selected instanceof ElementTreeItem) {
        const panel =
          VisualParserPanel.current ??
          VisualParserPanel.show(context.extensionUri, { reveal: false, refresh: true });
        panel.highlight(selected.element.id);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('visualParser.startSession', async () => {
      await startBrowserSession();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('visualParser.connectRealChrome', async () => {
      await connectRealChrome();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('visualParser.setLanguage', async () => {
      await pickUiLanguage();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('visualParser.scanUrl', async () => {
      await runScan();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('visualParser.rescan', async () => {
      if (session?.isRunning) {
        setStatus(t('status.rescan'));
        await session.forceRescan();
        return;
      }
      const current = scanStore.getResult()?.url;
      if (!current) {
        await startBrowserSession();
        return;
      }
      await runScan(current);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('visualParser.openPanel', () => {
      VisualParserPanel.show(context.extensionUri, { reveal: true, refresh: true });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('visualParser.revealElement', (elementId: string) => {
      const panel =
        VisualParserPanel.current ??
        VisualParserPanel.show(context.extensionUri, { reveal: false, refresh: true });
      // preserveFocus / без полного refresh — скролл каталога не сбрасывается
      panel.highlight(elementId);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'visualParser.copyLocator',
      async (arg?: string | ElementTreeItem) => {
        const el = resolveElement(arg);
        if (!el) {
          void vscode.window.showWarningMessage(t('msg.noElement'));
          return;
        }
        await vscode.env.clipboard.writeText(el.bestLocator.expression);
        void vscode.window.showInformationMessage(t('msg.locatorCopied'));
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'visualParser.insertLocator',
      async (arg?: string | ElementTreeItem) => {
        let el = resolveElement(arg);
        if (!el) {
          const items = scanStore.getElements();
          if (items.length === 0) {
            void vscode.window.showWarningMessage(t('msg.noScanData'));
            return;
          }
          const picked = await vscode.window.showQuickPick(
            items.map((item) => ({
              label: item.name || item.label || item.testId || item.tag,
              description: item.bestLocator.strategy,
              detail: item.bestLocator.expression,
              item,
            })),
            { title: t('msg.pickLocator'), matchOnDetail: true }
          );
          el = picked?.item;
        }
        if (!el) {
          return;
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          await vscode.env.clipboard.writeText(el.bestLocator.expression);
          void vscode.window.showInformationMessage(t('msg.noEditor'));
          return;
        }

        await editor.edit((builder) => {
          builder.insert(editor.selection.active, el!.bestLocator.expression);
        });
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('visualParser.generatePageObject', async () => {
      const result = scanStore.getResult();
      if (!result) {
        void vscode.window.showWarningMessage(t('msg.scanFirst'));
        return;
      }
      if (!getWorkspaceRoot()) {
        void vscode.window.showWarningMessage(t('msg.openWorkspace'));
        return;
      }
      await generatePageObjectSilent(result);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('visualParser.saveStorageState', async () => {
      const settings = getSettings();
      const root = getWorkspaceRoot();
      if (!root) {
        void vscode.window.showWarningMessage(t('msg.openWorkspace'));
        return;
      }

      const env = readEnvFile(settings.envFile);
      const email = env.USER_EMAIL || env.EMAIL || env.USERNAME;
      const password = env.USER_PASSWORD || env.PASSWORD;
      const loginUrl =
        settings.loginUrl ||
        env.LOGIN_URL ||
        (await vscode.window.showInputBox({
          title: t('msg.loginUrlTitle'),
          ignoreFocusOut: true,
        }));

      if (!loginUrl) {
        return;
      }
      if (!email || !password) {
        void vscode.window.showErrorMessage(t('msg.envCredentials', { file: settings.envFile }));
        return;
      }

      const storagePath =
        resolveWorkspacePath(settings.storageStatePath) ??
        path.join(root, settings.storageStatePath);

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: t('msg.savingAuth'),
        },
        async () => {
          try {
            const saved = await loginAndSaveStorageState({
              loginUrl,
              email,
              password,
              emailSelector: settings.loginEmailSelector,
              passwordSelector: settings.loginPasswordSelector,
              submitSelector: settings.loginSubmitSelector,
              browser: settings.defaultBrowser,
              headless: false,
              timeoutMs: settings.navigationTimeoutMs,
              storageStatePath: storagePath,
            });
            void vscode.window.showInformationMessage(t('msg.storageSaved', { path: saved }));
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            void vscode.window.showErrorMessage(t('msg.loginFailed', { error: message }));
          }
        }
      );
    })
  );

  context.subscriptions.push({
    dispose: () => {
      void session?.dispose();
    },
  });

  const settings = getSettings();
  if (settings.autoStartSession) {
    // Небольшая пауза, чтобы Extension Host успел отрисоваться
    setTimeout(() => {
      void startBrowserSession();
    }, 600);
  }
}

export async function deactivate(): Promise<void> {
  await session?.dispose();
  session = null;
  scanStore.clear();
}
