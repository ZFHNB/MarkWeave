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

function marksOf(markdown: string, markName: string): number {
  let count = 0;
  markdownToDoc(markdown, schema).descendants((node) => {
    if (node.isText && node.marks.some((mark) => mark.type.name === markName)) count++;
  });
  return count;
}

describe("Typora inline syntax parsing", () => {
  it("parses highlight into the highlight mark", () => {
    expect(marksOf("a ==key== b", "highlight")).toBeGreaterThan(0);
  });

  it("parses superscript and subscript", () => {
    expect(marksOf("X^2^", "superscript")).toBeGreaterThan(0);
    expect(marksOf("H~2~O", "subscript")).toBeGreaterThan(0);
  });

  it("parses inline math with its formula", () => {
    let formula = "";
    markdownToDoc("value $x^2$ end", schema).descendants((node) => {
      if (node.isText) {
        node.marks.forEach((mark) => {
          if (mark.type.name === "inline_math") formula = mark.attrs.formula;
        });
      }
    });
    expect(formula).toBe("x^2");
  });

  it("does not treat code spans as extended syntax", () => {
    const doc = markdownToDoc("`==a==` and `$b$`", schema);
    let hasHighlight = false;
    let hasMath = false;
    doc.descendants((node) => {
      node.marks.forEach((mark) => {
        if (mark.type.name === "highlight") hasHighlight = true;
        if (mark.type.name === "inline_math") hasMath = true;
      });
    });
    expect(hasHighlight).toBe(false);
    expect(hasMath).toBe(false);
  });

  it("leaves plain currency amounts alone", () => {
    expect(marksOf("cost $5 and $6", "inline_math")).toBe(0);
  });
});

describe("Typora inline syntax serialization", () => {
  it("round-trips highlight", () => {
    expect(normalize(roundTrip("a ==key== b"))).toBe("a ==key== b");
  });

  it("round-trips superscript and subscript", () => {
    expect(normalize(roundTrip("X^2^ and H~2~O"))).toBe("X^2^ and H~2~O");
  });

  it("round-trips inline math", () => {
    expect(normalize(roundTrip("value $x^2$ end"))).toBe("value $x^2$ end");
  });

  it("round-trips combinations with other marks", () => {
    const md = "**bold** and ==hl== with `code` and $a+b$";
    expect(normalize(roundTrip(md))).toBe(md);
  });

  it("leaves strike syntax intact", () => {
    const md = "~~deleted~~ and ~sub~";
    expect(normalize(roundTrip(md))).toBe(md);
  });
});
