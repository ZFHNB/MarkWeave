import { Node as PMNode, Schema, DOMParser } from "prosemirror-model";
import MarkdownIt from "markdown-it";

const md = new MarkdownIt({
  html: true,
  breaks: false,
  linkify: true,
});

/**
 * 将 Markdown 纯文本解析为 ProseMirror 文档对象模型 (AST)
 */
export function markdownToDoc(markdownText: string, schema: Schema): PMNode {
  // 1. 特殊块预处理 (如数学公式块 $$ ... $$)
  let processed = markdownText.replace(/\$\$([\s\S]*?)\$\$/g, (_match, formula) => {
    return `<div data-math-block="true" data-formula="${encodeURIComponent(formula.trim())}"></div>`;
  });

  // 2. 将 Markdown 转为标准 HTML DOM
  const renderedHTML = md.render(processed);
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = renderedHTML;

  // 将数学公式占位节点还原
  tempDiv.querySelectorAll("div[data-math-block]").forEach((el) => {
    const raw = el.getAttribute("data-formula") || "";
    el.setAttribute("data-formula", decodeURIComponent(raw));
  });

  // 3. 使用 ProseMirror DOMParser 生成强类型 Document AST
  const pmParser = DOMParser.fromSchema(schema);
  return pmParser.parse(tempDiv);
}

/**
 * 将 ProseMirror Document AST 序列化回标准 Markdown (复刻 Typora toMark())
 */
export function docToMarkdown(doc: PMNode): string {
  const result: string[] = [];

  function serializeNode(node: PMNode): string {
    switch (node.type.name) {
      case "paragraph": {
        return serializeInlines(node);
      }

      case "heading": {
        const hashes = "#".repeat(node.attrs.level || 1);
        return `${hashes} ${serializeInlines(node)}`;
      }

      case "blockquote": {
        const inner = node.content.content.map(serializeNode).join("\n\n");
        return inner
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n");
      }

      case "horizontal_rule": {
        return "---";
      }

      case "code_block": {
        const lang = node.attrs.params || "";
        return `\`\`\`${lang}\n${node.textContent}\n\`\`\``;
      }

      case "math_block": {
        return `$$\n${node.attrs.formula || ""}\n$$`;
      }

      case "bullet_list": {
        return node.content.content
          .map((item) => `- ${serializeListItem(item)}`)
          .join("\n");
      }

      case "ordered_list": {
        const start = node.attrs.order || 1;
        return node.content.content
          .map((item, idx) => `${start + idx}. ${serializeListItem(item)}`)
          .join("\n");
      }

      case "task_list": {
        return node.content.content
          .map((item) => {
            const checked = item.attrs.checked ? "[x]" : "[ ]";
            return `- ${checked} ${serializeListItem(item)}`;
          })
          .join("\n");
      }

      default:
        return serializeInlines(node);
    }
  }

  function serializeListItem(item: PMNode): string {
    return item.content.content.map(serializeNode).join("\n  ");
  }

  function serializeInlines(node: PMNode): string {
    let text = "";
    node.forEach((child) => {
      if (child.isText) {
        let piece = child.text || "";
        // 按 marks 逆序包裹语法
        child.marks.forEach((mark) => {
          switch (mark.type.name) {
            case "strong":
              piece = `**${piece}**`;
              break;
            case "em":
              piece = `*${piece}*`;
              break;
            case "strike":
              piece = `~~${piece}~~`;
              break;
            case "code":
              piece = `\`${piece}\``;
              break;
            case "link":
              piece = `[${piece}](${mark.attrs.href})`;
              break;
            case "inline_math":
              piece = `$${mark.attrs.formula || piece}$`;
              break;
          }
        });
        text += piece;
      } else if (child.type.name === "image") {
        text += `![${child.attrs.alt || ""}](${child.attrs.src})`;
      } else if (child.type.name === "hard_break") {
        text += "  \n";
      }
    });
    return text;
  }

  doc.forEach((child) => {
    result.push(serializeNode(child));
  });

  return result.join("\n\n");
}
