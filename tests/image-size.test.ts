// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { schema } from "../src/editor/schema";
import { markdownToDoc, docToMarkdown } from "../src/editor/serializer/markdown";

/**
 * 图片尺寸的存储规则（与 Typora 一致）：
 * - 没有宽度 → 标准 Markdown 语法 `![alt](src)`
 * - 有宽度   → HTML 语法 `<img ... width="...">`
 */
describe("image width round-trip", () => {
  it("keeps plain Markdown syntax when no width is set", () => {
    const md = "![logo](attachments/a.png)";
    const out = docToMarkdown(markdownToDoc(md, schema));
    expect(out).toBe(md);
  });

  it("emits HTML syntax when a width exists", () => {
    const doc = markdownToDoc("![logo](attachments/a.png)", schema);
    let imagePos = -1;
    doc.descendants((node, pos) => {
      if (node.type.name === "image") imagePos = pos;
    });

    const node = doc.nodeAt(imagePos)!;
    const replaced = doc.type.schema.node("doc", null, [
      doc.type.schema.node("paragraph", null, [
        node.type.create({ ...node.attrs, width: 320 }),
      ]),
    ]);
    expect(docToMarkdown(replaced)).toContain('width="320"');
    expect(docToMarkdown(replaced)).toContain("<img");
  });

  it("parses width back from an HTML img tag", () => {
    const md = '<img src="attachments/a.png" alt="logo" width="320" />';
    const doc = markdownToDoc(md, schema);
    let width: number | null = null;
    doc.descendants((node) => {
      if (node.type.name === "image") width = node.attrs.width;
    });
    expect(width).toBe(320);
  });

  it("falls back to Markdown syntax after clearing the width", () => {
    const html = '<img src="a.png" alt="x" width="200" />';
    const doc = markdownToDoc(html, schema);
    let imagePos = -1;
    doc.descendants((node, pos) => {
      if (node.type.name === "image") imagePos = pos;
    });
    const node = doc.nodeAt(imagePos)!;
    const cleared = doc.type.schema.node("doc", null, [
      doc.type.schema.node("paragraph", null, [
        node.type.create({ ...node.attrs, width: null }),
      ]),
    ]);
    const out = docToMarkdown(cleared);
    expect(out).not.toContain("width=");
    expect(out).toContain("![x](a.png)");
  });
});
