import { describe, it, expect } from "vitest";
import {
  buildExportMeta,
  frontMatterFromNode,
  parseFrontMatter,
  resolveHtmlTitle,
  resolvePaperSize,
} from "../src/export/front-matter";

describe("parseFrontMatter", () => {
  it("parses title, date and toc", () => {
    const fm = parseFrontMatter("title: 我的文档\ndate: 2026-11-02\ntoc: true");
    expect(fm.title).toBe("我的文档");
    expect(fm.date).toBe("2026-11-02");
    expect(fm.toc).toBe(true);
  });

  it("strips surrounding quotes", () => {
    expect(parseFrontMatter('title: "带引号的标题"').title).toBe("带引号的标题");
    expect(parseFrontMatter("title: '单引号'").title).toBe("单引号");
  });

  it("parses a block-style author list", () => {
    const fm = parseFrontMatter("author:\n  - 张三\n  - 李四");
    expect(fm.author).toEqual(["张三", "李四"]);
  });

  it("parses an inline author list", () => {
    expect(parseFrontMatter("author: [张三, 李四]").author).toEqual(["张三", "李四"]);
  });

  it("parses a single author as a one-item list", () => {
    expect(parseFrontMatter("author: 张三").author).toEqual(["张三"]);
  });

  it("parses toc_depth", () => {
    expect(parseFrontMatter("toc: true\ntoc_depth: 4").tocDepth).toBe(4);
  });

  it("parses papersize", () => {
    expect(parseFrontMatter("papersize: Letter").papersize).toBe("letter");
  });

  it("keeps unknown keys in extra", () => {
    const fm = parseFrontMatter("foo: bar");
    expect(fm.extra.foo).toBe("bar");
  });

  it("ignores comments and blank lines", () => {
    const fm = parseFrontMatter("# 注释\n\ntitle: A\n\n");
    expect(fm.title).toBe("A");
    expect(Object.keys(fm.extra)).toEqual([]);
  });

  it("returns an empty object for blank input", () => {
    expect(parseFrontMatter("").extra).toEqual({});
    expect(parseFrontMatter("   ").title).toBeUndefined();
  });

  it("does not throw on malformed lines", () => {
    expect(() => parseFrontMatter("::: not yaml :::")).not.toThrow();
  });

  it("accepts boolean synonyms", () => {
    expect(parseFrontMatter("toc: yes").toc).toBe(true);
    expect(parseFrontMatter("toc: off").toc).toBe(false);
  });
});

describe("frontMatterFromNode", () => {
  it("handles null and empty", () => {
    expect(frontMatterFromNode(null).title).toBeUndefined();
    expect(frontMatterFromNode("").extra).toEqual({});
  });

  it("parses node content", () => {
    expect(frontMatterFromNode("title: X").title).toBe("X");
  });
});

describe("buildExportMeta", () => {
  it("prefers the front matter title", () => {
    const meta = buildExportMeta(parseFrontMatter("title: 文档标题"), "文件名");
    expect(meta.title).toBe("文档标题");
    expect(meta.metadata.title).toBe("文档标题");
  });

  it("falls back to the file name", () => {
    expect(buildExportMeta(parseFrontMatter(""), "文件名").title).toBe("文件名");
  });

  it("joins multiple authors", () => {
    const meta = buildExportMeta(parseFrontMatter("author:\n  - A\n  - B"), "T");
    expect(meta.metadata.author).toBe("A; B");
    expect(meta.authors).toEqual(["A", "B"]);
  });

  it("emits toc metadata", () => {
    const meta = buildExportMeta(parseFrontMatter("toc: true\ntoc_depth: 2"), "T");
    expect(meta.metadata.toc).toBe("true");
    expect(meta.metadata["toc-depth"]).toBe("2");
  });

  it("omits absent fields", () => {
    const meta = buildExportMeta(parseFrontMatter(""), "T");
    expect(meta.metadata.author).toBeUndefined();
    expect(meta.metadata.date).toBeUndefined();
  });
});

describe("resolveHtmlTitle", () => {
  it("uses the front matter title when present", () => {
    expect(resolveHtmlTitle(parseFrontMatter("title: A"), "B")).toBe("A");
  });

  it("falls back when the title is blank", () => {
    expect(resolveHtmlTitle(parseFrontMatter("title: '  '"), "B")).toBe("B");
  });
});

describe("resolvePaperSize", () => {
  const supported = ["A4", "A3", "Letter"];

  it("matches case-insensitively", () => {
    expect(resolvePaperSize(parseFrontMatter("papersize: letter"), supported)).toBe("Letter");
    expect(resolvePaperSize(parseFrontMatter("papersize: A4"), supported)).toBe("A4");
  });

  it("returns null for unsupported sizes", () => {
    expect(resolvePaperSize(parseFrontMatter("papersize: B5"), supported)).toBeNull();
  });

  it("returns null when absent", () => {
    expect(resolvePaperSize(parseFrontMatter(""), supported)).toBeNull();
  });
});
