/**
 * 自动保存与备份快照策略（纯逻辑，便于单测）。
 *
 * 这里只负责"什么时候该做什么"，实际的文件读写由调用方注入。
 */

export type AutoSaveMode = "off" | "onChange" | "interval";

/**
 * 快照机制版本。
 * 1（旧）：每次保存新建一个带时间戳的文件 → 保存 N 次就 N 个文件。
 * 2（新）：固定槽位，首次保存写 `<名>.bak.md`，之后原地覆盖；
 *         需要更多层时依次占用 `.bak-2`、`.bak-3`……名字不会持续增长。
 */
export const SNAPSHOT_VERSION = 2;

export interface AutoSaveSettings {
  mode: AutoSaveMode;
  /** 间隔保存的分钟数（mode 为 interval 时生效） */
  intervalMinutes: number;
  /** 快照目录；为空时使用文档同级的 .markweave-history */
  historyDir: string;
  /**
   * 保留的快照层数。
   * 1 表示只保留"上一次保存前"的版本；
   * 大于 1 时再多留几层，总数量始终受此值约束。
   */
  maxHistory: number;
  /** 是否启用保存前快照 */
  historyEnabled: boolean;
  /** 快照机制版本，用于把旧配置迁移到固定槽位 */
  snapshotVersion?: number;
}

export const DEFAULT_AUTO_SAVE: AutoSaveSettings = {
  mode: "off",
  intervalMinutes: 5,
  historyDir: "",
  // 3 = 1 份「当前内容镜像」+ 2 份历史版本，总数恒定
  maxHistory: 3,
  historyEnabled: true,
  snapshotVersion: SNAPSHOT_VERSION,
};

export const MIN_INTERVAL_MINUTES = 1;
export const MAX_INTERVAL_MINUTES = 120;
export const MIN_HISTORY = 1;
export const MAX_HISTORY = 20;

/**
 * 草稿镜像的写入节流间隔。
 *
 * 这份快照的目的是防止误操作丢失未保存的修改，因此**与自动保存开关无关**，
 * 只要内容变了就该更新。但每敲一个字就写盘太重，用 1.5 秒合并连续输入。
 */
export const DRAFT_MIRROR_DEBOUNCE_MS = 1500;

export function normalizeAutoSaveSettings(raw: unknown): AutoSaveSettings {
  const input = (raw ?? {}) as Partial<AutoSaveSettings>;
  const mode: AutoSaveMode =
    input.mode === "onChange" || input.mode === "interval" ? input.mode : "off";

  const interval = Number(input.intervalMinutes);
  const maxHistory = Number(input.maxHistory);

  // 旧配置默认是 20 层时间戳副本，升级后语义变了：
  // 不迁移的话用户第一次打开仍会看到一堆版本文件。
  const legacy = input.snapshotVersion !== SNAPSHOT_VERSION;

  return {
    mode,
    intervalMinutes: Number.isFinite(interval)
      ? Math.min(MAX_INTERVAL_MINUTES, Math.max(MIN_INTERVAL_MINUTES, Math.round(interval)))
      : DEFAULT_AUTO_SAVE.intervalMinutes,
    historyDir: typeof input.historyDir === "string" ? input.historyDir.trim() : "",
    maxHistory: legacy
      ? DEFAULT_AUTO_SAVE.maxHistory
      : Number.isFinite(maxHistory)
      ? Math.min(MAX_HISTORY, Math.max(MIN_HISTORY, Math.round(maxHistory)))
      : DEFAULT_AUTO_SAVE.maxHistory,
    historyEnabled: input.historyEnabled !== false,
    snapshotVersion: SNAPSHOT_VERSION,
  };
}

/** 自动保存间隔（毫秒）；未启用按间隔保存时返回 null */
export function autoSaveIntervalMs(settings: AutoSaveSettings): number | null {
  if (settings.mode !== "interval") return null;
  return settings.intervalMinutes * 60 * 1000;
}

/**
 * 是否应该在这次改动后立即保存。
 * - onChange：有改动就保存
 * - interval：交给定时器，不在改动时保存
 * - off：不保存
 */
export function shouldSaveOnChange(settings: AutoSaveSettings, dirty: boolean): boolean {
  return settings.mode === "onChange" && dirty;
}

/** 只接受形如 20261030-112233 的时间戳片段，保证副本文件名可排序 */
export function formatHistoryStamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/** 把路径拆成 目录 / 主干名 / 扩展名 */
export function splitFilePath(filePath: string): { dir: string; stem: string; ext: string } {
  const normalized = filePath.replace(/\\/g, "/");
  const slash = normalized.lastIndexOf("/");
  const dir = slash === -1 ? "" : normalized.slice(0, slash);
  const base = slash === -1 ? normalized : normalized.slice(slash + 1);
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : ".md";
  return { dir, stem, ext };
}

/**
 * 固定槽位快照文件名（槽位从 1 开始）。
 *
 * 槽位 1 → `<名>.bak.md`  （草稿镜像：当前未保存内容）
 * 槽位 2 → `<名>.bak-2.md`
 * 槽位 3 → `<名>.bak-3.md`
 *
 * 名字固定，重复使用只覆盖，不会像时间戳方案那样越存越多。
 */
export function snapshotFileName(originalPath: string, slot = 1): string {
  const safeSlot = Math.max(1, Math.floor(slot));
  const { dir, stem, ext } = splitFilePath(originalPath);
  const suffix = safeSlot === 1 ? ".bak" : `.bak-${safeSlot}`;
  const name = `${stem}${suffix}${ext}`;
  return dir ? `${dir}/${name}` : name;
}

/**
 * 判断某个文件名是否是这份文档的快照，是则返回它占用的槽位。
 * 用于列出已有快照、计算轮转起点。
 */
