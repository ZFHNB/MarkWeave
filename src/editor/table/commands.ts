import { Plugin, type Command, TextSelection } from "prosemirror-state";
import { Fragment, type Node as PMNode } from "prosemirror-model";
import {
  goToNextCell,
  isInTable,
  selectedRect,
  addRow,
  moveCellForward,
} from "prosemirror-tables";
import { schema } from "../schema";

/**
 * 这些块自身无法承载普通文本光标（表格、代码块、公式块等），
 * 若它们位于文档末尾，光标就无法再往下走。Typora 的做法是始终在其后保留一个空段落。
 */
const TERMINAL_BLOCK_TYPES = new Set([
  "table",
  "code_block",
  "math_block",
  "toc_block",
  "yaml_frontmatter",
  "footnote_definition",
  "link_reference_definition",
  "horizontal_rule",
]);

export function ensureTrailingParagraphNode(doc: PMNode): PMNode {
  const last = doc.lastChild;
  if (last && TERMINAL_BLOCK_TYPES.has(last.type.name)) {
    const paragraph = schema.nodes.paragraph.createAndFill() ?? schema.nodes.paragraph.create();
    return doc.copy(doc.content.append(Fragment.from(paragraph)));
  }
  return doc;
}

export function createTrailingParagraphPlugin(): Plugin {
  return new Plugin({
    appendTransaction(transactions, oldState, newState) {
      const docChanged = transactions.some((tr) => tr.docChanged);
      if (!docChanged) return null;

      const oldLast = oldState.doc.lastChild;
      const { doc } = newState;
      const last = doc.lastChild;
      if (!last || !TERMINAL_BLOCK_TYPES.has(last.type.name)) return null;

      // 用户主动删除了末尾的空段落时不强行加回，避免与退格操作打架；
      // 只有当末尾块刚刚出现（或光标位于该块内）时才补一个空段落。
      if (oldLast && oldLast.type === last.type) {
        const { $head } = newState.selection;
        const inTerminalBlock = $head.depth > 0 && $head.node(1).type === last.type;
        if (!inTerminalBlock) return null;
      }

      const paragraph = schema.nodes.paragraph.createAndFill() ?? schema.nodes.paragraph.create();
      const tr = newState.tr.insert(doc.content.size, paragraph);
      if (newState.selection.empty) {
        tr.setSelection(TextSelection.near(tr.doc.resolve(newState.selection.head), 1));
      }
      return tr;
    },
  });
}

/**
 * 从代码块/公式块等“终端块”向下退出到下一个可编辑段落。
 * - 若光标不在块末尾，交给默认行为（返回 false）
 * - 若已在文档最后一个块，先追加一个空段落再进入
 */
export function exitTerminalBlock(direction: "down" | "right" = "down"): Command {
  return (state, dispatch) => {
    const { $head, empty } = state.selection;
    if (!empty) return false;

    // 找到光标所在的终端块
    let depth = -1;
    for (let d = $head.depth; d > 0; d--) {
      const node = $head.node(d);
      if (TERMINAL_BLOCK_TYPES.has(node.type.name)) {
        depth = d;
        break;
      }
    }
    if (depth === -1) return false;

    const block = $head.node(depth);
    const atEnd = $head.parentOffset >= $head.parent.content.size;

    if (direction === "down" && !atEnd) return false;
    if (direction === "right" && !atEnd) return false;
    // 代码块内有多行时，只有最后一行才算末尾
    if (block.type.name === "code_block") {
      const text = block.textContent;
      const offset = $head.parentOffset;
      if (text.indexOf("\n", offset) !== -1) return false;
    }

    if (!dispatch) return true;

    const blockEnd = $head.after(depth);
    const docSize = state.doc.content.size;
    const tr = state.tr;

    if (blockEnd >= docSize) {
      const paragraph = schema.nodes.paragraph.createAndFill() ?? schema.nodes.paragraph.create();
      tr.insert(docSize, paragraph);
    }

    const target = Math.min(tr.doc.content.size, blockEnd + 1);
    tr.setSelection(TextSelection.near(tr.doc.resolve(target), 1));
    dispatch(tr.scrollIntoView());
    return true;
  };
}


