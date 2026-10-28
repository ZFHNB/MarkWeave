/**
 * 引用式链接（reference-style links）的保真支持。
 *
 * markdown-it 默认会把 `[text][id]` 解析成普通 `<a>`，并在输出中丢弃
 * `[id]: url` 定义。为了让编辑体验与 Typora 一致，同时保证纯文本可逆：
 *
 *   1. 解析前提取所有 `[id]: url "title"` 定义，写入 link mark 的
 *      `reference` 属性，并保留定义块作为 `link_reference_definition` 节点。
 *   2. 序列化时，带 `reference` 的链接写回 `[text][id]`，定义块原样输出。
 */

export interface LinkReference {
  id: string;
  href: string;
  title: string | null;
}

const DEFINITION_LINE = /^\s{0,3}\[([^\]^]+)\]:\s*(\S+?)(?:\s+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?\s*$/;

export function extractLinkReferences(markdown: string): {
  references: Map<string, LinkReference>;
  markdown: string;
  definitions: LinkReference[];
} {
  const references = new Map<string, LinkReference>();
  const definitions: LinkReference[] = [];
  const keptLines: string[] = [];
  let inFence = false;

  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      keptLines.push(line);
      continue;
    }

    const match = inFence ? null : DEFINITION_LINE.exec(line);
    if (match) {
      const id = match[1].trim();
      const href = match[2];
      const title = match[3] ?? match[4] ?? match[5] ?? null;
      const ref: LinkReference = { id, href, title };
      references.set(id.toLowerCase(), ref);
      definitions.push(ref);
      keptLines.push(line);
    } else {
      keptLines.push(line);
    }
  }

  return { references, markdown: keptLines.join("\n"), definitions };
}

/**
 * 在定义行之后插入占位块。定义行本身保留给 markdown-it 用于解析引用，
 * 占位块则让定义以节点形式出现在文档中并可被序列化。
 */
export function insertDefinitionPlaceholders(markdown: string, definitions: LinkReference[]): string {
  if (definitions.length === 0) return markdown;
  const byId = new Map(definitions.map((ref) => [ref.id, ref]));

  return markdown
    .split(/\r?\n/)
    .map((line) => {
      const match = DEFINITION_LINE.exec(line);
      if (!match) return line;
      const id = match[1].trim();
      const ref = byId.get(id);
      if (!ref) return line;
      const escapeAttr = (value: string) => value.replace(/"/g, "&quot;");
      const placeholder = `<div class="md-link-def" data-ref-id="${escapeAttr(
        ref.id
      )}" data-ref-href="${escapeAttr(ref.href)}" data-ref-title="${escapeAttr(
        ref.title || ""
      )}"></div>`;
      return `${line}\n${placeholder}`;
    })
    .join("\n");
}

/** markdown-it 解析后：把 `<a>` 恢复成带 reference 信息的标记 */
export function annotateReferenceLinks(
  root: HTMLElement,
  references: Map<string, LinkReference>,
  originalMarkdown: string
): void {
  if (references.size === 0) return;

  const anchors = Array.from(root.querySelectorAll("a[href]")) as HTMLAnchorElement[];
  for (const anchor of anchors) {
    const href = anchor.getAttribute("href") || "";
    const title = anchor.getAttribute("title");
    // 找到与当前 href/title 匹配且确实以引用形式出现的定义
    for (const ref of references.values()) {
      if (ref.href === href && (ref.title ?? null) === (title ?? null)) {
        const id = ref.id;
        const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const referenceUse = new RegExp(`\\[[^\\]]*\\]\\[${escaped}\\]`, "i");
        const collapsedUse = new RegExp(`\\[${escaped}\\]\\[\\]`, "i");
        if (referenceUse.test(originalMarkdown) || collapsedUse.test(originalMarkdown)) {
          anchor.setAttribute("data-link-reference", id);
          if (collapsedUse.test(originalMarkdown) && !referenceUse.test(originalMarkdown)) {
            anchor.setAttribute("data-link-reference-collapsed", "true");
          }
          break;
        }
      }
    }
  }
}

export function serializeLinkReference(text: string, id: string): string {
  return `[${text}][${id}]`;
}

export function serializeDefinition(ref: LinkReference): string {
  const title = ref.title ? ` "${ref.title}"` : "";
  return `[${ref.id}]: ${ref.href}${title}`;
}

/**
 * 计算标题的 GitHub 风格锚点 id（小写、去标点、空格转连字符）。
 * 与 Typora/GFM 的 `#block-elements` 行为一致。
 */
export function slugifyHeading(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[`~!@#$%^&*()+=[\]{}\\|;:'",.<>/?]/g, "")
    .replace(/\s+/g, "-");
}
