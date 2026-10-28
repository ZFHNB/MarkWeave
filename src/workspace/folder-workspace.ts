import { getDesktopAPI } from "../platform/desktop";
import { addRecent, type FlatFile, type RecentEntry } from "./file-tree";

const RECENT_KEY = "markweave_recent_files";
const FOLDER_KEY = "markweave_last_folder";

export interface FolderWorkspace {
  root: string;
  files: FlatFile[];
}

export function loadRecentFiles(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is RecentEntry =>
        item && typeof item.path === "string" && typeof item.title === "string" && typeof item.openedAt === "number"
    );
  } catch {
    return [];
  }
}

export function saveRecentFiles(list: RecentEntry[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // localStorage may be unavailable; recents are non-critical
  }
}

export function rememberRecentFile(path: string, title: string): RecentEntry[] {
  const next = addRecent(loadRecentFiles(), { path, title, openedAt: Date.now() });
  saveRecentFiles(next);
  return next;
}

export function clearRecentFiles(): void {
  saveRecentFiles([]);
}

export function loadLastFolder(): string | null {
  try {
    return localStorage.getItem(FOLDER_KEY);
  } catch {
    return null;
  }
}

export function rememberLastFolder(root: string | null): void {
  try {
    if (root) localStorage.setItem(FOLDER_KEY, root);
    else localStorage.removeItem(FOLDER_KEY);
  } catch {
    // ignore
  }
}

/** 打开文件夹（仅桌面版）；Web 版返回 null */
export async function openFolderWorkspace(): Promise<FolderWorkspace | null> {
  const api = getDesktopAPI();
  if (!api?.openFolder) return null;
  const result = await api.openFolder();
  if (!result) return null;
  rememberLastFolder(result.root);
  return {
    root: result.root,
    files: result.files.map((file) => ({
      name: file.name,
      path: file.path,
      relativePath: file.relativePath,
    })),
  };
}

/** 重新扫描上次打开的文件夹，用于刷新文件树 */
export async function refreshFolderWorkspace(root: string): Promise<FolderWorkspace | null> {
  const api = getDesktopAPI();
  if (!api?.listFolder) return null;
  const result = await api.listFolder(root);
  if (!result) return null;
  return {
    root: result.root,
    files: result.files.map((file) => ({
      name: file.name,
      path: file.path,
      relativePath: file.relativePath,
    })),
  };
}

/** 检测文件是否被外部修改（用于 Typora 的外部修改重载提示） */
export async function getFileMtime(path: string): Promise<number | null> {
  const api = getDesktopAPI();
  if (!api?.statFile) return null;
  const stat = await api.statFile(path);
  return stat ? stat.mtime : null;
}
