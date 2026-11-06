// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { schema } from "../src/editor/schema";
import { markdownToDoc } from "../src/editor/serializer/markdown";
import { createCodeIndentPlugin } from "../src/editor/plugins/code-indent";

function codeState(code: string, size = 2) {
  const doc = markdownToDoc("```js\n" + code + "\n```", schema);
  let state = EditorState.create({ doc });
  const view = {
    get state() {
      return state;
    },
    dispatch(tr: never) {
      state = state.apply(tr);
    },
  } as unknown as EditorView;
  const plugin = createCodeIndentPlugin({ getIndentSize: () => size });
  const tab = (shift = false) =>
    plugin.props.handleKeyDown!(view, { key: "Tab", shiftKey: shift } as KeyboardEvent);
  const moveCaretTo = (offset: number) => {
    let target = -1;
    state.doc.descendants((node, pos) => {
      if (target < 0 && node.type.name === "code_block") {
        target = pos + 1 + offset;
      }
    });
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, target)));
  };
  const text = () => {
    let out = "";
    state.doc.descendants((n) => {
      if (n.type.name === "code_block") out = n.textContent;
    });
    return out;
  };
  return { tab, text, moveCaretTo, getState: () => state };
}

describe("code block indentation", () => {
  it("ignores Tab outside a code block", () => {
    const doc = markdownToDoc("hello", schema);
    const state = EditorState.create({ doc });
    const view = { get state() { return state; }, dispatch() {} } as unknown as EditorView;
    const plugin = createCodeIndentPlugin({ getIndentSize: () => 2 });
    expect(plugin.props.handleKeyDown!(view, { key: "Tab" } as KeyboardEvent)).toBe(false);
  });

  it("inserts the configured number of spaces", () => {
    const h = codeState("abc", 4);
    h.moveCaretTo(3);
    expect(h.tab()).toBe(true);
    expect(h.text()).toBe("abc    ");
  });

  it("uses the live indent size setting", () => {
    const h = codeState("x", 3);
    h.moveCaretTo(1);
    h.tab();
    expect(h.text()).toBe("x   ");
  });

  it("unindents one level with Shift-Tab", () => {
    const h = codeState("    deep", 4);
    h.moveCaretTo(8);
    expect(h.tab(true)).toBe(true);
    expect(h.text()).toBe("deep");
  });

  it("does nothing on Shift-Tab when there is no indentation", () => {
    const h = codeState("plain", 2);
    h.moveCaretTo(3);
    expect(h.tab(true)).toBe(false);
    expect(h.text()).toBe("plain");
  });

  it("indents every line of a multi-line selection", () => {
    let state = EditorState.create({ doc: markdownToDoc("```js\na\nb\n```", schema) });
    let codeStart = -1;
    state.doc.descendants((node, pos) => {
      if (codeStart < 0 && node.type.name === "code_block") codeStart = pos + 1;
    });
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, codeStart + 1, codeStart + 3))
    );

    const plugin = createCodeIndentPlugin({ getIndentSize: () => 2 });
    let next = state;
    const view = {
      get state() {
        return next;
      },
      dispatch(tr: never) {
        next = next.apply(tr);
      },
    } as unknown as EditorView;

    expect(plugin.props.handleKeyDown!(view, { key: "Tab" } as KeyboardEvent)).toBe(true);
    let out = "";
    next.doc.descendants((n) => {
      if (n.type.name === "code_block") out = n.textContent;
    });
    expect(out).toBe("  a\n  b");
  });
});
