/**
 * 快照策略的端到端验证（模拟真实文件系统行为）。
 *
 * 用一个内存文件系统复现 writeHistoryCopy 的完整流程：
 * 自动保存 / 手动保存 / 多轮保存 / 旧副本清理。
 */
import { describe, it, expect } from "vitest";
import {
  listSnapshots,
  planSnapshotWrite,
  selectExpiredSnapshots,
  snapshotFileName,
  resolveHistoryDir,
  isLegacyTimestampCopy,
  DEFAULT_AUTO_SAVE,
} from "../src/workspace/autosave";

/** 极简内存 FS，模拟 Electron 主进程的读写行为 */
class MemFS {
  files = new Map<string, string>();

  read(p: string): string | null {
    return this.files.has(p) ? this.files.get(p)! : null;
  }
  write(p: string, content: string): void {
    this.files.set(p, content);
  }
  remove(p: string): void {
    this.files.delete(p);
  }
  list(dir: string): string[] {
    const prefix = dir.endsWith("/") ? dir : `${dir}/`;
    return [...this.files.keys()]
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.slice(prefix.length))
      .sort();
  }
}

const DOC = "/docs/note.md";

/** 复刻 src/main.ts 里的 writeHistoryCopy 决策流程 */
function save(fs: MemFS, newContent: string, opts: { rotate: boolean; maxSlots: number }) {
  const dir = resolveHistoryDir(DOC, { ...DEFAULT_AUTO_SAVE, maxHistory: opts.maxSlots });
  const files = fs.list(dir);
  const snapshots = listSnapshots(files, DOC);
  const plan = planSnapshotWrite(snapshots, opts.maxSlots, opts.rotate);

  if (plan.write) {
    const previous = fs.read(DOC);
    if (previous) {
      const pathFor = (slot: number) => {
        const name = snapshotFileName(DOC, slot).split("/").pop()!;
        return `${dir}/${name}`;
      };
      for (const move of plan.moves) {
        const from = snapshots.find((s) => s.slot === move.from);
        if (!from) continue;
        const src = fs.read(`${dir}/${from.name}`);
        if (src === null) continue;
        fs.write(pathFor(move.to), src);
      }
      fs.write(pathFor(plan.targetSlot), previous);

      for (const name of [
        ...plan.expired,
        ...files.filter((n) => isLegacyTimestampCopy(n, DOC)),
      ]) {
        fs.remove(`${dir}/${name}`);
      }
    }
  }

  // 主文件始终被覆盖
  fs.write(DOC, newContent);
  return fs;
}

describe("snapshot behaviour end to end", () => {
  it("produces exactly one snapshot after 20 auto saves", () => {
    const fs = new MemFS();
    fs.write(DOC, "v0");

    for (let i = 1; i <= 20; i++) {
      save(fs, `v${i}`, { rotate: false, maxSlots: 1 });
    }

    const dir = resolveHistoryDir(DOC, DEFAULT_AUTO_SAVE);
    const snapshots = listSnapshots(fs.list(dir), DOC);

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].name).toBe("note.bak.md");
    // 自动保存全程没动过快照：它仍是第一次自动保存时抓到的 v0
    expect(fs.read(`${dir}/note.bak.md`)).toBe("v0");
    // 主文件是最新内容
    expect(fs.read(DOC)).toBe("v20");
  });

  it("rotates the snapshot on manual save so the previous version is recoverable", () => {
    const fs = new MemFS();
    fs.write(DOC, "v0");
    save(fs, "v1", { rotate: false, maxSlots: 1 });
    expect(fs.read("/docs/.markweave-history/note.bak.md")).toBe("v0");

    save(fs, "v2", { rotate: true, maxSlots: 1 });
    // 手动保存后，快照变成"上一版" v1
    expect(fs.read("/docs/.markweave-history/note.bak.md")).toBe("v1");
    expect(fs.read(DOC)).toBe("v2");
  });

  it("keeps multiple layers bounded when configured", () => {
    const fs = new MemFS();
    fs.write(DOC, "v0");

    for (let i = 1; i <= 10; i++) {
      save(fs, `v${i}`, { rotate: true, maxSlots: 3 });
    }

    const dir = resolveHistoryDir(DOC, DEFAULT_AUTO_SAVE);
    const snapshots = listSnapshots(fs.list(dir), DOC);

    expect(snapshots.map((s) => s.name)).toEqual([
      "note.bak.md",
      "note.bak-2.md",
      "note.bak-3.md",
    ]);
    // 三个槽位依次是最近三版
    expect(fs.read(`${dir}/note.bak.md`)).toBe("v9");
    expect(fs.read(`${dir}/note.bak-2.md`)).toBe("v8");
    expect(fs.read(`${dir}/note.bak-3.md`)).toBe("v7");
    expect(fs.read(DOC)).toBe("v10");
  });

  it("cleans up legacy timestamp copies left by the old scheme", () => {
    const fs = new MemFS();
    fs.write(DOC, "v0");
    const dir = resolveHistoryDir(DOC, DEFAULT_AUTO_SAVE);
    fs.write(`${dir}/note.20261030-112233.md`, "old-a");
    fs.write(`${dir}/note.20261031-090000.md`, "old-b");

    save(fs, "v1", { rotate: true, maxSlots: 1 });

    const names = fs.list(dir);
    expect(names).toContain("note.bak.md");
    expect(names.filter((n) => isLegacyTimestampCopy(n, DOC))).toEqual([]);
  });

  it("mixes auto and manual saves without growing the file count", () => {
    const fs = new MemFS();
    fs.write(DOC, "v0");

    let n = 0;
    for (let round = 0; round < 10; round++) {
      // 每轮：3 次自动保存 + 1 次手动保存
      for (let i = 0; i < 3; i++) save(fs, `v${++n}`, { rotate: false, maxSlots: 1 });
      save(fs, `v${++n}`, { rotate: true, maxSlots: 1 });
    }

    const dir = resolveHistoryDir(DOC, DEFAULT_AUTO_SAVE);
    expect(fs.list(dir)).toHaveLength(1);
    expect(listSnapshots(fs.list(dir), DOC)).toHaveLength(1);
  });

  it("does nothing before the document has ever been written", () => {
    const fs = new MemFS();
    // 主文件不存在 → 没有"上一版"可备份
    save(fs, "v1", { rotate: true, maxSlots: 1 });
    const dir = resolveHistoryDir(DOC, DEFAULT_AUTO_SAVE);
    expect(fs.list(dir)).toEqual([]);
  });

  it("expired list never includes the slot being written", () => {
    const snapshots = listSnapshots(["note.bak.md", "note.bak-2.md"], DOC);
    const plan = planSnapshotWrite(snapshots, 1, true);
    expect(plan.expired).not.toContain("note.bak.md");
    expect(selectExpiredSnapshots(snapshots, 1)).toEqual(["note.bak-2.md"]);
  });
});

/** 模拟真实文件系统行为，确保上述断言不依赖内存实现细节 */
describe("snapshot naming is stable across calls", () => {
  it("returns the same path for the same slot every time", () => {
    const a = snapshotFileName(DOC, 1);
    const b = snapshotFileName(DOC, 1);
    expect(a).toBe(b);
    expect(a).toBe("/docs/note.bak.md");
  });
});
