import { describe, it, expect } from "vitest";
import {
  absolutizeImagePaths,
  baseName,
  convertLineEnding,
  detectLineEnding,
  dirname,
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

  it("extracts the parent folder from both slash styles", () => {
    // 回归：只看 `/` 时 Windows 路径会原样返回，导出 PDF 会把文件当目录
    expect(dirname("D:\\notes\\a.md")).toBe("D:/notes");
    expect(dirname("D:/notes/a.md")).toBe("D:/notes");
    expect(dirname("a.md")).toBe("");
  });

  it("never treats a file path as a folder when building a sibling path", () => {
    const joined = joinPath(dirname("D:\\notes\\a.md"), "a.pdf");
    expect(joined).toBe("D:/notes/a.pdf");
    expect(joined.endsWith(".md/a.pdf")).toBe(false);
  });

  it("expands relative image paths for pandoc export", () => {
    const md = "![a](img/a.png) ![b](./b.jpg) ![c](sub/x.svg)";
    const out = absolutizeImagePaths(md, "D:\\notes\\doc.md");
    expect(out).toContain("D:/notes/img/a.png");
    expect(out).toContain("D:/notes/b.jpg");
    expect(out).toContain("D:/notes/sub/x.svg");
  });

  it("leaves absolute, remote and data image sources untouched", () => {
    const md =
      '![a](https://x/y.png) ![b](data:image/png;base64,AAA) ![c](C:\\img\\c.png) ![d](/abs/d.png) ![e](img/e.png "title")';
    const out = absolutizeImagePaths(md, "D:/notes/doc.md");
    expect(out).toContain("https://x/y.png");
    expect(out).toContain("data:image/png;base64,AAA");
    expect(out).toContain("C:\\img\\c.png");
    expect(out).toContain("/abs/d.png");
    // 带 title 的相对路径也要展开，且标题原样保留
    expect(out).toContain('D:/notes/img/e.png "title"');
  });

  it("is a no-op when the document has no path yet", () => {
    const md = "![a](img/a.png)";
    expect(absolutizeImagePaths(md, null)).toBe(md);
  });

  it("avoids duplicate names", () => {
    expect(uniqueFileName(["a.md"], "b.md")).toBe("b.md");
    expect(uniqueFileName(["a.md"], "a.md")).toBe("a (2).md");
    expect(uniqueFileName(["a.md", "a (2).md"], "a.md")).toBe("a (3).md");
  });
});
