import { describe, it, expect } from "vitest";
import {
  applyReload,
  createTrackedFile,
  hasExternalChange,
  markLocalWrite,
} from "../src/workspace/external-change";

const stat = (mtime: number, size = 10) => ({ path: "/docs/a.md", mtime, size });

function doc(id: string, content: string, filePath?: string) {
  return {
    id,
    title: "a.md",
    content,
    updatedAt: 1,
    dirty: true,
    ...(filePath ? { filePath } : {}),
  };
}

describe("external change detection", () => {
  it("ignores unchanged files", () => {
    const tracked = createTrackedFile("d1", stat(1000), 10_000);
    expect(hasExternalChange(tracked, stat(1000), 20_000)).toBe(false);
  });

  it("detects a newer mtime", () => {
    const tracked = createTrackedFile("d1", stat(1000), 10_000);
    expect(hasExternalChange(tracked, stat(2000), 20_000)).toBe(true);
  });

  it("detects a size change with the same mtime", () => {
    const tracked = createTrackedFile("d1", stat(1000, 10), 10_000);
    expect(hasExternalChange(tracked, stat(1000, 20), 20_000)).toBe(true);
  });

  it("ignores changes right after a local save", () => {
    const tracked = createTrackedFile("d1", stat(1000), 10_000);
    // 自己在 10.2s 写入后立刻轮询到新 mtime
    expect(hasExternalChange(tracked, stat(1200), 10_200)).toBe(false);
  });

  it("honors a custom tolerance", () => {
    const tracked = createTrackedFile("d1", stat(1000), 10_000);
    expect(hasExternalChange(tracked, stat(1200), 10_200, 0)).toBe(true);
  });

  it("ignores a different path", () => {
    const tracked = createTrackedFile("d1", stat(1000), 10_000);
    expect(
      hasExternalChange(tracked, { path: "/docs/b.md", mtime: 5000, size: 99 }, 20_000)
    ).toBe(false);
  });

  it("refreshes the baseline after a local write", () => {
    const tracked = createTrackedFile("d1", stat(1000), 10_000);
    const updated = markLocalWrite(tracked, stat(1500, 12), 11_000);
    expect(updated.mtime).toBe(1500);
    expect(updated.size).toBe(12);
    expect(hasExternalChange(updated, stat(1500, 12), 30_000)).toBe(false);
  });
});

describe("reload", () => {
  it("replaces content and clears the dirty flag", () => {
    const docs = [doc("d1", "old", "/docs/a.md"), doc("d2", "keep")];
    const next = applyReload(docs, "d1", "from disk", 500);
    expect(next[0].content).toBe("from disk");
    expect(next[0].dirty).toBe(false);
    expect(next[0].updatedAt).toBe(500);
    expect(next[1].content).toBe("keep");
  });

  it("does not mutate the input array", () => {
    const docs = [doc("d1", "old")];
    applyReload(docs, "d1", "new");
    expect(docs[0].content).toBe("old");
  });

  it("leaves other documents untouched when the id is unknown", () => {
    const docs = [doc("d1", "old")];
    expect(applyReload(docs, "missing", "new")[0].content).toBe("old");
  });
});
