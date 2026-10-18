import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

export const syntaxFoldingKey = new PluginKey("syntaxFolding");

/**
 * Typora 核心机制：光标驱动的语法折叠与显现插件 (Inline Syntax Folding)
 * 1. 块级语法符号（标题的 # 符号、引用的 > 符号）在失焦时隐藏或弱化，光标进入段落时显现
 * 2. 行内样式符号（加粗 **、斜体 *、删除线 ~~、行内代码 `、链接 []()）在光标离开时折叠，进入时展开
 */
export function createSyntaxFoldingPlugin() {
  return new Plugin({
    key: syntaxFoldingKey,
    state: {
      init(_, { doc }) {
        return DecorationSet.create(doc, []);
      },
      apply(tr, oldSet, oldState, newState) {
        if (!tr.docChanged && oldState.selection.eq(newState.selection)) {
          return oldSet;
        }

        const { selection, doc } = newState;
        const decorations: Decoration[] = [];
        const { from: cursorFrom, to: cursorTo } = selection;

        // 1. 遍历块级节点（处理标题 # 标记与聚焦高亮）
        doc.descendants((node, pos) => {
          const nodeEnd = pos + node.nodeSize;
          const isCursorInBlock = cursorFrom >= pos && cursorTo <= nodeEnd;

          // 块级当前行聚焦高亮标识 (Typora .onfocus)
          if (node.isBlock && isCursorInBlock) {
            decorations.push(
              Decoration.node(pos, nodeEnd, {
                class: "md-focus-block",
              })
            );
          }

          // 标题节点语法显隐
          if (node.type.name === "heading") {
            const level = node.attrs.level || 1;
            const prefixText = "#".repeat(level) + " ";
            const widget = document.createElement("span");
            widget.className = `md-meta md-heading-mark ${isCursorInBlock ? "md-visible" : "md-hidden"}`;
            widget.textContent = prefixText;
            widget.setAttribute("contenteditable", "false");

            // 在标题起始位置插入 Widget 标记
            decorations.push(
              Decoration.widget(pos + 1, widget, {
                side: -1,
                stopEvent: () => false,
              })
            );
          }
        });

        // 2. 遍历行内节点并动态生成前后语法装饰器
        doc.descendants((node, pos) => {
          if (!node.isText) return;

          node.marks.forEach((mark) => {
            const markName = mark.type.name;
            const startPos = pos;
            const endPos = pos + node.nodeSize;
            const isCursorNear = cursorFrom <= endPos + 1 && cursorTo >= startPos - 1;

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
              case "link":
                prefix = "[";
                suffix = `](${mark.attrs.href})`;
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
      },
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
  });
}
