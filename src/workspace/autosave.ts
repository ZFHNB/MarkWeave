/**
 * 自动保存与历史副本策略（纯逻辑，便于单测）。
 *
 * 这里只负责"什么时候该做什么"，实际的文件读写由调用方注入。
 */

export type AutoSaveMode = "off" | "onChange" | "interval";

export interface AutoSaveSettings {
  mode: AutoSaveMode;
  /** 间隔保存的分钟数（mode 为 interval 时生效） */
  intervalMinutes: number;
  /** 历史副本目录；为空时使用文档同级的 .markweave-history */
  historyDir: string;
  /** 每个文件保留的副本数量 */
  maxHistory: number;
  /** 是否启用历史副本 */
  historyEnabled: boolean;
}

export const DEFAULT_AUTO_SAVE: AutoSaveSettings = {
  mode: "off",
  intervalMinutes: 5,
  historyDir: "",
  maxHistory: 20,
  historyEnabled: true,
};

export const MIN_INTERVAL_MINUTES = 1;
export const MAX_INTERVAL_MINUTES = 120;
export const MIN_HISTORY = 1;
export const MAX_HISTORY = 200;

export function normalizeAutoSaveSettings(raw: unknown): AutoSaveSettings {
  const input = (raw ?? {}) as Partial<AutoSaveSettings>;
  const mode: AutoSaveMode =
    input.mode === "onChange" || input.mode === "interval" ? input.mode : "off";

  const interval = Number(input.intervalMinutes);
  const maxHistory = Number(input.maxHistory);

  return {
    mode,
    intervalMinutes: Number.isFinite(interval)
      ? Math.min(MAX_INTERVAL_MINUTES, Math.max(MIN_INTERVAL_MINUTES, Math.round(interval)))
      : DEFAULT_AUTO_SAVE.intervalMinutes,
    historyDir: typeof input.historyDir === "string" ? input.historyDir.trim() : "",
    maxHistory: Number.isFinite(maxHistory)
      ? Math.min(MAX_HISTORY, Math.max(MIN_HISTORY, Math.round(maxHistory)))
      : DEFAULT_AUTO_SAVE.maxHistory,
    historyEnabled: input.historyEnabled !== false,
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

/** 副本文件名：<原文件名去扩展名>.<时间戳>.<扩展名> */
export function historyFileName(originalPath: string, date: Date): string {
  const normalized = originalPath.replace(/\\/g, "/");
  const slash = normalized.lastIndexOf("/");
  const dir = slash === -1 ? "" : normalized.slice(0, slash);
  const base = slash === -1 ? normalized : normalized.slice(slash + 1);
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : ".md";
  const name = `${stem}.${formatHistoryStamp(date)}${ext}`;
  return dir ? `${dir}/${name}` : name;
}

/** 副本目录：用户指定目录，或文档同级的 .markweave-history */
export function resolveHistoryDir(filePath: string, settings: AutoSaveSettings): string {
  if (settings.historyDir) return settings.historyDir.replace(/\\/g, "/").replace(/\/+$/, "");
  const normalized = filePath.replace(/\\/g, "/");
  const slash = normalized.lastIndexOf("/");
  const dir = slash === -1 ? "." : normalized.slice(0, slash);
  return `${dir}/.markweave-history`;
}

/**
 * 从副本列表中剔除超出保留数量的旧副本。
 * 输入为文件名数组，按字典序（即时间序）升序排列，返回应删除的文件名。
 */
export function selectExpiredHistory(files: string[], maxHistory: number): string[] {
  const limit = Math.max(0, Math.floor(maxHistory));
  if (files.length <= limit) return [];
  const sorted = [...files].sort();
  return sorted.slice(0, sorted.length - limit);
}

/** 关闭窗口时是否需要提醒用户保存 */
export function shouldPromptOnClose(dirty: boolean, autoSaveMode: AutoSaveMode): boolean {
  if (!dirty) return false;
  // 自动保存已开启时内容已落盘，不再打扰用户
  return autoSaveMode === "off";
}
