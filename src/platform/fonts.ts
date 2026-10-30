/**
 * 字体选项与字体栈装配。
 *
 * 四组设置互相独立：
 * - bodyLatin  正文西文
 * - bodyCJK    正文中文
 * - monoLatin  代码西文（编程字体）
 * - monoCJK    代码中文
 *
 * 每组最终拼成一条完整 font-family 栈，形如：
 *   "选定字体", "回退1", "回退2", <generic>
 * 这样用户选了未安装的字体时，会平稳回退而不是变成难看的默认字形。
 */

export type FontGroup = "bodyLatin" | "bodyCJK" | "monoLatin" | "monoCJK";

export interface FontOption {
  id: string;
  label: string;
  /** 只包含该字体本身的候选名，不含 generic 回退 */
  families: string[];
  description: string;
}

const GENERIC: Record<FontGroup, string> = {
  bodyLatin: "sans-serif",
  bodyCJK: "sans-serif",
  monoLatin: "monospace",
  monoCJK: "monospace",
};

// ---------------------------------------------------------------------------
// 正文 · 西文
// ---------------------------------------------------------------------------

export const BODY_LATIN_FONTS: FontOption[] = [
  {
    id: "system",
    label: "系统默认",
    families: ["-apple-system", "BlinkMacSystemFont", "Segoe UI"],
    description: "跟随操作系统界面字体",
  },
  {
    id: "inter",
    label: "Inter",
    families: ["Inter"],
    description: "为屏幕设计的现代无衬线字体",
  },
  {
    id: "noto-sans",
    label: "Noto Sans",
    families: ["Noto Sans"],
    description: "跨平台覆盖广，中英混排均匀",
  },
  {
    id: "source-sans",
    label: "Source Sans 3",
    families: ["Source Sans 3", "Source Sans Pro"],
    description: "Adobe 开源无衬线字体，正文易读",
  },
  {
    id: "georgia",
    label: "Georgia",
    families: ["Georgia"],
    description: "经典西文衬线字体，屏幕阅读舒适",
  },
  {
    id: "times",
    label: "Times New Roman",
    families: ["Times New Roman", "Times"],
    description: "传统衬线字体，适合作品与论文",
  },
  {
    id: "garamond",
    label: "Garamond",
    families: ["Garamond", "EB Garamond"],
    description: "人文气息浓厚的古典衬线字体",
  },
  {
    id: "custom",
    label: "自定义…",
    families: [],
    description: "填写本机已安装的西文字体名",
  },
];

// ---------------------------------------------------------------------------
// 正文 · 中文
// ---------------------------------------------------------------------------

export const BODY_CJK_FONTS: FontOption[] = [
  {
    id: "system",
    label: "系统默认",
    families: ["PingFang SC", "Microsoft YaHei", "Hiragino Sans GB"],
    description: "跟随操作系统默认中文字体",
  },
  {
    id: "pingfang",
    label: "苹方",
    families: ["PingFang SC"],
    description: "macOS 系统中文黑体",
  },
  {
    id: "yahei",
    label: "微软雅黑",
    families: ["Microsoft YaHei"],
    description: "Windows 系统中文黑体",
  },
  {
    id: "source-han-sans",
    label: "思源黑体",
    families: ["Source Han Sans SC", "Noto Sans CJK SC", "Noto Sans SC"],
    description: "开源中文黑体，字重齐全",
  },
  {
    id: "source-han-serif",
    label: "思源宋体",
    families: ["Source Han Serif SC", "Noto Serif CJK SC", "Noto Serif SC"],
    description: "开源中文宋体，适合长文阅读",
  },
  {
    id: "songti",
    label: "宋体",
    families: ["Songti SC", "SimSun"],
    description: "传统中文衬线字体",
  },
  {
    id: "lxgw",
    label: "霞鹜文楷",
    families: ["LXGW WenKai"],
    description: "带书写感的楷体风格",
  },
  {
    id: "custom",
    label: "自定义…",
    families: [],
    description: "填写本机已安装的中文字体名",
  },
];

