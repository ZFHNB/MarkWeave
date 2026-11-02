/**
 * 自动更新接口（预留）。
 *
 * 当前版本不实现真正的更新下载与安装：应用为自用分发，没有更新服务器。
 * 这里定义一个稳定的契约，未来接入时只需替换 `createUpdateChannel` 的实现，
 * 界面与调用方无需改动。
 */

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "up-to-date"
  | "downloading"
  | "ready"
  | "error"
  | "unsupported";

export interface UpdateInfo {
  /** 远端最新版本号，如 0.2.0 */
  version: string;
  /** 发布说明（Markdown 或纯文本） */
  notes?: string;
  /** 下载页地址 */
  url?: string;
  /** 发布时间 ISO 字符串 */
  publishedAt?: string;
}

export interface UpdateState {
  status: UpdateStatus;
  current: string;
  info: UpdateInfo | null;
  /** 下载进度 0–100，仅 downloading 时有意义 */
  progress: number;
  /** 错误信息，仅 error 时有意义 */
  error: string | null;
}

export const INITIAL_UPDATE_STATE: UpdateState = {
  status: "idle",
  current: "",
  info: null,
  progress: 0,
  error: null,
};

export interface UpdateChannel {
  /** 当前应用版本 */
  getCurrentVersion: () => string;
  /** 检查是否有新版本 */
  check: () => Promise<UpdateState>;
  /** 开始下载（未实现时应直接返回 unsupported） */
  download: () => Promise<UpdateState>;
  /** 退出并安装（未实现时返回 unsupported） */
  install: () => Promise<UpdateState>;
  /** 是否支持完整更新流程 */
  isSupported: () => boolean;
}

/**
 * 尚未接入更新后端时使用的空实现。
 *
 * 它总是返回 `unsupported`，界面据此显示「当前版本不支持自动更新」，
 * 而不是伪装成功或静默失败。
 */
export function createUnsupportedChannel(currentVersion: string): UpdateChannel {
  const unsupported = (): UpdateState => ({
    ...INITIAL_UPDATE_STATE,
    status: "unsupported",
    current: currentVersion,
    error: "当前构建未接入更新服务",
  });

  return {
    getCurrentVersion: () => currentVersion,
    check: async () => unsupported(),
    download: async () => unsupported(),
    install: async () => unsupported(),
    isSupported: () => false,
  };
}

/**
 * 纯逻辑：比较两个语义化版本。
 * 返回 1 表示 a 更新，-1 表示 a 更旧，0 表示相同。
 * 忽略预发布后缀，只比较数字段。
 */
export function compareVersions(a: string, b: string): number {
  // 只取形如 1.2.3 的数字主体，丢掉 -beta.1 / +build.5 这类后缀
  const parse = (v: string) => {
    const core = v.trim().replace(/^v/i, "").split(/[-+]/)[0];
    return core.split(".").map((part) => {
      const n = parseInt(part, 10);
      return Number.isFinite(n) ? n : 0;
    });
  };

  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length);

  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

/** 根据版本比较结果推导状态 */
export function statusForVersions(current: string, latest: string): UpdateStatus {
  if (!latest) return "error";
  return compareVersions(latest, current) > 0 ? "available" : "up-to-date";
}
