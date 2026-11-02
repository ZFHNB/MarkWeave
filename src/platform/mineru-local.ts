/**
 * 本地 MinerU 运行时的探测与调用约定。
 *
 * 版本线索（pip 查询结果）：
 * - `magic-pdf` 是旧名，停在 1.3.12
 * - `mineru` 是现行包名，最新 4.x
 * 因此本地模式以 `mineru` 命令为准，并兼容旧命令回退。
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
export const LOCAL_COMMANDS = ["mineru", "magic-pdf"] as const;

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
 * `mineru` 4.x：`mineru -p <input> -o <output>`
 * `magic-pdf` 1.x：`magic-pdf -p <input> -o <output>`
 * 两者参数形式一致，差异在可执行名与输出目录结构。
 */
export function buildLocalArgs(options: {
  command: string;
  inputPath: string;
  outputDir: string;
  enableFormula?: boolean;
}): string[] {
  const args = ["-p", options.inputPath, "-o", options.outputDir];

  // magic-pdf 支持 -m auto（自动检测），mineru 4.x 默认行为即可
  if (options.command === "magic-pdf") {
    args.push("-m", "auto");
  }

  void options.enableFormula;
  return args;
}

/**
 * 本地解析的输出目录结构：
 *   <outputDir>/<pdf 名>/auto/<pdf 名>.md
 * 不同版本略有差异，这里提供多候选路径，取第一个存在的。
 */
export function candidateMarkdownPaths(
  outputDir: string,
  pdfBaseName: string
): string[] {
  const norm = outputDir.replace(/\\/g, "/").replace(/\/+$/, "");
  return [
    `${norm}/${pdfBaseName}/${pdfBaseName}.md`,
    `${norm}/${pdfBaseName}/auto/${pdfBaseName}.md`,
    `${norm}/${pdfBaseName}.md`,
    `${norm}/${pdfBaseName}/ocr/${pdfBaseName}.md`,
  ];
}

/** 从命令输出里提取模型目录提示，用于判断模型是否就绪 */
export function indicatesMissingModels(output: string): boolean {
  if (!output) return false;
  return /model.*(not found|missing|download)|请.*下载.*模型|模型.*不存在/i.test(output);
}
