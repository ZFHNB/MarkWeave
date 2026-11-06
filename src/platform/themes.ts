/**
 * 主题目录：内置主题移植自 Typora 1.5 的公开主题（均为 MIT/开源许可），
 * 另支持从用户目录加载自定义 CSS（仅样式，不含脚本）。
 */

export interface ThemeOption {
  id: string;
  label: string;
  /** 是否为深色主题（决定界面配色与 Mermaid 默认色） */
  dark: boolean;
  description: string;
  /** 自定义主题的样式文本 */
  css?: string;
  custom?: boolean;
}

export const CUSTOM_THEME_PREFIX = "custom:";

export const BUILT_IN_THEMES: ThemeOption[] = [
  {
    id: "default",
    label: "MarkWeave 经典",
    dark: false,
    description: "项目的原生排版风格",
  },
  {
    id: "github",
    label: "GitHub",
    dark: false,
    description: "GitHub Markdown 风格",
  },
  {
    id: "newsprint",
    label: "Newsprint",
    dark: false,
    description: "报纸排版，衬线字体",
  },
  {
    id: "pixyll",
    label: "Pixyll",
    dark: false,
    description: "极简博客风格",
  },
  {
    id: "whitey",
    label: "Whitey",
    dark: false,
    description: "高密度阅读排版",
  },
  {
    id: "night",
    label: "Night",
    dark: true,
    description: "Typora 经典夜间配色",
  },
];

const customThemes = new Map<string, ThemeOption>();

export function isCustomThemeId(id: string): boolean {
  return typeof id === "string" && id.startsWith(CUSTOM_THEME_PREFIX);
}

/** 注册（或替换）自定义主题，供设置面板与渲染共用 */
export function registerCustomThemes(themes: ThemeOption[]): void {
  customThemes.clear();
  for (const theme of themes) {
    if (!theme || !theme.id) continue;
    customThemes.set(theme.id, { ...theme, custom: true });
  }
}

export function getCustomThemes(): ThemeOption[] {
  return [...customThemes.values()];
}

export function getAllThemes(): ThemeOption[] {
  return [...BUILT_IN_THEMES, ...getCustomThemes()];
}

export function getTheme(id: string): ThemeOption {
  if (isCustomThemeId(id)) {
    const custom = customThemes.get(id);
    if (custom) return custom;
  }
  return BUILT_IN_THEMES.find((theme) => theme.id === id) ?? BUILT_IN_THEMES[0];
}

export function normalizeThemeId(value: unknown): string {
  if (typeof value !== "string") return "default";
  if (isCustomThemeId(value)) {
    // 主题文件可能已被删除，此时回退到内置默认主题
    return customThemes.has(value) ? value : "default";
  }
  return BUILT_IN_THEMES.some((theme) => theme.id === value) ? value : "default";
}

/**
 * 显式写出每个主题的 URL：Vite 只能静态分析字面量形式的 `new URL(...)`，
 * 动态拼接路径会导致样式表不被打包。
 */
const THEME_URLS: Record<string, string> = {
  github: new URL("../styles/themes/github.css", import.meta.url).href,
  newsprint: new URL("../styles/themes/newsprint.css", import.meta.url).href,
  pixyll: new URL("../styles/themes/pixyll.css", import.meta.url).href,
  whitey: new URL("../styles/themes/whitey.css", import.meta.url).href,
  night: new URL("../styles/themes/night.css", import.meta.url).href,
};

const THEME_LINK_ID = "markweave-theme";
const CUSTOM_STYLE_ID = "markweave-theme-custom";

function clearCustomStyle(): void {
  document.getElementById(CUSTOM_STYLE_ID)?.remove();
}

/** 应用自定义主题：以 <style> 注入，切换时替换 */
export function applyCustomTheme(theme: ThemeOption | null): void {
  clearCustomStyle();
  if (!theme?.css) return;
  const style = document.createElement("style");
  style.id = CUSTOM_STYLE_ID;
  style.textContent = theme.css;
  document.head.appendChild(style);
}

export function getThemeUrl(id: string): string | null {
  return THEME_URLS[id] ?? null;
}

/** 切换排版主题；内置主题用 <link>，自定义主题用内联 <style> */
export function applyBuiltInTheme(id: string): void {
  const theme = getTheme(normalizeThemeId(id));

  if (theme.custom) {
    const existing = document.getElementById(THEME_LINK_ID) as HTMLLinkElement | null;
    existing?.remove();
    applyCustomTheme(theme);
    document.body.dataset.markweaveTheme = theme.id;
    return;
  }

  clearCustomStyle();

  const existing = document.getElementById(THEME_LINK_ID) as HTMLLinkElement | null;
  const href = THEME_URLS[theme.id];

  if (!href) {
    existing?.remove();
    delete document.body.dataset.markweaveTheme;
    return;
  }

  if (existing && existing.getAttribute("href") === href) {
    document.body.dataset.markweaveTheme = theme.id;
    return;
  }

  const link = existing ?? document.createElement("link");
  link.id = THEME_LINK_ID;
  link.rel = "stylesheet";
  link.setAttribute("href", href);
  if (!existing) {
    document.head.appendChild(link);
  }
  document.body.dataset.markweaveTheme = theme.id;
}
