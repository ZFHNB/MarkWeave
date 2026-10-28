import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";

/**
 * 图片相对路径解析（对标 Typora 的 typora-root-url）。
 *
 * Markdown 中的 `![alt](image.png)` 相对于当前文档所在目录解析；
 * 若 YAML front matter 提供 `typora-root-url`，则以它为前缀。
 */

export const imageResolveKey = new PluginKey("markweave-image-resolve");

export interface ImageResolveOptions {
  getDocumentPath: () => string | null;
  getRootUrl: () => string | null;
  isDesktop: () => boolean;
}

function dirname(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index === -1 ? "" : normalized.slice(0, index);
}

/** 把 Markdown 图片 src 解析为可加载的 URL */
export function resolveImageSrc(
  src: string,
  documentPath: string | null,
  rootUrl: string | null,
  isDesktop: boolean
): string {
  if (!src) return src;
  if (/^(?:https?:|data:|file:|blob:)/i.test(src)) return src;
  if (src.startsWith("#")) return src;

  let base: string | null = null;
  if (rootUrl && src.startsWith("/")) {
    base = rootUrl.replace(/\/$/, "");
  } else if (documentPath) {
    base = dirname(documentPath);
  }

  if (!base) return src;

  const combined = src.startsWith("/") && rootUrl
    ? `${base}${src}`
    : `${base}/${src.replace(/^\.\//, "")}`;

  // 网络地址保持原样，只折叠路径中重复的斜杠
  if (/^https?:\/\//i.test(combined)) {
    return combined.replace(/([^:])\/{2,}/g, "$1/");
  }

  const cleaned = combined.replace(/\/{2,}/g, "/").replace(/^(\w):\//, "$1:/");

  // root URL 本身是网络地址时直接返回
  if (/^(?:https?:|data:|blob:)/i.test(cleaned)) return cleaned;

  if (isDesktop) {
    // Windows 绝对路径转为 file:// URL
    if (/^[a-zA-Z]:\//.test(cleaned)) return `file:///${cleaned}`;
    return `file://${cleaned}`;
  }
  return src;
}

/** 从文档的 YAML front matter 中读取 typora-root-url */
export function extractRootUrl(doc: PMNode): string | null {
  const first = doc.firstChild;
  if (!first || first.type.name !== "yaml_frontmatter") return null;
  const content = first.attrs.content || "";
  const match = /^typora-root-url:\s*(.+)$/m.exec(content);
  return match ? match[1].trim().replace(/^["']|["']$/g, "") : null;
}

export function createImageResolvePlugin(options: ImageResolveOptions): Plugin {
  return new Plugin({
    key: imageResolveKey,
    props: {
      decorations(state) {
        const decorations: Decoration[] = [];
        const documentPath = options.getDocumentPath();
        const rootUrl = extractRootUrl(state.doc) ?? options.getRootUrl();
        const isDesktop = options.isDesktop();

        state.doc.descendants((node, pos) => {
          if (node.type.name !== "image") return;
          const rawSrc = node.attrs.src || "";
          const resolved = resolveImageSrc(rawSrc, documentPath, rootUrl, isDesktop);
          if (resolved !== rawSrc) {
            decorations.push(
              Decoration.node(pos, pos + node.nodeSize, {
                "data-resolved-src": resolved,
              })
            );
          }
        });

        return DecorationSet.create(state.doc, decorations);
      },
    },
  });
}
