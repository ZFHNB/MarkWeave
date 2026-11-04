// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { findSourceMatches, nextMatchIndex } from "../src/editor/search/source-search";

/**
 * 源码模式的查找是纯文本匹配（textarea 上用不了 ProseMirror 装饰），
 * 这里把匹配与循环导航的算法单独覆盖，面板本身只做 DOM 组装。
 */
describe("source search matching", () => {
  const text = "Foo bar foo\nFOO baz";

  it("finds all matches case-insensitively by default", () => {
    const matches = findSourceMatches(text, "foo");
    expect(matches).toHaveLength(3);
    expect(matches[0]).toEqual({ from: 0, to: 3 });
  });

  it("respects case sensitivity", () => {
    // 文本是 "Foo bar foo\nFOO baz"：只有第 2 个 foo 是全小写
    const matches = findSourceMatches(text, "foo", { caseSensitive: true });
    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual({ from: 8, to: 11 });
  });

  it("supports regular expressions", () => {
    const matches = findSourceMatches(text, "f(o+)", { regex: true });
    expect(matches).toEqual([
      { from: 0, to: 3 },
      { from: 8, to: 11 },
      { from: 12, to: 15 },
    ]);
  });

  it("returns nothing for an invalid regular expression instead of throwing", () => {
    expect(findSourceMatches(text, "([", { regex: true })).toEqual([]);
    expect(findSourceMatches(text, "", {})).toEqual([]);
  });

  it("treats plain queries with regex characters literally", () => {
    const matches = findSourceMatches("a.b axb", "a.b");
    expect(matches).toEqual([{ from: 0, to: 3 }]);
  });

  it("walks forward and wraps around", () => {
    const matches = findSourceMatches(text, "foo");
    expect(nextMatchIndex(matches, -1, 1)).toBe(0);
    expect(nextMatchIndex(matches, 3, 1)).toBe(1);
    expect(nextMatchIndex(matches, 999, 1)).toBe(0);
  });

  it("walks backward and wraps around", () => {
    const matches = findSourceMatches(text, "foo"); // from: 0, 8, 12
    expect(nextMatchIndex(matches, 999, -1)).toBe(2);
    expect(nextMatchIndex(matches, 9, -1)).toBe(1);
    expect(nextMatchIndex(matches, 1, -1)).toBe(0);
    // 已经在第一个之前，回绕到最后一个
    expect(nextMatchIndex(matches, 0, -1)).toBe(2);
  });

  it("returns -1 when there is nothing to navigate", () => {
    expect(nextMatchIndex([], 0, 1)).toBe(-1);
  });
});
