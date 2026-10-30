/**
 * 界面状态的规范化定义。
 *
 * 这些常量同时被 UI 与 QA 使用：任何一处改动都会让测试立刻暴露，
 * 避免"文案改了但判断逻辑没改"这类不易察觉的回归。
 */

/** 保存状态胶囊的取值，与 CSS 的 data-tone 一一对应 */
export const SAVE_STATUS_TONES = ["idle", "saving", "saved", "error"] as const;
export type SaveStatusTone = (typeof SAVE_STATUS_TONES)[number];

export interface CloseChoiceOption {
  action: "cancel" | "discard" | "save";
  label: string;
  primary: boolean;
}

/** 关闭未保存提示的三个选项 */
export const CLOSE_CHOICES: CloseChoiceOption[] = [
  { action: "cancel", label: "取消", primary: false },
  { action: "discard", label: "不保存", primary: false },
  { action: "save", label: "保存并退出", primary: true },
];

export interface SettingsTab {
  id: string;
  label: string;
}

/** 偏好设置页签的顺序与名称 */
export const SETTINGS_TABS: SettingsTab[] = [
  { id: "charts", label: "图表设置" },
  { id: "editor", label: "字体排版" },
  { id: "appearance", label: "外观主题" },
  { id: "storage", label: "存储与导出" },
  { id: "about", label: "关于系统" },
];
