import type { Node as PMNode } from "prosemirror-model";
import { schema } from "../schema";
import { docToMarkdown } from "../serializer/markdown";

/**
 * 复制 / 导出为多种格式（对标 Typora 的 Copy / Paste As）。
 * 全部基于 ProseMirror 文档树，不依赖编辑器 DOM，便于测试。
 */

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function toMarkdown(doc: PMNode): string {
  return docToMarkdown(doc);
}

export function toPlainText(doc: PMNode): string {
  return doc.textBetween(0, doc.content.size, "\n\n");
}

function serializeInline(node: PMNode): string {
  let out = "";
  node.forEach((child) => {
    if (child.isText) {
      let html = escapeHtml(child.text || "");
      child.marks.forEach((mark) => {
        switch (mark.type.name) {
          case "strong":
            html = `<strong>${html}</strong>`;
            break;
          case "em":
            html = `<em>${html}</em>`;
            break;
          case "strike":
            html = `<del>${html}</del>`;
            break;
          case "highlight":
            html = `<mark>${html}</mark>`;
            break;
          case "superscript":
            html = `<sup>${html}</sup>`;
            break;
          case "subscript":
            html = `<sub>${html}</sub>`;
            break;
          case "code":
            html = `<code>${html}</code>`;
            break;
          case "link":
            html = `<a href="${escapeHtml(mark.attrs.href || "")}">${html}</a>`;
            break;
          case "inline_math":
            html = `<span class="math">$${escapeHtml(mark.attrs.formula || "")}$</span>`;
            break;
        }
      });
      out += html;
    } else if (child.type.name === "image") {
      out += `<img src="${escapeHtml(child.attrs.src || "")}" alt="${escapeHtml(
        child.attrs.alt || ""
      )}" />`;
    } else if (child.type.name === "hard_break") {
      out += "<br />";
    } else if (child.type.name === "footnote_ref") {
      out += `<sup class="footnote-ref">${escapeHtml(child.attrs.id || "")}</sup>`;
    }
  });
  return out;
}

function serializeBlock(node: PMNode, inList = false): string {
  switch (node.type.name) {
    case "paragraph":
      return inList ? serializeInline(node) : `<p>${serializeInline(node)}</p>`;
    case "heading": {
      const level = node.attrs.level || 1;
      return `<h${level}>${serializeInline(node)}</h${level}>`;
    }
    case "blockquote":
      return `<blockquote>${node.content.content.map((child) => serializeBlock(child)).join("\n")}</blockquote>`;
    case "horizontal_rule":
      return "<hr />";
    case "code_block": {
      const lang = node.attrs.params || "";
      return `<pre><code${lang ? ` class="language-${escapeHtml(lang)}"` : ""}>${escapeHtml(
        node.textContent
      )}</code></pre>`;
    }
    case "math_block":
      return `<div class="math-block">$$${escapeHtml(node.attrs.formula || "")}$$</div>`;
    case "bullet_list":
      return `<ul>${node.content.content
        .map((item) => `<li>${item.content.content.map((child) => serializeBlock(child, true)).join("")}</li>`)
        .join("")}</ul>`;
    case "ordered_list":
      return `<ol>${node.content.content
        .map((item) => `<li>${item.content.content.map((child) => serializeBlock(child, true)).join("")}</li>`)
        .join("")}</ol>`;
    case "task_list":
      return `<ul class="task-list">${node.content.content
        .map(
          (item) =>
            `<li class="task-item"><input type="checkbox" disabled ${
              item.attrs.checked ? "checked" : ""
            } /> ${item.content.content.map((child) => serializeBlock(child, true)).join("")}</li>`
        )
        .join("")}</ul>`;
    case "table": {
      const rows: string[] = [];
      let isFirstRow = true;
      node.forEach((row) => {
        const cells: string[] = [];
        row.forEach((cell) => {
          const tag = isFirstRow ? "th" : "td";
          const align = cell.attrs.alignment;
          const style = align && align !== "left" ? ` style="text-align:${align}"` : "";
          cells.push(`<${tag}${style}>${cell.content.content.map((child) => serializeInline(child)).join("")}</${tag}>`);
        });
        rows.push(`<tr>${cells.join("")}</tr>`);
        isFirstRow = false;
      });
      return `<table>${rows.join("")}</table>`;
    }
    case "toc_block":
      return `<nav class="toc"></nav>`;
    case "yaml_frontmatter":
      // 导出时 front matter 已转成文档元数据，不再作为正文出现
      return "";
    case "footnote_definition":
      return `<div class="footnote-def"><sup>${escapeHtml(node.attrs.id || "")}</sup> ${escapeHtml(
        node.attrs.content || ""
      )}</div>`;
    case "link_reference_definition":
      return "";
    default:
      return serializeInline(node);
  }
}

export function toHtml(doc: PMNode, includeStyles = false): string {
  const body = doc.content.content.map((child) => serializeBlock(child)).join("\n");
  if (!includeStyles) return body;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
body { font-family: -apple-system, "Segoe UI", sans-serif; line-height: 1.65; max-width: 820px; margin: 40px auto; padding: 0 20px; color: #333; }
h1,h2,h3,h4,h5,h6 { font-weight: 600; line-height: 1.3; margin: 1.4em 0 0.6em; }
p { margin: 0.8em 0; }
pre { background: #f6f8fa; padding: 12px; border-radius: 6px; overflow-x: auto; }
code { font-family: ui-monospace, Consolas, monospace; }
blockquote { border-left: 3px solid #ddd; margin: 1em 0; padding: 0.2em 1em; color: #555; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #ddd; padding: 6px 12px; }
mark { background: #fff3a3; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

export function toMathMl(formula: string): string {
  return `<math><mtext>${escapeHtml(formula)}</mtext></math>`;
}

export function toTex(doc: PMNode): string {
  const parts: string[] = [];
  doc.descendants((node) => {
    if (node.type.name === "math_block") {
      parts.push(`\\[\n${node.attrs.formula || ""}\n\\]`);
    } else if (node.isText) {
      node.marks.forEach((mark) => {
        if (mark.type.name === "inline_math") {
          parts.push(`$${mark.attrs.formula || ""}$`);
        }
      });
    }
    return true;
  });
  return parts.join("\n");
}

export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export function parsePlainTextToDoc(text: string): PMNode {
  const paragraphs = text.split(/\r?\n\r?\n/);
  const nodes = paragraphs.map((block) => {
    const lines = block.split(/\r?\n/);
    const inline: PMNode[] = [];
    lines.forEach((line, index) => {
      if (index > 0) inline.push(schema.nodes.hard_break.create());
      if (line) inline.push(schema.text(line));
    });
    return schema.nodes.paragraph.create(null, inline);
  });
  return schema.nodes.doc.create(null, nodes.length > 0 ? nodes : [schema.nodes.paragraph.create()]);
}
