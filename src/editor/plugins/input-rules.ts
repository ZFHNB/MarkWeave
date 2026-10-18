import {
  inputRules,
  wrappingInputRule,
  textblockTypeInputRule,
  InputRule,
} from "prosemirror-inputrules";
import { Schema, MarkType } from "prosemirror-model";

function createMarkInputRule(regexp: RegExp, markType: MarkType, getAttrs?: any) {
  return new InputRule(regexp, (state, match, start, end) => {
    const attrs = getAttrs instanceof Function ? getAttrs(match) : getAttrs;
    const { tr } = state;
    const m = match.length - 1;
    let markStart = start;
    let markEnd = end;
    if (match[m]) {
      const matchStart = start + match[0].lastIndexOf(match[m]);
      const matchEnd = matchStart + match[m].length;
      tr.delete(matchEnd, end);
      tr.delete(start, matchStart);
      markStart = start;
      markEnd = markStart + match[m].length;
    }
    tr.addMark(markStart, markEnd, markType.create(attrs));
    tr.removeStoredMark(markType);
    return tr;
  });
}

export function buildInputRules(schema: Schema) {
  const rules: InputRule[] = [];

  // 1. 标题快捷语法 (# 至 ######)
  if (schema.nodes.heading) {
    rules.push(
      textblockTypeInputRule(
        new RegExp("^(#{1,6})\\s$"),
        schema.nodes.heading,
        (match) => ({ level: match[1].length })
      )
    );
  }

  // 2. 块级引用 (> )
  if (schema.nodes.blockquote) {
    rules.push(wrappingInputRule(/^\s*>\s$/, schema.nodes.blockquote));
  }

  // 3. 无序列表 (* 或 - 或 + )
  if (schema.nodes.bullet_list) {
    rules.push(wrappingInputRule(/^\s*([-+*])\s$/, schema.nodes.bullet_list));
  }

  // 4. 有序列表 (1. )
  if (schema.nodes.ordered_list) {
    rules.push(
      wrappingInputRule(
        /^(\d+)\.\s$/,
        schema.nodes.ordered_list,
        (match) => ({ order: +match[1] }),
        (match, node) => node.childCount + node.attrs.order === +match[1]
      )
    );
  }

  // 5. 任务列表 (- [ ] 或 - [x] )
  if (schema.nodes.task_list && schema.nodes.task_item) {
    rules.push(
      wrappingInputRule(
        /^\s*-\s\[([ xX])\]\s$/,
        schema.nodes.task_list,
        (match) => ({ checked: match[1].toLowerCase() === "x" })
      )
    );
  }

  // 6. 代码块 (```[lang] 回车触发)
  if (schema.nodes.code_block) {
    rules.push(
      textblockTypeInputRule(/^```([a-zA-Z0-9_-]*)\s$/, schema.nodes.code_block, (match) => ({
        params: match[1] || "",
      }))
    );
  }

  // 7. 数学公式块 ($$ 回车触发)
  if (schema.nodes.math_block) {
    rules.push(
      new InputRule(/^\$\$\s$/, (state, _match, start, end) => {
        const { tr } = state;
        tr.replaceWith(start - 1, end, schema.nodes.math_block.create({ formula: "" }));
        return tr;
      })
    );
  }

  // 8. 分割线 (--- 或 ***)
  if (schema.nodes.horizontal_rule) {
    rules.push(
      new InputRule(/^(?:---|---|\*\*\*)\s$/, (state, _match, start, end) => {
        const { tr } = state;
        tr.replaceWith(start - 1, end, schema.nodes.horizontal_rule.create());
        return tr;
      })
    );
  }

  // 9. 行内加粗 (**bold**)
  if (schema.marks.strong) {
    rules.push(createMarkInputRule(/(?:\*\*|__)([^*_]+)(?:\*\*|__)$/, schema.marks.strong));
  }

  // 10. 行内斜体 (*italic*)
  if (schema.marks.em) {
    rules.push(createMarkInputRule(/(?:^|[^*])(\*([^*]+)\*)$/, schema.marks.em));
  }

  // 11. 行内删除线 (~~strike~~)
  if (schema.marks.strike) {
    rules.push(createMarkInputRule(/~~([^~]+)~~$/, schema.marks.strike));
  }

  // 12. 行内代码 (`code`)
  if (schema.marks.code) {
    rules.push(createMarkInputRule(/(?:^|[^`])(`([^`]+)`)$/, schema.marks.code));
  }

  return inputRules({ rules });
}
