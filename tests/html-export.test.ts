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
  it("produces a complete document with inlined styles", async () => {
    const html = await toStandaloneHtml(doc("# Hello\n\nSome *text*."), { title: "Demo" });
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain('<meta charset="utf-8" />');
    expect(html).toContain("<title>Demo</title>");
    expect(html).toContain('<article id="write">');
    // 标题带锚点 id，便于目录跳转
    expect(html).toMatch(/<h1 id="hello">Hello<\/h1>/);
    expect(html).toContain("<em>text</em>");
    // KaTeX 样式需内联，保证公式离线可读
    expect(html).toContain(".katex");
  });

  it("escapes the title", async () => {
    const html = await toStandaloneHtml(doc("x"), { title: '<script>"x"</script>' });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("embeds the selected theme css", async () => {
    const css = buildExportCss("github");
    expect(css).toContain("#write");
    expect(css).not.toBe(buildExportCss("default"));
  });

  it("uses a dark body background for night", async () => {
    expect(buildExportCss("night")).toContain("#363b40");
    expect(buildExportCss("github")).toContain("#fff");
  });

  it("replaces mermaid code blocks with rendered svg in order", async () => {
    const html = await toStandaloneHtml(
      doc("```mermaid\ngraph TD; A-->B;\n```\n\n```js\nconst a = 1;\n```"),
      { mermaidSvgs: ["<svg id=\"one\"></svg>"] }
    );
    expect(html).toContain('<div class="md-diagram-preview"><svg id="one"></svg></div>');
    expect(html).toContain("language-js");
  });

  it("keeps the source block when no svg is available", async () => {
    const html = await toStandaloneHtml(doc("```mermaid\ngraph TD; A-->B;\n```"), {
      mermaidSvgs: [],
    });
    expect(html).toContain('class="language-mermaid"');
  });

  it("serializes tables and task lists", async () => {
    const html = await toStandaloneHtml(
      doc("| A | B |\n| --- | --- |\n| 1 | 2 |\n\n- [x] done\n- [ ] todo")
    );
    expect(html).toContain("<table>");
    expect(html).toContain("<th>A</th>");
    expect(html).toContain('type="checkbox" disabled checked');
  });
});

describe("mermaid block discovery", () => {
  it("collects only mermaid-fenced code blocks in document order", async () => {
    const blocks = collectMermaidBlocks(
      doc("```mermaid\nA\n```\n\n```js\nB\n```\n\n```Mermaid\nC\n```")
    );
    expect(blocks).toEqual(["A", "C"]);
  });

  it("ignores empty mermaid blocks", async () => {
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
    const html = await toStandaloneHtml(doc("x"), { katexFontCss: buildKatexFontCss() });
    expect(html).toContain("data:font/woff2;base64");
  });
});

describe("table of contents", () => {
  it("emits a toc when requested", async () => {
    const html = await toStandaloneHtml(doc("# 第一章\n\n正文\n\n## 1.1 小节\n\n内容"), {
      title: "T",
      toc: true,
    });
    expect(html).toContain('class="markweave-toc"');
    expect(html).toContain("第一章");
    expect(html).toContain("1.1 小节");
  });

  it("respects tocDepth", async () => {
    const md = "# 一级\n\n## 二级\n\n### 三级";
    const deep = await toStandaloneHtml(doc(md), { toc: true, tocDepth: 3 });
    const shallow = await toStandaloneHtml(doc(md), { toc: true, tocDepth: 1 });

    // 只统计 <nav> 内的 <li>，避免匹配到样式表里的类名
    const countEntries = (html: string) => (html.match(/<li class="toc-level-/g) ?? []).length;
    expect(countEntries(deep)).toBe(3);
    expect(countEntries(shallow)).toBe(1);
  });

  it("omits the toc by default", async () => {
    expect(await toStandaloneHtml(doc("# A"))).not.toContain('<nav class="markweave-toc"');
  });

  it("links match heading ids", async () => {
    const html = await toStandaloneHtml(doc("# 标题一\n\n## 标题二"), { toc: true });
    const links = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
    const ids = [...html.matchAll(/<h[1-6] id="([^"]+)"/g)].map((m) => m[1]);
    expect(links).toEqual(ids);
  });

  it("handles a document without headings", async () => {
    const html = await toStandaloneHtml(doc("只有正文"), { toc: true });
    expect(html).not.toContain('<nav class="markweave-toc"');
    expect(html).toContain("只有正文");
  });
});

describe("front matter exclusion", () => {
  it("does not render the front matter block in the body", async () => {
    const html = await toStandaloneHtml(doc("---\ntitle: X\n---\n\n正文"), { title: "X" });
    expect(html).not.toContain("front-matter");
    expect(html).not.toContain("title: X");
  });
});
