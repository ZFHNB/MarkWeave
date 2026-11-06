/**
 * Pandoc 桥的纯逻辑部分。
 *
 * 实际调用 pandoc 由 Electron 主进程完成；这里只处理
 * 「目标格式 → 参数」「输出扩展名」「错误归类」这类可测逻辑。
 */

export type PandocFormat =
  | "docx"
  | "odt"
  | "epub"
  | "latex"
  | "rtf"
  | "pptx"
  | "rst"
  | "org"
  | "mediawiki"
  | "plain";

export interface PandocFormatOption {
  id: PandocFormat;
  label: string;
  extension: string;
  description: string;
}

export const PANDOC_FORMATS: PandocFormatOption[] = [
  { id: "docx", label: "Word (.docx)", extension: "docx", description: "通用办公文档格式" },
  { id: "odt", label: "OpenDocument (.odt)", extension: "odt", description: "LibreOffice / WPS" },
  { id: "epub", label: "EPUB 电子书 (.epub)", extension: "epub", description: "适合长文阅读" },
  { id: "latex", label: "LaTeX (.tex)", extension: "tex", description: "学术排版源码" },
  { id: "rtf", label: "RTF (.rtf)", extension: "rtf", description: "兼容性最好的富文本" },
  { id: "pptx", label: "PowerPoint (.pptx)", extension: "pptx", description: "按标题层级生成幻灯片" },
  { id: "rst", label: "reStructuredText (.rst)", extension: "rst", description: "Python 文档常用" },
  { id: "org", label: "Org Mode (.org)", extension: "org", description: "Emacs 生态" },
  { id: "mediawiki", label: "MediaWiki (.wiki)", extension: "wiki", description: "Wiki 语法" },
  { id: "plain", label: "纯文本 (.txt)", extension: "txt", description: "去掉所有标记" },
];

export function getFormat(id: string): PandocFormatOption {
  return PANDOC_FORMATS.find((f) => f.id === id) ?? PANDOC_FORMATS[0];
}

export interface PandocInvocation {
  /** 传给 pandoc 的参数（不含可执行文件本身） */
  args: string[];
  /** 建议的输出扩展名（含点） */
  extension: string;
}

/**
 * 构造 pandoc 调用参数。
 *
 * 输入统一为 markdown；开启 standalone 让 pandoc 生成完整文档
 * （给 docx/epub 等格式补上必要的容器结构）。
 */
export function buildPandocArgs(options: {
  format: string;
  inputPath: string;
  outputPath: string;
  /** 额外元数据，如标题、作者 */
  metadata?: Record<string, string>;
}): PandocInvocation {
  const fmt = getFormat(options.format);
  const args = [
    options.inputPath,
    "-f",
    "markdown+pipe_tables+task_lists+footnotes+strikeout",
    "-t",
    fmt.id,
    "-o",
    options.outputPath,
    "--standalone",
  ];

  for (const [key, value] of Object.entries(options.metadata ?? {})) {
    if (value && value.trim()) {
      args.push("-M", `${key}=${value}`);
    }
  }

  return { args, extension: `.${fmt.extension}` };
}

/** 把 stderr 归类成用户能看懂的提示 */
export function classifyPandocError(stderr: string, exitCode: number | null): string {
  const text = (stderr || "").trim();
  if (!text) {
    return exitCode ? `pandoc 退出码 ${exitCode}` : "pandoc 执行失败";
  }
  if (/not found|command not found|ENOENT/i.test(text)) {
    return "未找到 pandoc，请先安装并确保其在 PATH 中";
  }
  if (/permission denied/i.test(text)) {
    return "没有写入目标文件的权限";
  }
  if (/could not find|does not exist/i.test(text)) {
    return "输入文件读取失败";
  }
  // 只取首行，避免把整段堆栈塞进界面
  return text.split("\n")[0].slice(0, 200);
}

/** 版本字符串解析：pandoc 3.1.9 → { major:3, minor:1, patch:9 } */
export function parsePandocVersion(output: string): {
  major: number;
  minor: number;
  patch: number;
  raw: string;
} | null {
  const match = output.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3] ?? 0),
    raw: output.trim().split("\n")[0],
  };
}
