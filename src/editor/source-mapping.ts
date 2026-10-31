/**
 * 源码视图与所见即所得视图之间的位置同步。
 *
 * 两种视图的排版差异很大（渲染后有一段段落间距、代码块有工具条等），
 * 直接按像素比例换算会明显错位。这里改用「内容位置」为锚点：
 * 取光标所在的顶层块，在源码里找到该块对应的行，然后按行比例定位。
 */

export interface LineWindow {
  /** 源码中每行的高度（由 textarea 的 line-height 决定） */
  lineHeight: number;
  /** 可视区高度 */
  viewportHeight: number;
  /** 文本域内边距（上下各一份） */
  paddingTop: number;
}

/**
 * 估算源码行号对应需要滚动的偏移。
 * 目标是把该行放在可视区的上部三分之一处，符合阅读习惯。
 */
export function scrollTopForLine(line: number, window: LineWindow): number {
  const contentY = window.paddingTop + Math.max(0, line) * window.lineHeight;
  return Math.max(0, contentY - window.viewportHeight / 3);
}

/**
 * 根据编辑器滚动位置估算在源码中的比例位置（0–1）。
 * 只在无法取得精确块位置时作为兜底。
 */
export function ratioFromScroll(scrollTop: number, scrollHeight: number, viewportHeight: number): number {
  const max = Math.max(1, scrollHeight - viewportHeight);
  return Math.min(1, Math.max(0, scrollTop / max));
}

/**
 * 把「渲染视图中的块序号」映射为「源码行号」。
 *
 * `blocks` 是顶层块在源码中的起始行号数组（与文档顶层块一一对应）。
 * 找不到时返回 0。
 */
export function lineForBlockIndex(blocks: number[], index: number): number {
  if (!blocks.length) return 0;
  const clamped = Math.min(Math.max(0, index), blocks.length - 1);
  return blocks[clamped] ?? 0;
}

/**
 * 统计每个顶层块在 Markdown 源码中的起始行。
 *
 * 做法：按空行切分源码为段落组，与顶层块逐一对应；
 * 块数量不一致时（例如列表被拆成多个节点）尽量按顺序对齐，
 * 剩余的块沿用上一个块的起始行，避免越界。
 */
export function computeBlockStartLines(markdown: string, blockCount: number): number[] {
  const lines = markdown.split("\n");
  const starts: number[] = [];

  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isFence = /^\s*(```|~~~)/.test(line);

    if (isFence) {
      // 围栏开始/结束都算一个块的开头
      if (!inFence) starts.push(i);
      inFence = !inFence;
      continue;
    }

    if (inFence) continue;

    const isBlank = line.trim() === "";
    if (isBlank) continue;

    const prevBlank = i === 0 || lines[i - 1].trim() === "";
    const isListContinuation = /^\s{2,}\S/.test(line) || /^\s*[-*+]\s/.test(line) || /^\s*\d+\.\s/.test(line);

    if (prevBlank && !isListContinuation) {
      starts.push(i);
    }
  }

  if (starts.length === 0) starts.push(0);

  // 对齐块数量：多了截断，少了用最后一行的位置补齐
  if (starts.length > blockCount) {
    return starts.slice(0, blockCount);
  }
  while (starts.length < blockCount) {
    starts.push(lines.length - 1);
  }
  return starts;
}


/**
 * 用「块的纯文本内容」在源码中定位其起始行。
 *
 * 比块序号对齐可靠得多：ProseMirror 的顶层块与 Markdown 的段落划分
 * 并不总是一一对应（列表会拆成多个节点、代码块内有空行等），
 * 而用内容文本搜索几乎总能命中唯一位置。
 *
 * @param blockText 目标块的纯文本（可截断，取开头几十个字符）
 * @param markdown  源码全文
 * @param nearLine  参考行号；命中多个候选时取最接近它的
 * @returns 起始行号；找不到时返回 null
 */
export function findLineByBlockText(
  blockText: string,
  markdown: string,
  nearLine = 0
): number | null {
  const raw = blockText.trim();
  if (!raw) return null;

  const lines = markdown.split("\n");

  /** 在候选行里挑最接近参考行的一个 */
  const pick = (candidates: number[]): number | null => {
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];
    return candidates.reduce((best, cur) =>
      Math.abs(cur - nearLine) < Math.abs(best - nearLine) ? cur : best
    );
  };

  // 1) 优先：整块文本出现在同一行（标题、段落最常见）
  const exact = pick(
    lines.map((line, i) => (line.includes(raw) ? i : -1)).filter((i) => i >= 0)
  );
  if (exact !== null) return exact;

  // 2) 其次：用块文本的开头一段做前缀匹配
  const head = raw.slice(0, 24);
  const byHead = pick(
    lines.map((line, i) => (line.includes(head) ? i : -1)).filter((i) => i >= 0)
  );
  if (byHead !== null) return byHead;

  // 3) 兜底：跨行拼接匹配（块内容被换行拆开的情况）
  const needle = raw.slice(0, 40);
  if (needle.length >= 8) {
    const byWindow = pick(
      lines
        .map((_, i) => (lines.slice(i, i + 4).join("").includes(needle) ? i : -1))
        .filter((i) => i >= 0)
    );
    if (byWindow !== null) return byWindow;
  }

  return null;
}

/**
 * 找到源码中给定行所在的顶层块序号。
 * 用块起始行数组，取「不超过该行的最后一个」。
 */
export function blockIndexForLine(blocks: number[], line: number): number {
  let index = 0;
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i] <= line) index = i;
    else break;
  }
  return index;
}
