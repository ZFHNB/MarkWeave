import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

describe("document semantics", () => {
  it("declares the Chinese locale", () => {
    expect(read("index.html")).toContain('<html lang="zh-CN">');
  });

  it("provides a document title", () => {
    expect(read("index.html")).toMatch(/<title>[^<]+<\/title>/);
  });

  it("sets a viewport meta for scaling", () => {
    expect(read("index.html")).toContain("name=\"viewport\"");
  });
});

describe("landmarks in the shell", () => {
  const main = read("src/main.ts");

  it("exposes header, main, footer and navigation", () => {
    expect(main).toContain("<header");
    expect(main).toContain("<main");
    expect(main).toContain("<footer");
    expect(main).toContain('role="navigation"');
  });

  it("labels the sidebar region", () => {
    expect(main).toMatch(/role="navigation"\s+aria-label="[^"]+"/);
  });
});

describe("editor accessibility", () => {
  const main = read("src/main.ts");

  it("labels the editable region", () => {
    expect(main).toContain('role="textbox"');
    expect(main).toMatch(/aria-label="Markdown 编辑器"/);
    expect(main).toContain('aria-multiline="true"');
  });

  it("labels the source editor", () => {
    expect(main).toContain('aria-label="Markdown 源码编辑器"');
  });

  it("labels the outline filter", () => {
    expect(main).toContain('aria-label="过滤大纲标题"');
  });
});

describe("dialog behaviour", () => {
  const main = read("src/main.ts");

  it("marks the settings surface as a modal dialog", () => {
    expect(main).toContain('role="dialog"');
    expect(main).toContain('aria-modal="true"');
    expect(main).toContain('aria-labelledby="settings-dialog-title"');
  });

  it("closes on Escape and traps focus", () => {
    expect(main).toContain('event.key === "Escape"');
    expect(main).toContain('event.key !== "Tab"');
  });

  it("restores focus to the previously active element", () => {
    expect(main).toContain("previouslyFocused");
  });

  it("gives the close button an accessible name", () => {
    expect(main).toContain('aria-label="关闭"');
  });
});

describe("generated controls", () => {
  it("labels task list checkboxes", () => {
    const src = read("src/editor/nodeviews/task-item.ts");
    expect(src).toContain('"aria-label"');
    expect(src).toContain("任务项");
  });

  it("labels the math formula textarea", () => {
    expect(read("src/editor/nodeviews/math-block.ts")).toContain('aria-label", "LaTeX 公式"');
  });

  it("labels the language search box", () => {
    expect(read("src/editor/code/language-picker.ts")).toContain('aria-label", "搜索代码块语言"');
  });
});

describe("focus and motion styles", () => {
  const css = read("src/styles/typora-theme.css");

  it("shows a visible focus ring for keyboard users", () => {
    expect(css).toContain(":focus-visible");
    expect(css).toMatch(/outline:\s*2px solid/);
  });

  it("raises contrast in the dark theme", () => {
    expect(css).toMatch(/\.theme-night[^{]*:focus-visible/);
  });

  it("honours reduced motion", () => {
    expect(css).toContain("prefers-reduced-motion");
  });

  it("provides a screen-reader-only utility", () => {
    expect(css).toContain(".ty-sr-only");
  });
});
