/**
 * 文件拖入的支持逻辑。
 *
 * 两种运行环境的差异：
 * - Electron：`File` 对象带 `path` 字段，可以直接拿到磁盘路径，
 *   走已有的 openWorkspaceFile（支持外部修改检测、最近文件等）。
 * - 浏览器：只能读 `File` 内容，没有磁盘路径，作为内存文档打开。
 *
 * 这里只做判断与归类，实际的读取在调用方。
 */

/** 允许直接作为文档打开的扩展名 */
export const DROPPABLE_EXTENSIONS = [".md", ".markdown", ".mdown", ".mkd", ".txt"];

/** 可交给 MinerU 解析为 Markdown 的扩展名 */
export const PDF_EXTENSIONS = [".pdf"];

/** 拖入的全部可接受扩展名（文档 + PDF） */
export const ALL_DROPPABLE_EXTENSIONS = [...DROPPABLE_EXTENSIONS, ...PDF_EXTENSIONS];

export interface DroppedFileInfo {
  /** 磁盘路径；浏览器环境为空 */
  path: string | null;
  name: string;
  /** 扩展名是否受支持 */
  supported: boolean;
  /** 是否为需要解析的 PDF */
  isPdf: boolean;
}

/** 判断扩展名是否可作为 Markdown 打开 */
export function isSupportedDocument(name: string): boolean {
  if (typeof name !== "string") return false;
  const lower = name.toLowerCase();
  return DROPPABLE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** 判断是否为 PDF（需要走 MinerU 解析） */
export function isPdfFile(name: string): boolean {
  if (typeof name !== "string") return false;
  return name.toLowerCase().endsWith(".pdf");
}

/** 拖入的文件是否可接受（文档或 PDF） */
export function isDroppable(name: string): boolean {
  return isSupportedDocument(name) || isPdfFile(name);
}

/**
 * 从 DataTransfer 的文件列表里提取可用于打开的文件。
 * 不支持的扩展名会被过滤掉，并在 `rejected` 里给出名称。
 *
 * @param resolvePath 取得文件磁盘路径的方法。
 *   Electron 32 起 `File.path` 已被移除，调用方应传入
 *   `webUtils.getPathForFile` 的包装（见 preload.cjs）。
 *   不传时退回到读取 `File.path`（旧版 Electron / 浏览器）。
 */
export function classifyDroppedFiles(
  files: FileList | File[],
  resolvePath?: (file: File) => string | null
): {
  accepted: DroppedFileInfo[];
  rejected: string[];
} {
  const accepted: DroppedFileInfo[] = [];
  const rejected: string[] = [];

  for (const file of Array.from(files)) {
    if (!isDroppable(file.name)) {
      rejected.push(file.name);
      continue;
    }

    let rawPath: string | null = null;
    if (resolvePath) {
      try {
        rawPath = resolvePath(file);
      } catch {
        rawPath = null;
      }
    }
    // 兼容旧版 Electron：File 上曾有一个非标准的 path 字段
    if (!rawPath) {
      const legacy = (file as File & { path?: string }).path;
      if (typeof legacy === "string") rawPath = legacy;
    }

    accepted.push({
      path: typeof rawPath === "string" && rawPath.trim() ? rawPath.trim() : null,
      name: file.name,
      supported: true,
      isPdf: isPdfFile(file.name),
    });
  }

  return { accepted, rejected };
}

/** 拖拽事件里是否携带文件（而不是普通文本选区） */
export function dragContainsFiles(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  const types = Array.from(dataTransfer.types ?? []);
  return types.includes("Files");
}

/** 拖入被拒文件时的提示文案 */
export function buildRejectedMessage(names: string[]): string {
  if (names.length === 0) return "";
  const listed = names.slice(0, 3).join("、");
  const more = names.length > 3 ? ` 等 ${names.length} 个文件` : "";
  return `不支持的文件类型：${listed}${more}。仅支持 ${ALL_DROPPABLE_EXTENSIONS.join(" / ")}。`;
}
