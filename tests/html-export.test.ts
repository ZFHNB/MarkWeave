// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { schema } from "../src/editor/schema";
import { markdownToDoc } from "../src/editor/serializer/markdown";
import { buildExportCss, toStandaloneHtml } from "../src/export/html-export";
import { collectMermaidBlocks } from "../src/export/mermaid-render";

function doc(markdown: string) {
  return markdownToDoc(markdown, schema);
}

describe("standalone HTML export", () => {
  it("produces a complete document with inlined styles", () => {
    const html = toStandaloneHtml(doc("# Hello\n\nSome *text*."), { title: "Demo" });
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain('<meta charset="utf-8" />');
    expect(html).toContain("<title>Demo</title>");
    expect(html).toContain('<article id="write">');
    expect(html).toContain("<h1>Hello</h1>");
    expect(html).toContain("<em>text</em>");
    // KaTeX 样式需内联，保证公式离线可读
    expect(html).toContain(".katex");
  });

  it("escapes the title", () => {
    const html = toStandaloneHtml(doc("x"), { title: '<script>"x"</script>' });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("embeds the selected theme css", () => {
    const css = buildExportCss("github");
    expect(css).toContain("#write");
    expect(css).not.toBe(buildExportCss("default"));
  });

  it("uses a dark body background for night", () => {
    expect(buildExportCss("night")).toContain("#363b40");
    expect(buildExportCss("github")).toContain("#fff");
  });

  it("replaces mermaid code blocks with rendered svg in order", () => {
    const html = toStandaloneHtml(
      doc("```mermaid\ngraph TD; A-->B;\n```\n\n```js\nconst a = 1;\n```"),
      { mermaidSvgs: ["<svg id=\"one\"></svg>"] }
    );
    expect(html).toContain('<div class="md-diagram-preview"><svg id="one"></svg></div>');
    expect(html).toContain("language-js");
  });

  it("keeps the source block when no svg is available", () => {
    const html = toStandaloneHtml(doc("```mermaid\ngraph TD; A-->B;\n```"), {
      mermaidSvgs: [],
    });
    expect(html).toContain('class="language-mermaid"');
  });

  it("serializes tables and task lists", () => {
    const html = toStandaloneHtml(
      doc("| A | B |\n| --- | --- |\n| 1 | 2 |\n\n- [x] done\n- [ ] todo")
    );
    expect(html).toContain("<table>");
    expect(html).toContain("<th>A</th>");
    expect(html).toContain('type="checkbox" disabled checked');
  });
});

describe("mermaid block discovery", () => {
  it("collects only mermaid-fenced code blocks in document order", () => {
    const blocks = collectMermaidBlocks(
      doc("```mermaid\nA\n```\n\n```js\nB\n```\n\n```Mermaid\nC\n```")
    );
    expect(blocks).toEqual(["A", "C"]);
  });

  it("ignores empty mermaid blocks", () => {
    expect(collectMermaidBlocks(doc("```mermaid\n\n```"))).toEqual([]);
  });
});

describe("katex font embedding", () => {
  it("inlines woff2 data urls so formulas render offline", async () => {
    const { buildKatexFontCss } = await import("../src/export/katex-fonts");
    const css = buildKatexFontCss();
    expect(css).toContain("KaTeX_Main");
    expect(css).toContain("data:font/woff2;base64");
    expect(css.split("@font-face").length - 1).toBeGreaterThanOrEqual(19);
  });

  it("uses the provided font css in the exported document", async () => {
    const { buildKatexFontCss } = await import("../src/export/katex-fonts");
    const html = toStandaloneHtml(doc("x"), { katexFontCss: buildKatexFontCss() });
    expect(html).toContain("data:font/woff2;base64");
  });
});
