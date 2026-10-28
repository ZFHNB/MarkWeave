// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { schema } from "../src/editor/schema";
import { markdownToDoc, docToMarkdown } from "../src/editor/serializer/markdown";
import {
  jumpToTop,
  jumpToBottom,
  selectBlock,
  deleteBlock,
  selectLine,
  increaseHeadingLevel,
  decreaseHeadingLevel,
  clearFormatting,
  toggleTaskStatus,
} from "../src/editor/commands/editing";
import {
  toHtml,
  toPlainText,
  toTex,
  toMarkdown,
  parsePlainTextToDoc,
} from "../src/editor/commands/clipboard-formats";

function stateFrom(md: string, from?: number, to?: number): EditorState {
  const doc = markdownToDoc(md, schema);
  let state = EditorState.create({ doc });
  if (from !== undefined) {
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, from, to ?? from))
    );
  }
  return state;
}

function run(state: EditorState, command: any): { ok: boolean; state: EditorState } {
  let next: EditorState | null = null;
  const ok = command(state, (tr: any) => {
    next = state.apply(tr);
  });
  return { ok, state: next ?? state };
}

function positionOf(doc: any, text: string): number {
  let found = -1;
  doc.descendants((node: any, pos: number) => {
    if (found >= 0) return false;
    if (node.isText && node.text?.includes(text)) {
      found = pos + node.text.indexOf(text);
      return false;
    }
    return true;
  });
  return found;
}

describe("navigation commands", () => {
  it("jumps to the start and end of the document", () => {
    const state = stateFrom("# A\n\nBody", 8);
    expect(run(state, jumpToTop).state.selection.from).toBe(1);
    const end = run(state, jumpToBottom).state.selection.from;
    expect(end).toBeGreaterThan(1);
  });

  it("selects the current block", () => {
    const md = "# A\n\nBody text";
    const pos = positionOf(markdownToDoc(md, schema), "Body");
    const selected = run(stateFrom(md, pos), selectBlock);
    expect(selected.ok).toBe(true);
    const text = selected.state.doc.textBetween(
      selected.state.selection.from,
      selected.state.selection.to
    );
    expect(text).toContain("Body text");
  });

  it("selects the current line", () => {
    const md = "first line\nsecond line";
    const state = stateFrom(md);
    const pos = positionOf(state.doc, "second");
    const selected = run(stateFrom(md, pos), selectLine);
    expect(selected.ok).toBe(true);
    expect(selected.state.doc.textBetween(selected.state.selection.from, selected.state.selection.to)).toContain("second line");
  });

  it("deletes the current block and leaves a paragraph", () => {
    const md = "# A\n\nDelete me\n\nKeep";
    const pos = positionOf(markdownToDoc(md, schema), "Delete");
    const result = run(stateFrom(md, pos), deleteBlock);
    expect(result.ok).toBe(true);
    const out = docToMarkdown(result.state.doc);
    expect(out).not.toContain("Delete me");
    expect(out).toContain("Keep");
  });
});

describe("heading level commands", () => {
  it("promotes and demotes headings", () => {
    const md = "## Middle";
    const pos = positionOf(markdownToDoc(md, schema), "Middle");
    const up = run(stateFrom(md, pos), increaseHeadingLevel);
    expect(docToMarkdown(up.state.doc)).toBe("# Middle");
    const down = run(stateFrom(md, pos), decreaseHeadingLevel);
    expect(docToMarkdown(down.state.doc)).toBe("### Middle");
  });

  it("turns H6 into a paragraph when demoted", () => {
    const md = "###### Six";
    const pos = positionOf(markdownToDoc(md, schema), "Six");
    const down = run(stateFrom(md, pos), decreaseHeadingLevel);
    expect(docToMarkdown(down.state.doc)).toBe("Six");
  });
});

describe("clear formatting", () => {
  it("removes inline marks from the selection", () => {
    const md = "**bold** text";
    const doc = markdownToDoc(md, schema);
    const state = stateFrom(md, 1, doc.content.size - 1);
    const cleared = run(state, clearFormatting);
    expect(docToMarkdown(cleared.state.doc)).toBe("bold text");
  });
});

describe("task status", () => {
  it("toggles the current task item", () => {
    const md = "- [ ] todo";
    const doc = markdownToDoc(md, schema);
    const pos = positionOf(doc, "todo");
    const toggled = run(stateFrom(md, pos), toggleTaskStatus);
    expect(toggled.ok).toBe(true);
    expect(docToMarkdown(toggled.state.doc)).toBe("- [x] todo");
  });
});

describe("clipboard formats", () => {
  const md = [
    "# Title",
    "",
    "Some **bold** and `code` text.",
    "",
    "- one",
    "- two",
    "",
    "| A | B |",
    "| :--- | ---: |",
    "| 1 | 2 |",
  ].join("\n");
  const doc = markdownToDoc(md, schema);

  it("produces markdown", () => {
    expect(toMarkdown(doc)).toContain("# Title");
  });

  it("produces plain text", () => {
    const text = toPlainText(doc);
    expect(text).toContain("Title");
    expect(text).not.toContain("**");
    expect(text).not.toContain("| :---");
  });

  it("produces HTML with semantic tags", () => {
    const html = toHtml(doc);
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<table>");
    expect(html).toContain("<td");
  });

  it("wraps HTML in a standalone document when styled", () => {
    const html = toHtml(doc, true);
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("<style>");
  });

  it("extracts TeX expressions", () => {
    const tex = toTex(markdownToDoc("$$x^2$$\n\ntext $a+b$", schema));
    expect(tex).toContain("x^2");
    expect(tex).toContain("$a+b$");
  });

  it("parses plain text back into a document", () => {
    const docFromText = parsePlainTextToDoc("first\nsecond\n\nthird");
    const out = docToMarkdown(docFromText);
    expect(out).toContain("first");
    expect(out).toContain("third");
  });
});
