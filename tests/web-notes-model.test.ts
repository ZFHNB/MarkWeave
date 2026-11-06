import { describe, it, expect } from "vitest";
import {
  collectTags,
  createNote,
  dedupeTags,
  deriveTitle,
  listNotes,
  uniqueNoteTitle,
  updateNoteContent,
  type Note,
} from "../web/notes/model";

describe("note model", () => {
  it("derives a title from the first meaningful line", () => {
    expect(deriveTitle("# 周报\n\n内容")).toBe("周报");
    expect(deriveTitle("- [ ] 待办事项")).toBe("待办事项");
    expect(deriveTitle("> 引用开头")).toBe("引用开头");
    expect(deriveTitle("```js\ncode\n```")).toBe("code");
    expect(deriveTitle("   \n\n  ")).toBe("");
  });

  it("creates a note with sane defaults", () => {
    const note = createNote({ content: "# 我的笔记\n正文" }, 1000);
    expect(note.title).toBe("我的笔记");
    expect(note.revision).toBe(1);
    expect(note.pinned).toBe(false);
    expect(note.archived).toBe(false);
    expect(note.createdAt).toBe(1000);
  });

  it("falls back to a placeholder title when content is empty", () => {
    expect(createNote({}).title).toBe("未命名笔记");
  });

  it("dedupes and strips # from tags", () => {
    expect(dedupeTags(["#科研", "科研", " 笔记 ", ""])).toEqual(["科研", "笔记"]);
  });

  it("bumps revision only when content actually changes", () => {
    const note = createNote({ content: "旧内容" }, 1000);
    const same = updateNoteContent(note, "旧内容", 2000);
    expect(same).toBe(note);

    const changed = updateNoteContent(note, "新内容", 2000);
    expect(changed.revision).toBe(2);
    expect(changed.updatedAt).toBe(2000);
    expect(changed.content).toBe("新内容");
  });

  it("follows the first line when the title was auto-derived", () => {
    const note = createNote({ content: "# 原标题\n正文" });
    const updated = updateNoteContent(note, "# 新标题\n正文");
    expect(updated.title).toBe("新标题");
  });

  it("keeps a manually edited title when content changes", () => {
    const note = { ...createNote({ content: "# 临时\n正文" }), title: "我起的名" };
    const updated = updateNoteContent(note, "# 完全不同的内容");
    expect(updated.title).toBe("我起的名");
  });
});

describe("listing and filtering", () => {
  const notes: Note[] = [
    { ...createNote({ title: "Alpha", content: "机器学习笔记", tags: ["AI"] }, 100), id: "a" },
    { ...createNote({ title: "Beta", content: "统计学习方法", tags: ["AI", "统计"] }, 200), id: "b" },
    { ...createNote({ title: "Gamma", content: "生活随笔", tags: ["生活"] }, 300), id: "c" },
    { ...createNote({ title: "Old", content: "归档的笔记", tags: ["AI"] }, 400), id: "d", archived: true },
  ];

  it("excludes archived notes by default", () => {
    expect(listNotes(notes).map((n) => n.id)).toEqual(["c", "b", "a"]);
  });

  it("can include archived notes", () => {
    expect(listNotes(notes, { includeArchived: true })).toHaveLength(4);
  });

  it("filters by all requested tags", () => {
    expect(listNotes(notes, { tags: ["AI"] }).map((n) => n.id)).toEqual(["b", "a"]);
    expect(listNotes(notes, { tags: ["AI", "统计"] }).map((n) => n.id)).toEqual(["b"]);
  });

  it("searches title and content", () => {
    expect(listNotes(notes, { query: "alpha" }).map((n) => n.id)).toEqual(["a"]);
    expect(listNotes(notes, { query: "统计学习" }).map((n) => n.id)).toEqual(["b"]);
  });

  it("sorts by update time by default", () => {
    expect(listNotes(notes).map((n) => n.id)).toEqual(["c", "b", "a"]);
  });

  it("puts pinned notes first regardless of sort", () => {
    const withPin = notes.map((n) => (n.id === "a" ? { ...n, pinned: true } : n));
    expect(listNotes(withPin).map((n) => n.id)).toEqual(["a", "c", "b"]);
  });

  it("sorts by title", () => {
    const ids = listNotes(notes, { sort: "title-asc" }).map((n) => n.id);
    expect(ids).toEqual(["a", "b", "c"]);
  });
});

describe("tags and naming", () => {
  it("counts tags across notes, ignoring archived", () => {
    const notes = [
      { ...createNote({ tags: ["AI", "科研"] }), archived: false },
      { ...createNote({ tags: ["AI"] }), archived: false },
      { ...createNote({ tags: ["AI"] }), archived: true },
    ];
    const tags = collectTags(notes);
    expect(tags[0]).toEqual({ tag: "AI", count: 2 });
    expect(tags.find((t) => t.tag === "科研")?.count).toBe(1);
  });

  it("generates unique titles", () => {
    const notes = [createNote({ title: "笔记" })];
    expect(uniqueNoteTitle(notes, "笔记")).toBe("笔记 2");
    expect(uniqueNoteTitle(notes, "笔记", notes[0].id)).toBe("笔记");
    expect(uniqueNoteTitle(notes, "新笔记")).toBe("新笔记");
  });
});
