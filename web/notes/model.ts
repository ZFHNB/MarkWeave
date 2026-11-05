/**
 * 多笔记的数据模型与查询逻辑（纯函数，可在 Node 里单测）。
 *
 * 与桌面版的 `workspace/store.ts` 的区别：
 * - 桌面版是单工作区、文件为真源、靠 filePath 关联磁盘；
 * - 这里把「笔记」当作数据库记录，支持标签、置顶、归档，
 *   并为后续的语义检索预留 chunk 层。
 *
 * 设计要点：
 * - Markdown 始终是唯一真源（content 字段），不引入私有格式；
 * - 每次保存生成递增 revision，便于 AI 索引判断"哪些笔记需要重新向量化"；
 * - 标签是普通数组，不做规范化，由调用方去重。
 */

export interface Note {
  id: string;
  title: string;
  /** Markdown 原文，唯一真源 */
  content: string;
  /** 标签，用于筛选 */
  tags: string[];
  /** 置顶到列表顶部 */
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  /** 内容版本号，每次内容变化 +1；AI 索引据此判断是否需要重建 */
  revision: number;
  /** 被归档的笔记不在主列表显示 */
  archived: boolean;
}

export interface NoteInput {
  title?: string;
  content?: string;
  tags?: string[];
}

/** 新建一篇笔记（不触碰存储） */
export function createNote(input: NoteInput = {}, now = Date.now()): Note {
  const content = input.content ?? "";
  return {
    id: createId(),
    title: input.title?.trim() || deriveTitle(content) || "未命名笔记",
    content,
    tags: dedupeTags(input.tags ?? []),
    pinned: false,
    createdAt: now,
    updatedAt: now,
    revision: 1,
    archived: false,
  };
}

let idCounter = 0;

export function createId(now = Date.now()): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  idCounter += 1;
  return `note-${now}-${idCounter}`;
}

/**
 * 从正文推导标题：取第一个非空行，去掉 Markdown 标记。
 *
 * 用户通常不会手写标题，靠首行生成更符合直觉。没内容时返回空串，
 * 由调用方决定兜底文案。
 */
export function deriveTitle(markdown: string): string {
  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const text = line
      .replace(/^#{1,6}\s+/, "") // 标题标记
      .replace(/^[-*+]\s+(\[[ xX]\]\s+)?/, "") // 列表 / 任务列表
      .replace(/^>\s*/, "") // 引用
      .replace(/^`{3,}.*$/, "") // 代码围栏
      .trim();
    if (text) return text.slice(0, 80);
  }
  return "";
}

/** 标签去重并去掉前导 # */
export function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().replace(/^#+/, "").trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

/** 新建笔记时的占位标题 */
export const PLACEHOLDER_TITLE = "未命名笔记";

/**
 * 正文变化后更新笔记（revision 递增，让 AI 索引知道要重建）。
 *
 * 标题策略：只有「用户没手动改过」时才跟随首行。判断依据是标题等于
 * 占位名、或等于旧内容推导出的标题。这样：
 * - 新建笔记输入首行 → 自动变成首行内容（符合直觉）
 * - 用户手动改名 → 后续编辑不覆盖
 */
export function updateNoteContent(note: Note, content: string, now = Date.now()): Note {
  if (note.content === content) return note;

  const previousDerived = deriveTitle(note.content);
  const userRenamed =
    note.title.trim() !== "" &&
    note.title !== PLACEHOLDER_TITLE &&
    note.title !== previousDerived;

  return {
    ...note,
    content,
    title: userRenamed ? note.title : deriveTitle(content) || PLACEHOLDER_TITLE,
    updatedAt: now,
    revision: note.revision + 1,
  };
}

export type SortMode = "updated-desc" | "created-desc" | "title-asc";

export interface ListOptions {
  query?: string;
  tags?: string[];
  includeArchived?: boolean;
  sort?: SortMode;
}

/**
 * 列出笔记。
 *
 * 筛选优先级：归档 → 标签 → 文本查询。置顶项始终排在前面。
 */
export function listNotes(notes: Note[], options: ListOptions = {}): Note[] {
  const { query = "", tags = [], includeArchived = false, sort = "updated-desc" } = options;

  const needle = query.trim().toLowerCase();
  const wantedTags = tags.map((t) => t.trim()).filter(Boolean);

  const filtered = notes.filter((note) => {
    if (!includeArchived && note.archived) return false;
    if (wantedTags.length > 0 && !wantedTags.every((t) => note.tags.includes(t))) return false;
    if (!needle) return true;
    // 标题 + 正文一起搜；正文命中已经足以说明相关性
    return (
      note.title.toLowerCase().includes(needle) ||
      note.content.toLowerCase().includes(needle)
    );
  });

  const sorted = [...filtered].sort((a, b) => compareNotes(a, b, sort));
  // 置顶优先，但保持同一排序规则内部的顺序
  return [...sorted.filter((n) => n.pinned), ...sorted.filter((n) => !n.pinned)];
}

function compareNotes(a: Note, b: Note, sort: SortMode): number {
  switch (sort) {
    case "created-desc":
      return b.createdAt - a.createdAt;
    case "title-asc":
      return a.title.localeCompare(b.title, "zh-Hans-CN");
    case "updated-desc":
    default:
      return b.updatedAt - a.updatedAt;
  }
}

/** 统计所有笔记用到的标签及出现次数（按次数降序） */
export function collectTags(notes: Note[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const note of notes) {
    if (note.archived) continue;
    for (const tag of note.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "zh-Hans-CN"));
}

/** 生成不冲突的标题（新建 / 重命名用） */
export function uniqueNoteTitle(notes: Note[], base: string, excludeId?: string): string {
  const trimmed = base.trim() || "未命名笔记";
  const taken = new Set(
    notes.filter((n) => n.id !== excludeId).map((n) => n.title)
  );
  if (!taken.has(trimmed)) return trimmed;

  let index = 2;
  while (taken.has(`${trimmed} ${index}`)) index += 1;
  return `${trimmed} ${index}`;
}
