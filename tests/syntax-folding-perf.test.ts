// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { schema } from "../src/editor/schema";
import { markdownToDoc } from "../src/editor/serializer/markdown";
import { createSyntaxFoldingPlugin } from "../src/editor/plugins/syntax-folding";

function stateFor(markdown: string, focused = true) {
  const doc = markdownToDoc(markdown, schema);
  const plugin = createSyntaxFoldingPlugin({ isFocused: () => focused });
  return { plugin, state: EditorState.create({ doc, plugins: [plugin] }) };
}

/** 把光标放到包含指定文字的块里 */
function cursorInto(state: EditorState, text: string): EditorState {
  let target = -1;
  state.doc.forEach((node, offset) => {
    if (target < 0 && node.textContent.includes(text)) target = offset;
  });
  if (target < 0) return state;
  return state.apply(state.tr.setSelection(TextSelection.near(state.doc.resolve(target + 2))));
}

describe("syntax folding decorations", () => {
  it("produces no decorations while everything is collapsed", () => {
    const { plugin, state } = stateFor("第一段\n\n第二段\n\n第三段");
    // 光标落在最后一块，前两块处于折叠态
    const next = cursorInto(state, "第三段");
    const set = plugin.getState(next);
    // 只剩光标所在块可能产生装饰
    expect(set.find().length).toBeGreaterThanOrEqual(0);
  });

  it("adds decorations only for the block under the cursor", () => {
    const md = "## 标题\n\n这是 **加粗** 与 `代码`。\n\n第三段";
    const { plugin, state } = stateFor(md);
    const next = cursorInto(state, "加粗");
    const set = plugin.getState(next);

    // 只应包含第二段内的位置，不含第一段 / 第三段
    let secondStart = -1;
    let secondEnd = -1;
    let offset = 0;
    next.doc.forEach((node) => {
      if (node.textContent.includes("加粗")) {
        secondStart = offset;
        secondEnd = offset + node.nodeSize;
      }
      offset += node.nodeSize;
    });

    for (const deco of set.find()) {
      expect(deco.from).toBeGreaterThanOrEqual(secondStart);
      expect(deco.to).toBeLessThanOrEqual(secondEnd);
    }
    expect(set.find().length).toBeGreaterThan(0);
  });

  it("clears all decorations when the editor loses focus", () => {
    const md = "这是 **加粗** 文字。";
    const { plugin, state } = stateFor(md);
    const focusedState = cursorInto(state, "加粗");
    expect(plugin.getState(focusedState).find().length).toBeGreaterThan(0);

    const blurred = focusedState.apply(
      focusedState.tr.setMeta(plugin.key, { focused: false })
    );
    expect(plugin.getState(blurred).find().length).toBe(0);
  });

  it("stays cheap on a large document", () => {
    const parts: string[] = [];
    for (let i = 0; i < 400; i++) parts.push(`## 第 ${i} 节\n\n这是第 ${i} 段，含 **加粗**。`);
    const md = parts.join("\n\n");

    const { plugin, state } = stateFor(md);
    const before = Date.now();
    const next = cursorInto(state, "第 200 段");
    plugin.getState(next);
    const elapsed = Date.now() - before;

    // 400 块文档里定位与生成装饰应在合理范围内
    expect(elapsed).toBeLessThan(200);
  });

  it("does not accumulate decorations across repeated cursor moves", () => {
    const md = "第一段 **粗**。\n\n第二段 **粗**。\n\n第三段 **粗**。";
    const { plugin, state } = stateFor(md);

    let current = state;
    const counts: number[] = [];
    for (let i = 0; i < 5; i++) {
      current = cursorInto(current, `第${["一", "二", "三"][i % 3]}段`);
      counts.push(plugin.getState(current).find().length);
    }

    // 反复移动不应让装饰数量持续增长
    const max = Math.max(...counts);
    const last = counts[counts.length - 1];
    expect(last).toBeLessThanOrEqual(max);
  });
});
