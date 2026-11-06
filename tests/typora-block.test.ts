// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { markdownToDoc, docToMarkdown } from "../src/editor/serializer/markdown";
import { schema } from "../src/editor/schema";
import { replaceEmojiShortcodes } from "../src/editor/serializer/emoji";

function roundTrip(markdown: string): string {
  return docToMarkdown(markdownToDoc(markdown, schema));
}

function normalize(markdown: string): string {
  return markdown.replace(/\r\n/g, "\n").trim();
}

function nodeNames(markdown: string): string[] {
  const names: string[] = [];
  markdownToDoc(markdown, schema).descendants((node) => {
    names.push(node.type.name);
  });
  return names;
}

describe("YAML front matter", () => {
  it("parses at the top of the document", () => {
    const doc = markdownToDoc("---\ntitle: Post\ndate: 2026-10-28\n---\n\nBody", schema);
    const first = doc.firstChild!;
    expect(first.type.name).toBe("yaml_frontmatter");
    expect(first.attrs.content).toContain("title: Post");
    expect(first.attrs.content).toContain("date: 2026-10-28");
  });

  it("round-trips front matter", () => {
    const md = "---\ntitle: Post\n---\n\nBody";
    expect(normalize(roundTrip(md))).toBe(md);
  });

  it("does not treat a mid-document rule as front matter", () => {
    const md = "Para\n\n---\n\nMore";
    expect(normalize(roundTrip(md))).toBe(md);
  });

  it("does not treat fences inside code blocks as front matter", () => {
    const md = "```\n---\ntitle: x\n---\n```";
    expect(nodeNames(md)).not.toContain("yaml_frontmatter");
  });
});

describe("table of contents", () => {
  it("parses [toc] into a toc block", () => {
    const doc = markdownToDoc("[toc]\n\n# A", schema);
    expect(doc.firstChild!.type.name).toBe("toc_block");
  });

  it("round-trips [toc]", () => {
    expect(normalize(roundTrip("[toc]\n\n# A"))).toBe("[toc]\n\n# A");
  });

  it("accepts uppercase TOC", () => {
    const doc = markdownToDoc("[TOC]", schema);
    expect(doc.firstChild!.type.name).toBe("toc_block");
  });
});

describe("footnotes", () => {
  it("parses a reference and a definition", () => {
    const doc = markdownToDoc("text[^1]\n\n[^1]: the note", schema);
    expect(nodeNames("text[^1]\n\n[^1]: the note")).toContain("footnote_ref");
    expect(doc.lastChild!.type.name).toBe("footnote_definition");
    expect(doc.lastChild!.attrs.id).toBe("1");
    expect(doc.lastChild!.attrs.content).toBe("the note");
  });

  it("round-trips footnotes", () => {
    const md = "text[^1]\n\n[^1]: the note";
    expect(normalize(roundTrip(md))).toBe(md);
  });

  it("keeps indented continuation lines", () => {
    const doc = markdownToDoc("[^a]: first\n  second", schema);
    expect(doc.firstChild!.attrs.content).toBe("first\nsecond");
  });
});

describe("emoji shortcodes", () => {
  it("replaces known shortcodes", () => {
    expect(replaceEmojiShortcodes("hi :smile: there")).toBe("hi 😄 there");
    expect(replaceEmojiShortcodes(":thumbsup:")).toBe("👍");
  });

  it("leaves unknown shortcodes alone", () => {
    expect(replaceEmojiShortcodes(":not_a_real_emoji:")).toBe(":not_a_real_emoji:");
  });

  it("does not replace inside inline code", () => {
    const doc = markdownToDoc("`:smile:` and :smile:", schema);
    const texts: string[] = [];
    doc.descendants((node) => {
      if (node.isText) texts.push(node.text || "");
    });
    expect(texts.join("")).toContain(":smile:");
    expect(texts.join("")).toContain("😄");
  });
});

describe("HTML preservation", () => {
  it("keeps inline HTML text content", () => {
    const md = '<span style="color:red">red</span>';
    expect(normalize(roundTrip(md))).toContain("red");
  });

  it("keeps a raw HTML block", () => {
    const md = '<div class="note">\nblock\n</div>';
    expect(normalize(roundTrip(md))).toContain("block");
  });
});
