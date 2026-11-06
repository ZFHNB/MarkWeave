import { describe, it, expect } from "vitest";
import {
  blockIndexForLine,
  computeBlockStartLines,
  findAnchorLine,
  findLineByBlockText,
  lineAtScrollTop,
  lineForBlockIndex,
  ratioFromScroll,
  scrollTopForLine,
} from "../src/editor/source-mapping";

const SAMPLE = `## 第 14 节

这是第 14 段的内容，用来验证源码视图的位置同步。

- 列表项 A14
- 列表项 B14

## 第 15 节

这是第 15 段的内容，用来验证源码视图的位置同步。

- 列表项 A15
- 列表项 B15`;

describe("findLineByBlockText", () => {
  it("prefers an exact single-line match over a windowed one", () => {
    const line = findLineByBlockText("这是第 15 段的内容，用来验证源码视图", SAMPLE);
    expect(line).toBe(9);
    expect(SAMPLE.split("\n")[line!]).toContain("第 15 段");
  });

  it("matches headings", () => {
    expect(findLineByBlockText("## 第 15 节", SAMPLE)).toBe(7);
  });

  it("returns null for empty or missing text", () => {
    expect(findLineByBlockText("", SAMPLE)).toBeNull();
    expect(findLineByBlockText("不存在的段落", SAMPLE)).toBeNull();
  });

  it("uses nearLine to disambiguate duplicates", () => {
    const md = "重复段落\n\n中间\n\n重复段落";
    // 两处都含"重复段落"，nearLine 决定取哪一处
    expect(findLineByBlockText("重复段落", md, 0)).toBe(0);
    expect(findLineByBlockText("重复段落", md, 4)).toBe(4);
  });

  it("falls back to a windowed match for wrapped blocks", () => {
    const md = "第一行开头\n第二行续写内容\n\n下一段";
    expect(findLineByBlockText("第一行开头第二行续写内容", md)).toBe(0);
  });
});

describe("scrollTopForLine", () => {
  it("places the line in the upper third", () => {
    const top = scrollTopForLine(100, { lineHeight: 20, viewportHeight: 600, paddingTop: 0 });
    expect(top).toBe(2000 - 200);
  });

  it("never returns a negative offset", () => {
    expect(scrollTopForLine(0, { lineHeight: 20, viewportHeight: 600, paddingTop: 0 })).toBe(0);
  });
});

describe("block line mapping", () => {
  it("maps a block index to its start line", () => {
    const blocks = computeBlockStartLines(SAMPLE, 8);
    expect(lineForBlockIndex(blocks, 0)).toBe(blocks[0]);
    expect(lineForBlockIndex(blocks, 999)).toBe(blocks[blocks.length - 1]);
  });

  it("maps a line back to a block index", () => {
    const blocks = [0, 6, 14];
    expect(blockIndexForLine(blocks, 0)).toBe(0);
    expect(blockIndexForLine(blocks, 5)).toBe(0);
    expect(blockIndexForLine(blocks, 6)).toBe(1);
    expect(blockIndexForLine(blocks, 100)).toBe(2);
  });

  it("produces one start line per top-level block", () => {
    const blocks = computeBlockStartLines(SAMPLE, 8);
    expect(blocks.length).toBe(8);
    expect(blocks[0]).toBe(0);
  });

  it("keeps fenced code blocks intact", () => {
    const md = "前言\n\n```js\nconst a = 1;\n\nconst b = 2;\n```\n\n结尾";
    const blocks = computeBlockStartLines(md, 3);
    expect(blocks.length).toBe(3);
    // 代码块内部的空行不应产生新块
    expect(blocks[1]).toBe(2);
  });
});

describe("ratioFromScroll", () => {
  it("clamps to 0..1", () => {
    expect(ratioFromScroll(-10, 1000, 200)).toBe(0);
    expect(ratioFromScroll(9999, 1000, 200)).toBe(1);
  });

  it("handles a non-scrollable document", () => {
    expect(ratioFromScroll(0, 100, 200)).toBe(0);
  });
});

describe("reading-position sync (viewport top, not cursor)", () => {
  const MD = `# 开头

第一段正文。

## 中间一节

这一节是用户正在读的地方。

## 结尾

最后一段。`;

  it("reads the top line back from a scroll offset", () => {
    const win = { lineHeight: 24, paddingTop: 20, viewportHeight: 600 };
    // 让第 N 行顶部对齐视口顶部所需的偏移 = paddingTop + N * lineHeight
    expect(lineAtScrollTop(20, win)).toBe(0);
    expect(lineAtScrollTop(20 + 24, win)).toBe(1);
    expect(lineAtScrollTop(20 + 24 * 7, win)).toBe(7);
    // 行内偏移向下取整：仍是同一行
    expect(lineAtScrollTop(20 + 24 * 7 + 12, win)).toBe(7);
  });

  it("clamps when scrolled above the content", () => {
    const win = { lineHeight: 24, paddingTop: 20, viewportHeight: 600 };
    expect(lineAtScrollTop(0, win)).toBe(0);
  });

  it("locates the anchor by the start of its text, not just containment", () => {
    const line = findAnchorLine("这一节是用户正在读的地方。", MD);
    expect(line).toBe(6);
    expect(MD.split("\n")[line!].startsWith("这一节")).toBe(true);
  });

  it("ignores markdown markers when matching headings", () => {
    expect(findAnchorLine("中间一节", MD)).toBe(4);
  });

  it("disambiguates repeated text with nearLine", () => {
    const repeated = ["重复段落", "", "填充", "", "填充", "", "重复段落"].join("\n");
    const first = findAnchorLine("重复段落", repeated, 0);
    const second = findAnchorLine("重复段落", repeated, 6);
    expect(first).toBe(0);
    expect(second).toBe(6);
  });

  it("falls back to a windowed match for wrapped blocks", () => {
    const wrapped = ["头部", "", "这是一段会被源码换行拆开的长文字", "继续的部分"].join("\n");
    // 该段跨两行；块从第 2 行开始，上一行的空白行不算
    expect(findAnchorLine("这是一段会被源码换行拆开的长文字继续的部分", wrapped)).toBe(2);
  });

  it("returns null when nothing matches", () => {
    expect(findAnchorLine("不存在的文字", MD)).toBeNull();
    expect(findAnchorLine("   ", MD)).toBeNull();
  });
});
