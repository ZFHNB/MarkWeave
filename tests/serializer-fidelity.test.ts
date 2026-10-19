// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { markdownToDoc, docToMarkdown } from "../src/editor/serializer/markdown";
import { schema } from "../src/editor/schema";
import { computeStats } from "../src/editor/stats";

function roundTrip(markdown: string): string {
  return docToMarkdown(markdownToDoc(markdown, schema));
}

function normalize(markdown: string): string {
  return markdown.replace(/\r\n/g, "\n").trim();
}

describe("Markdown round-trip fidelity", () => {
  it("preserves nested bullet list indentation", () => {
    const md = "- parent\n  - child\n    - grandchild";
    expect(normalize(roundTrip(md))).toBe(md);
  });

  it("preserves ordered list start numbers", () => {
    const md = "3. three\n4. four";
    expect(normalize(roundTrip(md))).toBe(md);
  });

  it("preserves link titles", () => {
    const md = '[text](https://example.com "Title")';
    expect(normalize(roundTrip(md))).toBe(md);
  });

  it("preserves image titles", () => {
    const md = '![alt](image.png "Pic")';
    expect(normalize(roundTrip(md))).toBe(md);
  });

  it("preserves inline marks", () => {
    const md = "**bold** *em* ~~strike~~ `code`";
    expect(normalize(roundTrip(md))).toBe(md);
  });

  it("preserves headings and blockquotes", () => {
    const md = "# Title\n\n> quoted text";
    expect(normalize(roundTrip(md))).toBe(md);
  });
});

describe("computeStats", () => {
  it("counts serialized lines", () => {
    expect(computeStats("a\n\nb").lines).toBe(3);
    expect(computeStats("").lines).toBe(1);
  });

  it("counts CJK characters and latin words", () => {
    const stats = computeStats("你好 world");
    expect(stats.words).toBe(3);
    expect(stats.chars).toBe(8);
  });
});

describe("M0 required styles", () => {
  const css = fs.readFileSync(
    path.resolve(process.cwd(), "src/styles/typora-theme.css"),
    "utf8"
  );

  it("contains print rules", () => {
    expect(css).toMatch(/@media\s+print/);
  });

  it("constrains images to the content width", () => {
    expect(css).toMatch(/\.md-image\s*\{[^}]*max-width:\s*100%/s);
  });
});
