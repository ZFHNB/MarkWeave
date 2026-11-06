// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { schema } from "../src/editor/schema";
import { markdownToDoc } from "../src/editor/serializer/markdown";
import {
  buildOutlineTree,
  extractOutlineItems,
  filterOutline,
  findActiveHeading,
} from "../src/editor/outline-tree";

const md = [
  "# A",
  "",
  "text",
  "",
  "## B",
  "",
  "### C",
  "",
  "## D",
  "",
  "# E",
  "",
  "## F",
].join("\n");

const items = extractOutlineItems(markdownToDoc(md, schema));

describe("outline extraction", () => {
  it("collects every heading in document order", () => {
    expect(items.map((i) => i.text)).toEqual(["A", "B", "C", "D", "E", "F"]);
    expect(items.map((i) => i.level)).toEqual([1, 2, 3, 2, 1, 2]);
  });

  it("assigns increasing positions", () => {
    const positions = items.map((i) => i.pos);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("skips empty headings", () => {
    const doc = markdownToDoc("# \n\ntext", schema);
    expect(extractOutlineItems(doc)).toHaveLength(0);
  });
});

describe("outline tree", () => {
  it("nests children under their parent heading", () => {
    const tree = buildOutlineTree(items);
    expect(tree.map((n) => n.text)).toEqual(["A", "E"]);
    expect(tree[0].children.map((n) => n.text)).toEqual(["B", "D"]);
    expect(tree[0].children[0].children.map((n) => n.text)).toEqual(["C"]);
  });

  it("handles a document that starts at level 3", () => {
    const deep = extractOutlineItems(markdownToDoc("### Only\n\n#### Child", schema));
    const tree = buildOutlineTree(deep);
    expect(tree).toHaveLength(1);
    expect(tree[0].children[0].text).toBe("Child");
  });
});

describe("outline filtering", () => {
  it("keeps matching headings and their ancestors", () => {
    const filtered = filterOutline(items, "c");
    expect(filtered.map((i) => i.text)).toEqual(["A", "B", "C"]);
  });

  it("is case insensitive", () => {
    expect(filterOutline(items, "D").map((i) => i.text)).toEqual(["A", "D"]);
  });

  it("returns everything for an empty query", () => {
    expect(filterOutline(items, "   ")).toHaveLength(items.length);
  });

  it("returns nothing when there is no match", () => {
    expect(filterOutline(items, "zzz")).toHaveLength(0);
  });
});

describe("active heading", () => {
  it("returns the last heading at or before the cursor", () => {
    expect(findActiveHeading(items, items[2].pos)?.text).toBe("C");
    expect(findActiveHeading(items, items[2].pos + 1)?.text).toBe("C");
  });

  it("returns null before the first heading", () => {
    const leading = extractOutlineItems(
      markdownToDoc("intro paragraph\n\n# Later", schema)
    );
    expect(findActiveHeading(leading, 0)).toBeNull();
    expect(findActiveHeading(leading, leading[0].pos)?.text).toBe("Later");
  });

  it("returns the final heading at the end of the document", () => {
    const end = markdownToDoc(md, schema).content.size;
    expect(findActiveHeading(items, end)?.text).toBe("F");
  });
});
