import { describe, it, expect } from "vitest";
import {
  PANDOC_FORMATS,
  buildPandocArgs,
  classifyPandocError,
  getFormat,
  parsePandocVersion,
} from "../src/export/pandoc";

describe("pandoc formats", () => {
  it("offers the common export targets", () => {
    const ids = PANDOC_FORMATS.map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining(["docx", "epub", "latex", "rtf", "odt"]));
  });

  it("every format has a unique extension", () => {
    const exts = PANDOC_FORMATS.map((f) => f.extension);
    expect(new Set(exts).size).toBe(exts.length);
  });

  it("falls back to the first format for unknown ids", () => {
    expect(getFormat("nope").id).toBe(PANDOC_FORMATS[0].id);
    expect(getFormat("epub").extension).toBe("epub");
  });
});

describe("buildPandocArgs", () => {
  it("passes input, format, output and standalone", () => {
    const { args, extension } = buildPandocArgs({
      format: "docx",
      inputPath: "/tmp/in.md",
      outputPath: "/tmp/out.docx",
    });
    expect(args).toContain("/tmp/in.md");
    expect(args).toContain("-t");
    expect(args[args.indexOf("-t") + 1]).toBe("docx");
    expect(args).toContain("--standalone");
    expect(extension).toBe(".docx");
  });

  it("enables the extensions the editor relies on", () => {
    const { args } = buildPandocArgs({
      format: "docx",
      inputPath: "a.md",
      outputPath: "a.docx",
    });
    const from = args[args.indexOf("-f") + 1];
    expect(from).toContain("pipe_tables");
    expect(from).toContain("task_lists");
    expect(from).toContain("footnotes");
    expect(from).toContain("strikeout");
  });

  it("adds metadata with -M", () => {
    const { args } = buildPandocArgs({
      format: "epub",
      inputPath: "a.md",
      outputPath: "a.epub",
      metadata: { title: "我的文档", author: "" },
    });
    expect(args).toContain("-M");
    expect(args).toContain("title=我的文档");
    // 空值不下发
    expect(args.some((a) => a.startsWith("author="))).toBe(false);
  });
});

describe("classifyPandocError", () => {
  it("recognises a missing binary", () => {
    expect(classifyPandocError("spawn pandoc ENOENT")).toContain("未找到 pandoc");
  });

  it("recognises a permission problem", () => {
    expect(classifyPandocError("permission denied")).toContain("权限");
  });

  it("falls back to the first line of stderr", () => {
    expect(classifyPandocError("boom\ndetails")).toBe("boom");
  });

  it("handles empty stderr", () => {
    expect(classifyPandocError("", 2)).toContain("退出码 2");
    expect(classifyPandocError("", null)).toContain("执行失败");
  });

  it("truncates very long messages", () => {
    expect(classifyPandocError("x".repeat(500)).length).toBeLessThanOrEqual(200);
  });
});

describe("parsePandocVersion", () => {
  it("parses a normal version line", () => {
    const v = parsePandocVersion("pandoc 3.1.9\nFeatures: +server +lua");
    expect(v).toEqual({ major: 3, minor: 1, patch: 9, raw: "pandoc 3.1.9" });
  });

  it("handles a two-part version", () => {
    expect(parsePandocVersion("pandoc 2.9")?.patch).toBe(0);
  });

  it("returns null for unparseable output", () => {
    expect(parsePandocVersion("command not found")).toBeNull();
  });
});
