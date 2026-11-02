import { Node as PMNode, Schema, DOMParser } from "prosemirror-model";
import MarkdownIt from "markdown-it";
import { applyTyporaInlineRules } from "./typora-inline-rules";
import { applyTyporaBlockRules } from "./typora-block-rules";
import { applyTaskListToDom } from "./task-list-rules";
import { applyEmojiToDom } from "./emoji";
import {
  annotateReferenceLinks,
  extractLinkReferences,
  insertDefinitionPlaceholders,
  slugifyHeading,
} from "./link-references";

/**
 * 解析器的可配置语法项（对应偏好设置里的「Markdown 语法」分组）。
 */
export interface MarkdownSyntaxOptions {
  /** 单个换行是否渲染为 <br>（Typora 默认关闭） */
  softBreaksAsHardBreaks: boolean;
  /** 是否自动把裸网址识别为链接 */
  autoLink: boolean;
}

export const DEFAULT_SYNTAX_OPTIONS: MarkdownSyntaxOptions = {
  softBreaksAsHardBreaks: false,
  autoLink: true,
};

/** 当前生效的语法配置；由 UI 在设置变更时写入 */
let activeSyntax: MarkdownSyntaxOptions = { ...DEFAULT_SYNTAX_OPTIONS };

export function setMarkdownSyntaxOptions(options: Partial<MarkdownSyntaxOptions>): void {
  activeSyntax = { ...activeSyntax, ...options };
  parserCache.clear();
}

export function getMarkdownSyntaxOptions(): MarkdownSyntaxOptions {
  return { ...activeSyntax };
}

/**
 * 解析器实例按配置缓存。
 * markdown-it 的 breaks / linkify 在构造时固定，无法运行时切换，
 * 因此每种配置组合各保留一个实例。
 */
type MarkdownItInstance = InstanceType<typeof MarkdownIt>;
const parserCache = new Map<string, MarkdownItInstance>();

function buildParser(options: MarkdownSyntaxOptions): MarkdownItInstance {
  const key = `${options.softBreaksAsHardBreaks ? 1 : 0}${options.autoLink ? 1 : 0}`;
  const cached = parserCache.get(key);
  if (cached) return cached;

  const instance = new MarkdownIt({
    html: true,
    breaks: options.softBreaksAsHardBreaks,
    linkify: options.autoLink,
  });

  applyTyporaInlineRules(instance);
  applyTyporaBlockRules(instance);
  parserCache.set(key, instance);
  return instance;
}

