import type { StoredDocument } from "./store";

/**
 * 外部修改检测：编辑器定时比较磁盘 mtime，若文件被外部程序改写则提示重载。
 * 这里只放纯逻辑，便于单测；实际轮询在 main.ts。
 */

export interface FileStat {
  path: string;
  mtime: number;
  size: number;
}

export interface TrackedFile {
  docId: string;
  path: string;
  mtime: number;
  size: number;
  /** 本编辑器最后一次写入的时间，用于区分“自己刚保存”和“外部修改” */
  lastLocalWrite: number;
}

export const EXTERNAL_CHANGE_TOLERANCE_MS = 1500;

export function createTrackedFile(docId: string, stat: FileStat, now = Date.now()): TrackedFile {
  return { docId, path: stat.path, mtime: stat.mtime, size: stat.size, lastLocalWrite: now };
}

/**
 * 判断磁盘文件是否在编辑器不知情的情况下被改动。
 * 自己刚保存后 mtime 也会变，因此在容差窗口内忽略。
 */
export function hasExternalChange(
  tracked: TrackedFile,
  current: FileStat,
  now = Date.now(),
  tolerance = EXTERNAL_CHANGE_TOLERANCE_MS
): boolean {
  if (current.path !== tracked.path) return false;
  if (now - tracked.lastLocalWrite < tolerance) return false;
  if (current.mtime === tracked.mtime && current.size === tracked.size) return false;
  return current.mtime > tracked.mtime || current.size !== tracked.size;
}

/** 本编辑器写入后刷新基线，避免把自己的保存误判为外部修改 */
export function markLocalWrite(tracked: TrackedFile, stat: FileStat, now = Date.now()): TrackedFile {
  return { ...tracked, mtime: stat.mtime, size: stat.size, lastLocalWrite: now };
}

/**
 * 应用“外部内容重载”：保留文档身份，仅替换正文。
 */
export function applyReload(
  documents: StoredDocument[],
  docId: string,
  content: string,
  now = Date.now()
): StoredDocument[] {
  return documents.map((doc) =>
    doc.id === docId
      ? { ...doc, content, dirty: false, updatedAt: now }
      : { ...doc }
  );
}

/** 轮询间隔：桌面端每 2 秒检查一次即可 */
export const POLL_INTERVAL_MS = 2000;
