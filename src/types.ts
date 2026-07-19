export type BrowserName = 'chromium' | 'firefox' | 'webkit';

export type LocatorStrategy =
  | 'testid'
  | 'data-name'
  | 'role'
  | 'label'
  | 'placeholder'
  | 'text'
  | 'css';

export type WarningCode =
  | 'text-dependent'
  | 'not-unique'
  | 'dynamic-class'
  | 'nth-index'
  | 'iframe'
  | 'shadow'
  | 'css-fallback'
  | 'empty-name'
  | 'row-template';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LocatorCandidate {
  strategy: LocatorStrategy;
  expression: string;
  score: number;
  unique: boolean;
  warnings: WarningCode[];
}

export interface ScannedElement {
  id: string;
  tag: string;
  role: string | null;
  /** Имя в каталоге (description / человекочитаемое) */
  name: string | null;
  /** Имя для getByRole — то, что реально в accessibility tree (aria-label, eye…) */
  roleName: string | null;
  label: string | null;
  placeholder: string | null;
  testId: string | null;
  /** data-name / name — стабильный атрибут иконок (глазик и т.п.) */
  dataName: string | null;
  /** description / title — человекочитаемое имя */
  description: string | null;
  text: string | null;
  href: string | null;
  inputType: string | null;
  interactive: boolean;
  visible: boolean;
  disabled: boolean;
  inIframe: boolean;
  inShadow: boolean;
  /** Элемент внутри строки таблицы / списка данных — не для POM как отдельное поле */
  inDataRow: boolean;
  framePath: string[];
  section: string | null;
  bbox: BoundingBox | null;
  cssPath: string;
  candidates: LocatorCandidate[];
  bestLocator: LocatorCandidate;
}

export interface ScanPageResult {
  url: string;
  title: string;
  scannedAt: string;
  screenshotBase64: string | null;
  elements: ScannedElement[];
  warnings: string[];
}

export interface ScanOptions {
  url: string;
  browser: BrowserName;
  headless: boolean;
  timeoutMs: number;
  storageStatePath?: string;
  interactiveOnly: boolean;
  visibleOnly: boolean;
  preferTestId: boolean;
}

export interface AuthOptions {
  loginUrl: string;
  email: string;
  password: string;
  emailSelector: string;
  passwordSelector: string;
  submitSelector: string;
  browser: BrowserName;
  headless: boolean;
  timeoutMs: number;
  storageStatePath: string;
}

export interface GeneratorOptions {
  className: string;
  filePath: string;
  pageUrl: string;
  elements: ScannedElement[];
  language: 'typescript' | 'javascript';
  /** Элементы уже выбраны галочками — не фильтровать заново */
  fromSelection?: boolean;
}
