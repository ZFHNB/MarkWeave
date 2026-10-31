import { loadMermaid } from "../editor/diagram/mermaid-loader";
import type { Node as PMNode } from "prosemirror-model";
import { resolveMermaidTheme, getMermaidThemePreference } from "../platform/mermaid-theme";

let counter = 0;

/** 收集文档中的 Mermaid 代码块（按文档顺序） */
export function collectMermaidBlocks(doc: PMNode): string[] {
  const blocks: string[] = [];
  doc.descendants((node) => {
    if (node.type.name !== "code_block") return;
    const lang = (node.attrs.params || "").trim().toLowerCase();
    if (lang === "mermaid" || lang === "graph" || lang === "flowchart") {
      const code = node.textContent.trim();
      if (code) blocks.push(code);
    }
  });
  return blocks;
}

/**
 * 预渲染全部 Mermaid 图为 SVG 字符串，供静态 HTML 导出使用。
 * 渲染失败时以 null 占位，导出端会退回源码块。
 */
export async function renderMermaidForExport(
  doc: PMNode,
  options: { dark?: boolean } = {}
): Promise<string[]> {
  const blocks = collectMermaidBlocks(doc);
  if (!blocks.length) return [];

  const theme = resolveMermaidTheme(getMermaidThemePreference(), Boolean(options.dark));
  const mermaid = await loadMermaid();
  mermaid.initialize({
    startOnLoad: false,
    theme,
    securityLevel: "loose",
    flowchart: { curve: "basis" },
  });

  const out: string[] = [];
  for (const code of blocks) {
    try {
      const { svg } = await mermaid.render(`markweave-export-${++counter}`, code);
      out.push(svg);
    } catch {
      out.push("");
    }
  }
  return out;
}
