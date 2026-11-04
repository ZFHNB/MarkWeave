import { describe, it, expect } from "vitest";
import {
  DEFAULT_AUTO_SAVE,
  SNAPSHOT_VERSION,
  autoSaveIntervalMs,
  formatHistoryStamp,
  isLegacyTimestampCopy,
  listSnapshots,
  normalizeAutoSaveSettings,
  planSnapshotWrite,
  resolveHistoryDir,
  selectExpiredSnapshots,
  shouldPromptOnClose,
  shouldSaveOnChange,
  snapshotFileName,
  snapshotSlotOf,
  splitFilePath,
} from "../src/workspace/autosave";

describe("auto save settings", () => {
  it("defaults to off with three rotating snapshots", () => {
    expect(DEFAULT_AUTO_SAVE.mode).toBe("off");
    expect(DEFAULT_AUTO_SAVE.intervalMinutes).toBe(5);
    expect(DEFAULT_AUTO_SAVE.historyEnabled).toBe(true);
    // 默认三层：既有回退能力，文件数量也仍然恒定
    expect(DEFAULT_AUTO_SAVE.maxHistory).toBe(3);
  });

  it("normalizes partial and invalid input", () => {
    expect(normalizeAutoSaveSettings(null)).toEqual(DEFAULT_AUTO_SAVE);
    expect(normalizeAutoSaveSettings({ mode: "nope" }).mode).toBe("off");
    expect(
      normalizeAutoSaveSettings({ mode: "interval", intervalMinutes: 0, snapshotVersion: 2 })
        .intervalMinutes
    ).toBe(1);
    expect(
      normalizeAutoSaveSettings({ mode: "interval", intervalMinutes: 999, snapshotVersion: 2 })
        .intervalMinutes
    ).toBe(120);
    expect(normalizeAutoSaveSettings({ maxHistory: 0, snapshotVersion: 2 }).maxHistory).toBe(1);
    expect(normalizeAutoSaveSettings({ maxHistory: 9999, snapshotVersion: 2 }).maxHistory).toBe(20);
    expect(normalizeAutoSaveSettings({ historyDir: "  /tmp/h  " }).historyDir).toBe("/tmp/h");
  });

  it("migrates legacy configuration to the new default", () => {
    // 旧配置 maxHistory=20、没有版本号 → 压回默认的 3 层
    const migrated = normalizeAutoSaveSettings({ maxHistory: 20 });
    expect(migrated.maxHistory).toBe(3);
    expect(migrated.snapshotVersion).toBe(SNAPSHOT_VERSION);

    // 已经是新版本的不再改动
    expect(normalizeAutoSaveSettings({ maxHistory: 5, snapshotVersion: 2 }).maxHistory).toBe(5);
  });

  it("computes the interval only in interval mode", () => {
    expect(autoSaveIntervalMs({ ...DEFAULT_AUTO_SAVE, mode: "interval", intervalMinutes: 3 })).toBe(180000);
    expect(autoSaveIntervalMs({ ...DEFAULT_AUTO_SAVE, mode: "onChange" })).toBeNull();
    expect(autoSaveIntervalMs({ ...DEFAULT_AUTO_SAVE, mode: "off" })).toBeNull();
  });

  it("saves on change only in onChange mode", () => {
    expect(shouldSaveOnChange({ ...DEFAULT_AUTO_SAVE, mode: "onChange" }, true)).toBe(true);
    expect(shouldSaveOnChange({ ...DEFAULT_AUTO_SAVE, mode: "onChange" }, false)).toBe(false);
    expect(shouldSaveOnChange({ ...DEFAULT_AUTO_SAVE, mode: "interval" }, true)).toBe(false);
    expect(shouldSaveOnChange({ ...DEFAULT_AUTO_SAVE, mode: "off" }, true)).toBe(false);
  });
});

describe("path splitting", () => {
  it("splits posix and windows paths", () => {
    expect(splitFilePath("/docs/note.md")).toEqual({ dir: "/docs", stem: "note", ext: ".md" });
    expect(splitFilePath("C:\\docs\\note.txt")).toEqual({
      dir: "C:/docs",
      stem: "note",
      ext: ".txt",
    });
    expect(splitFilePath("note.md")).toEqual({ dir: "", stem: "note", ext: ".md" });
  });

  it("handles names without an extension", () => {
    expect(splitFilePath("/docs/README")).toEqual({ dir: "/docs", stem: "README", ext: ".md" });
  });
});

