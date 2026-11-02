/**
 * 本地 MinerU 运行时的探测与调用约定。
 *
 * 版本线索（调研确认）：
 * - `magic-pdf` 是旧名，最后版本 1.3.12（2025-05-24），已停止维护
 * - `mineru` 是现行包名（4.x，要求 Python 3.11–3.14）
 *
 * **重要**：4.x 移除了 3.x 的 `mineru -p in.pdf -o out` 调用形式。
 * 现行无状态单文件解析命令是 `mineru-kit parse`，
 * 例如 `mineru-kit parse doc.pdf -o doc.md`。
 *
 * 本模块只做纯逻辑：命令候选、输出解析、就绪判定。
 * 真正的进程调用在主进程里。
 */

export interface LocalRuntimeInfo {
  /** 找到的命令，如 mineru / magic-pdf */
  command: string | null;
  /** 命令输出的版本行 */
  version: string | null;
  /** 是否已下载模型（部分版本需要单独 prepare） */
  modelsReady: boolean;
  /** 面向用户的就绪说明 */
  detail: string;
}

export const LOCAL_READY_HINTS = [
  "未检测到本地 MinerU。",
  "可通过 `pip install -U mineru` 安装，或在偏好设置中切换到云端模式。",
].join("");

/** 依次尝试的命令；新名优先 */
/** 探测顺序：先找现行的 mineru-kit，再回退到旧命令 */
export const LOCAL_COMMANDS = ["mineru-kit", "mineru", "magic-pdf"] as const;

export type LocalCommand = (typeof LOCAL_COMMANDS)[number];

/**
 * 从 `mineru --version` / `magic-pdf --version` 的输出中取版本号。
 * 不同版本格式不一，尽量宽松。
 */
export function parseLocalVersion(output: string): string | null {
  if (!output) return null;
  const match = output.match(/(\d+\.\d+\.\d+(?:[-+][\w.]+)?)/);
  return match ? match[1] : null;
}

/** 版本主号，用于判断是否为 4.x 新命令体系 */
export function majorVersion(version: string | null): number | null {
  if (!version) return null;
  const n = parseInt(version.split(".")[0], 10);
  return Number.isFinite(n) ? n : null;
}

/** 根据探测结果判断本地是否可用 */
export function evaluateLocalRuntime(input: {
  command: string | null;
  versionOutput: string | null;
  modelsReady: boolean;
}): LocalRuntimeInfo {
  if (!input.command) {
    return {
      command: null,
      version: null,
      modelsReady: false,
      detail: LOCAL_READY_HINTS,
    };
  }

  const version = parseLocalVersion(input.versionOutput ?? "");

  if (!input.modelsReady) {
    return {
      command: input.command,
      version,
      modelsReady: false,
      detail: `已检测到 ${input.command}${
        version ? ` ${version}` : ""
      }，但模型尚未下载。首次运行需要下载模型，请保持网络连接。`,
    };
  }

  return {
    command: input.command,
    version,
    modelsReady: true,
    detail: `本地解析就绪：${input.command}${version ? ` ${version}` : ""}`,
  };
}

/**
 * 构造本地解析命令参数。
 *
 * 三种命令的参数形式并不相同：
 *
 * - `mineru-kit parse <input> -o <output>`（4.x 无状态模式，直接输出 .md）
 * - `mineru <input> --pages all -o <output>`（4.x 库模式，默认只取前 10 页）
 * - `magic-pdf -p <input> -o <dir> -m auto`（1.x 旧版，已停更）
 */
export function buildLocalArgs(options: {
  command: string;
  inputPath: string;
  outputDir: string;
  enableFormula?: boolean;
  /** 库模式默认只解析前 10 页，需要显式要全部 */
  allPages?: boolean;
}): string[] {
  void options.enableFormula;

  if (options.command === "mineru-kit") {
    // 无状态解析：直接指定输出文件
    return ["parse", options.inputPath, "-o", options.outputDir];
  }

  if (options.command === "magic-pdf") {
    return ["-p", options.inputPath, "-o", options.outputDir, "-m", "auto"];
  }

  // mineru 4.x 库模式：必须显式要求全部页面
  const args = [options.inputPath];
  if (options.allPages !== false) {
    args.push("--pages", "all");
  }
  args.push("-o", options.outputDir);
  return args;
}

/**
 * 本地解析的输出路径候选。
 *
 * 不同命令与版本产出的位置不同，按可能性从高到低排列，取第一个存在的：
 * - `mineru-kit parse doc.pdf -o out.md` 直接写出 out.md
 * - 4.x 库模式写出 `<out>/<pdf 名>/<pdf 名>.md`
 * - 1.x 会多一层 `auto/` 或 `ocr/`
 */
export function candidateMarkdownPaths(
  outputDir: string,
  pdfBaseName: string
): string[] {
  const norm = outputDir.replace(/\\/g, "/").replace(/\/+$/, "");
  return [
    norm.endsWith(".md") ? norm : `${norm}.md`,
    `${norm}/${pdfBaseName}.md`,
    `${norm}/${pdfBaseName}/auto/${pdfBaseName}.md`,
    `${norm}/${pdfBaseName}/${pdfBaseName}.md`,
    `${norm}/${pdfBaseName}/ocr/${pdfBaseName}.md`,
  ];
}

/** 从命令输出里提取模型目录提示，用于判断模型是否就绪 */
export function indicatesMissingModels(output: string): boolean {
  if (!output) return false;
  return /model.*(not found|missing|download)|请.*下载.*模型|模型.*不存在/i.test(output);
}
