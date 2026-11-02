/**
 * MinerU 云端 API 的凭证与错误处理（纯逻辑）。
 *
 * 实际存储由 Electron 主进程用 safeStorage 加密后写盘；
 * 这里只定义数据结构、优先级与错误归类，便于单测。
 */

export type MineruMode = "local" | "cloud";

export interface MineruCloudSettings {
  /** 云端 endpoint，形如 https://api.example.com/v1/parse */
  endpoint: string;
  /** 是否已保存密钥（密钥本体不进入这个结构） */
  hasApiKey: boolean;
  /** 密钥来源：环境变量优先，其次系统钥匙串 */
  keySource: "env" | "keychain" | "none";
}

export interface MineruSettings {
  /** 默认解析模式 */
  mode: MineruMode;
  cloud: MineruCloudSettings;
}

export const ENV_API_KEY = "MINERU_API_KEY";

/** 日志、错误信息里用于替换敏感值的掩码 */
export const REDACTION_MASK = "***";

// ---------------------------------------------------------------------------
// 凭证来源
// ---------------------------------------------------------------------------

export interface CredentialLookup {
  envValue: string | null;
  keychainValue: string | null;
}

export interface ResolvedCredential {
  apiKey: string | null;
  source: "env" | "keychain" | "none";
}

/**
 * 解析可用密钥。
 * 环境变量优先——它更适合 CI 与临时覆盖，也避免与界面里保存的值混淆。
 */
export function resolveCredential(lookup: CredentialLookup): ResolvedCredential {
  const env = lookup.envValue?.trim();
  if (env) return { apiKey: env, source: "env" };

  const stored = lookup.keychainValue?.trim();
  if (stored) return { apiKey: stored, source: "keychain" };

  return { apiKey: null, source: "none" };
}

/** 密钥是否足够可信到可以发起请求（只做长度与明显占位符检查） */
export function looksLikeApiKey(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (trimmed.length < 8) return false;
  // 占位符不算密钥
  return !/^(your[-_ ]?api[-_ ]?key|x{4,}|placeholder|none|null)$/i.test(trimmed);
}

// ---------------------------------------------------------------------------
// 脱敏
// ---------------------------------------------------------------------------

/**
 * 把文本里出现的密钥替换为掩码。
 * 用于日志与错误信息，避免密钥泄漏到控制台或错误弹窗。
 */
export function redact(text: string, secrets: (string | null | undefined)[]): string {
  if (!text) return "";
  let out = text;
  for (const secret of secrets) {
    const value = secret?.trim();
    if (!value || value.length < 6) continue;
    out = out.split(value).join(REDACTION_MASK);
  }
  return out;
}

/** 展示用的密钥摘要，只保留首尾各 4 位 */
export function maskApiKey(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 8) return REDACTION_MASK;
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// 错误归类
// ---------------------------------------------------------------------------

export type MineruErrorKind =
  | "auth"
  | "quota"
  | "network"
  | "parse"
  | "not-configured"
  | "local-not-ready"
  | "canceled"
  | "unknown";

export interface MineruFailure {
  kind: MineruErrorKind;
  /** 面向用户的提示 */
  message: string;
  /** 建议的下一步动作 */
  action: "open-settings" | "switch-local" | "retry" | "none";
  /** 是否值得重试 */
  retryable: boolean;
}

const NETWORK_CODES = new Set([
  "ENOTFOUND",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENETUNREACH",
]);

/**
 * 把底层错误归类为用户可理解的四类：网络 / 配额 / 鉴权 / 解析失败。
 * 识别不出来时归为 unknown，但一定给出可执行的建议。
 */
export function classifyMineruError(input: {
  status?: number | null;
  code?: string | null;
  message?: string | null;
  mode: MineruMode;
}): MineruFailure {
  const message = (input.message ?? "").toLowerCase();
  const status = input.status ?? null;
  const code = (input.code ?? "").toUpperCase();

  if (status === 401 || status === 403 || /unauthori[sz]ed|invalid.*key|forbidden/.test(message)) {
    return {
      kind: "auth",
      message: "API Key 无效或已过期",
      action: "open-settings",
      retryable: false,
    };
  }

  if (status === 402 || status === 429 || /quota|rate.?limit|too many requests/.test(message)) {
    return {
      kind: "quota",
      message: "配额不足或请求过于频繁",
      action: input.mode === "cloud" ? "switch-local" : "retry",
      retryable: true,
    };
  }

  if (NETWORK_CODES.has(code) || /network|fetch failed|offline|dns/.test(message)) {
    return {
      kind: "network",
      message: "网络连接失败，请检查网络或 Endpoint",
      action: input.mode === "cloud" ? "switch-local" : "retry",
      retryable: true,
    };
  }

  if (/no api key|not configured|缺少/.test(message)) {
    return {
      kind: "not-configured",
      message: "尚未配置 API Key",
      action: "open-settings",
      retryable: false,
    };
  }

  if (/model|runtime|python|not ready|未就绪/.test(message) && input.mode === "local") {
    return {
      kind: "local-not-ready",
      message: "本地解析环境未就绪",
      action: "open-settings",
      retryable: false,
    };
  }

  if (status !== null && status >= 400) {
    return {
      kind: "parse",
      message: `解析失败（HTTP ${status}）`,
      action: "retry",
      retryable: status >= 500,
    };
  }

  if (/parse|invalid pdf|corrupt/.test(message)) {
    return {
      kind: "parse",
      message: "PDF 无法解析，文件可能已损坏或加密",
      action: "retry",
      retryable: false,
    };
  }

  return {
    kind: "unknown",
    message: input.message?.trim() || "解析过程中发生未知错误",
    action: "retry",
    retryable: true,
  };
}

/** 解析前的凭证前置检查 */
export function preflightCheck(input: {
  mode: MineruMode;
  apiKey: string | null;
  localReady: boolean;
}): MineruFailure | null {
  if (input.mode === "local") {
    if (input.localReady) return null;
    return {
      kind: "local-not-ready",
      message: "本地 MinerU 环境未就绪",
      action: "open-settings",
      retryable: false,
    };
  }

  if (!looksLikeApiKey(input.apiKey)) {
    return {
      kind: "not-configured",
      message: "尚未配置有效的 API Key",
      action: "open-settings",
      retryable: false,
    };
  }

  return null;
}
