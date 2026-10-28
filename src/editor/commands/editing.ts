import type { Command, EditorState } from "prosemirror-state";
import { TextSelection, Selection } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import { setBlockType, toggleMark } from "prosemirror-commands";
import { schema } from "../schema";

/** 跳转到文档顶部 */
export const jumpToTop: Command = (state, dispatch) => {
  if (dispatch) {
    const tr = state.tr.setSelection(Selection.atStart(state.doc));
    tr.scrollIntoView();
    dispatch(tr);
  }
  return true;
};

/** 跳转到文档底部 */
export const jumpToBottom: Command = (state, dispatch) => {
  if (dispatch) {
    const tr = state.tr.setSelection(Selection.atEnd(state.doc));
    tr.scrollIntoView();
    dispatch(tr);
  }
  return true;
};

/** 跳转到当前选区（居中滚动） */
export const jumpToSelection: Command = (state, dispatch) => {
  if (dispatch) {
    dispatch(state.tr.scrollIntoView());
  }
  return true;
};

function getBlockRange(state: EditorState): { from: number; to: number } | null {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    const parent = $from.node(depth - 1);
    if (node.isBlock && (parent.type.name === "doc" || parent.type.name === "list_item" || parent.type.name === "blockquote")) {
      return { from: $from.before(depth), to: $from.after(depth) };
    }
  }
  return null;
}

/** 选择当前段落 / 块 */
export const selectBlock: Command = (state, dispatch) => {
  const range = getBlockRange(state);
  if (!range) return false;
  if (dispatch) {
    dispatch(
      state.tr
        .setSelection(TextSelection.create(state.doc, range.from + 1, range.to - 1))
        .scrollIntoView()
    );
  }
  return true;
};

/** 删除当前段落 / 块，并保留一个空段落 */
export const deleteBlock: Command = (state, dispatch) => {
  const { $from } = state.selection;
  let depth = -1;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d - 1).type.name === "doc") {
      depth = d;
      break;
    }
  }
  if (depth === -1) return false;

  const from = $from.before(depth);
  const to = $from.after(depth);
  if (dispatch) {
    const empty = schema.nodes.paragraph.createAndFill();
    const tr = state.tr.replaceWith(from, to, empty ? empty : []);
    tr.setSelection(Selection.atStart(tr.doc));
    dispatch(tr.scrollIntoView());
  }
  return true;
};

/** 选择当前行（按软换行切分） */
export const selectLine: Command = (state, dispatch) => {
  const { $from } = state.selection;
  const start = $from.start();
  const end = $from.end();
  const text = $from.parent.textBetween(0, $from.parent.content.size, "￼", "￼");

  let lineStart = 0;
  let lineEnd = text.length;
  for (let i = $from.parentOffset - 1; i >= 0; i--) {
    if (text[i] === "\n" || text[i] === "￼") {
      lineStart = i + 1;
      break;
    }
  }
  for (let i = $from.parentOffset; i < text.length; i++) {
    if (text[i] === "\n" || text[i] === "￼") {
      lineEnd = i;
      break;
    }
  }

  if (dispatch) {
    dispatch(
      state.tr
        .setSelection(TextSelection.create(state.doc, start + lineStart, Math.min(start + lineEnd, end)))
        .scrollIntoView()
    );
  }
  return true;
};

/** 标题升级（H3 -> H2） */
export const increaseHeadingLevel: Command = (state, dispatch) => {
  const { $from } = state.selection;
  if ($from.parent.type !== schema.nodes.heading) return false;
  const level = $from.parent.attrs.level || 1;
  if (level <= 1) return false;
  return setBlockType(schema.nodes.heading, { level: level - 1 })(state, dispatch);
};

/** 标题降级（H2 -> H3，H6 之后转为段落） */
export const decreaseHeadingLevel: Command = (state, dispatch) => {
  const { $from } = state.selection;
  if ($from.parent.type !== schema.nodes.heading) return false;
  const level = $from.parent.attrs.level || 1;
  if (level >= 6) {
    return setBlockType(schema.nodes.paragraph)(state, dispatch);
  }
  return setBlockType(schema.nodes.heading, { level: level + 1 })(state, dispatch);
};

/** 清除格式：去掉所有行内标记，保留块结构 */
export const clearFormatting: Command = (state, dispatch) => {
  const { from, to, empty } = state.selection;
  if (empty) {
    if (dispatch) {
      dispatch(state.tr.setStoredMarks([]));
    }
    return true;
  }
  if (dispatch) {
    dispatch(state.tr.removeMark(from, to));
  }
  return true;
};

/** 切换任务状态（勾选/取消勾选） */
export const toggleTaskStatus: Command = (state, dispatch) => {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type.name === "task_item") {
      if (dispatch) {
        dispatch(
          state.tr.setNodeMarkup($from.before(d), undefined, {
            ...node.attrs,
            checked: !node.attrs.checked,
          })
        );
      }
      return true;
    }
  }

  // 选区位于任务项内部（task_list > task_item > paragraph）时也允许切换
  for (let d = $from.depth; d > 0; d--) {
    const candidate = $from.node(d);
    if (candidate.type.name === "task_list") {
      const itemIndex = $from.index(d);
      const item = candidate.child(itemIndex);
      if (item && item.type.name === "task_item") {
        if (dispatch) {
          const itemPos = $from.posAtIndex(itemIndex, d);
          dispatch(
            state.tr.setNodeMarkup(itemPos, undefined, {
              ...item.attrs,
              checked: !item.attrs.checked,
            })
          );
        }
        return true;
      }
    }
  }
  return false;
};

/** 批量切换所有行内标记（用于工具栏按钮） */
export function toggleInlineMark(name: string): Command {
  return (state, dispatch) => {
    const mark = schema.marks[name];
    if (!mark) return false;
    return toggleMark(mark)(state, dispatch);
  };
}

/** 提取当前块内的纯文本，供“复制为 Markdown / 纯文本”使用 */
export function getBlockText(state: EditorState): string {
  const range = getBlockRange(state);
  if (!range) return "";
  return state.doc.textBetween(range.from + 1, range.to - 1, "\n");
}

export function getDocumentText(doc: PMNode): string {
  return doc.textBetween(0, doc.content.size, "\n\n");
}
