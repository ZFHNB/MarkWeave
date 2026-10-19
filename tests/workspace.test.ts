import { describe, it, expect } from "vitest";
import {
  WORKSPACE_STORAGE_KEY,
  createDocument,
  createWorkspace,
  loadWorkspace,
  parseWorkspace,
  saveWorkspace,
  serializeWorkspace,
  uniqueTitle,
} from "../src/workspace/store";
import { applyDocumentSwitch } from "../src/workspace/session";

class MemoryStorage implements Storage {
  private map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

describe("workspace store", () => {
  it("creates documents with unique ids and defaults", () => {
    const a = createDocument("a.md", "A");
    const b = createDocument("b.md", "B");
    expect(a.id).not.toBe(b.id);
    expect(a.content).toBe("A");
    expect(a.dirty).toBe(false);
    expect(createDocument().title).toBe("未命名.md");
  });

  it("round-trips a workspace through storage", () => {
    const a = createDocument("a.md", "A");
    const b = createDocument("b.md", "B");
    const workspace = createWorkspace([a, b], a.id);
    const storage = new MemoryStorage();

    saveWorkspace(workspace, storage);
    expect(storage.getItem(WORKSPACE_STORAGE_KEY)).toBeTruthy();

    const loaded = loadWorkspace(storage, createWorkspace([], ""));
    expect(loaded.documents.map((doc) => doc.id)).toEqual([a.id, b.id]);
    expect(loaded.activeDocId).toBe(a.id);
  });

  it("falls back on corrupt or incompatible data", () => {
    const fallback = createWorkspace([createDocument("fallback.md", "F")], "fallback-id");
    const storage = new MemoryStorage();

    expect(loadWorkspace(storage, fallback)).toEqual(fallback);

    storage.setItem(WORKSPACE_STORAGE_KEY, "{not-json");
    expect(loadWorkspace(storage, fallback)).toEqual(fallback);

    storage.setItem(
      WORKSPACE_STORAGE_KEY,
      JSON.stringify({ version: 2, documents: [], activeDocId: "", savedAt: 0 })
    );
    expect(loadWorkspace(storage, fallback)).toEqual(fallback);

    expect(parseWorkspace(null)).toBeNull();
    expect(parseWorkspace("{not-json")).toBeNull();
  });

  it("serializes with version 1", () => {
    const workspace = createWorkspace([createDocument("x.md", "x")], "id");
    const parsed = JSON.parse(serializeWorkspace(workspace));
    expect(parsed.version).toBe(1);
    expect(parsed.documents).toHaveLength(1);
  });

  it("generates unique titles", () => {
    const docs = [
      createDocument("未命名.md", ""),
      createDocument("未命名 (2).md", ""),
    ];
    expect(uniqueTitle(docs, "未命名.md")).toBe("未命名 (3).md");
    expect(uniqueTitle(docs, "其他.md")).toBe("其他.md");
    expect(uniqueTitle([], "未命名.md")).toBe("未命名.md");
  });
});

describe("document switching", () => {
  it("saves the source buffer when in source mode", () => {
    const a = createDocument("a.md", "old-a");
    const b = createDocument("b.md", "old-b");

    const result = applyDocumentSwitch({
      documents: [a, b],
      activeDocId: a.id,
      nextDocId: b.id,
      isSourceMode: true,
      sourceBuffer: "source-edited",
      editorMarkdown: "stale-editor",
    });

    expect(result.documents.find((doc) => doc.id === a.id)!.content).toBe("source-edited");
    expect(result.activeDocId).toBe(b.id);
    expect(result.contentForNextDoc).toBe("old-b");
    expect(a.content).toBe("old-a");
    expect(b.content).toBe("old-b");
  });

  it("saves the editor markdown when not in source mode", () => {
    const a = createDocument("a.md", "old-a");
    const b = createDocument("b.md", "old-b");

    const result = applyDocumentSwitch({
      documents: [a, b],
      activeDocId: a.id,
      nextDocId: b.id,
      isSourceMode: false,
      sourceBuffer: "ignored",
      editorMarkdown: "editor-edited",
    });

    expect(result.documents.find((doc) => doc.id === a.id)!.content).toBe("editor-edited");
  });

  it("falls back to editor markdown when source buffer is null", () => {
    const a = createDocument("a.md", "old-a");
    const b = createDocument("b.md", "old-b");

    const result = applyDocumentSwitch({
      documents: [a, b],
      activeDocId: a.id,
      nextDocId: b.id,
      isSourceMode: true,
      sourceBuffer: null,
      editorMarkdown: "editor-edited",
    });

    expect(result.documents.find((doc) => doc.id === a.id)!.content).toBe("editor-edited");
  });

  it("rejects an unknown target document", () => {
    const a = createDocument("a.md", "old-a");
    expect(() =>
      applyDocumentSwitch({
        documents: [a],
        activeDocId: a.id,
        nextDocId: "missing",
        isSourceMode: false,
        sourceBuffer: null,
        editorMarkdown: "x",
      })
    ).toThrow(/document not found/);
  });
});