describe("fixed snapshot slots", () => {
  it("uses a fixed name that does not grow with each save", () => {
    // 同一个槽位永远得到同一个名字 —— 这正是"不再产生多个版本"的核心
    expect(snapshotFileName("/docs/note.md", 1)).toBe("/docs/note.bak.md");
    expect(snapshotFileName("/docs/note.md", 1)).toBe(snapshotFileName("/docs/note.md", 1));
    expect(snapshotFileName("/docs/note.md", 2)).toBe("/docs/note.bak-2.md");
    expect(snapshotFileName("C:\\docs\\note.txt", 1)).toBe("C:/docs/note.bak.txt");
    expect(snapshotFileName("note.md", 3)).toBe("note.bak-3.md");
  });

  it("clamps the slot to at least one", () => {
    expect(snapshotFileName("/docs/note.md", 0)).toBe("/docs/note.bak.md");
    expect(snapshotFileName("/docs/note.md", -5)).toBe("/docs/note.bak.md");
  });

  it("recognises its own snapshots and nothing else", () => {
    expect(snapshotSlotOf("note.bak.md", "/docs/note.md")).toBe(1);
    expect(snapshotSlotOf("note.bak-2.md", "/docs/note.md")).toBe(2);
    expect(snapshotSlotOf("note.bak-12.md", "/docs/note.md")).toBe(12);
    // 主文件本身、别的文档、旧时间戳副本都不算快照
    expect(snapshotSlotOf("note.md", "/docs/note.md")).toBeNull();
    expect(snapshotSlotOf("other.bak.md", "/docs/note.md")).toBeNull();
    expect(snapshotSlotOf("note.20261030-112233.md", "/docs/note.md")).toBeNull();
    expect(snapshotSlotOf("note.bak-abc.md", "/docs/note.md")).toBeNull();
  });

  it("lists snapshots in slot order", () => {
    const files = ["note.bak-3.md", "note.bak.md", "note.md", "note.bak-2.md", "img.png"];
    expect(listSnapshots(files, "/docs/note.md")).toEqual([
      { name: "note.bak.md", slot: 1 },
      { name: "note.bak-2.md", slot: 2 },
      { name: "note.bak-3.md", slot: 3 },
    ]);
  });

  it("never deletes the slot that was just written", () => {
    const snapshots = listSnapshots(["note.bak.md"], "/docs/note.md");
    // 只留一层时，槽位 1 必须保留
    expect(selectExpiredSnapshots(snapshots, 1)).toEqual([]);

    const many = listSnapshots(
      ["note.bak.md", "note.bak-2.md", "note.bak-3.md"],
      "/docs/note.md"
    );
    expect(selectExpiredSnapshots(many, 1)).toEqual(["note.bak-2.md", "note.bak-3.md"]);
    expect(selectExpiredSnapshots(many, 2)).toEqual(["note.bak-3.md"]);
    expect(selectExpiredSnapshots(many, 3)).toEqual([]);
  });

  it("keeps the total snapshot count bounded across many saves", () => {
    // 用 Set 模拟文件系统：同槽位永远同名，搬移是改名而非新增
    let names = new Set<string>();

    for (let i = 0; i < 50; i++) {
      const snapshots = listSnapshots([...names], "/docs/note.md");
      const plan = planSnapshotWrite(snapshots, 3, "commit");

      // 搬移：旧槽位的文件改名到新槽位
      for (const move of plan.moves) {
        const from = snapshots.find((s) => s.slot === move.from);
        if (!from) continue;
        names.delete(from.name);
        names.add(snapshotFileName("/docs/note.md", move.to).split("/").pop()!);
      }

      // 写入：同名覆盖
      for (const write of plan.writes) {
        names.add(snapshotFileName("/docs/note.md", write.slot).split("/").pop()!);
      }

      // 清理超限
      for (const name of selectExpiredSnapshots(listSnapshots([...names], "/docs/note.md"), 3)) {
        names.delete(name);
      }
    }

    // 保存 50 次后仍然只有 3 个快照文件
    expect(listSnapshots([...names], "/docs/note.md")).toHaveLength(3);
  });
});

