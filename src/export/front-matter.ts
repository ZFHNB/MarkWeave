/**
 * YAML front matter 的读取与导出应用。
 *
 * 只支持导出相关的少量字段，采用逐行解析而不是引入完整 YAML 库：
 * front matter 里的值多为简单标量或短列表，手写解析足够且没有额外依赖。
 */

export interface FrontMatter {
  /** 文档标题 */
  title?: string;
  /** 作者，可为多个 */
  author?: string[];
  /** 文档日期 */
  date?: string;
  /** 是否生成目录 */
  toc?: boolean;
  /** 目录深度，如 3 表示到 h3 */
  tocDepth?: number;
  /** PDF 纸张，如 a4 / letter */
  papersize?: string;
  /** 其他未识别的键，原样保留 */
  extra: Record<string, string>;
}

const EMPTY: FrontMatter = { extra: {} };

/** 去掉包裹的引号 */
function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseBool(value: string): boolean | undefined {
  const v = value.trim().toLowerCase();
  if (["true", "yes", "on", "1"].includes(v)) return true;
  if (["false", "no", "off", "0"].includes(v)) return false;
  return undefined;
}

/**
 * 解析 front matter 文本（不含首尾的 ---）。
 * 无法识别的行会被忽略，不会抛异常。
 */
export function parseFrontMatter(raw: string): FrontMatter {
  if (!raw || !raw.trim()) return { ...EMPTY, extra: {} };

  const lines = raw.split(/\r?\n/);
  const result: FrontMatter = { extra: {} };

  let currentKey: string | null = null;
  let listBuffer: string[] = [];

  const flushList = () => {
    if (currentKey === "author" && listBuffer.length > 0) {
      result.author = [...listBuffer];
    }
    listBuffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // 列表项：「  - 值」
    const listMatch = trimmed.match(/^-\s+(.*)$/);
    if (listMatch && currentKey) {
      listBuffer.push(unquote(listMatch[1]));
      continue;
    }

    const kv = trimmed.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!kv) continue;

    flushList();
    currentKey = kv[1].toLowerCase();
    const value = kv[2].trim();

    // 值为空表示后面可能跟列表
    if (value === "") {
      if (currentKey === "author") listBuffer = [];
      continue;
    }

    // 行内列表：[a, b]
    const inlineList = value.match(/^\[(.*)\]$/);
    if (inlineList) {
      const items = inlineList[1]
        .split(",")
        .map((s) => unquote(s))
        .filter(Boolean);
      if (currentKey === "author") result.author = items;
      else result.extra[currentKey] = inlineList[1];
      continue;
    }

    switch (currentKey) {
      case "title":
        result.title = unquote(value);
        break;
      case "author": {
        const single = unquote(value);
        if (single) result.author = [single];
        break;
      }
      case "date":
        result.date = unquote(value);
        break;
      case "toc": {
        const b = parseBool(value);
        if (b !== undefined) result.toc = b;
        break;
      }
      case "toc_depth":
      case "tocdepth": {
        const n = parseInt(unquote(value), 10);
        if (Number.isFinite(n) && n > 0) result.tocDepth = n;
        break;
      }
      case "papersize":
      case "papersize_a4":
        result.papersize = unquote(value).toLowerCase();
        break;
      default:
        result.extra[currentKey] = unquote(value);
    }
  }

  flushList();
  return result;
}

/** 从文档的 yaml_frontmatter 节点内容中解析 */
export function frontMatterFromNode(nodeContent: string | null | undefined): FrontMatter {
  if (!nodeContent) return { ...EMPTY, extra: {} };
  return parseFrontMatter(nodeContent);
}

export interface ExportMeta {
  title?: string;
  authors: string[];
  date?: string;
  /** pandoc 用的 -M 参数 */
  metadata: Record<string, string>;
}

/**
 * 把 front matter 转成导出用的元数据。
 * `fallbackTitle` 用于 front matter 未提供标题时的兜底。
 */
export function buildExportMeta(front: FrontMatter, fallbackTitle?: string): ExportMeta {
  const title = front.title?.trim() || fallbackTitle?.trim() || undefined;

  const metadata: Record<string, string> = {};
  if (title) metadata.title = title;
  if (front.author && front.author.length > 0) metadata.author = front.author.join("; ");
  if (front.date) metadata.date = front.date;
  if (front.toc !== undefined) metadata.toc = front.toc ? "true" : "false";
  if (front.tocDepth !== undefined) metadata["toc-depth"] = String(front.tocDepth);

  return {
    title,
    authors: front.author ?? [],
    date: front.date,
    metadata,
  };
}

/** 把 HTML 导出用的 <title> 决出来 */
export function resolveHtmlTitle(front: FrontMatter, fallbackTitle: string): string {
  const fromFront = front.title?.trim();
  return fromFront && fromFront.length > 0 ? fromFront : fallbackTitle;
}

/** 将 front matter 的 papersize 映射到当前支持的纸张枚举 */
export function resolvePaperSize(
  front: FrontMatter,
  supported: readonly string[]
): string | null {
  const raw = front.papersize?.trim().toLowerCase();
  if (!raw) return null;
  const hit = supported.find((s) => s.toLowerCase() === raw);
  return hit ?? null;
}
