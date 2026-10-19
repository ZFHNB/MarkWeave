import type { Node as PMNode } from "prosemirror-model";
import { Plugin, type EditorState } from "prosemirror-state";
import { isInTable } from "prosemirror-tables";
import { schema } from "../schema";
import { markdownToDoc } from "../serializer/markdown";

function isDelimiterRow(line: string): boolean {
  let trimmed = line.trim();
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
  if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
  const cells = trimmed.split("|").map((c) => c.trim());
  if (cells.length === 0) return false;
  return cells.every((c) => /^:?-{3,}:?$/.test(c));
}

function isInCodeBlock(state: EditorState): boolean {
  const { $from, $to } = state.selection;
  for (const pos of [$from, $to]) {
    if (pos.parent.type.spec.code || pos.parent.type.name === "code_block") {
      return true;
    }
    for (let d = pos.depth; d > 0; d--) {
      const node = pos.node(d);
      if (node.type.spec.code || node.type.name === "code_block") {
        return true;
      }
    }
  }
  return false;
}

function isInsideTable(state: EditorState): boolean {
  if (isInTable(state)) {
    return true;
  }
  const { $from, $to } = state.selection;
  for (const pos of [$from, $to]) {
    const parentRole = pos.parent.type.spec.tableRole;
    if (
      parentRole === "table" ||
      parentRole === "cell" ||
      parentRole === "header_cell" ||
      parentRole === "row"
    ) {
      return true;
    }
    for (let d = pos.depth; d > 0; d--) {
      const role = pos.node(d).type.spec.tableRole;
      if (
        role === "table" ||
        role === "cell" ||
        role === "header_cell" ||
        role === "row"
      ) {
        return true;
      }
    }
  }
  return false;
}

export function parseMarkdownTableBlock(text: string): PMNode | null {
  if (!text || typeof text !== "string") {
    return null;
  }

  const lines = text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 3) {
    return null;
  }

  // 第一行包含 |
  if (!lines[0].includes("|")) {
    return null;
  }

  // 第二行是 GFM 分隔行（匹配 :?-{3,}:? 的列，允许首尾管道）
  if (!isDelimiterRow(lines[1])) {
    return null;
  }

  // 其余行包含 |
  for (let i = 2; i < lines.length; i++) {
    if (!lines[i].includes("|")) {
      return null;
    }
  }

  const doc = markdownToDoc(lines.join("\n"), schema);
  let table: PMNode | null = null;
  doc.descendants((node) => {
    if (!table && node.type.name === "table") {
      table = node;
      return false;
    }
    return !table;
  });

  return table;
}

export function createTablePastePlugin(): Plugin {
  return new Plugin({
    props: {
      handlePaste(view, event) {
        if (isInCodeBlock(view.state)) {
          return false;
        }
        if (isInsideTable(view.state)) {
          return false;
        }
        const text = event.clipboardData?.getData("text/plain");
        if (!text) {
          return false;
        }

        const table = parseMarkdownTableBlock(text);
        if (!table) {
          return false;
        }

        view.dispatch(view.state.tr.replaceSelectionWith(table).scrollIntoView());
        return true;
      },
    },
  });
}
