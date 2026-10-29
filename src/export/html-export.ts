/**
 * 独立 HTML 导出：内联主题排版、正文样式、KaTeX 与 Mermaid 图。
 *
 * 编辑器的主题样式表本身是可打包资源，这里通过 `?inline` 取到文本，
 * 供导出的单文件 HTML 直接嵌入（离线可读、无外部依赖）。
 */
import type { Node as PMNode } from "prosemirror-model";
import { toHtml } from "../editor/commands/clipboard-formats";
import katexCss from "katex/dist/katex.min.css?inline";
import githubTheme from "../styles/themes/github.css?inline";
import newsprintTheme from "../styles/themes/newsprint.css?inline";
import pixyllTheme from "../styles/themes/pixyll.css?inline";
import whiteyTheme from "../styles/themes/whitey.css?inline";
import nightTheme from "../styles/themes/night.css?inline";
import baseTheme from "../styles/typora-theme.css?inline";
import { getTheme } from "../platform/themes";

export interface HtmlExportOptions {
  title?: string;
  /** 排版主题 id，与设置项保持一致 */
  themeId?: string;
  /** 深色主题背景下 Mermaid 也使用深色配色 */
  dark?: boolean;
  /** 预渲染的 Mermaid SVG（按文档顺序） */
  mermaidSvgs?: string[];
  /** 内联的 KaTeX 字体声明（由 katex-fonts 模块按需生成） */
  katexFontCss?: string;
}

const THEME_CSS: Record<string, string> = {
  github: githubTheme,
  newsprint: newsprintTheme,
  pixyll: pixyllTheme,
  whitey: whiteyTheme,
  night: nightTheme,
};

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Typora 的主题样式以 `#write` 为根选择器；
 * 导出时把正文包进 `<article id="write">` 即可直接复用内置主题。
 */
export function buildExportCss(
  themeId?: string,
  dark?: boolean,
  katexFontCss = ""
): string {
  const theme = themeId ? getTheme(themeId) : null;
  // 自定义主题的样式直接取自注册表，内置主题使用打包后的 CSS 文本
  const themeCss = (theme?.custom ? theme.css : themeId && THEME_CSS[themeId]) || "";
  const isDark = dark ?? Boolean(theme?.dark);

  return [
    baseTheme,
    themeCss,
    katexCss,
    katexFontCss,
    // 编辑器内的自定义节点（任务列表、图表、公式块）在导出时补齐样式
    `
.md-diagram-preview svg { max-width: 100%; height: auto; }
.md-diagram-error { color: #b00; font-family: monospace; }
.task-list { list-style: none; padding-left: 1.2em; }
.task-list .task-item { list-style: none; }
.task-item > input[type="checkbox"] { margin-right: 0.4em; }
.footnote-ref { font-size: 0.75em; vertical-align: super; }
.footnote-def { font-size: 0.9em; color: #666; }
#write .math-block { text-align: center; margin: 1em 0; }
#write table { border-collapse: collapse; }
#write th, #write td { border: 1px solid var(--border-color, #ddd); padding: 6px 12px; }
body { background: ${isDark ? "#363b40" : "#fff"}; }
@media print {
  #write { max-width: none; padding: 0; }
  body { background: #fff; }
}
`,
  ].join("\n");
}

function bodyHtml(doc: PMNode, mermaidSvgs: string[] = []): string {
  let html = toHtml(doc, false);
  if (!mermaidSvgs.length) return html;

  // 按文档顺序把 mermaid 代码块替换为已渲染的 SVG
  let index = 0;
  return html.replace(/<pre><code([^>]*)>([\s\S]*?)<\/code><\/pre>/g, (whole, attrs: string) => {
    const isMermaid = /class="language-(mermaid|graph|flowchart)"/.test(attrs);
    if (!isMermaid) return whole;
    const svg = mermaidSvgs[index++];
    if (!svg) return whole;
    return `<div class="md-diagram-preview">${svg}</div>`;
  });
}

export function toStandaloneHtml(doc: PMNode, options: HtmlExportOptions = {}): string {
  const title = options.title || "MarkWeave Document";
  const css = buildExportCss(options.themeId, options.dark, options.katexFontCss);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="generator" content="MarkWeave" />
<title>${escapeHtml(title)}</title>
<style>
${css}
</style>
</head>
<body class="markweave-export">
<article id="write">
${bodyHtml(doc, options.mermaidSvgs ?? [])}
</article>
</body>
</html>`;
}
