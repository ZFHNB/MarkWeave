// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { markdownToDoc, docToMarkdown } from "../src/editor/serializer/markdown";
import { schema } from "../src/editor/schema";

function roundTrip(markdown: string): string {
  return docToMarkdown(markdownToDoc(markdown, schema));
}

function normalize(markdown: string): string {
  return markdown.replace(/\r\n/g, "\n").trim();
}

describe("table parsing", () => {
  it("parses a GFM table into table nodes", () => {
    const doc = markdownToDoc("| A | B |\n| :--- | ---: |\n| 1 | 2 |", schema);
    let tables = 0;
    doc.descendants((node) => {
      if (node.type.name === "table") tables++;
    });
    expect(tables).toBe(1);
  });

  it("maps column alignment from style", () => {
    const doc = markdownToDoc(
      "| A | B | C |\n| :--- | :---: | ---: |\n| 1 | 2 | 3 |",
      schema
    );
    const alignments: string[] = [];
    doc.descendants((node) => {
      if (node.type.name === "table_header") alignments.push(node.attrs.alignment);
    });
    expect(alignments).toEqual(["left", "center", "right"]);
  });
});

describe("table serialization", () => {
  it("round-trips canonical alignment", () => {
    const md = "| A | B | C |\n| :--- | :---: | ---: |\n| 1 | 2 | 3 |";
    expect(normalize(roundTrip(md))).toBe(md);
  });

  it("canonicalizes plain dashes to left alignment", () => {
    const md = "| A | B |\n| --- | --- |\n| 1 | 2 |";
    const expected = "| A | B |\n| :--- | :--- |\n| 1 | 2 |";
    expect(normalize(roundTrip(md))).toBe(expected);
  });

  it("escapes pipes inside cells", () => {
    const md = "| A | B |\n| :--- | :--- |\n| a \\| b | c |";
    expect(normalize(roundTrip(md))).toBe(md);
  });

  it("preserves inline marks in cells", () => {
    const md = "| A | B |\n| :--- | :--- |\n| **bold** | `code` |";
    expect(normalize(roundTrip(md))).toBe(md);
  });

  it("preserves hard breaks as <br>", () => {
    const md = "| A | B |\n| :--- | :--- |\n| a<br>b | c |";
    expect(normalize(roundTrip(md))).toBe(md);
  });

  it("preserves empty cells", () => {
    const md = "| A | B |\n| :--- | :--- |\n|  |  |";
    expect(normalize(roundTrip(md))).toBe(md);
  });

  it("round-trips a table inside a blockquote", () => {
    const md = "> | A | B |\n> | :--- | :--- |\n> | 1 | 2 |";
    expect(normalize(roundTrip(md))).toBe(md);
  });

  it("leaves non-table content unchanged", () => {
    const md = "# Title\n\nParagraph with **bold**.";
    expect(normalize(roundTrip(md))).toBe(md);
  });
});
