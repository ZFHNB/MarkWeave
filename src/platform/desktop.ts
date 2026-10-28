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

export interface MarkWeaveDesktopAPI {
  isDesktop?: boolean;
  openFile: () => Promise<OpenFileResult | null>;
  saveFile: (payload: SaveFilePayload) => Promise<SaveFileResult | null>;
  readFile?: (filePath: string) => Promise<OpenFileResult | null>;
  writeFile?: (payload: { path: string; content: string }) => Promise<{ path: string } | null>;
  statFile?: (filePath: string) => Promise<{ path: string; mtime: number; size: number } | null>;
  revealInFolder?: (filePath: string) => Promise<boolean>;
  openFolder?: () => Promise<WorkspaceFolder | null>;
  listFolder?: (rootDir: string) => Promise<WorkspaceFolder | null>;
  openExternal?: (url: string) => Promise<boolean>;
  getInfo?: () => Promise<AppInfo>;
  setLanguage?: (language: string) => Promise<boolean>;
  onMenuAction: (callback: (action: string) => void) => () => void;
  onOpenPath: (callback: (filePath: string) => void) => () => void;
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
