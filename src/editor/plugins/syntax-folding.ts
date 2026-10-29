import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";

export const syntaxFoldingKey = new PluginKey("syntaxFolding");

/**
 * Typora 核心机制：光标驱动的语法折叠与显现插件 (Inline Syntax Folding)
 * 1. 块级语法符号（标题的 # 符号、引用的 > 符号）在失焦时隐藏或弱化，光标进入段落时显现
 * 2. 行内样式符号（加粗 **、斜体 *、删除线 ~~、行内代码 `、链接 []()）在光标离开时折叠，进入时展开
 *
 * 与 Typora 一致：编辑器失去焦点时（例如点击正文左右两侧的空白区域），
 * 所有块都回到“解析后”的纯净排版形态，隐藏 Markdown 标记符号。
 */

export interface SyntaxFoldingOptions {
  /** 编辑器当前是否获得焦点；未提供时始终视为聚焦 */
  isFocused?: () => boolean;
}

export function createSyntaxFoldingPlugin(options: SyntaxFoldingOptions = {}) {
  let focused = true;

  const buildDecorations = (doc: any, selection: { from: number; to: number }): DecorationSet => {
    const decorations: Decoration[] = [];
    const useFolding = focused;
    const cursorFrom = selection.from;
    const cursorTo = selection.to;

    doc.descendants((node: any, pos: number) => {
      const nodeEnd = pos + node.nodeSize;
      const isCursorInBlock = cursorFrom >= pos && cursorTo <= nodeEnd;

      if (node.isBlock && isCursorInBlock && useFolding) {
        decorations.push(
          Decoration.node(pos, nodeEnd, {
            class: "md-focus-block",
          })
        );
      }

      if (node.type.name === "heading") {
        const level = node.attrs.level || 1;
        const prefixText = "#".repeat(level) + " ";
        const widget = document.createElement("span");
        const visible = useFolding && isCursorInBlock;
        widget.className = `md-meta md-heading-mark ${visible ? "md-visible" : "md-hidden"}`;
        widget.textContent = prefixText;
        widget.setAttribute("contenteditable", "false");

        decorations.push(
          Decoration.widget(pos + 1, widget, {
            side: -1,
            stopEvent: () => false,
          })
        );
      }
    });

    doc.descendants((node: any, pos: number) => {
      if (!node.isText) return;

      node.marks.forEach((mark: any) => {
        const markName = mark.type.name;
        const startPos = pos;
        const endPos = pos + node.nodeSize;
        const isCursorNear = useFolding && cursorFrom <= endPos + 1 && cursorTo >= startPos - 1;

        let prefix = "";
        let suffix = "";

        switch (markName) {
          case "strong":
            prefix = "**";
            suffix = "**";
            break;
          case "em":
            prefix = "*";
            suffix = "*";
            break;
          case "strike":
            prefix = "~~";
            suffix = "~~";
            break;
          case "code":
            prefix = "`";
            suffix = "`";
            break;
          case "highlight":
            prefix = "==";
            suffix = "==";
            break;
          case "superscript":
            prefix = "^";
            suffix = "^";
            break;
          case "subscript":
            prefix = "~";
            suffix = "~";
            break;
          case "inline_math":
            prefix = "$";
            suffix = "$";
            break;
          case "link":
            if (mark.attrs.reference) {
              prefix = "[";
              suffix = mark.attrs.referenceCollapsed
                ? "][]"
                : `][${mark.attrs.reference}]`;
            } else {
              prefix = "[";
              suffix = `](${mark.attrs.href})`;
            }
            break;
        }

        if (prefix && suffix) {
          const prefixEl = document.createElement("span");
          prefixEl.className = `md-meta md-inline-mark md-before ${isCursorNear ? "md-visible" : "md-hidden"}`;
          prefixEl.textContent = prefix;
          prefixEl.setAttribute("contenteditable", "false");

          const suffixEl = document.createElement("span");
          suffixEl.className = `md-meta md-inline-mark md-after ${isCursorNear ? "md-visible" : "md-hidden"}`;
          suffixEl.textContent = suffix;
          suffixEl.setAttribute("contenteditable", "false");

          decorations.push(
            Decoration.widget(startPos, prefixEl, { side: -1 }),
            Decoration.widget(endPos, suffixEl, { side: 1 })
          );
        }
      });
    });

    return DecorationSet.create(doc, decorations);
  };

  return new Plugin({
    key: syntaxFoldingKey,
    state: {
      init(_, { doc, selection }) {
        focused = options.isFocused ? options.isFocused() : true;
        return buildDecorations(doc, selection);
      },
      apply(tr, oldSet, oldState, newState) {
        const meta = tr.getMeta(syntaxFoldingKey) as { focused?: boolean } | undefined;
        if (meta && typeof meta.focused === "boolean") {
          focused = meta.focused;
          return buildDecorations(newState.doc, newState.selection);
        }
        if (!tr.docChanged && !tr.selectionSet && oldState.selection.eq(newState.selection)) {
          return oldSet;
        }
        return buildDecorations(newState.doc, newState.selection);
      },
    },
    view(editorView: EditorView) {
      const refresh = (isFocused: boolean) => {
        focused = isFocused;
        // 通过一个空事务触发装饰器重建
        editorView.dispatch(editorView.state.tr.setMeta(syntaxFoldingKey, { focused }));
      };

      const onFocus = () => refresh(true);
      const onBlur = () => {
        if (options.isFocused && options.isFocused()) return;
        refresh(false);
      };

      editorView.dom.addEventListener("focus", onFocus);
      editorView.dom.addEventListener("blur", onBlur);

      return {
        destroy() {
          editorView.dom.removeEventListener("focus", onFocus);
          editorView.dom.removeEventListener("blur", onBlur);
        },
      };
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
  });
}
