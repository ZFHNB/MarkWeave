/**
 * MinerU 云端解析客户端。
 *
 * 协议（实测确认）：
 *   1. POST /api/v4/file-urls/batch   申请 OSS 预签名上传地址
 *   2. PUT  <预签名地址>               上传 PDF（切勿设置 Content-Type，否则 403）
 *   3. GET  /api/v4/extract-results/batch/{batch_id}  轮询状态
 *   4. GET  full_zip_url               下载 zip，内含 full.md
 *
 * 认证统一使用 `Authorization: Bearer <token>`。
 *
 * 本模块只负责协议与状态机，不做密钥存储、不写文件。
 */

export const MINERU_API_BASE = "https://mineru.net/api/v4";

export type CloudTaskState =
  | "waiting-file"
  | "pending"
  | "running"
  | "converting"
  | "done"
  | "failed";

/** 终态判断：done 与 failed 之外都要继续轮询 */
export function isTerminalState(state: string): boolean {
  return state === "done" || state === "failed";
}

export interface CloudParseOptions {
  apiKey: string;
  /** 上传的文件名，用于结果命名 */
  fileName: string;
  /** 文件字节 */
  data: Uint8Array;
  /** 是否 OCR（扫描版 PDF 需要） */
  enableOcr?: boolean;
  /** 是否解析公式 */
  enableFormula?: boolean;
  /** 语言：ch / en */
  language?: "ch" | "en";
  /** 轮询间隔毫秒 */
  pollIntervalMs?: number;
  /** 最长等待毫秒 */
  timeoutMs?: number;
  /** 进度回调，便于界面显示 */
  onProgress?: (info: { state: string; attempts: number }) => void;
  /** 取消信号 */
  signal?: AbortSignal;
}

export interface CloudParseResult {
  /** 解析出的 Markdown 全文 */
  markdown: string;
  /** 结果 zip 的下载地址（原始证据） */
  zipUrl: string;
  /** 结果文件列表 */
  files: string[];
}

/**
 * 把 Uint8Array 转成 fetch / DecompressionStream 接受的 body。
 * TypeScript 6 收紧了 Uint8Array 的泛型，直接传会报类型不匹配。
 */
function toBodyInit(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength
  ) as ArrayBuffer;
}

/** 调用失败时抛出的结构化错误，供上层归类 */
export class MineruCloudError extends Error {
  readonly status: number | null;
  readonly code: string | null;

  constructor(message: string, options: { status?: number | null; code?: string | null } = {}) {
    super(message);
    this.name = "MineruCloudError";
    this.status = options.status ?? null;
    this.code = options.code ?? null;
  }
}

async function readJson(response: Response): Promise<any> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new MineruCloudError(`响应不是合法 JSON：${text.slice(0, 120)}`, {
      status: response.status,
    });
  }
}

/** 申请上传地址并上传文件，返回 batch_id */
export async function uploadPdf(options: {
  apiKey: string;
  fileName: string;
  data: Uint8Array;
  enableOcr?: boolean;
  enableFormula?: boolean;
  language?: "ch" | "en";
  signal?: AbortSignal;
}): Promise<{ batchId: string }> {
  const requestRes = await fetch(`${MINERU_API_BASE}/file-urls/batch`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    signal: options.signal,
    body: JSON.stringify({
      files: [{ name: options.fileName, is_ocr: options.enableOcr ?? true }],
      enable_formula: options.enableFormula ?? true,
      language: options.language ?? "ch",
    }),
  });

  const requestJson = await readJson(requestRes);
  if (!requestRes.ok || requestJson.code !== 0) {
    throw new MineruCloudError(requestJson.msg || "申请上传地址失败", {
      status: requestRes.status,
      code: String(requestJson.code ?? ""),
    });
  }

  const batchId: string = requestJson.data?.batch_id;
  const uploadUrl: string = requestJson.data?.file_urls?.[0];
  if (!batchId || !uploadUrl) {
    throw new MineruCloudError("上传地址缺失");
  }

  // 关键：OSS 预签名 URL 对 Content-Type 敏感，设置会导致签名校验失败（403）
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    body: toBodyInit(options.data),
    signal: options.signal,
  });

  if (!putRes.ok) {
    throw new MineruCloudError(`上传失败（HTTP ${putRes.status}）`, {
      status: putRes.status,
    });
  }

  return { batchId };
}

export interface PollResult {
  state: string;
  zipUrl: string | null;
  errMsg: string;
}

