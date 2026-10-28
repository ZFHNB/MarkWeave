// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { markdownToDoc, docToMarkdown } from "../src/editor/serializer/markdown";
import { schema } from "../src/editor/schema";
import { slugifyHeading } from "../src/editor/serializer/link-references";

function roundTrip(markdown: string): string {
  return docToMarkdown(markdownToDoc(markdown, schema));
}

function normalize(markdown: string): string {
  return markdown.replace(/\r\n/g, "\n").trim();
}

describe("reference-style links", () => {
  it("parses a reference link into a link mark", () => {
    const doc = markdownToDoc("This is [an example][id].\n\n[id]: http://example.com", schema);
    let found = false;
    doc.descendants((node) => {
      node.marks.forEach((mark) => {
        if (mark.type.name === "link" && mark.attrs.reference === "id") found = true;
      });
    });
    expect(found).toBe(true);
  });

  it("keeps the definition as a block node", () => {
    const doc = markdownToDoc("[a][id]\n\n[id]: http://example.com \"Title\"", schema);
    let def: any = null;
    doc.descendants((node) => {
      if (node.type.name === "link_reference_definition") def = node;
    });
    expect(def).not.toBeNull();
    expect(def.attrs.id).toBe("id");
    expect(def.attrs.href).toBe("http://example.com");
    expect(def.attrs.title).toBe("Title");
  });

  it("round-trips a reference link and its definition", () => {
    const md = "This is [an example][id].\n\n[id]: http://example.com";
    expect(normalize(roundTrip(md))).toBe(md);
  });

  it("round-trips a collapsed reference", () => {
    const md = "[Google][]\n\n[Google]: http://google.com/";
    expect(normalize(roundTrip(md))).toBe(md);
  });

  it("leaves inline links untouched", () => {
    const md = "[text](https://example.com \"T\")";
    expect(normalize(roundTrip(md))).toBe(md);
  });
});

describe("internal anchors", () => {
  it("slugifies headings like GFM", () => {
    expect(slugifyHeading("Block Elements")).toBe("block-elements");
    expect(slugifyHeading("Markdown For Typora!")).toBe("markdown-for-typora");
    expect(slugifyHeading("  Hello   World  ")).toBe("hello-world");
  });

  it("round-trips an internal anchor link", () => {
    const md = "# Block Elements\n\n[Jump](#block-elements)";
    expect(normalize(roundTrip(md))).toBe(md);
  });

  it("marks internal anchors on the link mark", () => {
    const doc = markdownToDoc("# Block Elements\n\n[Jump](#block-elements)", schema);
    let anchor: string | null = null;
    doc.descendants((node) => {
      node.marks.forEach((mark) => {
        if (mark.type.name === "link" && mark.attrs.anchor) anchor = mark.attrs.anchor;
      });
    });
    expect(anchor).toBe("block-elements");
  });
});

describe("autolinks", () => {
  it("keeps plain URLs linked", () => {
    const doc = markdownToDoc("see https://example.com/a for details", schema);
    let linked = false;
    doc.descendants((node) => {
      node.marks.forEach((mark) => {
        if (mark.type.name === "link") linked = true;
      });
    });
    expect(linked).toBe(true);
  });
});
