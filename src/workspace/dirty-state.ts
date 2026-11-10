/**
 * "文档是否被修改"的判断（纯逻辑，便于单测）。
 *
 * 不能直接比较 `content` 与磁盘原文：Markdown 往返序列化会规范化
 * 末尾换行、行尾空白与换行符风格，这些是等价写法。直接比字符串会导致
 * 文件一打开就被标成"有未保存修改"，关窗时还会误弹保存提示。
 *
 * 改用基线法：打开/保存时把「编辑器当时输出的内容」记为 savedContent，
 * 之后只有偏离基线才算真正修改。
 */

/** 归一化：统一换行符、去掉行尾空白与末尾空行 */
export function normalizeForCompare(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n+$/, "");
}

/** 文档内容是否偏离基线（真正被修改） */
export function isContentDirty(doc: {
  content: string;
  savedContent?: string;
}): boolean {
  const baseline = doc.savedContent;
  // 没有基线时退回"是否有内容"：从未落盘的新文档里写了字也算未保存。
  // （空文档不应因此被判脏，否则关窗会无谓地弹提示。）
  if (baseline === undefined) return doc.content.trim().length > 0;
  return normalizeForCompare(doc.content) !== normalizeForCompare(baseline);
}
