// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { schema } from "../src/editor/schema";
import { markdownToDoc, docToMarkdown } from "../src/editor/serializer/markdown";
import { ensureTrailingParagraphNode } from "../src/editor/table/commands";
import { prepareDocumentForDisk } from "../src/qa/save-pipeline";

/**
 * QA 回归清单：用户日常操作路径的基础校验。
 *
 * 与既有单测的区别：这里每条都对应一个"用户能直接感知"的行为，
 * 出问题时能快速定位是哪一类操作坏了。
 */

describe("QA / 文档往返", () => {
  const samples: [string, string][] = [
    ["一级标题", "# 标题"],
    ["多级标题", "## 二级\n\n### 三级"],
    ["加粗斜体", "这是 **加粗** 与 *斜体*。"],
    ["删除线与高亮", "~~删除~~ 与 ==高亮=="],
    ["行内代码", "运行 `npm test` 检查。"],
    ["链接", "[示例](https://example.com)"],
    ["图片", "![替代文字](./img/a.png)"],
    ["无序列表", "- 第一项\n- 第二项"],
    ["有序列表", "1. 第一项\n2. 第二项"],
    ["任务列表", "- [x] 已完成\n- [ ] 待办"],
    ["引用", "> 这是一段引用"],
    ["代码块", "```js\nconst a = 1;\n```"],
    ["表格", "| A | B |\n| --- | --- |\n| 1 | 2 |"],
    ["分割线", "---"],
    ["公式块", "$$\nx^2 + y^2\n$$"],
    ["脚注", "正文[^1]\n\n[^1]: 脚注内容"],
  ];

  it.each(samples)("往返保持稳定：%s", (_label, markdown) => {
    const once = docToMarkdown(markdownToDoc(markdown, schema));
    const twice = docToMarkdown(markdownToDoc(once, schema));
    expect(twice).toBe(once);
  });

  it("空文档往返后仍为空", () => {
    expect(docToMarkdown(markdownToDoc("", schema))).toBe("");
  });

  it("尾部终端块会补一个空段落，但不写进 Markdown", () => {
    const doc = ensureTrailingParagraphNode(markdownToDoc("```js\nx\n```", schema));
    expect(doc.lastChild?.type.name).toBe("paragraph");
    expect(docToMarkdown(doc).trim()).toBe("```js\nx\n```");
  });

  it("代码块末行换行不会在往返后累积", () => {
    const markdown = "```js\nconst a = 1;\n```";
    let current = markdown;
    for (let i = 0; i < 3; i++) {
      current = docToMarkdown(markdownToDoc(current, schema));
    }
    expect(current.trim()).toBe(markdown);
  });
});

describe("QA / 保存管线", () => {
  it("按 LF 写出时统一换行", () => {
    const out = prepareDocumentForDisk("a\r\nb", { lineEnding: "lf", finalNewline: true });
    expect(out).toBe("a\nb\n");
  });

  it("按 CRLF 写出时统一换行", () => {
    const out = prepareDocumentForDisk("a\nb", { lineEnding: "crlf", finalNewline: true });
    expect(out).toBe("a\r\nb\r\n");
  });

  it("关闭末尾换行时不会强行补", () => {
    const out = prepareDocumentForDisk("a\n", { lineEnding: "lf", finalNewline: false });
    expect(out).toBe("a\n");
  });

  it("空内容不会被补成换行", () => {
    expect(prepareDocumentForDisk("", { lineEnding: "lf", finalNewline: true })).toBe("");
  });

  it("CRLF 往返不重复转换", () => {
    const once = prepareDocumentForDisk("a\nb", { lineEnding: "crlf", finalNewline: true });
    const twice = prepareDocumentForDisk(once, { lineEnding: "crlf", finalNewline: true });
    expect(twice).toBe(once);
  });
});

describe("QA / 光标可达性", () => {
  it("文档末尾的代码块之后可以落光标", () => {
    const doc = ensureTrailingParagraphNode(markdownToDoc("```js\nx\n```", schema));
    const last = doc.lastChild!;
    expect(last.type.name).toBe("paragraph");
    expect(last.content.size).toBe(0);
  });

  it("文档末尾的表格之后可以落光标", () => {
    const doc = ensureTrailingParagraphNode(
      markdownToDoc("| A |\n| --- |\n| 1 |", schema)
    );
    expect(doc.lastChild?.type.name).toBe("paragraph");
  });

  it("普通段落结尾不会被额外塞入空段落", () => {
    const doc = ensureTrailingParagraphNode(markdownToDoc("普通段落", schema));
    expect(doc.childCount).toBe(1);
    expect(doc.lastChild?.type.name).toBe("paragraph");
  });
});

describe("QA / 界面状态", () => {
  it("保存状态胶囊能表达四种状态", async () => {
    const { SAVE_STATUS_TONES } = await import("../src/qa/ui-states");
    expect(SAVE_STATUS_TONES).toEqual(["idle", "saving", "saved", "error"]);
  });

  it("关闭弹窗只提供三个明确选项", async () => {
    const { CLOSE_CHOICES } = await import("../src/qa/ui-states");
    expect(CLOSE_CHOICES.map((c) => c.action)).toEqual(["cancel", "discard", "save"]);
  });

  it("设置页签顺序稳定", async () => {
    const { SETTINGS_TABS } = await import("../src/qa/ui-states");
    expect(SETTINGS_TABS.map((t) => t.id)).toEqual([
      "charts",
      "editor",
      "appearance",
      "storage",
      "about",
    ]);
  });

  it("字体设置按中英文与正文代码分为四组", async () => {
    const { FONT_GROUPS } = await import("../src/platform/fonts");
    expect(Object.keys(FONT_GROUPS).sort()).toEqual(
      ["bodyCJK", "bodyLatin", "monoCJK", "monoLatin"].sort()
    );
    for (const list of Object.values(FONT_GROUPS)) {
      expect(list.some((f) => f.id === "custom")).toBe(true);
    }
  });
});
