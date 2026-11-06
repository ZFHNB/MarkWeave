// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { resolveImageSrc, extractRootUrl } from "../src/editor/plugins/image-resolve";
import { schema } from "../src/editor/schema";
import { markdownToDoc } from "../src/editor/serializer/markdown";

describe("image src resolution", () => {
  it("keeps absolute URLs, data and file URLs", () => {
    expect(resolveImageSrc("https://x.com/a.png", null, null, true)).toBe("https://x.com/a.png");
    expect(resolveImageSrc("data:image/png;base64,xxx", null, null, true)).toBe("data:image/png;base64,xxx");
    expect(resolveImageSrc("file:///C:/a.png", null, null, true)).toBe("file:///C:/a.png");
    expect(resolveImageSrc("blob:http://x/y", null, null, true)).toBe("blob:http://x/y");
  });

  it("resolves relative paths against the document directory", () => {
    expect(resolveImageSrc("image.png", "D:/docs/note.md", null, true)).toBe(
      "file:///D:/docs/image.png"
    );
    expect(resolveImageSrc("../assets/a.png", "D:/docs/note.md", null, true)).toBe(
      "file:///D:/docs/../assets/a.png"
    );
  });

  it("uses typora-root-url for absolute-looking paths", () => {
    expect(
      resolveImageSrc("/blog/img/a.png", "D:/docs/note.md", "https://example.com/", true)
    ).toBe("https://example.com/blog/img/a.png");
  });

  it("leaves paths untouched in the web build without a base", () => {
    expect(resolveImageSrc("image.png", null, null, false)).toBe("image.png");
  });
});

describe("front matter root url", () => {
  it("reads typora-root-url", () => {
    const doc = markdownToDoc("---\ntypora-root-url: /site/\n---\n\n![a](/x.png)", schema);
    expect(extractRootUrl(doc)).toBe("/site/");
  });

  it("returns null without front matter", () => {
    expect(extractRootUrl(markdownToDoc("# A", schema))).toBeNull();
  });

  it("returns null when the key is absent", () => {
    const doc = markdownToDoc("---\ntitle: x\n---\n\nbody", schema);
    expect(extractRootUrl(doc)).toBeNull();
  });
});
