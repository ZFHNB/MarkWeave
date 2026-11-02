// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  DROPPABLE_EXTENSIONS,
  buildRejectedMessage,
  classifyDroppedFiles,
  dragContainsFiles,
  isSupportedDocument,
} from "../src/workspace/file-drop";

function makeFile(name: string, path?: string): File {
  const file = new File(["# 内容"], name, { type: "text/markdown" });
  if (path !== undefined) {
    (file as File & { path?: string }).path = path;
  }
  return file;
}

describe("isSupportedDocument", () => {
  it.each([["a.md"], ["b.markdown"], ["c.mdown"], ["d.mkd"], ["e.txt"], ["F.MD"]])(
    "accepts %s",
    (name) => {
      expect(isSupportedDocument(name)).toBe(true);
    }
  );

  it.each([["a.png"], ["b.pdf"], ["c.docx"], ["d"], ["e.md.bak"]])("rejects %s", (name) => {
    expect(isSupportedDocument(name)).toBe(false);
  });

  it("handles non-string input", () => {
    expect(isSupportedDocument(undefined as unknown as string)).toBe(false);
  });
});

describe("classifyDroppedFiles", () => {
  it("separates accepted and rejected files", () => {
    const { accepted, rejected } = classifyDroppedFiles([
      makeFile("note.md", "C:/docs/note.md"),
      makeFile("image.png"),
      makeFile("readme.txt", "C:/docs/readme.txt"),
    ]);
    expect(accepted.map((a) => a.name)).toEqual(["note.md", "readme.txt"]);
    expect(rejected).toEqual(["image.png"]);
  });

  it("carries the Electron path when present", () => {
    const { accepted } = classifyDroppedFiles([makeFile("a.md", "C:/x/a.md")]);
    expect(accepted[0].path).toBe("C:/x/a.md");
  });

  it("returns a null path in the browser environment", () => {
    const { accepted } = classifyDroppedFiles([makeFile("a.md")]);
    expect(accepted[0].path).toBeNull();
  });

  it("treats a blank path as missing", () => {
    const { accepted } = classifyDroppedFiles([makeFile("a.md", "   ")]);
    expect(accepted[0].path).toBeNull();
  });

  it("handles an empty list", () => {
    expect(classifyDroppedFiles([])).toEqual({ accepted: [], rejected: [] });
  });
});

describe("dragContainsFiles", () => {
  it("detects a Files drag", () => {
    const dt = { types: ["Files"] } as unknown as DataTransfer;
    expect(dragContainsFiles(dt)).toBe(true);
  });

  it("ignores text drags", () => {
    const dt = { types: ["text/plain"] } as unknown as DataTransfer;
    expect(dragContainsFiles(dt)).toBe(false);
  });

  it("handles null", () => {
    expect(dragContainsFiles(null)).toBe(false);
  });
});

describe("buildRejectedMessage", () => {
  it("is empty when nothing was rejected", () => {
    expect(buildRejectedMessage([])).toBe("");
  });

  it("lists up to three names", () => {
    const msg = buildRejectedMessage(["a.png", "b.pdf", "c.exe", "d.zip"]);
    expect(msg).toContain("a.png");
    expect(msg).toContain("c.exe");
    expect(msg).toContain("等 4 个文件");
  });

  it("mentions the supported extensions", () => {
    const msg = buildRejectedMessage(["x.png"]);
    for (const ext of DROPPABLE_EXTENSIONS) {
      expect(msg).toContain(ext);
    }
  });
});
