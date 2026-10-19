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

export interface MarkWeaveDesktopAPI {
  isDesktop?: boolean;
  openFile: () => Promise<OpenFileResult | null>;
  saveFile: (payload: SaveFilePayload) => Promise<SaveFileResult | null>;
  readFile?: (filePath: string) => Promise<OpenFileResult | null>;
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