// ---------------------------------------------------------------------------
// 代码 · 西文（编程字体）
// ---------------------------------------------------------------------------

export const MONO_LATIN_FONTS: FontOption[] = [
  {
    id: "system",
    label: "系统等宽",
    families: ["SF Mono", "Menlo", "Consolas", "Liberation Mono", "Courier New"],
    description: "使用系统自带等宽字体，无需安装",
  },
  {
    id: "jetbrains-mono",
    label: "JetBrains Mono",
    families: ["JetBrains Mono"],
    description: "连字与符号辨识度优秀",
  },
  {
    id: "fira-code",
    label: "Fira Code",
    families: ["Fira Code"],
    description: "经典编程连字字体",
  },
  {
    id: "cascadia",
    label: "Cascadia Code",
    families: ["Cascadia Code", "Cascadia Mono"],
    description: "Windows Terminal 默认等宽字体",
  },
  {
    id: "source-code-pro",
    label: "Source Code Pro",
    families: ["Source Code Pro"],
    description: "Adobe 开源等宽字体",
  },
  {
    id: "ibm-plex-mono",
    label: "IBM Plex Mono",
    families: ["IBM Plex Mono"],
    description: "字形克制，适合正文内代码",
  },
  {
    id: "hack",
    label: "Hack",
    families: ["Hack"],
    description: "专为源代码设计",
  },
  {
    id: "sf-mono",
    label: "SF Mono",
    families: ["SF Mono"],
    description: "Apple 系统等宽字体",
  },
  {
    id: "menlo",
    label: "Menlo",
    families: ["Menlo"],
    description: "macOS 自带等宽字体",
  },
  {
    id: "consolas",
    label: "Consolas",
    families: ["Consolas"],
    description: "Windows 自带等宽字体",
  },
  {
    id: "monaco",
    label: "Monaco",
    families: ["Monaco"],
    description: "经典 macOS 等宽字体",
  },
  {
    id: "ubuntu-mono",
    label: "Ubuntu Mono",
    families: ["Ubuntu Mono", "Ubuntu Monospace"],
    description: "Ubuntu 系统字体，字形圆润",
  },
  {
    id: "custom",
    label: "自定义…",
    families: [],
    description: "填写本机已安装的等宽字体名",
  },
];

// ---------------------------------------------------------------------------
// 代码 · 中文
// ---------------------------------------------------------------------------

export const MONO_CJK_FONTS: FontOption[] = [
  {
    id: "system",
    label: "系统默认",
    families: ["PingFang SC", "Microsoft YaHei", "Noto Sans Mono CJK SC"],
    description: "与系统中文界面字体一致的等宽效果",
  },
  {
    id: "source-han-mono",
    label: "思源等宽",
    families: ["Source Han Mono SC", "Noto Sans Mono CJK SC"],
    description: "严格等宽的中文等宽字体",
  },
  {
    id: "sarasa-mono",
    label: "更纱黑体等宽",
    families: ["Sarasa Mono SC", "Sarasa Mono HC"],
    description: "中文等宽，与编程字体比例协调",
  },
  {
    id: "sarasa-gothic",
    label: "更纱黑体",
    families: ["Sarasa Gothic SC"],
    description: "中英文混排均匀的等宽黑体",
  },
  {
    id: "ms-yahei-mono",
    label: "微软雅黑",
    families: ["Microsoft YaHei"],
    description: "Windows 系统中文，非严格等宽",
  },
  {
    id: "custom",
    label: "自定义…",
    families: [],
    description: "填写本机已安装的中文等宽字体名",
  },
];

export const FONT_GROUPS: Record<FontGroup, FontOption[]> = {
  bodyLatin: BODY_LATIN_FONTS,
  bodyCJK: BODY_CJK_FONTS,
  monoLatin: MONO_LATIN_FONTS,
  monoCJK: MONO_CJK_FONTS,
};

