import { describe, it, expect } from "vitest";
import { shouldParseAsMarkdown } from "../src/editor/plugins/paste-markdown";

describe("markdown paste detection", () => {
  it("parses a multi-block markdown fragment", () => {
    const text = `## 10. 变更清单

| 类型 | 路径 |
| --- | --- |
| 修改 | a.py |

**给下一个 agent**：说明。`;
    const r = shouldParseAsMarkdown(text);
    expect(r.parse).toBe(true);
  });

  it("parses a standalone markdown table", () => {
    const text = "| A | B |\n| --- | --- |\n| 1 | 2 |";
    expect(shouldParseAsMarkdown(text).parse).toBe(true);
    expect(shouldParseAsMarkdown(text).reason).toMatch(/table|block-markers/);
  });

  it("parses a bulleted list", () => {
    expect(shouldParseAsMarkdown("- 第一项\n- 第二项").parse).toBe(true);
  });

  it("parses a fenced code block", () => {
    expect(shouldParseAsMarkdown("```js\nconst a = 1;\n```").parse).toBe(true);
  });

  it("parses a heading with a following paragraph marker", () => {
    expect(shouldParseAsMarkdown("# 标题\n\n> 引用内容").parse).toBe(true);
  });

  it("leaves plain prose alone", () => {
    expect(shouldParseAsMarkdown("这是一段普通的说明文字，没有 Markdown 标记。").parse).toBe(false);
    expect(shouldParseAsMarkdown("另一段普通文字\n\n还有一段").parse).toBe(false);
  });

  it("leaves short single lines alone", () => {
    expect(shouldParseAsMarkdown("你好").parse).toBe(false);
    expect(shouldParseAsMarkdown("hello").parse).toBe(false);
  });

  it("leaves a bare URL alone", () => {
    expect(shouldParseAsMarkdown("https://example.com/a/b").parse).toBe(false);
  });

  it("ignores empty input", () => {
    expect(shouldParseAsMarkdown("").parse).toBe(false);
    expect(shouldParseAsMarkdown("   \n  \n").parse).toBe(false);
  });

  it("parses multi-line fragments with inline markers", () => {
    const text = "**重点**：见 `config.yaml`\n\n另一行含 `code` 与 **粗体**";
    expect(shouldParseAsMarkdown(text).parse).toBe(true);
  });

  it("reports a reason for every decision", () => {
    for (const text of ["", "你好", "# 标题\n\n正文", "| a | b |\n| --- | --- |\n| 1 | 2 |"]) {
      expect(shouldParseAsMarkdown(text).reason.length).toBeGreaterThan(0);
    }
  });
});
