// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { schema } from "../src/editor/schema";
import { markdownToDoc, docToMarkdown } from "../src/editor/serializer/markdown";
import {
  ensureTrailingParagraphNode,
  exitTerminalBlock,
} from "../src/editor/table/commands";

function stateFor(markdown: string, cursorText?: string): EditorState {
  const doc = ensureTrailingParagraphNode(markdownToDoc(markdown, schema));
  let state = EditorState.create({ doc });
  if (cursorText) {
    let pos = -1;
    state.doc.descendants((node, p) => {
      if (pos < 0 && node.isText && node.text?.includes(cursorText)) {
        pos = p + node.text.indexOf(cursorText) + cursorText.length;
      }
    });
    if (pos > 0) {
      state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, pos)));
    }
  }
  return state;
}

function run(state: EditorState, command: any) {
  let next: EditorState | null = null;
  const ok = command(state, (tr: any) => {
    next = state.apply(tr);
  });
  return { ok, state: next ?? state };
}

describe("trailing paragraph for terminal blocks", () => {
  it.each([
    ["table", "| A |\n| --- |\n| 1 |"],
    ["code block", "```js\nconst a = 1;\n```"],
    ["math block", "$$\nx^2\n$$"],
    ["toc", "[toc]"],
  ])("appends a paragraph after a trailing %s", (_label, markdown) => {
    const doc = markdownToDoc(markdown, schema);
    const next = ensureTrailingParagraphNode(doc);
    expect(next.lastChild?.type.name).toBe("paragraph");
    expect(next.childCount).toBe(doc.childCount + 1);
  });

  it("does not append twice when a paragraph already follows", () => {
    const doc = ensureTrailingParagraphNode(
      markdownToDoc("```js\nx\n```\n\nAfter", schema)
    );
    expect(doc.lastChild?.type.name).toBe("paragraph");
    expect(ensureTrailingParagraphNode(doc)).toBe(doc);
  });

  it("keeps trailing paragraphs out of the serialized markdown", () => {
    const doc = ensureTrailingParagraphNode(markdownToDoc("```js\nx\n```", schema));
    expect(docToMarkdown(doc).trim()).toBe("```js\nx\n```");
  });
});

describe("exitTerminalBlock", () => {
  it("exits a trailing code block into a new paragraph", () => {
    const state = stateFor("```js\nconst a = 1;\n```", "1;");
    const result = run(state, exitTerminalBlock("down"));
    expect(result.ok).toBe(true);
    expect(result.state.selection.$head.parent.type.name).toBe("paragraph");
  });

  it("exits a code block that already has a following paragraph", () => {
    const state = stateFor("```js\nconst a = 1;\n```\n\nAfter", "1;");
    const result = run(state, exitTerminalBlock("down"));
    expect(result.ok).toBe(true);
    expect(result.state.selection.$head.parent.textContent).toBe("After");
  });

  it("does not exit when the caret is not on the last code line", () => {
    const state = stateFor("```js\nline1\nline2\n```", "line1");
    expect(run(state, exitTerminalBlock("down")).ok).toBe(false);
  });

  it("ignores plain paragraphs", () => {
    const state = stateFor("just text", "text");
    expect(run(state, exitTerminalBlock("down")).ok).toBe(false);
  });
});