export function createTableNode(rows: number, cols: number): PMNode {
  const clampedRows = Math.max(1, Math.min(50, Number.isFinite(rows) ? Math.floor(rows) : 1));
  const clampedCols = Math.max(1, Math.min(50, Number.isFinite(cols) ? Math.floor(cols) : 1));

  const rowNodes: PMNode[] = [];
  for (let r = 0; r < clampedRows; r++) {
    const cells: PMNode[] = [];
    const cellType = r === 0 ? schema.nodes.table_header : schema.nodes.table_cell;
    for (let c = 0; c < clampedCols; c++) {
      const cell = cellType.createAndFill()!;
      cells.push(cell);
    }
    rowNodes.push(schema.nodes.table_row.create(null, cells));
  }

  return schema.nodes.table.create(null, rowNodes);
}

export function insertTable(rows: number, cols: number): Command {
  return (state, dispatch) => {
    if (!state.selection) return false;

    const table = createTableNode(rows, cols);
    const tr = state.tr;
    const { from } = state.selection;
    tr.replaceSelectionWith(table);

    if (!tr.docChanged) return false;

    if (tr.doc.lastChild?.type.name === "table") {
      const paragraph = schema.nodes.paragraph.createAndFill() ?? schema.nodes.paragraph.create();
      tr.insert(tr.doc.content.size, paragraph);
    }

    if (dispatch) {
      let tablePos: number | null = null;
      tr.doc.nodesBetween(
        Math.max(0, from - 1),
        Math.min(tr.doc.content.size, from + table.nodeSize + 2),
        (node, pos) => {
          if (tablePos === null && node.type.name === "table") {
            tablePos = pos;
            return false;
          }
        }
      );

      if (tablePos === null) {
        tr.doc.descendants((node, pos) => {
          if (tablePos === null && node.type.name === "table") {
            tablePos = pos;
            return false;
          }
        });
      }

      if (tablePos !== null) {
        // First row starts at tablePos + 1
        // First header cell starts at tablePos + 2
        const firstCellPos = tablePos + 2;
        const $cell = tr.doc.resolve(firstCellPos);
        tr.setSelection(TextSelection.between($cell, moveCellForward($cell)));
      }

      dispatch(tr.scrollIntoView());
    }

    return true;
  };
}

export function goToNextCellOrAppendRow(direction: 1 | -1): Command {
  return (state, dispatch) => {
    if (!isInTable(state)) return false;

    // Try normal goToNextCell first
    if (goToNextCell(direction)(state, dispatch)) {
      return true;
    }

    // If moving backward and at the first cell, return false (don't leave table)
    if (direction === -1) {
      return false;
    }

    // direction === 1 and at the last cell: append a row and move selection to its first cell
    if (dispatch) {
      const rect = selectedRect(state);
      const tr = addRow(state.tr, rect, rect.map.height);

      let rowPos = rect.tableStart;
      for (let i = 0; i < rect.table.childCount; i++) {
        rowPos += rect.table.child(i).nodeSize;
      }

      // First cell of the newly added row is at rowPos + 1
      const $firstCell = tr.doc.resolve(rowPos + 1);
      tr.setSelection(TextSelection.between($firstCell, moveCellForward($firstCell)));
      dispatch(tr.scrollIntoView());
    }

    return true;
  };
}

export function setColumnAlignment(alignment: "left" | "center" | "right"): Command {
  return (state, dispatch) => {
    if (!isInTable(state)) return false;

    if (dispatch) {
      const rect = selectedRect(state);
      const { map, tableStart, table } = rect;
      const tr = state.tr;
      const seen = new Set<number>();

      for (let col = rect.left; col < rect.right; col++) {
        for (let row = 0; row < map.height; row++) {
          const index = row * map.width + col;
          const pos = map.map[index];
          if (seen.has(pos)) continue;
          seen.add(pos);

          const cell = table.nodeAt(pos);
          if (cell && cell.attrs.alignment !== alignment) {
            tr.setNodeMarkup(tableStart + pos, null, {
              ...cell.attrs,
              alignment,
            });
          }
        }
      }

      dispatch(tr);
     }

    return true;
  };
}
