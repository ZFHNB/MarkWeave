/**
 * PDF 解析的模式选择策略（纯逻辑，便于单测）。
 *
 * 核心原则：**已经配置好的方式不该再打扰用户**。
 * 用户选了本地但本地没装、同时云端有 Key —— 直接走云端，别弹窗问。
 * 只有"两条路都走不通"或"需要用户做选择"时才提示。
 */

export type ParseMode = "local" | "cloud";

/** 当前可用的解析能力 */
export interface ParseAvailability {
  /** 本地 MinerU 是否就绪 */
  localReady: boolean;
  /** 云端是否已配置 API Key */
  cloudReady: boolean;
  /** 本地未就绪时的说明文字 */
  localDetail?: string;
}

export interface ModeDecision {
  /**
   * - "proceed"：可以直接解析
   * - "ask-switch"：首选方式不可用，但另一条路可行，且需要用户确认
   * - "need-local-setup"：只有本地可用但没装好，且云端也没配
   * - "need-cloud-key"：只有云端可用但没配 Key，且本地也没装
   */
  action: "proceed" | "ask-switch" | "need-local-setup" | "need-cloud-key";
  /** 最终采用的解析方式；action 非 proceed 时为 null */
  mode: ParseMode | null;
  /** 提示语（action 非 proceed 时使用） */
  message?: string;
}

/**
 * 决定这次该用哪种方式解析。
 *
 * 规则，按优先级：
 * 1. 首选方式就绪 → 直接用，不问
 * 2. 首选不可用、另一种就绪 → **静默切换**，只在设置里记一笔
 *    （用户已经配好了某一种，就是要用那种，没必要每次问）
 * 3. 两种都不可用 → 根据首选给出针对性的配置引导
 *
 * 注意：这里不做"是否允许上传云端"的隐私确认，那是另一层逻辑。
 */
export function decideParseMode(
  preferred: ParseMode,
  availability: ParseAvailability
): ModeDecision {
  const { localReady, cloudReady } = availability;

  if (preferred === "local") {
    if (localReady) return { action: "proceed", mode: "local" };
    if (cloudReady) {
      // 云端已配置 → 静默切换，不再弹「是否改用云端」
      return { action: "proceed", mode: "cloud" };
    }
    return {
      action: "need-local-setup",
      mode: null,
      message:
        `${availability.localDetail ?? "本地 MinerU 未就绪"}，云端也没有配置 API Key。` +
        `\n\n可执行 pip install -U mineru 安装本地环境，或前往设置填写云端 API Key。`,
    };
  }

  // preferred === "cloud"
  if (cloudReady) return { action: "proceed", mode: "cloud" };
  if (localReady) {
    // 本地已就绪 → 静默切换
    return { action: "proceed", mode: "local" };
  }
  return {
    action: "need-cloud-key",
    mode: null,
    message:
      "云端解析需要先配置 API Key，本地 MinerU 也没有就绪。" +
      "\n\n是否现在前往设置？",
  };
}

/**
 * 是否需要在解析前向用户确认"上传到云端"。
 *
 * 只有在真正走云端、且用户还没确认过时才提示一次。
 * 静默切换到云端的情况同样适用 —— 隐私确认不能跳。
 */
export function needsUploadConsent(
  mode: ParseMode,
  alreadyConfirmed: boolean
): boolean {
  return mode === "cloud" && !alreadyConfirmed;
}
