/**
 * 快照行为端到端验证（内存文件系统）。
 *
 * 复刻 src/main.ts 的两条路径：
 *   mirrorDraft   —— 内容变化时刷新槽位 1（当前内容镜像）
 *   archiveSnapshot —— 写盘前把磁盘旧内容归档到槽位 2..N
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
const DIR = resolveHistoryDir(DOC, DEFAULT_AUTO_SAVE);

function pathOf(slot: number): string {
  const name = snapshotFileName(DOC, slot).split("/").pop()!;
  return `${DIR}/${name}`;
}

/** 复刻 mirrorDraft：编辑器内容 → 槽位 1 */
function mirror(fs: MemFS, content: string, maxSlots = 3) {
  const snapshots = listSnapshots(fs.list(DIR), DOC);
  const plan = planSnapshotWrite(snapshots, maxSlots, "draft");
  for (const write of plan.writes) {
    if (write.source === "current") fs.write(pathOf(write.slot), content);
  }
}

/** 复刻 archiveSnapshot + mirrorDraft：写盘前归档旧内容，再刷新镜像 */
function save(fs: MemFS, content: string, maxSlots = 3) {
  const snapshots = listSnapshots(fs.list(DIR), DOC);
  const plan = planSnapshotWrite(snapshots, maxSlots, "commit");
  const previous = fs.read(DOC);

  // 搬移历史
  for (const move of plan.moves) {
    const from = snapshots.find((s) => s.slot === move.from);
    if (!from) continue;
    const src = fs.read(`${DIR}/${from.name}`);
    if (src === null) continue;
    fs.write(pathOf(move.to), src);
  }

  // 归档旧内容 + 写镜像
  for (const write of plan.writes) {
    if (write.source === "previous") {
      if (previous !== null) fs.write(pathOf(write.slot), previous);
    } else {
      fs.write(pathOf(write.slot), content);
    }
  }

  // 清理超限 + 旧方案遗留的时间戳副本
  for (const name of selectExpiredSnapshots(listSnapshots(fs.list(DIR), DOC), maxSlots)) {
    fs.remove(`${DIR}/${name}`);
  }
  for (const name of fs.list(DIR).filter((n) => isLegacyTimestampCopy(n, DOC))) {
    fs.remove(`${DIR}/${name}`);
  }

  // 主文件落盘
  fs.write(DOC, content);
}

describe("draft mirror protects unsaved work", () => {
  it("mirrors unsaved edits even with auto save disabled", () => {
    const fs = new MemFS();
    fs.write(DOC, "saved-v1");

    // 用户改了一段但没保存（自动保存关闭）
    mirror(fs, "unsaved-v2");

    // 磁盘主文件没变，但草稿镜像里有最新的未保存内容
    expect(fs.read(DOC)).toBe("saved-v1");
    expect(fs.read(pathOf(1))).toBe("unsaved-v2");
  });

  it("keeps the mirror in sync as the user keeps typing", () => {
    const fs = new MemFS();
    fs.write(DOC, "v0");

    mirror(fs, "v1");
    mirror(fs, "v2");
    mirror(fs, "v3");

    // 镜像始终是最新内容，且只有一个文件
    expect(fs.read(pathOf(1))).toBe("v3");
    expect(listSnapshots(fs.list(DIR), DOC)).toHaveLength(1);
  });

  it("survives a crash right after editing", () => {
    const fs = new MemFS();
    fs.write(DOC, "original");

    // 用户写了大量修改，还没点保存就崩溃了
    mirror(fs, "lots of new work");

    // 重新打开时可以从镜像恢复
    const recovered = fs.read(pathOf(1));
    expect(recovered).toBe("lots of new work");
    expect(fs.read(DOC)).toBe("original");
  });
});

describe("history slots roll on save", () => {
  it("archives the old file content into slot 2", () => {
    const fs = new MemFS();
    fs.write(DOC, "v1");
    mirror(fs, "v1-draft");

    save(fs, "v2");

    // 槽位 1 = 当前内容，槽位 2 = 被覆盖前的磁盘内容
    expect(fs.read(pathOf(1))).toBe("v2");
    expect(fs.read(pathOf(2))).toBe("v1");
    expect(fs.read(DOC)).toBe("v2");
  });

  it("keeps exactly three files no matter how many times you save", () => {
    const fs = new MemFS();
    fs.write(DOC, "v0");

    for (let i = 1; i <= 30; i++) {
      save(fs, `v${i}`);
    }

    const snapshots = listSnapshots(fs.list(DIR), DOC);
    expect(snapshots).toHaveLength(3);
    expect(snapshots.map((s) => s.name)).toEqual([
      "note.bak.md",
      "note.bak-2.md",
      "note.bak-3.md",
    ]);

    // 镜像是最新，历史依次是最近两版
    expect(fs.read(pathOf(1))).toBe("v30");
    expect(fs.read(pathOf(2))).toBe("v29");
    expect(fs.read(pathOf(3))).toBe("v28");
  });

  it("keeps mirror and history distinct", () => {
    const fs = new MemFS();
    fs.write(DOC, "v1");
    save(fs, "v2");
    // 之后只改不存
    mirror(fs, "v2-plus-unsaved");

    // 镜像反映未保存内容，历史仍是已保存版本
    expect(fs.read(pathOf(1))).toBe("v2-plus-unsaved");
    expect(fs.read(pathOf(2))).toBe("v1");
    expect(fs.read(DOC)).toBe("v2");
  });

  it("supports a single-slot configuration (mirror only)", () => {
    const fs = new MemFS();
    fs.write(DOC, "v0");

    save(fs, "v1", 1);
    save(fs, "v2", 1);

    expect(listSnapshots(fs.list(DIR), DOC)).toHaveLength(1);
    expect(fs.read(pathOf(1))).toBe("v2");
  });
});

describe("legacy cleanup", () => {
  it("removes timestamp copies left by the old scheme", () => {
    const fs = new MemFS();
    fs.write(DOC, "v0");
    fs.write(`${DIR}/note.20261030-112233.md`, "old-a");
    fs.write(`${DIR}/note.20261031-090000.md`, "old-b");

    save(fs, "v1");

    expect(fs.list(DIR).filter((n) => isLegacyTimestampCopy(n, DOC))).toEqual([]);
  });

  it("does not touch unrelated files in the history directory", () => {
    const fs = new MemFS();
    fs.write(DOC, "v0");
    fs.write(`${DIR}/other.md`, "someone else");

    save(fs, "v1");

    expect(fs.read(`${DIR}/other.md`)).toBe("someone else");
  });
});

describe("naming stability", () => {
  it("returns the same path for the same slot every time", () => {
    expect(snapshotFileName(DOC, 1)).toBe(snapshotFileName(DOC, 1));
    expect(snapshotFileName(DOC, 1)).toBe("/docs/note.bak.md");
    expect(snapshotFileName(DOC, 2)).toBe("/docs/note.bak-2.md");
    expect(snapshotFileName(DOC, 3)).toBe("/docs/note.bak-3.md");
  });
});
