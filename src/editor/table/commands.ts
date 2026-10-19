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

export function ensureTrailingParagraphNode(doc: PMNode): PMNode {
  if (doc.lastChild && doc.lastChild.type.name === "table") {
    const paragraph = schema.nodes.paragraph.createAndFill() ?? schema.nodes.paragraph.create();
    return doc.copy(doc.content.append(Fragment.from(paragraph)));
  }
  return doc;
}

export function createTrailingParagraphPlugin(): Plugin {
  return new Plugin({
    appendTransaction(transactions, _oldState, newState) {
      const docChanged = transactions.some((tr) => tr.docChanged);
      if (!docChanged) return null;

      const { doc } = newState;
      if (doc.lastChild && doc.lastChild.type.name === "table") {
        const paragraph = schema.nodes.paragraph.createAndFill() ?? schema.nodes.paragraph.create();
        return newState.tr.insert(doc.content.size, paragraph);
      }
      return null;
    },
  });
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
