import { describe, it, expect } from "vitest";
import {
  applyOpenedFile,
  findOpenDocumentByPath,
  markDocumentSaved,
  suggestedSaveName,
  wouldLoseEdits,
} from "../src/platform/documents";

function doc(id: string, title: string, content: string, filePath?: string) {
  return {
    id,
    title,
    content,
    updatedAt: 1,
    dirty: false,
    ...(filePath ? { filePath } : {}),
  };
}

describe("desktop document helpers", () => {
  it("adds a new document for a new path and activates it", () => {
    const existing = [doc("a", "a.md", "A")];
    const result = applyOpenedFile(existing, { path: "/tmp/b.md", content: "B" }, "a", 100);
    expect(result.documents).toHaveLength(2);
    expect(result.documents[1].title).toContain("b.md");
    expect(result.documents[1].filePath).toBe("/tmp/b.md");
    expect(result.activeDocId).toBe(result.documents[1].id);
  });

  it("updates an existing document with the same path instead of duplicating", () => {
    const existing = [doc("a", "a.md", "old", "/tmp/a.md")];
    const result = applyOpenedFile(existing, { path: "/tmp/a.md", content: "new" }, "a", 100);
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].content).toBe("new");
    expect(result.activeDocId).toBe("a");
  });

  it("marks a document saved without mutating the input", () => {
    const existing = [doc("a", "a.md", "A")];
    const next = markDocumentSaved(existing, "a", "/tmp/a.md", 200);
    expect(next[0].filePath).toBe("/tmp/a.md");
    expect(next[0].dirty).toBe(false);
    expect(next[0].updatedAt).toBe(200);
    expect(existing[0].filePath).toBeUndefined();
  });

  it("suggests the active document title", () => {
    const existing = [doc("a", "notes.md", "A")];
    expect(suggestedSaveName(existing, "a")).toBe("notes.md");
    expect(suggestedSaveName(existing, "missing")).toBe("未命名.md");
  });
});

describe("reopening an already-open file", () => {
  it("matches the same file regardless of slash style", () => {
    const existing = [doc("a", "a.md", "old", "C:\\notes\\a.md")];
    const found = findOpenDocumentByPath(existing, "C:/notes/a.md");
    expect(found?.id).toBe("a");
    expect(findOpenDocumentByPath(existing, "C:\\notes\\b.md")).toBeUndefined();
  });

  it("reports lost edits only when there are unsaved changes on top of different content", () => {
    const file = { path: "C:\\notes\\a.md", content: "disk" };

    expect(wouldLoseEdits(undefined, file)).toBe(false);
    expect(wouldLoseEdits(doc("a", "a.md", "x", file.path), file)).toBe(false);

    const dirty = { ...doc("a", "a.md", "unsaved edit", file.path), dirty: true };
    expect(wouldLoseEdits(dirty, file)).toBe(true);

    // 有 dirty 标记但内容和磁盘一致：直接刷新，不打扰用户
    const same = { ...doc("a", "a.md", "disk", file.path), dirty: true };
    expect(wouldLoseEdits(same, file)).toBe(false);
  });

  it("does not duplicate a document when the same path is opened with different separators", () => {
    const existing = [doc("a", "a.md", "old", "C:\\notes\\a.md")];
    const result = applyOpenedFile(existing, { path: "C:/notes/a.md", content: "new" }, "a");
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].content).toBe("new");
  });
});
