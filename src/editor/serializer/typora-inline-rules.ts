/**
 * 只依赖 MarkdownIt 的最小结构，避免在 `verbatimModuleSyntax` + `export =`
 * 的 typings 组合下无法以类型方式引用默认导出。
 */
interface MarkdownItLike {
  inline: {
    ruler: {
      before(beforeName: string, ruleName: string, rule: (state: any, silent: boolean) => boolean): void;
    };
  };
  renderer: {
    rules: Record<string, (tokens: any[], idx: number, options: any, env: any, self: any) => string>;
  };
}

/**
 * Typora 扩展行内语法（默认开启）：
 *   ==highlight==  高亮
 *   ^superscript^  上标
 *   ~subscript~    下标
 *   $inline math$  行内公式
 *
 * 这些规则复用 markdown-it 的 tokenizer 机制（而不是对整篇文本做正则替换），
 * 因此不会误伤代码块、行内代码、链接地址与 HTML 属性。
 */

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isEscaped(src: string, pos: number): boolean {
  let backslashes = 0;
  for (let i = pos - 1; i >= 0 && src[i] === "\\"; i--) backslashes++;
  return backslashes % 2 === 1;
}

function findClosing(
  src: string,
  start: number,
  delimiter: string,
  maxLength: number
): number {
  let index = start;
  while (index < maxLength) {
    const found = src.indexOf(delimiter, index);
    if (found === -1 || found >= maxLength) return -1;
    if (!isEscaped(src, found)) {
      // 内部不能为空，也不能以空白开头/结尾
      const inner = src.slice(start, found);
      if (inner.length > 0 && !/^\s/.test(inner) && !/\s$/.test(inner)) {
        return found;
      }
    }
    index = found + delimiter.length;
  }
  return -1;
}

function delimitedInlineRule(
  delimiter: string,
  tokenType: string,
  htmlTag: string,
  className: string
) {
  return function rule(state: any, silent: boolean): boolean {
    const start = state.pos;
    const max = state.posMax;
    const src = state.src;

    if (src.slice(start, start + delimiter.length) !== delimiter) return false;
    if (isEscaped(src, start)) return false;

    const contentStart = start + delimiter.length;
    const end = findClosing(src, contentStart, delimiter, max);
    if (end === -1) return false;

    if (!silent) {
      const content = src.slice(contentStart, end);
      const open = state.push(`${tokenType}_open`, htmlTag, 1);
      open.markup = delimiter;
      open.attrs = [["class", className]];

      const text = state.push("text", "", 0);
      text.content = content;

      const close = state.push(`${tokenType}_close`, htmlTag, -1);
      close.markup = delimiter;
    }

    state.pos = end + delimiter.length;
    return true;
  };
}

function inlineMathRule(state: any, silent: boolean): boolean {
  const start = state.pos;
  const max = state.posMax;
  const src = state.src;

  if (src[start] !== "$") return false;
  if (isEscaped(src, start)) return false;
  // 排除 $$（块级公式由预处理处理）
  if (src[start + 1] === "$") return false;

  let end = -1;
  for (let i = start + 1; i < max; i++) {
    if (src[i] === "$" && !isEscaped(src, i)) {
      end = i;
      break;
    }
  }
  if (end === -1) return false;

  const formula = src.slice(start + 1, end);
  if (!formula.trim() || /^\s/.test(formula) || /\s$/.test(formula)) return false;

  if (!silent) {
    const token = state.push("inline_math", "span", 0);
    token.markup = "$";
    token.content = formula;
    token.meta = { formula };
  }

  state.pos = end + 1;
  return true;
}

let applied = false;

export function applyTyporaInlineRules(md: MarkdownItLike): MarkdownItLike {
  if (applied) return md;
  applied = true;

  // 高亮 ==text==
  md.inline.ruler.before(
    "emphasis",
    "typora_highlight",
    delimitedInlineRule("==", "highlight", "mark", "md-highlight")
  );

  // 上标 ^text^
  md.inline.ruler.before(
    "emphasis",
    "typora_superscript",
    delimitedInlineRule("^", "superscript", "sup", "md-superscript")
  );

  // 下标 ~text~（strikethrough 是 ~~，因此单 ~ 不会冲突）
  md.inline.ruler.before(
    "strikethrough",
    "typora_subscript",
    delimitedInlineRule("~", "subscript", "sub", "md-subscript")
  );

  // 行内公式 $...$
  md.inline.ruler.before("text", "typora_inline_math", inlineMathRule);

  md.renderer.rules.inline_math = (tokens: any[], idx: number) => {
    const token = tokens[idx];
    return `<span class="md-inline-math" data-formula="${escapeHtml(
      token.meta?.formula || token.content || ""
    )}">${escapeHtml(token.content || "")}</span>`;
  };

  return md;
}
