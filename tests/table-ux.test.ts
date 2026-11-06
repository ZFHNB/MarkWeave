import { describe, it, expect } from "vitest";
import { EditorState } from "prosemirror-state";
import { schema } from "../src/editor/schema";
import {
  createTableNode,
  insertTable,
  ensureTrailingParagraphNode,
} from "../src/editor/table/commands";

describe("table trailing paragraph", () => {
  it("appends a paragraph after a table at the end of the document", () => {
    const table = createTableNode(2, 2);
    const doc = schema.node("doc", null, [table]);
    const next = ensureTrailingParagraphNode(doc);
    expect(next.childCount).toBe(2);
    expect(next.lastChild?.type.name).toBe("paragraph");
  });

  it("leaves a document whose last block is not a table unchanged", () => {
    const doc = schema.node("doc", null, [schema.node("paragraph")]);
    expect(ensureTrailingParagraphNode(doc)).toBe(doc);
  });

  it("insertTable leaves an editable paragraph after the table", () => {
    const state = EditorState.create({
      doc: schema.node("doc", null, [schema.node("paragraph")]),
    });
    let next: EditorState | null = null;
    insertTable(2, 2)(state, (tr) => {
      next = state.apply(tr);
    });
    expect(next).not.toBeNull();
    let hasTable = false;
    next!.doc.forEach((node) => {
      if (node.type.name === "table") hasTable = true;
    });
    expect(hasTable).toBe(true);
    expect(next!.doc.lastChild?.type.name).toBe("paragraph");
  });
});