/** 兼容旧引用 */
export const BODY_FONTS = BODY_LATIN_FONTS;
export const MONO_FONTS = MONO_LATIN_FONTS;

// ---------------------------------------------------------------------------
// 字体栈装配
// ---------------------------------------------------------------------------

/**
 * 清洗用户手填的字体名：允许字母数字、空格、连字符、下划线、点与逗号，
 * 其余字符（分号、花括号等）会被剔除，避免破坏 CSS 值。
 */
export function sanitizeFontStack(input: string): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/[^A-Za-z0-9\s,'"_.\-:]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

/** 需要加引号的安全字体名（含空格或中文时统一加引号） */
function quote(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  if (/^[A-Za-z0-9_.\-]+$/.test(trimmed)) return trimmed;
  return `"${trimmed.replace(/"/g, "")}"`;
}

/**
 * 解析某一组仅包含具体字体名的候选列表（不含 generic 回退）。
 * 未选择或自定义为空时，回退到该组的第一项。
 */
export function resolveFontFamilies(
  group: FontGroup,
  id: string,
  custom?: string
): string[] {
  const list = FONT_GROUPS[group];

  let families: string[] = [];
  if (id === "custom") {
    const clean = sanitizeFontStack(custom ?? "");
    families = clean
      ? clean.split(",").map((s: string) => s.trim()).filter(Boolean)
      : [];
  } else {
    const option = list.find((font) => font.id === id) ?? list[0];
    families = [...option.families];
  }

  if (families.length === 0) families = [...list[0].families];
  return families;
}

export function genericFor(group: FontGroup): string {
  return GENERIC[group];
}

/**
 * 解析某一组的完整 font-family 值（已包含 generic 回退）。
 * 单独使用某组设置时用这个。
 */
export function resolveFontStack(
  group: FontGroup,
  id: string,
  custom?: string
): string {
  return [...resolveFontFamilies(group, id, custom).map(quote), GENERIC[group]].join(", ");
}

export function resolveBodyFont(id: string, custom?: string): string {
  return resolveFontStack("bodyLatin", id, custom);
}

export function resolveMonoFont(id: string, custom?: string): string {
  return resolveFontStack("monoLatin", id, custom);
}

export function normalizeFontId(list: FontOption[], value: unknown): string {
  if (typeof value !== "string") return list[0]?.id ?? "system";
  return list.some((font) => font.id === value) ? value : (list[0]?.id ?? "system");
}

export function normalizeFontIdForGroup(group: FontGroup, value: unknown): string {
  return normalizeFontId(FONT_GROUPS[group], value);
}

/**
 * 检测字体是否可在当前环境使用。
 * 用 canvas 测量宽度差：装了字体会与兜底字体产生差异。
 */
export function isFontAvailable(family: string): boolean {
  if (typeof document === "undefined") return false;
  const name = family.replace(/^['"]|['"]$/g, "");
  if (!name) return false;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;

  const sample = "mmmmmmmmmmlli0123456789 中文字体测试";
  const measure = (font: string) => {
    ctx.font = `72px ${font}`;
    return ctx.measureText(sample).width;
  };

  const bases = ["monospace", "serif", "sans-serif"];
  const baseWidths = bases.map((base) => measure(base));
  const targetWidths = bases.map((base) => measure(`"${name}", ${base}`));

  return targetWidths.some((width, i) => Math.abs(width - baseWidths[i]) > 0.5);
}

/** 列出本机实际可用的入口字体（用于设置面板提示） */
export function findMissingFonts(group: FontGroup, id: string): string[] {
  if (id === "custom") return [];
  const option = FONT_GROUPS[group].find((font) => font.id === id);
  if (!option || option.families.length === 0) return [];
  // 命中任意一个候选即视为可用
  if (option.families.some((family) => isFontAvailable(family))) return [];
  return option.families;
}
