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
  it("defaults to off with a single rotating snapshot", () => {
    expect(DEFAULT_AUTO_SAVE.mode).toBe("off");
    expect(DEFAULT_AUTO_SAVE.intervalMinutes).toBe(5);
    expect(DEFAULT_AUTO_SAVE.historyEnabled).toBe(true);
    // 关键：默认只留一层，保证"反复保存不会产生多个版本"
    expect(DEFAULT_AUTO_SAVE.maxHistory).toBe(1);
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

  it("migrates legacy configuration to the single-slot scheme", () => {
    // 旧配置 maxHistory=20、没有版本号 → 必须被压回 1，否则升级后仍会堆文件
    const migrated = normalizeAutoSaveSettings({ maxHistory: 20 });
    expect(migrated.maxHistory).toBe(1);
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
    let files: string[] = [];
    for (let i = 0; i < 50; i++) {
      const snapshots = listSnapshots(files, "/docs/note.md");
      const plan = planSnapshotWrite(snapshots, 1, true);

      // 把旧槽位按计划搬移（未搬移且目标槽位被占用的会被覆盖，不是并存）
      const afterMoves = snapshots
        .map((s) => {
          const move = plan.moves.find((m) => m.from === s.slot);
          return {
            name: move ? snapshotFileName("/docs/note.md", move.to).split("/").pop()! : s.name,
            slot: move ? move.to : s.slot,
          };
        })
        // 目标槽位即将被本次写入覆盖，先移除
        .filter((s) => s.slot !== plan.targetSlot);

      files = [
        snapshotFileName("/docs/note.md", plan.targetSlot).split("/").pop()!,
        ...afterMoves.map((s) => s.name),
      ];

      // 清理超限
      const expired = selectExpiredSnapshots(listSnapshots(files, "/docs/note.md"), 1);
      files = files.filter((f) => !expired.includes(f));
    }
    // 保存 50 次后仍然只有一个快照文件
    expect(listSnapshots(files, "/docs/note.md")).toHaveLength(1);
  });
});

describe("snapshot write planning", () => {
  const doc = "/docs/note.md";

  it("writes a baseline when auto saving with no snapshot yet", () => {
    expect(planSnapshotWrite([], 1, false)).toEqual({
      write: true,
      moves: [],
      targetSlot: 1,
      expired: [],
    });
  });

  it("never touches the baseline during repeated auto saves", () => {
    // 这是本次修复的核心：自动保存存 100 次也只留一份快照
    const existing = listSnapshots(["note.bak.md"], doc);
    const plan = planSnapshotWrite(existing, 1, false);
    expect(plan.write).toBe(false);
    expect(plan.moves).toEqual([]);
  });

  it("rotates depth-first on manual save", () => {
    // 保留 3 层并已有 1、2 → 2 先搬到 3，再写 1
    const existing = listSnapshots(["note.bak.md", "note.bak-2.md"], doc);
    const plan = planSnapshotWrite(existing, 3, true);
    expect(plan.write).toBe(true);
    expect(plan.targetSlot).toBe(1);
    // 从深到浅：先搬 2→3，1→2 由新写入替代
    expect(plan.moves).toEqual([
      { from: 2, to: 3 },
      { from: 1, to: 2 },
    ]);
  });

  it("drops the slot that would exceed the limit", () => {
    // 只留 1 层时，手动保存不需要搬移，旧快照直接被覆盖
    const existing = listSnapshots(["note.bak.md"], doc);
    const plan = planSnapshotWrite(existing, 1, true);
    expect(plan.moves).toEqual([]);
    expect(plan.write).toBe(true);
  });

  it("reports surplus slots as expired", () => {
    const existing = listSnapshots(
      ["note.bak.md", "note.bak-2.md", "note.bak-3.md"],
      doc
    );
    expect(planSnapshotWrite(existing, 1, true).expired).toEqual([
      "note.bak-2.md",
      "note.bak-3.md",
    ]);
    expect(planSnapshotWrite(existing, 2, true).expired).toEqual(["note.bak-3.md"]);
  });

  it("still writes a baseline in auto mode when only deeper slots exist", () => {
    // 槽位 1 缺失（例如被用户手工删掉）→ 自动保存应补一份
    const existing = listSnapshots(["note.bak-2.md"], doc);
    const plan = planSnapshotWrite(existing, 3, false);
    expect(plan.write).toBe(true);
    expect(plan.moves).toEqual([]);
    expect(plan.targetSlot).toBe(1);
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

  it("prompts only when auto save is off", () => {
    expect(shouldPromptOnClose(true, "off")).toBe(true);
    expect(shouldPromptOnClose(true, "onChange")).toBe(false);
    expect(shouldPromptOnClose(true, "interval")).toBe(false);
  });
});
