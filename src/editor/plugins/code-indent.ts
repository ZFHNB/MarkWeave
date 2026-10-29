import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";

export const codeIndentKey = new PluginKey("code-indent");

export interface CodeIndentOptions {
  /** 每次 Tab 插入的空格数（跟随设置项） */
  getIndentSize: () => number;
}

function isCodeBlock(node: PMNode): boolean {
  return node.type.spec.code === true || node.type.name === "code_block";
}

/** 计算选区覆盖的每一行在父节点内的起始偏移 */
function selectedLineStarts(parent: PMNode, fromOffset: number, toOffset: number): number[] {
  const text = parent.textContent;
  const firstLine = text.lastIndexOf("\n", Math.max(0, fromOffset - 1)) + 1;
  const lastLineStart = text.lastIndexOf("\n", Math.max(0, toOffset - 1)) + 1;

  const starts: number[] = [];
  let cursor = firstLine;
  while (cursor <= lastLineStart) {
    starts.push(cursor);
    const next = text.indexOf("\n", cursor);
    if (next < 0) break;
    cursor = next + 1;
  }
  return starts;
}

/**
 * 代码块内的 Tab / Shift-Tab 缩进。
 *
 * ProseMirror 的默认 keymap 在代码块中不处理 Tab，浏览器会直接把焦点移走，
 * 因此这里显式插入缩进空格，并按设置项控制宽度。
 */
export function createCodeIndentPlugin(options: CodeIndentOptions): Plugin {
  return new Plugin({
    key: codeIndentKey,
    props: {
      handleKeyDown(view: EditorView, event: KeyboardEvent) {
        if (event.key !== "Tab") return false;
        if (event.ctrlKey || event.metaKey || event.altKey) return false;

        const { state } = view;
        const { $from, $to } = state.selection;
        if (!isCodeBlock($from.parent) || !$from.sameParent($to)) return false;

        const size = Math.max(1, Math.floor(options.getIndentSize()) || 2);
        const parent = $from.parent;

        if (!event.shiftKey) {
          if (state.selection.empty) {
            view.dispatch(state.tr.insertText(" ".repeat(size)));
            return true;
          }
          // 跨行选区：逐行在行首插入缩进
          let tr = state.tr;
          const starts = selectedLineStarts(parent, $from.parentOffset, $to.parentOffset);
          for (let i = starts.length - 1; i >= 0; i--) {
            tr = tr.insertText(" ".repeat(size), $from.start() + starts[i]);
          }
          view.dispatch(tr);
          return true;
        }

        // Shift-Tab：删除行首至多 size 个空格，或一个制表符
        let tr = state.tr;
        const starts = selectedLineStarts(parent, $from.parentOffset, $to.parentOffset);
        const text = parent.textContent;
        for (let i = starts.length - 1; i >= 0; i--) {
          const startOffset = starts[i];
          const rest = text.slice(startOffset, startOffset + size);
          const removable = rest.startsWith("\t")
            ? 1
            : rest.length - rest.replace(/^ +/, "").length;
          if (removable > 0) {
            tr = tr.delete($from.start() + startOffset, $from.start() + startOffset + removable);
          }
        }
        if (!tr.docChanged) return false;
        view.dispatch(tr);
        return true;
      },
    },
  });
}
