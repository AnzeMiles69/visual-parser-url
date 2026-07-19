import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { UiLanguageSetting } from '../i18n';
import type { BrowserName } from '../types';

export interface VisualParserSettings {
  uiLanguage: UiLanguageSetting;
  defaultBrowser: BrowserName;
  autoStartSession: boolean;
  autoGeneratePageObject: boolean;
  useSystemChrome: boolean;
  cdpEndpoint: string;
  locale: string;
  timezoneId: string;
  headless: boolean;
  envFile: string;
  storageStatePath: string;
  pagesDir: string;
  componentsDir: string;
  preferTestId: boolean;
  interactiveOnly: boolean;
  visibleOnly: boolean;
  navigationTimeoutMs: number;
  loginUrl: string;
  loginEmailSelector: string;
  loginPasswordSelector: string;
  loginSubmitSelector: string;
}

export function getSettings(): VisualParserSettings {
  const cfg = vscode.workspace.getConfiguration('visualParser');
  return {
    uiLanguage: cfg.get<UiLanguageSetting>('uiLanguage', 'auto'),
    defaultBrowser: cfg.get<BrowserName>('defaultBrowser', 'chromium'),
    autoStartSession: cfg.get<boolean>('autoStartSession', false),
    autoGeneratePageObject: cfg.get<boolean>('autoGeneratePageObject', true),
    useSystemChrome: cfg.get<boolean>('useSystemChrome', true),
    cdpEndpoint: cfg.get<string>('cdpEndpoint', ''),
    locale: cfg.get<string>('locale', 'ru-RU'),
    timezoneId: cfg.get<string>('timezoneId', 'Europe/Moscow'),
    headless: cfg.get<boolean>('headless', false),
    envFile: cfg.get<string>('envFile', '.env'),
    storageStatePath: cfg.get<string>('storageStatePath', 'playwright/.auth/user.json'),
    pagesDir: cfg.get<string>('pagesDir', 'pages'),
    componentsDir: cfg.get<string>('componentsDir', 'components'),
    preferTestId: cfg.get<boolean>('preferTestId', false),
    interactiveOnly: cfg.get<boolean>('interactiveOnly', true),
    visibleOnly: cfg.get<boolean>('visibleOnly', true),
    navigationTimeoutMs: cfg.get<number>('navigationTimeoutMs', 30000),
    loginUrl: cfg.get<string>('loginUrl', ''),
    loginEmailSelector: cfg.get<string>(
      'loginEmailSelector',
      "input[type='email'], input[name='email'], input[name='username']"
    ),
    loginPasswordSelector: cfg.get<string>('loginPasswordSelector', "input[type='password']"),
    loginSubmitSelector: cfg.get<string>('loginSubmitSelector', "button[type='submit']"),
  };
}

export function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export function resolveWorkspacePath(relativePath: string): string | undefined {
  const root = getWorkspaceRoot();
  if (!root) {
    return undefined;
  }
  return path.isAbsolute(relativePath) ? relativePath : path.join(root, relativePath);
}

export function readEnvFile(envFileRelative: string): Record<string, string> {
  const envPath = resolveWorkspacePath(envFileRelative);
  const result: Record<string, string> = {};
  if (!envPath || !fs.existsSync(envPath)) {
    return result;
  }

  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const eq = line.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

export function detectLanguage(workspaceRoot: string): 'typescript' | 'javascript' {
  if (fs.existsSync(path.join(workspaceRoot, 'tsconfig.json'))) {
    return 'typescript';
  }
  return 'javascript';
}

export function storageStateExists(relativePath: string): boolean {
  const full = resolveWorkspacePath(relativePath);
  return Boolean(full && fs.existsSync(full));
}
