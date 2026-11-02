import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_SYNTAX_OPTIONS,
  getMarkdownSyntaxOptions,
  markdownToDoc,
  setMarkdownSyntaxOptions,
} from "../src/editor/serializer/markdown";
import { schema } from "../src/editor/schema";

beforeEach(() => {
  setMarkdownSyntaxOptions(DEFAULT_SYNTAX_OPTIONS);
});

function hasLinkMark(markdown: string): boolean {
  let found = false;
  markdownToDoc(markdown, schema).descendants((node) => {
    if (node.marks.some((m) => m.type.name === "link")) found = true;
  });
  return found;
}

function countHardBreaks(markdown: string): number {
  let count = 0;
  markdownToDoc(markdown, schema).descendants((node) => {
    if (node.type.name === "hard_break") count++;
  });
  return count;
}

describe("syntax defaults", () => {
  it("keeps soft breaks off and auto link on", () => {
    expect(DEFAULT_SYNTAX_OPTIONS.softBreaksAsHardBreaks).toBe(false);
    expect(DEFAULT_SYNTAX_OPTIONS.autoLink).toBe(true);
  });
});

describe("auto link toggle", () => {
  it("creates a link mark when enabled", () => {
    setMarkdownSyntaxOptions({ autoLink: true });
    expect(hasLinkMark("访问 https://example.com 查看")).toBe(true);
  });

  it("leaves bare URLs as text when disabled", () => {
    setMarkdownSyntaxOptions({ autoLink: false });
    expect(hasLinkMark("访问 https://example.com 查看")).toBe(false);
  });

  it("still honours explicit markdown links when auto link is off", () => {
    setMarkdownSyntaxOptions({ autoLink: false });
    expect(hasLinkMark("访问 [示例](https://example.com) 查看")).toBe(true);
  });
});

describe("soft break toggle", () => {
  it("converts single newlines to hard breaks when enabled", () => {
    setMarkdownSyntaxOptions({ softBreaksAsHardBreaks: true });
    expect(countHardBreaks("第一行\n第二行")).toBe(1);
  });

  it("keeps a single newline soft when disabled", () => {
    setMarkdownSyntaxOptions({ softBreaksAsHardBreaks: false });
    expect(countHardBreaks("第一行\n第二行")).toBe(0);
  });

  it("still honours an explicit two-space hard break", () => {
    setMarkdownSyntaxOptions({ softBreaksAsHardBreaks: false });
    expect(countHardBreaks("第一行  \n第二行")).toBe(1);
  });
});

describe("option store", () => {
  it("merges partial updates", () => {
    setMarkdownSyntaxOptions({ autoLink: false });
    expect(getMarkdownSyntaxOptions()).toEqual({
      softBreaksAsHardBreaks: false,
      autoLink: false,
    });
  });

  it("returns a copy that cannot mutate internal state", () => {
    const snapshot = getMarkdownSyntaxOptions();
    snapshot.autoLink = false;
    expect(getMarkdownSyntaxOptions().autoLink).toBe(true);
  });

  it("switching back restores previous parsing", () => {
    setMarkdownSyntaxOptions({ autoLink: false });
    expect(hasLinkMark("https://example.com")).toBe(false);
    setMarkdownSyntaxOptions({ autoLink: true });
    expect(hasLinkMark("https://example.com")).toBe(true);
  });
});
