import { describe, it, expect } from "vitest";
import { shouldPromptOnClose } from "../src/workspace/autosave";

/**
 * 关闭弹窗的触发条件由两部分共同决定：
 * 1. hasUnsavedContent()：是否有真正需要保存的内容（main.ts）
 * 2. shouldPromptOnClose()：自动保存开启时不打扰用户
 *
 * 这里覆盖两者组合出的行为矩阵。
 */
function needsPrompt(
  docs: { dirty: boolean; filePath?: string; content: string }[],
  autoSaveMode: "off" | "onChange" | "interval"
): boolean {
  const hasContent = docs.some((doc) => {
    if (!doc.dirty) return false;
    if (doc.filePath) return true;
    return doc.content.trim().length > 0;
  });
  return shouldPromptOnClose(hasContent, autoSaveMode);
}

describe("close prompt decision", () => {
  it("does not prompt when nothing was edited", () => {
    expect(needsPrompt([{ dirty: false, content: "# 已保存" }], "off")).toBe(false);
  });

  it("does not prompt for a brand-new empty document", () => {
    // 新建文档会带 dirty 标记，但用户什么都没写
    expect(needsPrompt([{ dirty: true, content: "" }], "off")).toBe(false);
    expect(needsPrompt([{ dirty: true, content: "   \n  " }], "off")).toBe(false);
  });

  it("prompts for an unnamed document that has content", () => {
    expect(needsPrompt([{ dirty: true, content: "# 未保存的草稿" }], "off")).toBe(true);
  });

  it("prompts for a saved file with unsaved edits", () => {
    expect(needsPrompt([{ dirty: true, filePath: "/d/a.md", content: "x" }], "off")).toBe(true);
  });

  it("does not prompt only when every change hits the disk immediately", () => {
    const docs = [{ dirty: true, filePath: "/d/a.md", content: "x" }];
    expect(needsPrompt(docs, "onChange")).toBe(false);
    // 间隔保存可能还没轮到定时器，关窗仍会丢内容
    expect(needsPrompt(docs, "interval")).toBe(true);
  });

  it("prompts if any document needs saving", () => {
    const docs = [
      { dirty: false, content: "saved" },
      { dirty: true, content: "" },
      { dirty: true, filePath: "/d/b.md", content: "edited" },
    ];
    expect(needsPrompt(docs, "off")).toBe(true);
  });
});
