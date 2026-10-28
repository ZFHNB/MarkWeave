import { Node as PMNode, Schema, DOMParser } from "prosemirror-model";
import MarkdownIt from "markdown-it";
import { applyTyporaInlineRules } from "./typora-inline-rules";

const md = new MarkdownIt({
  html: true,
  breaks: false,
  linkify: true,
});

applyTyporaInlineRules(md);

/**
 * 将 Markdown 纯文本解析为 ProseMirror 文档对象模型 (AST)
 */
export function markdownToDoc(markdownText: string, schema: Schema): PMNode {
  // 处理空字符串或纯空白文档，确保返回纯净空段落
  if (!markdownText || !markdownText.trim()) {
    return schema.nodes.doc.createAndFill() || schema.node("doc", null, [schema.node("paragraph")]);
  }

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

  function serializeNode(node: PMNode, depth = 0): string {
    switch (node.type.name) {
      case "paragraph": {
        return serializeInlines(node);
      }

      case "heading": {
        const hashes = "#".repeat(node.attrs.level || 1);
        return `${hashes} ${serializeInlines(node)}`;
      }

      case "blockquote": {
        const inner = node.content.content.map((child) => serializeNode(child, depth)).join("\n\n");
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
        const indent = "  ".repeat(depth);
        return node.content.content
          .map((item) => `${indent}- ${serializeListItem(item, depth)}`)
          .join("\n");
      }

      case "ordered_list": {
        const start = node.attrs.order || 1;
        const indent = "  ".repeat(depth);
        return node.content.content
          .map((item, idx) => `${indent}${start + idx}. ${serializeListItem(item, depth)}`)
          .join("\n");
      }

      case "task_list": {
        const indent = "  ".repeat(depth);
        return node.content.content
          .map((item) => {
            const checked = item.attrs.checked ? "[x]" : "[ ]";
            return `${indent}- ${checked} ${serializeListItem(item, depth)}`;
          })
          .join("\n");
      }

      case "table": {
        const rows: PMNode[] = [];
        node.forEach((child) => {
          if (child.type.name === "table_row") {
            rows.push(child);
          }
        });

        if (rows.length === 0) {
          return "";
        }

        const rawRows: PMNode[][] = [];
        for (const row of rows) {
          const cells: PMNode[] = [];
          row.forEach((cell) => {
            if (cell.type.name === "table_cell" || cell.type.name === "table_header") {
              cells.push(cell);
            }
          });
          rawRows.push(cells);
        }

        let maxCols = 0;
        for (const cells of rawRows) {
          if (cells.length > maxCols) {
            maxCols = cells.length;
          }
        }

        if (maxCols === 0) {
          return "";
        }

        // 确定每一列的对齐方式，优先取包含该列的第一行的对齐属性，缺省为 left
        const alignments: string[] = [];
        for (let c = 0; c < maxCols; c++) {
          let align = "left";
          for (const cells of rawRows) {
            if (cells[c] && cells[c].attrs && cells[c].attrs.alignment) {
              align = cells[c].attrs.alignment;
              break;
            }
          }
          alignments.push(align);
        }

        const delimiterCells = alignments.map((align) => {
          switch (align?.toLowerCase()) {
            case "center":
              return ":---:";
            case "right":
              return "---:";
            case "left":
            default:
              return ":---";
          }
        });
        const delimiterRow = `| ${delimiterCells.join(" | ")} |`;

        const serializedRows: string[] = [];
        for (const rawCells of rawRows) {
          let cells = rawCells;
          if (cells.length > maxCols) {
            console.warn(
              `Table row has ${cells.length} cells, exceeding column count ${maxCols}. Truncating.`
            );
            cells = cells.slice(0, maxCols);
          }
          const cellTexts = cells.map((cell) => serializeTableCell(cell));
          while (cellTexts.length < maxCols) {
            cellTexts.push("");
          }
          serializedRows.push(`| ${cellTexts.join(" | ")} |`);
        }

        const tableLines = [serializedRows[0], delimiterRow, ...serializedRows.slice(1)];
        return tableLines.join("\n");
      }

      default:
        return serializeInlines(node);
    }
  }

  function serializeListItem(item: PMNode, depth: number): string {
    return item.content.content
      .map((block) => {
        if (
          block.type.name === "bullet_list" ||
          block.type.name === "ordered_list" ||
          block.type.name === "task_list"
        ) {
          return serializeNode(block, depth + 1);
        }
        return serializeNode(block, depth);
      })
      .join("\n");
  }

  function serializeTableCell(cell: PMNode): string {
    if (cell.inlineContent) {
      return serializeInlines(cell, true).trim();
    }
    const blocks: string[] = [];
    cell.forEach((child) => {
      if (child.type.name === "paragraph") {
        blocks.push(serializeInlines(child, true));
      }
    });
    return blocks.join("<br>").trim();
  }

  function serializeInlines(node: PMNode, inTable = false): string {
    let text = "";
    node.forEach((child) => {
      if (child.isText) {
        let piece = child.text || "";
        if (inTable) {
          piece = piece.replace(/\|/g, "\\|");
        }
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
            case "highlight":
              piece = `==${piece}==`;
              break;
            case "superscript":
              piece = `^${piece}^`;
              break;
            case "subscript":
              piece = `~${piece}~`;
              break;
            case "code":
              piece = `\`${piece}\``;
              break;
            case "link": {
              const title = mark.attrs.title ? ` "${mark.attrs.title}"` : "";
              piece = `[${piece}](${mark.attrs.href}${title})`;
              break;
            }
            case "inline_math": {
              const formula = mark.attrs.formula || piece;
              piece = `$${inTable ? formula.replace(/\|/g, "\\|") : formula}$`;
              break;
            }
          }
        });
        text += piece;
      } else if (child.type.name === "image") {
        const title = child.attrs.title ? ` "${child.attrs.title}"` : "";
        text += `![${child.attrs.alt || ""}](${child.attrs.src}${title})`;
      } else if (child.type.name === "hard_break") {
        text += inTable ? "<br>" : "  \n";
      }
    });
    return text;
  }

  doc.forEach((child) => {
    result.push(serializeNode(child));
  });

  const joined = result.join("\n\n");
  return joined.trim() === "" ? "" : joined;
}
