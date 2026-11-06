import { getDesktopAPI } from "../platform/desktop";
import { joinPath, normalizeMarkdownFileName, uniqueFileName } from "./file-ops";

export interface FileOpResult {
  ok: boolean;
  path?: string;
  error?: string;
}

function unavailable(): FileOpResult {
  return { ok: false, error: "unsupported" };
}

/** 在文件夹内新建 Markdown 文件，自动避开重名 */
export async function createMarkdownFile(
  folder: string,
  name: string,
  existingNames: string[],
  content = ""
): Promise<FileOpResult> {
  const api = getDesktopAPI();
  if (!api?.createFile) return unavailable();

  const normalized = normalizeMarkdownFileName(name);
  if (!normalized) return { ok: false, error: "invalid-name" };

  const fileName = uniqueFileName(existingNames, normalized);
  const result = await api.createFile({ path: joinPath(folder, fileName), content });
  if (!result?.path) return { ok: false, error: result?.error || "failed" };
  return { ok: true, path: result.path };
}

export async function createSubFolder(folder: string, name: string): Promise<FileOpResult> {
  const api = getDesktopAPI();
  if (!api?.createFolder) return unavailable();
  const result = await api.createFolder(joinPath(folder, name.trim()));
  if (!result?.path) return { ok: false, error: result?.error || "failed" };
  return { ok: true, path: result.path };
}

export async function renamePath(from: string, to: string): Promise<FileOpResult> {
  const api = getDesktopAPI();
  if (!api?.renamePath) return unavailable();
  if (from === to) return { ok: true, path: to };
  const result = await api.renamePath({ from, to });
  if (!result?.path) return { ok: false, error: result?.error || "failed" };
  return { ok: true, path: result.path };
}

export async function trashPath(path: string): Promise<FileOpResult> {
  const api = getDesktopAPI();
  if (!api?.trashPath) return unavailable();
  const result = await api.trashPath(path);
  if (!result?.path) return { ok: false, error: result?.error || "failed" };
  return { ok: true, path: result.path };
}

export async function revealPath(path: string): Promise<boolean> {
  const api = getDesktopAPI();
  if (!api?.revealInFolder) return false;
  return api.revealInFolder(path);
}
