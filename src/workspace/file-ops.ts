/**
 * 文件与行尾相关的纯逻辑（可在 Web 与 Electron 中共用、可单测）。
 */

export type LineEnding = "lf" | "crlf";

export function detectLineEnding(text: string): LineEnding {
  const crlf = (text.match(/\r\n/g) || []).length;
  const lf = (text.match(/(?<!\r)\n/g) || []).length;
  return crlf > lf ? "crlf" : "lf";
}

export function convertLineEnding(text: string, target: LineEnding): string {
  const normalized = text.replace(/\r\n/g, "\n");
  return target === "crlf" ? normalized.replace(/\n/g, "\r\n") : normalized;
}

/**
 * 确保文本以换行结束。
 *
 * 注意补的换行符要和文本现有风格一致：CRLF 文本若补一个单独的 \n，
 * 后续再做一次 CRLF 转换就会多出一个空行。
 */
export function ensureFinalNewline(text: string, enabled: boolean): string {
  if (!enabled) return text;
  if (!text) return text;
  if (text.endsWith("\r\n")) return text;
  if (text.endsWith("\n")) {
    // 已是 LF 结尾；若整体是 CRLF 风格，则改成 CRLF 结尾
    return text.includes("\r\n") ? `${text.slice(0, -1)}\r\n` : text;
  }
  return text.includes("\r\n") ? `${text}\r\n` : `${text}\n`;
}

/** 校验文件名：不能为空、不能含路径分隔符与 Windows 保留字符 */
export function isValidFileName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  if (/[\\/:*?"<>|]/.test(trimmed)) return false;
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(trimmed)) return false;
  if (/^\.+$/.test(trimmed)) return false;
  return true;
}

export function normalizeMarkdownFileName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  return /\.(md|markdown|mdown|mkd|txt)$/i.test(trimmed) ? trimmed : `${trimmed}.md`;
}

export function joinPath(dir: string, name: string): string {
  const normalizedDir = dir.replace(/[\\/]+$/, "");
  const separator = normalizedDir.includes("\\") && !normalizedDir.includes("/") ? "\\" : "/";
  return `${normalizedDir}${separator}${name}`;
}

/**
 * 取文件所在目录。
 *
 * 两种分隔符都要认：Windows 下 Electron 给回的是反斜杠路径，
 * 只按 `/` 切分会把 `D:\notes\a.md` 原样返回，后续拼上文件名就得到
 * `D:\notes\a.md\a.pdf` 这种把文件当目录的路径。
 */
export function dirname(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index === -1 ? "" : normalized.slice(0, index);
}

export function baseName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index === -1 ? normalized : normalized.slice(index + 1);
}

export function stripExtension(name: string): string {
  return name.replace(/\.(md|markdown|mdown|mkd|txt)$/i, "");
}

/**
 * 把 Markdown 里的相对路径图片展开成绝对路径。
 *
 * pandoc 拿到的是写到临时目录的 input.md，相对路径会指向临时目录，
 * 图片因此全部丢失。绝对路径和网络地址保持原样。
 */
export function absolutizeImagePaths(markdown: string, documentPath: string | null): string {
  if (!documentPath) return markdown;
  const base = dirname(documentPath);
  if (!base) return markdown;

  return markdown.replace(
    /(!\[[^\]]*\]\()([^)\s]+)(\s+"[^"]*")?(\))/g,
    (whole, open: string, src: string, title: string = "", close: string) => {
      if (!src) return whole;
      // 网络地址 / data URL / 锚点 / 已展开的 file:// 都不动
      if (/^(?:https?:|data:|file:|blob:|#|\/)/i.test(src)) return whole;
      // 已是绝对路径（含盘符）时不动
      if (/^[a-zA-Z]:[\\/]/.test(src)) return whole;
      const normalized = src.replace(/^\.\//, "");
      return `${open}${joinPath(base, normalized)}${title}${close}`;
    }
  );
}

/** 生成不冲突的副本名，如 "note (2).md" */
export function uniqueFileName(existing: Iterable<string>, candidate: string): string {
  const taken = new Set(Array.from(existing));
  if (!taken.has(candidate)) return candidate;

  const base = stripExtension(candidate);
  const extension = candidate.slice(base.length) || ".md";
  let index = 2;
  while (taken.has(`${base} (${index})${extension}`)) index++;
  return `${base} (${index})${extension}`;
}
