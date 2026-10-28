/**
 * 内置主题目录（移植自 Typora 1.5 的公开主题，均为 MIT/开源许可）。
 * 主题仅覆盖排版外观，不涉及编辑器逻辑。
 */

export interface ThemeOption {
  id: string;
  label: string;
  /** 是否为深色主题（决定界面配色与 Mermaid 默认色） */
  dark: boolean;
  description: string;
}

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

export function getTheme(id: string): ThemeOption {
  return BUILT_IN_THEMES.find((theme) => theme.id === id) ?? BUILT_IN_THEMES[0];
}

export function normalizeThemeId(value: unknown): string {
  if (typeof value !== "string") return "default";
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

/** 动态加载主题样式表；切换时移除旧表，避免样式叠加 */
const THEME_LINK_ID = "markweave-theme";

export function getThemeUrl(id: string): string | null {
  return THEME_URLS[id] ?? null;
}

export function applyBuiltInTheme(id: string): void {
  const theme = getTheme(normalizeThemeId(id));
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
