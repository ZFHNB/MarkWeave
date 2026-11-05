/**
 * 图片上下文操作中的纯逻辑。
 *
 * 与 DOM 无关的部分都放在这里，便于单测；真正的写剪贴板 / 弹保存框
 * 由 ImageContextMenu 注入的回调完成。
 */

/** 图片 src 可能的几种形态 */
export type ImageSourceKind = "data" | "remote" | "file" | "relative";

export function classifyImageSrc(src: string): ImageSourceKind {
  if (!src) return "relative";
  if (/^data:/i.test(src)) return "data";
  if (/^https?:|^blob:/i.test(src)) return "remote";
  if (/^file:\/\//i.test(src) || /^[a-zA-Z]:[\\/]/.test(src)) return "file";
  return "relative";
}

/**
 * 把图片 src 解析成磁盘路径。
 *
 * 相对路径按当前文档所在目录展开；data/网络地址没有对应文件，返回 null。
 * `documentPath` 为空（文档尚未保存）时同样返回 null——此时无法确定基准目录。
 */
export function resolveImageFilePath(src: string, documentPath: string | null): string | null {
  const kind = classifyImageSrc(src);
  if (kind === "data" || kind === "remote") return null;

  if (kind === "file") {
    if (/^file:\/\//i.test(src)) {
      const decoded = decodeURI(src.replace(/^file:\/\/\/?/i, ""));
      return decoded.replace(/^\/([a-zA-Z]:)/, "$1");
    }
    return src;
  }

  // 相对路径：需要文档目录作为基准
  if (!documentPath) return null;
  const docDir = documentPath.replace(/\\/g, "/").replace(/\/[^/]*$/, "");
  const clean = src.replace(/^\.\//, "");
  return docDir ? `${docDir}/${clean}` : clean;
}

/** 从路径推断图片扩展名对应的 MIME（无扩展名时退回 png） */
export function mimeForExtension(filePath: string): string {
  const ext = (filePath.split(".").pop() || "").toLowerCase();
  const map: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    bmp: "image/bmp",
    avif: "image/avif",
  };
  return map[ext] || "image/png";
}

/** 文件名（用于「另存为」的默认名） */
export function imageFileName(src: string): string {
  const kind = classifyImageSrc(src);
  if (kind === "data") {
    const mime = /^data:([^;,]+)/i.exec(src)?.[1] || "image/png";
    const ext = mime.split("/")[1]?.replace("svg+xml", "svg") || "png";
    return `pasted-image.${ext}`;
  }
  const clean = src.split("?")[0].split("#")[0];
  const name = clean.replace(/\\/g, "/").split("/").pop() || "image.png";
  return name || "image.png";
}

/** 图片是否可"在文件夹中显示"（只有真实磁盘文件才可以） */
export function canRevealImage(src: string, documentPath: string | null): boolean {
  return resolveImageFilePath(src, documentPath) !== null;
}
