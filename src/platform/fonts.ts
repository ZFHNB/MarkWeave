/**
 * 正文字体与等宽字体选项。
 *
 * 每项都是一个可直接写进 CSS `font-family` 的字体栈：
 * 前面是用户选择的目标字体，后面跟一组跨平台回退，
 * 保证在没装该字体的机器上也不会退化成难看的默认字体。
 */

export interface FontOption {
  id: string;
  label: string;
  /** 完整 font-family 栈 */
  stack: string;
  /** 说明文字（显示在设置面板的二级提示里） */
  description: string;
}

/** 正文字体：面向阅读与写作，中文优先，兼顾拉丁字形 */
export const BODY_FONTS: FontOption[] = [
  {
    id: "default",
    label: "系统原生无衬线",
    stack:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
    description: "跟随操作系统默认 UI 字体，最稳妥的选择",
  },
  {
    id: "pingfang",
    label: "苹方 / 微软雅黑",
    stack: "'PingFang SC', 'Microsoft YaHei', 'Segoe UI', sans-serif",
    description: "现代界面风格，中文显示清晰",
  },
  {
    id: "serif",
    label: "优雅衬线",
    stack: "Georgia, 'Songti SC', SimSun, 'Times New Roman', serif",
    description: "适合作品阅读与正式文稿",
  },
  {
    id: "lxgw",
    label: "霞鹜文楷 / 楷体",
    stack: "'LXGW WenKai', 'Kaiti SC', KaiTi, STKaiti, serif",
    description: "带书写感的楷体风格，适合长文",
  },
  {
    id: "georgia",
    label: "Georgia",
    stack: "Georgia, 'Songti SC', serif",
    description: "经典西文衬线字体，屏幕易读",
  },
  {
    id: "inter",
    label: "Inter",
    stack: "'Inter', -apple-system, 'Segoe UI', 'PingFang SC', sans-serif",
    description: "为屏幕设计的现代无衬线字体",
  },
  {
    id: "noto-sans",
    label: "Noto Sans",
    stack: "'Noto Sans', 'Noto Sans SC', 'Segoe UI', 'PingFang SC', sans-serif",
    description: "跨平台覆盖广，中英混排均匀",
  },
  {
    id: "custom",
    label: "自定义…",
    stack: "",
    description: "手动填写任意字体名称，可逗号分隔多个回退",
  },
];

/**
 * 等宽字体：面向代码块。
 * 覆盖主流编程字体，未安装时逐级回退到系统中立等宽字体。
 */
export const MONO_FONTS: FontOption[] = [
  {
    id: "default",
    label: "系统等宽 (默认)",
    stack:
      "'SF Mono', Menlo, Consolas, 'Liberation Mono', 'Courier New', monospace",
    description: "使用系统自带的等宽字体，无需额外安装",
  },
  {
    id: "jetbrains-mono",
    label: "JetBrains Mono",
    stack: "'JetBrains Mono', 'SF Mono', Consolas, monospace",
    description: "JetBrains 出品，连字与符号辨识度优秀",
  },
  {
    id: "fira-code",
    label: "Fira Code",
    stack: "'Fira Code', 'JetBrains Mono', Consolas, monospace",
    description: "经典编程连字字体，箭头与运算符会合并显示",
  },
  {
    id: "cascadia",
    label: "Cascadia Code",
    stack: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace",
    description: "微软 Terminal 默认等宽字体",
  },
  {
    id: "source-code-pro",
    label: "Source Code Pro",
    stack: "'Source Code Pro', 'SF Mono', Consolas, monospace",
    description: "Adobe 开源等宽字体，长时间阅读友好",
  },
  {
    id: "ibm-plex-mono",
    label: "IBM Plex Mono",
    stack: "'IBM Plex Mono', 'SF Mono', Consolas, monospace",
    description: "IBM 设计，字形克制、适合正文内代码",
  },
  {
    id: "hack",
    label: "Hack",
    stack: "'Hack', 'SF Mono', Consolas, monospace",
    description: "专为源代码设计，点线清晰",
  },
  {
    id: "menlo",
    label: "Menlo",
    stack: "Menlo, Consolas, monospace",
    description: "macOS 自带等宽字体",
  },
  {
    id: "consolas",
    label: "Consolas",
    stack: "Consolas, 'Liberation Mono', monospace",
    description: "Windows 自带等宽字体",
  },
  {
    id: "monaco",
    label: "Monaco",
    stack: "Monaco, Menlo, Consolas, monospace",
    description: "经典 macOS 等宽字体",
  },
  {
    id: "sf-mono",
    label: "SF Mono",
    stack: "'SF Mono', Menlo, Consolas, monospace",
    description: "Apple 系统等宽字体",
  },
  {
    id: "ubuntu-mono",
    label: "Ubuntu Mono",
    stack: "'Ubuntu Mono', 'Ubuntu Monospace', monospace",
    description: "Ubuntu 系统字体，字形圆润",
  },
  {
    id: "custom",
    label: "自定义…",
    stack: "",
    description: "手动填写任意等宽字体名称，可逗号分隔多个回退",
  },
];

const FALLBACK_MONO = "monospace";
const FALLBACK_BODY = "sans-serif";

function findFont(list: FontOption[], id: string): FontOption {
  return list.find((font) => font.id === id) ?? list[0];
}

/**
 * 清洗用户手填的字体名：允许字母数字、空格、连字符、下划线、点与逗号，
 * 其余字符（分号、花括号、引号等）会被剔除，避免破坏 CSS 值。
 */
export function sanitizeFontStack(input: string): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/[^A-Za-z0-9\s,'"_.\-:]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

/** 解析出可用的 font-family 值；自定义为空时回退到该列表的默认项 */
export function resolveBodyFont(id: string, custom?: string): string {
  if (id === "custom") {
    const clean = sanitizeFontStack(custom ?? "");
    return clean ? `${clean}, ${FALLBACK_BODY}` : findFont(BODY_FONTS, "default").stack;
  }
  return findFont(BODY_FONTS, id).stack;
}

export function resolveMonoFont(id: string, custom?: string): string {
  if (id === "custom") {
    const clean = sanitizeFontStack(custom ?? "");
    return clean ? `${clean}, ${FALLBACK_MONO}` : findFont(MONO_FONTS, "default").stack;
  }
  return findFont(MONO_FONTS, id).stack;
}

export function normalizeFontId(list: FontOption[], value: unknown): string {
  if (typeof value !== "string") return "default";
  return list.some((font) => font.id === value) ? value : "default";
}
