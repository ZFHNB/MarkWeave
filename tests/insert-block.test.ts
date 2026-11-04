// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { schema } from "../src/editor/schema";
import { markdownToDoc } from "../src/editor/serializer/markdown";
import { insertBlockAfterCurrent } from "../src/editor/commands/editing";

/**
 * 「插入代码块 / 公式块」的块级插入逻辑。
 *
 * 原生菜单的 Ctrl+Shift+K / Ctrl+Shift+M 只发一个字符串给渲染层，
 * 真正的插入走这个命令，确保：
 * - 新块插在当前块之后，而不是把当前段落转换掉；
 * - 光标落在新块内部，用户可以直接开始输入。
 */

function stateWithCursor(markdown: string): EditorState {
  const doc = markdownToDoc(markdown, schema);
  const state = EditorState.create({ doc });
  let pos = 1;
  state.doc.descendants((node, p) => {
    if (pos === 1 && node.isText) pos = p + 1;
  });
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, pos)));
}

function run(state: EditorState, node: any) {
  let next: EditorState | null = null;
  const ok = insertBlockAfterCurrent(node)(state, (tr) => {
    next = state.apply(tr);
  });
  return { ok, state: next ?? state };
}

function childNames(state: EditorState): string[] {
  const names: string[] = [];
  state.doc.forEach((n) => names.push(n.type.name));
  return names;
}

describe("insertBlockAfterCurrent", () => {
  it("inserts a code block after the current paragraph without touching it", () => {
    const { ok, state } = run(
      stateWithCursor("first paragraph"),
      schema.nodes.code_block.create({ params: "" })
    );

    expect(ok).toBe(true);
    expect(childNames(state)).toEqual(["paragraph", "code_block", "paragraph"]);
    expect(state.doc.child(0).textContent).toBe("first paragraph");
  });

  it("puts the cursor inside the new block so typing lands there", () => {
    const { state } = run(
      stateWithCursor("hello"),
      schema.nodes.code_block.create({ params: "js" })
    );
    expect(state.selection.$from.parent.type.name).toBe("code_block");
    expect(state.selection.$from.parent.attrs.params).toBe("js");
  });

  it("inserts a math block the same way and parks the cursor after it", () => {
    const { ok, state } = run(
      stateWithCursor("text"),
      schema.nodes.math_block.create({ formula: "" })
    );
    expect(ok).toBe(true);
    // 公式块是叶子块（内部没有可放光标的位置），新块后面会自动补一个段落
    expect(childNames(state)).toEqual(["paragraph", "math_block", "paragraph"]);
    expect(state.selection.$from.parent.type.name).toBe("paragraph");
  });

  it("declines when there is a selection instead of a collapsed cursor", () => {
    const doc = markdownToDoc("hello world", schema);
    const base = EditorState.create({ doc });
    const state = base.apply(base.tr.setSelection(TextSelection.create(doc, 1, 5)));
    const { ok } = run(state, schema.nodes.code_block.create({ params: "" }));
    expect(ok).toBe(false);
  });
});
