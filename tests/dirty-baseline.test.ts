import { describe, it, expect } from "vitest";
import { isContentDirty, normalizeForCompare } from "../src/workspace/dirty-state";

/**
 * "内容是否真的被修改"的判断。
 *
 * Markdown 往返序列化会规范化末尾换行、行尾空白、换行符风格——
 * 这些是等价写法。若直接比较字符串，文件一打开就会被标成"有未保存修改"，
 * 关窗时还会弹出保存提示。
 */
describe("dirty detection against a baseline", () => {
  it("treats a trailing newline difference as unchanged", () => {
    const disk = "# Title\n\nBody text\n";
    const editor = "# Title\n\nBody text";
    expect(isContentDirty({ content: editor, savedContent: editor })).toBe(false);
    expect(isContentDirty({ content: editor, savedContent: disk })).toBe(false);
  });

  it("treats CRLF vs LF as unchanged", () => {
    expect(isContentDirty({ content: "a\r\nb", savedContent: "a\nb" })).toBe(false);
  });

  it("ignores trailing whitespace on lines", () => {
    expect(
      isContentDirty({ content: "line one   \nline two\t", savedContent: "line one\nline two" })
    ).toBe(false);
  });

  it("detects real edits", () => {
    expect(isContentDirty({ content: "a\nb", savedContent: "a\nc" })).toBe(true);
    expect(isContentDirty({ content: "# Title\n\nextra", savedContent: "# Title" })).toBe(true);
  });

  it("treats content without a baseline as dirty, blank as clean", () => {
    // 从未落盘的新文档：写过字才算未保存
    expect(isContentDirty({ content: "anything" })).toBe(true);
    expect(isContentDirty({ content: "" })).toBe(false);
    expect(isContentDirty({ content: "   \n  " })).toBe(false);
  });

  it("does not confuse inner blank lines with trailing ones", () => {
    expect(isContentDirty({ content: "a\n\nb\n", savedContent: "a\n\nb" })).toBe(false);
    expect(isContentDirty({ content: "a\nb", savedContent: "a\n\nb" })).toBe(true);
  });

  it("normalises only the tail, not the body", () => {
    expect(normalizeForCompare("a\n\n\n")).toBe("a");
    expect(normalizeForCompare("a\n\nb")).toBe("a\n\nb");
  });
});
