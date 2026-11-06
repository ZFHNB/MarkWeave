export interface Stats {
  words: number;
  chars: number;
  lines: number;
}

/**
 * 统计 Markdown 内容的字数、字符数与行数
 * - chars: 包含空白与换行的全部字符数
 * - words: 每个中日韩字符计 1 个词，连续的拉丁字母/数字串计 1 个词
 * - lines: 行数，以换行符分割；空字符串为 1 行
 */
export function computeStats(markdown: string): Stats {
  const chars = markdown.length;
  const lines = markdown.split(/\r?\n/).length;
  const matches = markdown.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[\p{Script=Latin}0-9]+/gu);
  const words = matches ? matches.length : 0;

  return {
    words,
    chars,
    lines,
  };
}
