import { describe, it, expect } from "vitest";
import {
  baseName,
  convertLineEnding,
  detectLineEnding,
  ensureFinalNewline,
  isValidFileName,
  joinPath,
  normalizeMarkdownFileName,
  stripExtension,
  uniqueFileName,
} from "../src/workspace/file-ops";

describe("line endings", () => {
  it("detects crlf and lf", () => {
    expect(detectLineEnding("a\r\nb\r\nc")).toBe("crlf");
    expect(detectLineEnding("a\nb\nc")).toBe("lf");
    expect(detectLineEnding("single line")).toBe("lf");
  });

  it("converts between endings", () => {
    expect(convertLineEnding("a\nb", "crlf")).toBe("a\r\nb");
    expect(convertLineEnding("a\r\nb", "lf")).toBe("a\nb");
  });

  it("does not double convert", () => {
    expect(convertLineEnding("a\r\nb", "crlf")).toBe("a\r\nb");
  });

  it("optionally ensures a final newline", () => {
    expect(ensureFinalNewline("text", true)).toBe("text\n");
    expect(ensureFinalNewline("text\n", true)).toBe("text\n");
    expect(ensureFinalNewline("text", false)).toBe("text");
    expect(ensureFinalNewline("", true)).toBe("");
  });
});

describe("file names", () => {
  it("rejects invalid names", () => {
    expect(isValidFileName("")).toBe(false);
    expect(isValidFileName("  ")).toBe(false);
    expect(isValidFileName("a/b.md")).toBe(false);
    expect(isValidFileName("a:b.md")).toBe(false);
    expect(isValidFileName("con.md")).toBe(false);
    expect(isValidFileName("..")).toBe(false);
  });

  it("accepts normal names", () => {
    expect(isValidFileName("note.md")).toBe(true);
    expect(isValidFileName("会议记录 2026.md")).toBe(true);
  });

  it("adds the markdown extension when missing", () => {
    expect(normalizeMarkdownFileName("note")).toBe("note.md");
    expect(normalizeMarkdownFileName("note.md")).toBe("note.md");
    expect(normalizeMarkdownFileName("  ")).toBe("");
  });

  it("strips extensions and extracts base names", () => {
    expect(stripExtension("note.md")).toBe("note");
    expect(baseName("D:/docs/note.md")).toBe("note.md");
    expect(baseName("note.md")).toBe("note.md");
  });

  it("joins paths with the correct separator", () => {
    expect(joinPath("D:\\docs", "a.md")).toBe("D:\\docs\\a.md");
    expect(joinPath("/home/user", "a.md")).toBe("/home/user/a.md");
  });

  it("avoids duplicate names", () => {
    expect(uniqueFileName(["a.md"], "b.md")).toBe("b.md");
    expect(uniqueFileName(["a.md"], "a.md")).toBe("a (2).md");
    expect(uniqueFileName(["a.md", "a (2).md"], "a.md")).toBe("a (3).md");
  });
});
