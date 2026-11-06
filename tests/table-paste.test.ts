// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { parseMarkdownTableBlock } from "../src/editor/plugins/paste-table";

describe("markdown table paste parsing", () => {
  it("parses a standard GFM table block", () => {
    const table = parseMarkdownTableBlock(
      "| 名称 | 数量 |\n| :--- | ---: |\n| 苹果 | 3 |\n| 香蕉 | 5 |"
    );
    expect(table).not.toBeNull();
    expect(table!.type.name).toBe("table");
    expect(table!.childCount).toBe(3);
  });

  it("ignores plain text", () => {
    expect(parseMarkdownTableBlock("just a paragraph")).toBeNull();
  });

  it("ignores content without a delimiter row", () => {
    expect(parseMarkdownTableBlock("| a | b |\n| 1 | 2 |")).toBeNull();
  });
});
