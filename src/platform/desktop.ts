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
  saveFile: (payload: SaveFilePayload) => Promise<SaveFileResult | null>;
  readFile?: (filePath: string) => Promise<OpenFileResult | null>;
  writeFile?: (payload: { path: string; content: string }) => Promise<{ path: string } | null>;
  statFile?: (filePath: string) => Promise<{ path: string; mtime: number; size: number } | null>;
  printToPdf?: (payload: {
    path?: string;
    options: Record<string, unknown>;
  }) => Promise<{ path?: string; data?: string; bytes: number } | null>;
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