/** 查询一次批量结果 */
export async function pollBatch(
  apiKey: string,
  batchId: string,
  signal?: AbortSignal
): Promise<PollResult> {
  const res = await fetch(`${MINERU_API_BASE}/extract-results/batch/${batchId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal,
  });

  const json = await readJson(res);
  if (!res.ok || json.code !== 0) {
    throw new MineruCloudError(json.msg || "查询任务状态失败", {
      status: res.status,
      code: String(json.code ?? ""),
    });
  }

  const item = json.data?.extract_result?.[0];
  if (!item) {
    return { state: "pending", zipUrl: null, errMsg: "" };
  }

  return {
    state: String(item.state ?? "pending"),
    zipUrl: item.full_zip_url ?? null,
    errMsg: String(item.err_msg ?? ""),
  };
}

/** 等待任务完成 */
export async function waitForCompletion(
  apiKey: string,
  batchId: string,
  options: {
    pollIntervalMs?: number;
    timeoutMs?: number;
    onProgress?: CloudParseOptions["onProgress"];
    signal?: AbortSignal;
  } = {}
): Promise<PollResult> {
  const interval = options.pollIntervalMs ?? 3000;
  const timeout = options.timeoutMs ?? 10 * 60 * 1000;
  const startedAt = Date.now();

  let attempts = 0;
  while (Date.now() - startedAt < timeout) {
    if (options.signal?.aborted) {
      throw new MineruCloudError("已取消", { code: "canceled" });
    }

    const result = await pollBatch(apiKey, batchId, options.signal);
    attempts += 1;
    options.onProgress?.({ state: result.state, attempts });

    if (result.state === "failed") {
      throw new MineruCloudError(result.errMsg || "解析失败", { code: "parse-failed" });
    }
    if (result.state === "done") return result;

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new MineruCloudError("解析超时", { code: "timeout" });
}

/**
 * 从 zip 字节中取出 Markdown。
 *
 * 结果包里有多个文件，优先取 `full.md`；没有则取第一个 `.md`。
 * 这里实现最小 ZIP 解析（只读中央目录 + 支持 stored / deflate），
 * 避免为这一处引入完整解压库。
 */
export async function extractMarkdownFromZip(zipBytes: Uint8Array): Promise<{
  markdown: string;
  files: string[];
}> {
  const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  const files: string[] = [];
  let markdown: string | null = null;
  let fallback: string | null = null;

  // 扫描 End of Central Directory (EOCD)
  let eocd = -1;
  for (let i = zipBytes.length - 22; i >= 0 && i >= zipBytes.length - 65558; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new MineruCloudError("结果包不是合法 zip");

  const entryCount = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);

  for (let i = 0; i < entryCount; i++) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder("utf-8").decode(
      zipBytes.subarray(offset + 46, offset + 46 + nameLen)
    );

    files.push(name);

    if (name.toLowerCase().endsWith(".md")) {
      // 定位本地头，跳过文件名与 extra
      const localNameLen = view.getUint16(localOffset + 26, true);
      const localExtraLen = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + localNameLen + localExtraLen;
      const raw = zipBytes.subarray(dataStart, dataStart + compressedSize);

      const text =
        method === 0
          ? new TextDecoder("utf-8").decode(raw)
          : await inflateRaw(raw);

      if (/^full\.md$/i.test(name) || markdown === null) {
        markdown = text;
      }
      if (/^full\.md$/i.test(name)) {
        fallback = text;
      }
    }

    offset += 46 + nameLen + extraLen + commentLen;
  }

  const chosen = fallback ?? markdown;
  if (chosen === null) {
    throw new MineruCloudError("结果包中没有 Markdown 文件");
  }
  return { markdown: chosen, files };
}

/** 用浏览器/Node 的 DecompressionStream 解 deflate-raw */
async function inflateRaw(data: Uint8Array): Promise<string> {
  const stream = new DecompressionStream("deflate-raw" as CompressionFormat);
  const writer = stream.writable.getWriter();
  // 复制到独立 ArrayBuffer：原数组可能挂在 SharedArrayBuffer 上，不被接受
  void writer.write(new Uint8Array(toBodyInit(data)));
  void writer.close();

  const buffer = await new Response(stream.readable).arrayBuffer();
  return new TextDecoder("utf-8").decode(buffer);
}

/** 完整流程：上传 → 轮询 → 下载 → 提取 Markdown */
export async function parseWithCloud(options: CloudParseOptions): Promise<CloudParseResult> {
  const { batchId } = await uploadPdf(options);
  const poll = await waitForCompletion(options.apiKey, batchId, {
    pollIntervalMs: options.pollIntervalMs,
    timeoutMs: options.timeoutMs,
    onProgress: options.onProgress,
    signal: options.signal,
  });

  if (!poll.zipUrl) {
    throw new MineruCloudError("任务已完成但没有返回下载地址");
  }

  const zipRes = await fetch(poll.zipUrl, { signal: options.signal });
  if (!zipRes.ok) {
    throw new MineruCloudError(`下载结果失败（HTTP ${zipRes.status}）`, {
      status: zipRes.status,
    });
  }

  const zipBytes = new Uint8Array(await zipRes.arrayBuffer());
  const { markdown, files } = await extractMarkdownFromZip(zipBytes);

  return { markdown, zipUrl: poll.zipUrl, files };
}
