/**
 * 编辑器行为的可配置项（对应 Typora 偏好设置里的若干开关）。
 *
 * 全部是纯函数或多态开关，便于单测；实际效果由编辑器插件读取。
 */

export interface EditorBehaviorSettings {
  /** 拼写检查：主视图正文开启浏览器拼写提示 */
  spellcheck: boolean;
  /** 自动链接：输入 URL 时自动转为链接 */
  autoLink: boolean;
  /** 恢复上次会话：启动时打开上次的文档与光标位置 */
  restoreSession: boolean;
  /** 代码块自动换行：长行折行而不是横向滚动 */
  codeWrap: boolean;
}

export const DEFAULT_EDITOR_BEHAVIOR: EditorBehaviorSettings = {
  spellcheck: false,
  autoLink: true,
  restoreSession: true,
  codeWrap: false,
};

export function normalizeEditorBehavior(raw: unknown): EditorBehaviorSettings {
  const input = (raw ?? {}) as Partial<EditorBehaviorSettings>;
  const pick = (value: unknown, fallback: boolean): boolean =>
    typeof value === "boolean" ? value : fallback;

  return {
    spellcheck: pick(input.spellcheck, DEFAULT_EDITOR_BEHAVIOR.spellcheck),
    autoLink: pick(input.autoLink, DEFAULT_EDITOR_BEHAVIOR.autoLink),
    restoreSession: pick(input.restoreSession, DEFAULT_EDITOR_BEHAVIOR.restoreSession),
    codeWrap: pick(input.codeWrap, DEFAULT_EDITOR_BEHAVIOR.codeWrap),
  };
}

/**
 * 启动时是否应恢复上次会话。
 * 关闭该选项时返回 null，调用方改用全新初始状态。
 */
export function shouldRestoreSession(
  settings: EditorBehaviorSettings,
  storedSession: unknown
): boolean {
  if (!settings.restoreSession) return false;
  return storedSession !== null && storedSession !== undefined;
}

/**
 * 光标位置恢复的合理性校验。
 * 文档被外部改动后，旧位置可能越界，此时应回到开头。
 */
export function clampCursorPosition(position: unknown, docSize: number): number {
  if (typeof position !== "number" || !Number.isFinite(position)) return 0;
  if (position < 0) return 0;
  if (position > docSize) return Math.max(0, docSize);
  return Math.floor(position);
}
