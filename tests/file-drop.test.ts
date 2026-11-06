// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  DROPPABLE_EXTENSIONS,
  buildRejectedMessage,
  classifyDroppedFiles,
  dragContainsFiles,
  isDroppable,
  isPdfFile,
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

describe("PDF drop routing", () => {
  it("recognises pdf files", () => {
    expect(isPdfFile("paper.pdf")).toBe(true);
    expect(isPdfFile("PAPER.PDF")).toBe(true);
    expect(isPdfFile("paper.md")).toBe(false);
  });

  it("accepts pdf alongside markdown", () => {
    expect(isDroppable("a.pdf")).toBe(true);
    expect(isDroppable("a.md")).toBe(true);
    expect(isDroppable("a.png")).toBe(false);
  });

  it("marks pdf entries during classification", () => {
    const { accepted, rejected } = classifyDroppedFiles([
      makeFile("doc.pdf", "C:/docs/doc.pdf"),
      makeFile("note.md", "C:/docs/note.md"),
      makeFile("img.png"),
    ]);

    expect(accepted).toHaveLength(2);
    expect(accepted[0]).toMatchObject({ name: "doc.pdf", isPdf: true });
    expect(accepted[1]).toMatchObject({ name: "note.md", isPdf: false });
    expect(rejected).toEqual(["img.png"]);
  });

  it("mentions pdf in the rejection message", () => {
    expect(buildRejectedMessage(["x.png"])).toContain(".pdf");
  });
});

describe("path resolution via webUtils", () => {
  // Electron 32+ 移除了 File.path，必须通过 resolvePath 回调取路径
  it("uses the resolver when provided", () => {
    const resolver = (file: File) => (file.name.endsWith(".pdf") ? "D:/docs/doc.pdf" : null);
    const { accepted } = classifyDroppedFiles([makeFile("doc.pdf")], resolver);
    expect(accepted[0].path).toBe("D:/docs/doc.pdf");
  });

  it("resolves pdf paths so they can be parsed", () => {
    // 这正是用户报的 bug：拿不到路径时只能退回浏览器模式并提示"仅桌面版"
    const resolver = () => "D:/papers/2024.pdf";
    const { accepted } = classifyDroppedFiles([makeFile("2024.pdf")], resolver);
    expect(accepted[0].path).not.toBeNull();
    expect(accepted[0].isPdf).toBe(true);
  });

  it("falls back to the legacy File.path when no resolver is given", () => {
    const { accepted } = classifyDroppedFiles([makeFile("a.md", "C:/x/a.md")]);
    expect(accepted[0].path).toBe("C:/x/a.md");
  });

  it("prefers the resolver over the legacy field", () => {
    const { accepted } = classifyDroppedFiles(
      [makeFile("a.md", "C:/legacy/a.md")],
      () => "D:/real/a.md"
    );
    expect(accepted[0].path).toBe("D:/real/a.md");
  });

  it("returns null when the resolver throws", () => {
    const { accepted } = classifyDroppedFiles([makeFile("a.md")], () => {
      throw new Error("not supported");
    });
    expect(accepted[0].path).toBeNull();
  });

  it("trims whitespace from resolved paths", () => {
    const { accepted } = classifyDroppedFiles([makeFile("a.md")], () => "  D:/a.md  ");
    expect(accepted[0].path).toBe("D:/a.md");
  });

  it("treats an empty resolver result as missing", () => {
    const { accepted } = classifyDroppedFiles([makeFile("a.md")], () => "");
    expect(accepted[0].path).toBeNull();
  });
});