/** 取当前配置对应的解析器 */
function currentParser(): MarkdownItInstance {
  return buildParser(activeSyntax);
}

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

  // 1.1 引用式链接：提取定义，并插入占位块以保留定义节点
  const { references, definitions } = extractLinkReferences(processed);
  if (definitions.length > 0) {
    processed = insertDefinitionPlaceholders(processed, definitions);
  }

  // 2. 将 Markdown 转为标准 HTML DOM
  const renderedHTML = currentParser().render(processed);
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = renderedHTML;

  // 2.1 标记引用式链接，便于序列化时写回 [text][id]
  annotateReferenceLinks(tempDiv, references, processed);

  // 2.2 内部锚点链接：为标题生成 id，并给 #heading 链接打标
  const headingSlugs = new Map<string, string>();
  tempDiv.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((heading) => {
    const slug = slugifyHeading(heading.textContent || "");
    heading.setAttribute("data-anchor", slug);
    headingSlugs.set(slug, heading.textContent || "");
  });
  tempDiv.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    const href = anchor.getAttribute("href") || "";
    const slug = href.slice(1);
    if (headingSlugs.has(slug)) {
      anchor.setAttribute("data-anchor", slug);
    }
  });

  // 将数学公式占位节点还原
  tempDiv.querySelectorAll("div[data-math-block]").forEach((el) => {
    const raw = el.getAttribute("data-formula") || "";
    el.setAttribute("data-formula", decodeURIComponent(raw));
  });

  // 2.25 代码块尾部换行：markdown-it 会为最后一行补一个换行符，
  //      若原样进入 AST，序列化时会再补一次，产生多余空行。
  tempDiv.querySelectorAll("pre > code").forEach((code) => {
    const last = code.lastChild;
    if (last && last.nodeType === Node.TEXT_NODE) {
      last.nodeValue = (last.nodeValue || "").replace(/\n$/, "");
    }
  });

  // 2.3 GFM 任务列表（在 DOM 上转换 `- [ ]` 列表项）
  applyTaskListToDom(tempDiv);

  // 3. Typora 风格 Emoji 短代码（跳过 code/pre）
  applyEmojiToDom(tempDiv);

  // 4. 使用 ProseMirror DOMParser 生成强类型 Document AST
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
        // 去掉编辑器可能残留的单个尾部换行，避免往返后多出空行
        const body = node.textContent.replace(/\n$/, "");
        return `\`\`\`${lang}\n${body}\n\`\`\``;
      }

      case "math_block": {
        return `$$\n${node.attrs.formula || ""}\n$$`;
      }

      case "yaml_frontmatter": {
        return `---\n${node.attrs.content || ""}\n---`;
      }

      case "toc_block": {
        return "[toc]";
      }

      case "footnote_definition": {
        const id = node.attrs.id || "";
        const content = (node.attrs.content || "").split("\n").join("\n  ");
        return `[^${id}]: ${content}`;
      }

      case "link_reference_definition": {
        const title = node.attrs.title ? ` "${node.attrs.title}"` : "";
        return `[${node.attrs.id}]: ${node.attrs.href}${title}`;
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

  /** 按 mark 种类定义包裹方式 */
  function wrapWithMark(piece: string, mark: any, inTable: boolean): string {
    switch (mark.type.name) {
      case "strong":
        return `**${piece}**`;
      case "em":
        return `*${piece}*`;
      case "strike":
        return `~~${piece}~~`;
      case "highlight":
        return `==${piece}==`;
      case "superscript":
        return `^${piece}^`;
      case "subscript":
        return `~${piece}~`;
      case "code":
        return `\`${piece}\``;
      case "link": {
        if (mark.attrs.reference) {
          return mark.attrs.referenceCollapsed
            ? `[${piece}][]`
            : `[${piece}][${mark.attrs.reference}]`;
        }
        const title = mark.attrs.title ? ` "${mark.attrs.title}"` : "";
        return `[${piece}](${mark.attrs.href}${title})`;
      }
      case "inline_math": {
        const formula = mark.attrs.formula || piece;
        return `$${inTable ? formula.replace(/\|/g, "\\|") : formula}$`;
      }
      default:
        return piece;
    }
  }

  /** 包裹顺序：code 最内层，其次数学，再由内向外 */
  function markRank(mark: any): number {
    if (mark.type.name === "code") return 0;
    if (mark.type.name === "inline_math") return 1;
    return 2;
  }

  /**
   * 把一组文本片段按「mark 组合」重新分段并序列化。
   *
   * 难点：加粗若跨越「普通文字 + 行内代码」，逐段包裹会得到
   *   **a**`b`**c**
   * 相邻的 ** 会被 Markdown 解析器合并，导致强调边界错位。
   *
   * 解决：以外层 mark 为界递归。同一外层 mark 覆盖的连续片段先合到一起，
   * 只包裹一次，内部再分别处理各自的内层 mark。
   */
  function serializePieces(
    pieces: { text: string; marks: any[] }[],
    inTable: boolean
  ): string {
    if (pieces.length === 0) return "";

    // 找出所有片段共有的最外层 mark 候选：取第一个片段的 marks 中
    // 能覆盖全部片段的那个（其余片段都含有等价的 mark）
    const first = pieces[0];
    const common = first.marks.filter((candidate) =>
      pieces.every((p) => p.marks.some((m) => m.eq(candidate)))
    );

    if (common.length === 0) {
      // 没有共同 mark：逐个片段独立处理
      return pieces
        .map((p) => {
          if (p.marks.length === 0) return p.text;
          const inner = serializePieces(
            [{ text: p.text, marks: [] }],
            inTable
          );
          const ordered = [...p.marks].sort((a, b) => markRank(a) - markRank(b));
          return ordered.reduce((out, mark) => wrapWithMark(out, mark, inTable), inner);
        })
        .join("");
    }

    // 取优先级最低（最外层）的共同 mark 作为外层包裹
    const outer = common.sort((a, b) => markRank(a) - markRank(b)).pop();

    const inner = serializePieces(
      pieces.map((p) => ({
        text: p.text,
        marks: p.marks.filter((m) => !m.eq(outer!)),
      })),
      inTable
    );

    return wrapWithMark(inner, outer, inTable);
  }

  function serializeInlines(node: PMNode, inTable = false): string {
    const pieces: { text: string; marks: any[] }[] = [];

    node.forEach((child) => {
      if (child.isText) {
        let piece = child.text || "";
        if (inTable) piece = piece.replace(/\|/g, "\\|");
        if (piece) pieces.push({ text: piece, marks: child.marks as any[] });
        return;
      }

      if (child.type.name === "image") {
        const title = child.attrs.title ? ` "${child.attrs.title}"` : "";
        pieces.push({
          text: `![${child.attrs.alt || ""}](${child.attrs.src}${title})`,
          marks: [],
        });
      } else if (child.type.name === "hard_break") {
        pieces.push({ text: inTable ? "<br>" : "  \n", marks: [] });
      } else if (child.type.name === "footnote_ref") {
        pieces.push({ text: `[^${child.attrs.id || ""}]`, marks: [] });
      }
    });

    return serializePieces(pieces, inTable);
  }

  doc.forEach((child) => {
    result.push(serializeNode(child));
  });

  const joined = result.join("\n\n");
  return joined.trim() === "" ? "" : joined;
}
