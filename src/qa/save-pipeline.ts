/**
 * 保存管线的纯函数封装。
 *
 * 把"编辑器内容 → 磁盘字节"这一步独立出来，
 * 方便 QA 直接验证换行符与末尾换行的组合行为。
 */
import { convertLineEnding, ensureFinalNewline, type LineEnding } from "../workspace/file-ops";

export interface DiskWriteOptions {
  lineEnding: LineEnding;
  finalNewline: boolean;
}

/** 按用户偏好把编辑器内容转换为待写盘的文本 */
export function prepareDocumentForDisk(content: string, options: DiskWriteOptions): string {
  if (!content) return "";
  return ensureFinalNewline(convertLineEnding(content, options.lineEnding), options.finalNewline);
}
