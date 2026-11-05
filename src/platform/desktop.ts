export interface SaveFilePayload {
  path?: string;
  content: string;
  suggestedName?: string;
}

export interface SaveFileResult {
  path: string;
}

export interface OpenFileResult {
  path: string;
  content: string;
}

export interface AppInfo {
  version: string;
  dataDir: string;
  portable: boolean;
}

export interface WorkspaceFolder {
  root: string;
  files: {
    name: string;
    path: string;
    relativePath: string;
    size?: number;
    mtime?: number;
  }[];
}

export interface CustomThemePayload {
  id: string;
  label: string;
  css: string;
  path: string;
}

export interface MarkWeaveDesktopAPI {
  isDesktop?: boolean;
  openFile: () => Promise<OpenFileResult | null>;
  /**
   * 取拖入文件的磁盘路径。
   *
   * Electron 32+ 移除了 `File.path`，必须通过主进程的 webUtils 获取。
   * 浏览器环境或取不到时返回 null。
   */
  getPathForFile?: (file: File) => string | null;
  saveFile: (payload: SaveFilePayload) => Promise<SaveFileResult | null>;
  readFile?: (filePath: string) => Promise<OpenFileResult | null>;
  /** 把本地图片读成 data URL（二进制安全，供 HTML 导出内联） */
  readImage?: (filePath: string) => Promise<{ dataUrl: string } | null>;
  /** 把图片写入系统剪贴板（dataUrl 或磁盘路径二选一） */
  copyImage?: (payload: {
    dataUrl?: string;
    path?: string;
  }) => Promise<{ ok: boolean; error?: string } | null>;
  /** 图片另存为；用户取消时返回 canceled */
  saveImageAs?: (payload: {
    dataUrl?: string;
    path?: string;
    suggestedName?: string;
  }) => Promise<{ ok: boolean; path?: string; error?: string; canceled?: boolean } | null>;
  writeFile?: (payload: { path: string; content: string }) => Promise<{ path: string } | null>;
  /** 把 data URL 图片写入文档旁附件目录，返回绝对路径 */
  saveImage?: (payload: {
    directory: string;
    dataUrl: string;
    name?: string;
  }) => Promise<{ ok: boolean; path?: string; bytes?: number; error?: string } | null>;
  statFile?: (filePath: string) => Promise<{ path: string; mtime: number; size: number } | null>;
  printToPdf?: (payload: {
    /** 建议路径（保存对话框的初始位置）；最终位置由用户确认 */
    path?: string;
    suggestedName?: string;
    options: Record<string, unknown>;
  }) => Promise<{
    path?: string;
    data?: string;
    bytes?: number;
    error?: string;
    /** 用户取消了保存对话框 */
    canceled?: boolean;
  } | null>;
  createFile?: (payload: { path: string; content: string }) => Promise<{ path?: string; error?: string } | null>;
  createFolder?: (folderPath: string) => Promise<{ path?: string; error?: string } | null>;
  renamePath?: (payload: { from: string; to: string }) => Promise<{ path?: string; error?: string } | null>;
  trashPath?: (filePath: string) => Promise<{ path?: string; error?: string } | null>;
  revealInFolder?: (filePath: string) => Promise<boolean>;
  openFolder?: () => Promise<WorkspaceFolder | null>;
  listFolder?: (rootDir: string) => Promise<WorkspaceFolder | null>;
  openExternal?: (url: string) => Promise<boolean>;
  getInfo?: () => Promise<AppInfo>;
  setLanguage?: (language: string) => Promise<boolean>;
  listCustomThemes?: () => Promise<CustomThemePayload[]>;
  writeHistory?: (payload: { path: string; content: string }) => Promise<{ path: string } | null>;
  listHistory?: (dir: string) => Promise<string[]>;
  removeHistory?: (payload: { dir: string; names: string[] }) => Promise<number>;
  chooseDirectory?: () => Promise<string | null>;
  openThemesFolder?: () => Promise<{ path: string | null }>;
  onMenuAction: (callback: (action: string) => void) => () => void;
  onOpenPath: (callback: (filePath: string) => void) => () => void;
  onCloseRequested?: (callback: () => void) => () => void;
  confirmClose?: () => void;
  detectPandoc?: () => Promise<{ available: boolean; version: string | null; error: string | null }>;
  mineruSaveKey?: (apiKey: string) => Promise<{ ok: boolean; error?: string }>;
  mineruLoadKey?: () => Promise<{
    present: boolean;
    apiKey: string | null;
    source: "env" | "keychain" | "none";
    masked?: string;
    error?: string;
  }>;
  mineruClearKey?: () => Promise<{ ok: boolean; error?: string }>;
  mineruTestConnection?: (apiKey?: string) => Promise<{
    ok: boolean;
    kind: string;
    message: string;
    status?: number;
    elapsedMs?: number;
  }>;
  mineruDetectLocal?: () => Promise<{
    available: boolean;
    command: string | null;
    version: string | null;
    detail: string;
  }>;
  mineruParseLocal?: (payload: {
    pdfPath: string;
    command?: string;
    timeoutMs?: number;
  }) => Promise<{ ok: boolean; markdown?: string; error?: string; command?: string; source?: string }>;
  mineruParseCloud?: (payload: {
    pdfPath: string;
    enableOcr?: boolean;
    enableFormula?: boolean;
    language?: "ch" | "en";
    pollIntervalMs?: number;
    timeoutMs?: number;
  }) => Promise<{
    ok: boolean;
    markdown?: string;
    zipUrl?: string;
    error?: string;
    kind?: string;
    code?: string;
    retryable?: boolean;
  }>;
  convertWithPandoc?: (payload: {
    markdown: string;
    format: string;
    outputPath?: string;
    suggestedName?: string;
    metadata?: Record<string, string>;
  }) => Promise<{ ok: boolean; path?: string; bytes?: number; error?: string | null; canceled?: boolean }>;
}

declare global {
  interface Window {
    markweave?: MarkWeaveDesktopAPI;
  }
}

export function getDesktopAPI(): MarkWeaveDesktopAPI | null {
  if (typeof window !== "undefined" && window.markweave) {
    return window.markweave;
  }
  return null;
}

export function isDesktop(): boolean {
  return getDesktopAPI() !== null;
}