describe("snapshot write planning", () => {
  const doc = "/docs/note.md";

  it("draft mode refreshes only the mirror", () => {
    const plan = planSnapshotWrite([], 3, "draft");
    expect(plan.writes).toEqual([{ slot: 1, source: "current" }]);
    expect(plan.moves).toEqual([]);
  });

  it("draft mode never touches history slots", () => {
    const existing = listSnapshots(["note.bak.md", "note.bak-2.md", "note.bak-3.md"], doc);
    const plan = planSnapshotWrite(existing, 3, "draft");
    // 只写镜像，历史原样保留
    expect(plan.writes).toEqual([{ slot: 1, source: "current" }]);
    expect(plan.moves).toEqual([]);
  });

  it("commit mode archives the overwritten content into slot 2", () => {
    const plan = planSnapshotWrite([], 3, "commit");
    expect(plan.writes).toEqual([
      { slot: 2, source: "previous" },
      { slot: 1, source: "current" },
    ]);
  });

  it("commit mode shifts history deeper before writing", () => {
    // 已有历史 2、3 → 3 先搬不走（已是最深），2 搬到 3
    const existing = listSnapshots(["note.bak.md", "note.bak-2.md"], doc);
    const plan = planSnapshotWrite(existing, 3, "commit");
    expect(plan.moves).toEqual([{ from: 2, to: 3 }]);
    // 写入顺序：先历史后镜像，避免镜像被后面的搬移覆盖
    expect(plan.writes.map((w) => w.slot)).toEqual([2, 1]);
  });

  it("commit mode never moves the mirror itself", () => {
    // 槽位 1 是镜像，不参与历史轮转
    const existing = listSnapshots(["note.bak.md"], doc);
    const plan = planSnapshotWrite(existing, 3, "commit");
    expect(plan.moves.some((m) => m.from === 1)).toBe(false);
  });

  it("skips history when only one slot is configured", () => {
    // 只留 1 层时没有历史空间，只写镜像
    const plan = planSnapshotWrite([], 1, "commit");
    expect(plan.writes).toEqual([{ slot: 1, source: "current" }]);
  });

  it("reports surplus slots as expired", () => {
    const existing = listSnapshots(
      ["note.bak.md", "note.bak-2.md", "note.bak-3.md"],
      doc
    );
    expect(planSnapshotWrite(existing, 1, "commit").expired).toEqual([
      "note.bak-2.md",
      "note.bak-3.md",
    ]);
    expect(planSnapshotWrite(existing, 2, "commit").expired).toEqual(["note.bak-3.md"]);
    expect(planSnapshotWrite(existing, 3, "commit").expired).toEqual([]);
  });
});

describe("legacy timestamp copies", () => {
  it("identifies old-style copies for cleanup", () => {
    expect(isLegacyTimestampCopy("note.20261030-112233.md", "/docs/note.md")).toBe(true);
    expect(isLegacyTimestampCopy("note.20261030-112233.txt", "/docs/note.txt")).toBe(true);
    // 新方案与无关文件不能误删
    expect(isLegacyTimestampCopy("note.bak.md", "/docs/note.md")).toBe(false);
    expect(isLegacyTimestampCopy("note.md", "/docs/note.md")).toBe(false);
    expect(isLegacyTimestampCopy("other.20261030-112233.md", "/docs/note.md")).toBe(false);
  });

  it("keeps the timestamp formatter for reading old names", () => {
    const date = new Date(2026, 9, 30, 11, 22, 33);
    expect(formatHistoryStamp(date)).toBe("20261030-112233");
    expect(isLegacyTimestampCopy(`note.${formatHistoryStamp(date)}.md`, "/docs/note.md")).toBe(
      true
    );
  });
});

describe("history directory", () => {
  it("resolves to a hidden folder beside the document", () => {
    expect(resolveHistoryDir("/docs/note.md", DEFAULT_AUTO_SAVE)).toBe("/docs/.markweave-history");
    expect(resolveHistoryDir("C:\\docs\\note.md", DEFAULT_AUTO_SAVE)).toBe(
      "C:/docs/.markweave-history"
    );
  });

  it("honours a user-specified directory", () => {
    expect(resolveHistoryDir("/docs/note.md", { ...DEFAULT_AUTO_SAVE, historyDir: "/backup/" })).toBe(
      "/backup"
    );
  });
});

describe("close prompt", () => {
  it("never prompts when nothing is dirty", () => {
    expect(shouldPromptOnClose(false, "off")).toBe(false);
    expect(shouldPromptOnClose(false, "onChange")).toBe(false);
  });

  it("prompts unless every change is written immediately", () => {
    expect(shouldPromptOnClose(true, "off")).toBe(true);
    expect(shouldPromptOnClose(true, "onChange")).toBe(false);
    // 间隔保存：下一次定时器触发前内容仍在内存里，关窗会丢
    expect(shouldPromptOnClose(true, "interval")).toBe(true);
  });
});
