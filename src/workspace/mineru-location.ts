/**
 * MinerU 解析结果的存储位置策略（纯逻辑，便于单测）。
 *
 * 四种策略对应偏好设置里的四个选项，默认「与源 PDF 同目录」，
 * 解析完成后直接落盘，不打断用户。
 */

export type OutputLocationMode =
  | "same-as-pdf"
  | "fixed-folder"
  | "same-as-note"
  | "subfolder-of-note";

export interface OutputLocationSettings {
  mode: OutputLocationMode;
  /** mode 为 fixed-folder 时的目标目录 */
  fixedFolder: string;
  /** mode 为 subfolder-of-note 时的子目录名 */
  subfolderName: string;
  /** 每次解析后是否询问保存位置（默认关闭） */
  askEachTime: boolean;
}

export const DEFAULT_OUTPUT_LOCATION: OutputLocationSettings = {
  mode: "same-as-pdf",
  fixedFolder: "",
  subfolderName: "attachments",
  askEachTime: false,
};

export const LOCATION_MODE_LABELS: Record<OutputLocationMode, string> = {
  "same-as-pdf": "与源 PDF 同目录",
  "fixed-folder": "指定固定文件夹",
  "same-as-note": "与当前笔记同目录",
  "subfolder-of-note": "当前笔记所在文件夹下的子文件夹",
};

export function normalizeOutputLocation(raw: unknown): OutputLocationSettings {
  const input = (raw ?? {}) as Partial<OutputLocationSettings>;
  const modes: OutputLocationMode[] = [
    "same-as-pdf",
    "fixed-folder",
    "same-as-note",
    "subfolder-of-note",
  ];
  const mode = modes.includes(input.mode as OutputLocationMode)
    ? (input.mode as OutputLocationMode)
    : DEFAULT_OUTPUT_LOCATION.mode;

  return {
    mode,
    fixedFolder:
      typeof input.fixedFolder === "string" ? input.fixedFolder.trim() : "",
    subfolderName:
      (typeof input.subfolderName === "string" && input.subfolderName.trim()) ||
      DEFAULT_OUTPUT_LOCATION.subfolderName,
    askEachTime: input.askEachTime === true,
  };
}

/** 统一成正斜杠，去掉结尾分隔符 */
function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "");
}

/** 取目录部分 */
function dirname(filePath: string): string {
  const norm = normalizePath(filePath);
  const idx = norm.lastIndexOf("/");
  return idx <= 0 ? norm : norm.slice(0, idx);
}

/** 取文件名去扩展名 */
export function stem(filePath: string): string {
  const norm = normalizePath(filePath);
  const base = norm.slice(norm.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

export interface ResolveContext {
  pdfPath: string;
  /** 当前打开的笔记路径；没有笔记时为空 */
  notePath: string | null;
}

export interface ResolvedLocation {
  /** 目标目录（已归一化） */
  directory: string;
  /** 建议文件名（含 .md） */
  fileName: string;
  /** 无法解析时的原因 */
  error?: string;
}

/**
 * 根据策略算出解析结果的落盘位置。
 *
 * 拿不到必要信息时（例如选了「与当前笔记同目录」但当前没有笔记），
 * 退回到「与源 PDF 同目录」，而不是报错中断流程。
 */
export function resolveOutputLocation(
  settings: OutputLocationSettings,
  context: ResolveContext
): ResolvedLocation {
  const name = `${stem(context.pdfPath)}.md`;
  const pdfDir = dirname(context.pdfPath);

  switch (settings.mode) {
    case "fixed-folder": {
      if (!settings.fixedFolder) {
        return { directory: pdfDir, fileName: name };
      }
      return { directory: normalizePath(settings.fixedFolder), fileName: name };
    }

    case "same-as-note": {
      if (!context.notePath) {
        return { directory: pdfDir, fileName: name };
      }
      return { directory: dirname(context.notePath), fileName: name };
    }

    case "subfolder-of-note": {
      if (!context.notePath) {
        return { directory: pdfDir, fileName: name };
      }
      const base = dirname(context.notePath);
      const sub = settings.subfolderName.replace(/^[/\\]+|[/\\]+$/g, "");
      return { directory: `${base}/${sub}`, fileName: name };
    }

    case "same-as-pdf":
    default:
      return { directory: pdfDir, fileName: name };
  }
}

/** 解析结果是否应触发位置询问 */
export function shouldAskLocation(settings: OutputLocationSettings): boolean {
  return settings.askEachTime === true;
}

/**
 * 同名文件去重：note.md 已存在时返回 note-1.md、note-2.md……
 * `existing` 为该目录下已有的文件名集合。
 */
export function uniqueOutputName(
  fileName: string,
  existing: ReadonlySet<string>
): string {
  if (!existing.has(fileName)) return fileName;

  const dot = fileName.lastIndexOf(".");
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot > 0 ? fileName.slice(dot) : "";

  for (let i = 1; i < 1000; i++) {
    const candidate = `${base}-${i}${ext}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}${ext}`;
}
