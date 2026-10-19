import { describe, it, expect } from "vitest";
import { EditorState } from "prosemirror-state";
import {
  selectionCell,
  selectedRect,
  setCellAttr,
  addRowAfter,
  deleteRow,
  deleteColumn,
  deleteTable,
} from "prosemirror-tables";
import { schema } from "../src/editor/schema";
import {
  createTableNode,
  insertTable,
  goToNextCellOrAppendRow,
} from "../src/editor/table/commands";

function makeState(): EditorState {
  return EditorState.create({
    doc: schema.node("doc", null, [schema.node("paragraph")]),
  });
}

function run(state: EditorState, command: any): { ok: boolean; state: EditorState } {
  let next: EditorState | null = null;
  const ok = command(state, (tr: any) => {
    next = state.apply(tr);
  });
  return { ok, state: next ?? state };
}

function tableOf(state: EditorState) {
  let table: any = null;
  state.doc.descendants((node) => {
    if (!table && node.type.name === "table") table = node;
  });
  return table;
}

describe("createTableNode", () => {
  it("creates a header row and body rows", () => {
    const table = createTableNode(4, 3);
    expect(table.type.name).toBe("table");
    expect(table.childCount).toBe(4);
    for (let row = 0; row < 4; row++) {
      const rowNode = table.child(row);
      expect(rowNode.type.name).toBe("table_row");
      expect(rowNode.childCount).toBe(3);
      for (let col = 0; col < 3; col++) {
        const cell = rowNode.child(col);
        expect(cell.type.name).toBe(row === 0 ? "table_header" : "table_cell");
        expect(cell.childCount).toBe(1);
        expect(cell.child(0).type.name).toBe("paragraph");
      }
    }
  });

  it("clamps dimensions", () => {
    expect(createTableNode(0, 0).childCount).toBe(1);
    expect(createTableNode(0, 0).child(0).childCount).toBe(1);
    expect(createTableNode(51, 51).childCount).toBe(50);
    expect(createTableNode(51, 51).child(0).childCount).toBe(50);
  });
});

describe("insertTable", () => {
  it("inserts a table and puts the cursor in the first header cell", () => {
    const result = run(makeState(), insertTable(4, 3));
    expect(result.ok).toBe(true);
    const table = tableOf(result.state);
    expect(table).not.toBeNull();
    expect(table.childCount).toBe(4);
    expect(selectionCell(result.state)).not.toBeNull();
    const rect = selectedRect(result.state);
    expect(rect.top).toBe(0);
    expect(rect.left).toBe(0);
  });
});

describe("goToNextCellOrAppendRow", () => {
  it("returns false when moving backward from the first cell", () => {
    const inserted = run(makeState(), insertTable(4, 3));
    const result = run(inserted.state, goToNextCellOrAppendRow(-1));
    expect(result.ok).toBe(false);
  });

  it("moves forward and appends a row after the last cell", () => {
    let state = run(makeState(), insertTable(4, 3)).state;
    const initialRows = tableOf(state).childCount;

    for (let i = 0; i < 11; i++) {
      const moved = run(state, goToNextCellOrAppendRow(1));
      expect(moved.ok).toBe(true);
      state = moved.state;
    }

    const lastRect = selectedRect(state);
    expect(lastRect.top).toBe(3);
    expect(lastRect.left).toBe(2);

    const appended = run(state, goToNextCellOrAppendRow(1));
    expect(appended.ok).toBe(true);
    state = appended.state;

    expect(tableOf(state).childCount).toBe(initialRows + 1);
    const newRect = selectedRect(state);
    expect(newRect.top).toBe(4);
    expect(newRect.left).toBe(0);
  });
});

describe("table commands", () => {
  it("sets cell alignment", () => {
    const inserted = run(makeState(), insertTable(2, 2)).state;
    const aligned = run(inserted, setCellAttr("alignment", "center"));
    expect(aligned.ok).toBe(true);
    expect(selectionCell(aligned.state)!.nodeAfter!.attrs.alignment).toBe("center");
  });

  it("adds and deletes rows and columns", () => {
    const inserted = run(makeState(), insertTable(2, 2)).state;

    const addedRow = run(inserted, addRowAfter);
    expect(addedRow.ok).toBe(true);
    expect(tableOf(addedRow.state).childCount).toBe(3);

    const deletedRow = run(addedRow.state, deleteRow);
    expect(deletedRow.ok).toBe(true);
    expect(tableOf(deletedRow.state).childCount).toBe(2);

    const deletedCol = run(deletedRow.state, deleteColumn);
    expect(deletedCol.ok).toBe(true);
    expect(selectedRect(deletedCol.state).map.width).toBe(1);
  });

  it("deletes the whole table", () => {
    const inserted = run(makeState(), insertTable(2, 2)).state;
    const deleted = run(inserted, deleteTable);
    expect(deleted.ok).toBe(true);
    expect(tableOf(deleted.state)).toBeNull();
  });
});
