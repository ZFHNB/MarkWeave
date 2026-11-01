import { Plugin } from "prosemirror-state";
import { schema } from "../schema";
import { markdownToDoc } from "../serializer/markdown";

/**
 * 粘贴 Markdown 源码时按解析后的形式插入。
 *
 * 用户从对话、文档、代码库复制一段 Markdown 粘进主视图时，
 * 期望看到的是排版结果而不是原始符号。这里在纯文本粘贴时做一次
 * "这看起来是 Markdown 吗"的判断，是则整体解析成节点插入。
 *
 * 不做判断的情况：
 * - 光标在代码块内（应当原样插入源码）
 * - 光标在表格内（交给表格粘贴插件处理）
 * - 纯文本、URL、单行短句（避免把普通文字误当 Markdown）
 */

/** 出现这些行首标记之一，就认为是 Markdown 文档片段 */
const BLOCK_MARKERS = [
  /^#{1,6}\s+\S/,            // 标题
  /^\s*[-*+]\s+\S/,          // 无序列表
  /^\s*\d+\.\s+\S/,          // 有序列表
  /^\s*>\s?\S/,              // 引用
  /^\s*```/,                 // 围栏代码
  /^\s*\|.*\|\s*$/,          // 表格行
  /^\s*---+\s*$/,            // 分割线
  /^\s*\[[^\]]+\]:\s*\S/,    // 链接引用定义
];

/** 行内标记：成对出现时也视为 Markdown */
const INLINE_MARKERS = [/\*\*[^*\n]+\*\*/, /`[^`\n]+`/, /\[[^\]\n]+\]\([^)\n]+\)/];

export interface MarkdownPasteDecision {
  /** 是否按 Markdown 解析 */
  parse: boolean;
  /** 命中的特征，便于调试与测试 */
  reason: string;
}

/**
 * 判断粘贴的纯文本是否应作为 Markdown 解析。
 * 纯函数，便于单测。
 */
export function shouldParseAsMarkdown(text: string): MarkdownPasteDecision {
  const trimmed = text.trim();
  if (!trimmed) return { parse: false, reason: "empty" };

  const lines = trimmed.split(/\r?\n/);
  const nonEmpty = lines.filter((l) => l.trim().length > 0);

  // 单行且很短：多半是普通文字，不做处理
  if (nonEmpty.length === 1 && nonEmpty[0].length < 12) {
    return { parse: false, reason: "single-short-line" };
  }

  // 纯 URL
  if (nonEmpty.length === 1 && /^https?:\/\/\S+$/.test(nonEmpty[0].trim())) {
    return { parse: false, reason: "url" };
  }

  // 有多行块级标记：强信号
  const blockHits = nonEmpty.filter((line) =>
    BLOCK_MARKERS.some((re) => re.test(line))
  );
  if (blockHits.length >= 2) {
    return { parse: true, reason: `block-markers:${blockHits.length}` };
  }

  // 表格：至少两行含 | 且有一行是分隔行
  const pipeRows = nonEmpty.filter((l) => l.includes("|"));
  const hasDelimiter = nonEmpty.some((l) => /^\s*\|?[\s:-]*-{3,}[\s:|-]*\|?\s*$/.test(l) && l.includes("-"));
  if (pipeRows.length >= 2 && hasDelimiter) {
    return { parse: true, reason: "table" };
  }

  // 单个块级标记 + 其它行内标记：中等信号
  if (blockHits.length === 1) {
    return { parse: true, reason: `single-block-marker:${nonEmpty.length}lines` };
  }

  // 多行且含行内标记
  if (nonEmpty.length >= 2) {
    const inlineHits = nonEmpty.filter((line) =>
      INLINE_MARKERS.some((re) => re.test(line))
    );
    if (inlineHits.length >= 2) {
      return { parse: true, reason: "inline-markers" };
    }
  }

  return { parse: false, reason: "plain-text" };
}

function isInsideCode(state: { selection: any }): boolean {
  const { $from, $to } = state.selection;
  for (const pos of [$from, $to]) {
    if (pos.parent.type.spec.code) return true;
    for (let d = pos.depth; d > 0; d--) {
      if (pos.node(d).type.spec.code) return true;
    }
  }
  return false;
}

export function createMarkdownPastePlugin(): Plugin {
  return new Plugin({
    props: {
      handlePaste(view, event) {
        const data = event.clipboardData;
        if (!data) return false;

        // 有富文本时交给浏览器默认粘贴（会保留原有格式）
        if (data.getData("text/html")) return false;

        const text = data.getData("text/plain");
        if (!text) return false;

        // 代码块内原样插入
        if (isInsideCode(view.state)) return false;

        // 表格内交给表格插件
        const { $from } = view.state.selection;
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.spec.tableRole) return false;
        }

        const decision = shouldParseAsMarkdown(text);
        if (!decision.parse) return false;

        const doc = markdownToDoc(text, schema);
        if (doc.childCount === 0) return false;

        const { from, to } = view.state.selection;
        const tr = view.state.tr.replaceWith(from, to, doc.content);
        view.dispatch(tr.scrollIntoView());
        return true;
      },
    },
  });
}
