import { describe, it, expect } from "vitest";
import {
  addRecent,
  buildFileTree,
  clearRecent,
  fuzzyScore,
  naturalCompare,
  quickOpen,
  sortFiles,
  type FlatFile,
  type RecentEntry,
} from "../src/workspace/file-tree";

const files: FlatFile[] = [
  { name: "alpha.md", path: "/docs/alpha.md", relativePath: "docs/alpha.md" },
  { name: "beta.md", path: "/docs/beta.md", relativePath: "docs/beta.md" },
  { name: "chapter1.md", path: "/notes/chapter1.md", relativePath: "notes/chapter1.md" },
  { name: "chapter2.md", path: "/notes/chapter2.md", relativePath: "notes/chapter2.md" },
  { name: "chapter10.md", path: "/notes/chapter10.md", relativePath: "notes/chapter10.md" },
];

describe("file tree", () => {
  it("groups files into folders", () => {
    const tree = buildFileTree(
      files.map((f) => ({ name: f.name, path: f.relativePath, type: "file" as const }))
    );
    const folders = tree.filter((node) => node.type === "folder").map((node) => node.name);
    expect(folders).toEqual(["docs", "notes"]);
    const notes = tree.find((node) => node.name === "notes")!;
    expect(notes.children!.map((c) => c.name)).toEqual(["chapter1.md", "chapter2.md", "chapter10.md"]);
  });

  it("keeps empty folders out of the tree unless provided", () => {
    expect(buildFileTree([])).toEqual([]);
  });
});

describe("sorting", () => {
  it("sorts naturally so chapter2 precedes chapter10", () => {
    const sorted = sortFiles(files, "natural-asc").map((f) => f.name);
    expect(sorted.indexOf("chapter2.md")).toBeLessThan(sorted.indexOf("chapter10.md"));
  });

  it("sorts alphabetically when requested", () => {
    const sorted = sortFiles(files, "name-asc").map((f) => f.name);
    expect(sorted[0]).toBe("alpha.md");
  });

  it("reverses ordering", () => {
    const asc = sortFiles(files, "name-asc").map((f) => f.name);
    const desc = sortFiles(files, "name-desc").map((f) => f.name);
    expect(desc).toEqual([...asc].reverse());
  });

  it("compares naturally", () => {
    expect(naturalCompare("a2", "a10")).toBeLessThan(0);
  });
});

describe("fuzzy search", () => {
  it("matches subsequences", () => {
    expect(fuzzyScore("ch1", "chapter1.md")).not.toBeNull();
    expect(fuzzyScore("xyz", "chapter1.md")).toBeNull();
  });

  it("prefers boundary and consecutive matches", () => {
    const boundary = fuzzyScore("alpha", "alpha.md")!;
    const scattered = fuzzyScore("alpha", "a-l-p-h-a.md")!;
    expect(boundary).toBeLessThan(scattered);
  });

  it("returns recent-style matches for quick open", () => {
    const results = quickOpen(files, "ch2");
    expect(results[0]?.name).toBe("chapter2.md");
  });

  it("returns everything when the query is empty", () => {
    expect(quickOpen(files, "").length).toBe(files.length);
  });

  it("matches on the relative path", () => {
    const results = quickOpen(files, "notes");
    expect(results.some((f) => f.relativePath.startsWith("notes/"))).toBe(true);
  });
});

describe("recent files", () => {
  const entry = (path: string, openedAt: number): RecentEntry => ({
    path,
    title: path.split("/").pop()!,
    openedAt,
  });

  it("puts the newest file first", () => {
    let list = addRecent([], entry("/a.md", 1));
    list = addRecent(list, entry("/b.md", 2));
    expect(list.map((e) => e.path)).toEqual(["/b.md", "/a.md"]);
  });

  it("moves a reopened file to the front without duplicating", () => {
    let list = [entry("/a.md", 1), entry("/b.md", 2)];
    list = addRecent(list, entry("/a.md", 3));
    expect(list.map((e) => e.path)).toEqual(["/a.md", "/b.md"]);
  });

  it("caps the list", () => {
    let list: RecentEntry[] = [];
    for (let i = 0; i < 30; i++) list = addRecent(list, entry(`/f${i}.md`, i));
    expect(list.length).toBe(20);
  });

  it("clears", () => {
    expect(clearRecent()).toEqual([]);
  });
});
