// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { schema } from "../src/editor/schema";
import { markdownToDoc } from "../src/editor/serializer/markdown";
import { createAutoPairPlugin } from "../src/editor/plugins/auto-pair";

interface Harness {
  view: EditorView;
  getState: () => EditorState;
  text: () => string;
}

/** 用最小视图桩驱动插件 props，避免在 jsdom 中挂载完整 EditorView */
function harness(markdown: string, cursor?: number): Harness {
  let state = EditorState.create({ doc: markdownToDoc(markdown, schema) });
  if (cursor !== undefined) {
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, cursor)));
  }
  const view = {
    get state() {
      return state;
    },
    dispatch(tr: { docChanged?: boolean } & Record<string, unknown>) {
      state = state.apply(tr as never);
    },
  } as unknown as EditorView;

  return {
    view,
    getState: () => state,
    text: () => state.doc.textBetween(0, state.doc.content.size, "\n", "\n"),
  };
}

function makePlugin(options?: { pair?: boolean; smart?: boolean }) {
  return createAutoPairPlugin({
    isEnabled: () => options?.pair ?? true,
    smartPunctuation: () => options?.smart ?? true,
  });
}

function endOf(h: Harness): number {
  return h.getState().selection.to;
}

describe("auto pair", () => {
  it("inserts the closing character and keeps the caret inside", () => {
    const h = harness("ab", 3);
    const handled = makePlugin().props.handleTextInput!(
      h.view,
      3,
      3,
      "(",
      {} as never
    );
    expect(handled).toBe(true);
    expect(h.text()).toBe("ab()");
    expect(endOf(h)).toBe(4);
  });

  it.each([
    ["[", "[]"],
    ["{", "{}"],
    ["'", "''"],
    ['"', '""'],
  ])("pairs %s", (input, expected) => {
    const h = harness("x", 2);
    makePlugin().props.handleTextInput!(h.view, 2, 2, input, {} as never);
    expect(h.text()).toBe(`x${expected}`);
  });

  it("ignores characters without a pair", () => {
    const h = harness("x", 2);
    const handled = makePlugin().props.handleTextInput!(h.view, 2, 2, "a", {} as never);
    expect(handled).toBe(false);
    expect(h.text()).toBe("x");
  });

  it("does nothing when disabled", () => {
    const h = harness("x", 2);
    const handled = makePlugin({ pair: false }).props.handleTextInput!(
      h.view,
      2,
      2,
      "(",
      {} as never
    );
    expect(handled).toBe(false);
    expect(h.text()).toBe("x");
  });

  it("does not pair when a range is selected", () => {
    const h = harness("abcd", 2);
    const handled = makePlugin().props.handleTextInput!(h.view, 2, 4, "(", {} as never);
    expect(handled).toBe(false);
  });
});

describe("smart punctuation", () => {
  it("converts --- into an em dash", () => {
    const h = harness("ab--", 5);
    const handled = makePlugin().props.handleTextInput!(h.view, 5, 5, "-", {} as never);
    expect(handled).toBe(true);
    expect(h.text()).toBe("ab—");
  });

  it("leaves a lone dash alone", () => {
    const h = harness("ab", 3);
    const handled = makePlugin().props.handleTextInput!(h.view, 3, 3, "-", {} as never);
    expect(handled).toBe(false);
    expect(h.text()).toBe("ab");
  });

  it("is inert when smart punctuation is off", () => {
    const h = harness("ab--", 5);
    const handled = makePlugin({ smart: false }).props.handleTextInput!(
      h.view,
      5,
      5,
      "-",
      {} as never
    );
    expect(handled).toBe(false);
    expect(h.text()).toBe("ab--");
  });
});

describe("backspace on an empty pair", () => {
  it("removes both characters", () => {
    const h = harness("a()", 3);
    const handled = makePlugin().props.handleKeyDown!(h.view, {
      key: "Backspace",
    } as KeyboardEvent);
    expect(handled).toBe(true);
    expect(h.text()).toBe("a");
  });

  it("falls through for ordinary text", () => {
    const h = harness("ab", 3);
    const handled = makePlugin().props.handleKeyDown!(h.view, {
      key: "Backspace",
    } as KeyboardEvent);
    expect(handled).toBe(false);
    expect(h.text()).toBe("ab");
  });
});
