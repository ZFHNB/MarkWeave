import { describe, it, expect } from "vitest";
import {
  canRevealImage,
  classifyImageSrc,
  imageFileName,
  mimeForExtension,
  resolveImageFilePath,
} from "../src/editor/nodeviews/image-actions";

describe("image context actions", () => {
  it("classifies the four source shapes", () => {
    expect(classifyImageSrc("data:image/png;base64,AAA")).toBe("data");
    expect(classifyImageSrc("https://x/y.png")).toBe("remote");
    expect(classifyImageSrc("file:///C:/a/b.png")).toBe("file");
    expect(classifyImageSrc("C:\\a\\b.png")).toBe("file");
    expect(classifyImageSrc("attachments/b.png")).toBe("relative");
    expect(classifyImageSrc("")).toBe("relative");
  });

  it("resolves relative sources against the document folder", () => {
    expect(resolveImageFilePath("attachments/a.png", "C:\\notes\\doc.md")).toBe(
      "C:/notes/attachments/a.png"
    );
    expect(resolveImageFilePath("./img/a.png", "D:/notes/doc.md")).toBe("D:/notes/img/a.png");
  });

  it("normalises file:// URLs", () => {
    expect(resolveImageFilePath("file:///C:/notes/a.png", null)).toBe("C:/notes/a.png");
    // 中文路径需要解码
    expect(resolveImageFilePath("file:///D:/%E6%96%87%E6%A1%A3/a.png", null)).toBe("D:/文档/a.png");
  });

  it("has no disk path for data or remote images", () => {
    expect(resolveImageFilePath("data:image/png;base64,AA", "C:/n/d.md")).toBeNull();
    expect(resolveImageFilePath("https://x/y.png", "C:/n/d.md")).toBeNull();
  });

  it("cannot resolve relative sources without a saved document", () => {
    expect(resolveImageFilePath("attachments/a.png", null)).toBeNull();
    expect(canRevealImage("attachments/a.png", null)).toBe(false);
    expect(canRevealImage("attachments/a.png", "C:/n/d.md")).toBe(true);
  });

  it("maps extensions to mime types", () => {
    expect(mimeForExtension("a.PNG")).toBe("image/png");
    expect(mimeForExtension("a.jpeg")).toBe("image/jpeg");
    expect(mimeForExtension("a.svg")).toBe("image/svg+xml");
    expect(mimeForExtension("noext")).toBe("image/png");
  });

  it("derives a file name for save-as", () => {
    expect(imageFileName("attachments/a.png")).toBe("a.png");
    expect(imageFileName("file:///C:/x/b.jpg")).toBe("b.jpg");
    expect(imageFileName("data:image/png;base64,AAA")).toBe("pasted-image.png");
    expect(imageFileName("data:image/svg+xml;base64,AAA")).toBe("pasted-image.svg");
  });
});
