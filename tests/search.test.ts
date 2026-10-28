// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { schema } from "../src/editor/schema";
import { markdownToDoc } from "../src/editor/serializer/markdown";
import { findMatches, type SearchOptions } from "../src/editor/search/search-plugin";

const plain: SearchOptions = { caseSensitive: false, wholeWord: false, regex: false };

function doc(markdown: string) {
  return markdownToDoc(markdown, schema);
}

function texts(markdown: string, query: string, options: SearchOptions = plain): string[] {
  const d = doc(markdown);
  return findMatches(d, query, options).map((m) => d.textBetween(m.from, m.to, " "));
}

describe("search matching", () => {
  it("finds all case-insensitive matches by default", () => {
    expect(texts("Alpha alpha ALPHA", "alpha")).toEqual(["Alpha", "alpha", "ALPHA"]);
  });

  it("honors case sensitivity", () => {
    expect(texts("Alpha alpha", "alpha", { ...plain, caseSensitive: true })).toEqual(["alpha"]);
  });

  it("honors whole-word matching", () => {
    expect(texts("cat category cat", "cat", { ...plain, wholeWord: true })).toEqual(["cat", "cat"]);
  });

  it("supports regular expressions", () => {
    expect(texts("a1 b2 c3", "[a-z]\\d", { ...plain, regex: true })).toEqual(["a1", "b2", "c3"]);
  });

  it("returns nothing for an invalid regular expression", () => {
    expect(texts("abc", "([", { ...plain, regex: true })).toEqual([]);
  });

  it("finds matches across multiple blocks", () => {
    expect(texts("# Title\n\nBody title", "title")).toEqual(["Title", "title"]);
  });

  it("finds matches inside table cells and headings", () => {
    const md = "# Heading\n\n| key | val |\n| :--- | :--- |\n| key | x |";
    expect(texts(md, "key").length).toBe(2);
  });
});
