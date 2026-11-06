import type { StoredDocument } from "./store";

/**
 * 外部修改检测：编辑器定时比较磁盘 mtime，若文件被外部程序改写则提示重载。
 * 这里只放纯逻辑，便于单测；实际轮询在 main.ts。
 */

/** 轮询间隔：桌面端每 2 秒检查一次即可 */
export const POLL_INTERVAL_MS = 2000;

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
  /** 本编辑器最近一次写入后，磁盘上应有的 mtime（精确匹配即判定为自己所为） */
  expectedMtime?: number;
}

/**
 * 容差窗口：只用来吸收"保存瞬间与轮询之间的短暂时序抖动"，
 * 真正的自写识别依靠 TrackedFile.expectedMtime 与内容摘要，而非时间窗口。
 */
export const EXTERNAL_CHANGE_TOLERANCE_MS = 1500;

export function createTrackedFile(docId: string, stat: FileStat, now = Date.now()): TrackedFile {
  return {
    docId,
    path: stat.path,
    mtime: stat.mtime,
    size: stat.size,
    lastLocalWrite: now,
    expectedMtime: stat.mtime,
  };
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

  // 与"上一次已知状态"完全一致：没有任何改动
  if (current.mtime === tracked.mtime && current.size === tracked.size) return false;

  // 与"本次编辑器写入后应有的状态"一致：这是自己刚保存的结果
  if (
    tracked.expectedMtime !== undefined &&
    current.mtime === tracked.expectedMtime &&
    current.size === tracked.size
  ) {
    return false;
  }

  // 保存瞬间的时序抖动窗口
  if (now - tracked.lastLocalWrite < tolerance) return false;

  return current.mtime > tracked.mtime || current.size !== tracked.size;
}

/**
 * 本编辑器写入后刷新基线，避免把自己的保存误判为外部修改。
 * 同时记下 expectedMtime，即使轮询紧接着发生也能准确识别为自写。
 */
export function markLocalWrite(tracked: TrackedFile, stat: FileStat, now = Date.now()): TrackedFile {
  return {
    ...tracked,
    mtime: stat.mtime,
    size: stat.size,
    lastLocalWrite: now,
    expectedMtime: stat.mtime,
  };
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