export function snapshotSlotOf(fileName: string, originalPath: string): number | null {
  const base = fileName.replace(/\\/g, "/").split("/").pop() ?? "";
  const { stem, ext } = splitFilePath(originalPath);
  if (!base.startsWith(`${stem}.bak`) || !base.endsWith(ext)) return null;

  const middle = base.slice(stem.length, base.length - ext.length); // ".bak" 或 ".bak-3"
  if (middle === ".bak") return 1;

  const match = /^\.bak-(\d+)$/.exec(middle);
  if (!match) return null;
  const slot = Number(match[1]);
  return Number.isFinite(slot) && slot >= 2 ? slot : null;
}

/** 列出目录里属于该文档的全部快照，按槽位升序 */
export function listSnapshots(
  files: string[],
  originalPath: string
): { name: string; slot: number }[] {
  return files
    .map((name) => ({ name, slot: snapshotSlotOf(name, originalPath) }))
    .filter((item): item is { name: string; slot: number } => item.slot !== null)
    .sort((a, b) => a.slot - b.slot);
}

/**
 * 是否是旧方案（每次保存新建时间戳文件）留下的副本。
 * 升级后要清掉这些，否则用户的历史目录里仍会堆着一堆版本。
 */
export function isLegacyTimestampCopy(fileName: string, originalPath: string): boolean {
  const base = fileName.replace(/\\/g, "/").split("/").pop() ?? "";
  const { stem, ext } = splitFilePath(originalPath);
  if (!base.startsWith(`${stem}.`) || !base.endsWith(ext)) return false;
  const middle = base.slice(stem.length, base.length - ext.length);
  return /^\.\d{8}-\d{6}$/.test(middle);
}

export interface SnapshotMove {
  /** 已有快照当前占用的槽位 */
  from: number;
  /** 移动后占用的槽位 */
  to: number;
}

/** 本次要写入哪个槽位、写什么内容 */
export interface SnapshotWrite {
  slot: number;
  /** current = 编辑器此刻的内容；previous = 磁盘上被覆盖前的旧内容 */
  source: "current" | "previous";
}

export interface SnapshotPlan {
  /** 需要写入的槽位（按顺序执行） */
  writes: SnapshotWrite[];
  /** 需要先执行的槽位搬移（从深到浅，保证不互相覆盖） */
  moves: SnapshotMove[];
  /** 超出保留层数、应删除的文件名 */
  expired: string[];
}

/**
 * 决定这次写盘该如何处理快照。
 *
 * 槽位语义（必须分清，否则会写出"备份了即将写入的内容"这种无效快照）：
 *
 * - **槽位 1 = 当前内容的镜像**。写的是编辑器里此刻的内容（可能尚未保存），
 *   用于防止误操作——崩溃、误关、手滑覆盖之后还能把稿子捞回来。
 *   它不参与历史轮转，内容一变就原地覆盖，**与自动保存开关无关**。
 * - **槽位 2..N = 历史版本**。只在真正写盘时归档，存的是被覆盖前的磁盘内容。
 *
 * @param snapshots 目录里已有的快照（listSnapshots 的结果）
 * @param maxSlots  保留层数（1 份镜像 + (maxSlots-1) 份历史）
 * @param mode      "draft" 只刷新镜像；"commit" 先归档旧内容再刷新镜像
 */
export function planSnapshotWrite(
  snapshots: { name: string; slot: number }[],
  maxSlots: number,
  mode: "draft" | "commit"
): SnapshotPlan {
  const limit = Math.max(1, Math.floor(maxSlots));
  const kept = snapshots.filter((s) => s.slot <= limit);
  const expired = selectExpiredSnapshots(snapshots, limit);

  if (mode === "draft") {
    // 只刷新镜像；历史槽位原样保留
    return { writes: [{ slot: 1, source: "current" }], moves: [], expired };
  }

  // commit：历史槽位整体后移一格，给"被覆盖前的磁盘内容"腾出槽位 2
  const moves: SnapshotMove[] = kept
    .filter((s) => s.slot >= 2 && s.slot < limit)
    .map((s) => ({ from: s.slot, to: s.slot + 1 }))
    // 从深到浅，避免 to 覆盖尚未搬走的 from
    .sort((a, b) => b.from - a.from);

  const writes: SnapshotWrite[] = [];
  if (limit >= 2) writes.push({ slot: 2, source: "previous" });
  writes.push({ slot: 1, source: "current" });

  return { writes, moves, expired };
}

/**
 * 轮转时应当删除的文件名：超出保留层数的槽位。
 *
 * 保留的是槽位 1..maxSlots（槽位越高越旧），因此只有 slot > maxSlots
 * 的才是多余文件。用 `>` 而不是 `>=` 很关键：maxSlots=1 时槽位 1 正是
 * 本次刚写入的那份，被误删的话就一份快照都不剩了。
 */
export function selectExpiredSnapshots(
  snapshots: { name: string; slot: number }[],
  maxSlots: number
): string[] {
  const limit = Math.max(1, Math.floor(maxSlots));
  return snapshots.filter((s) => s.slot > limit).map((s) => s.name);
}

/** 副本目录：用户指定目录，或文档同级的 .markweave-history */
export function resolveHistoryDir(filePath: string, settings: AutoSaveSettings): string {
  if (settings.historyDir) return settings.historyDir.replace(/\\/g, "/").replace(/\/+$/, "");
  const { dir } = splitFilePath(filePath);
  return `${dir || "."}/.markweave-history`;
}

/** 关闭窗口时是否需要提醒用户保存 */
export function shouldPromptOnClose(dirty: boolean, autoSaveMode: AutoSaveMode): boolean {
  if (!dirty) return false;
  // 自动保存已开启时内容已落盘，不再打扰用户
  return autoSaveMode === "off";
}
