import { describe, it, expect } from "vitest";
import {
  blockIndexForLine,
  computeBlockStartLines,
  findLineByBlockText,
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
