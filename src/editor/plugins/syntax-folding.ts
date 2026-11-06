import { Plugin, PluginKey } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";

export const syntaxFoldingKey = new PluginKey("syntaxFolding");

/**
 * Typora 核心机制：光标驱动的语法折叠与显现插件 (Inline Syntax Folding)
 * 1. 块级语法符号（标题的 # 符号、引用标记）在折叠态隐藏，光标进入块时显现
 * 2. 行内样式符号（加粗 **、斜体 *、删除线 ~~、行内代码 `、链接 []()）在光标离开时折叠，进入时展开
 *
 * 与 Typora 一致：编辑器失去焦点时（例如点击正文左右两侧的空白区域），
 * 所有块都回到“解析后”的纯净排版形态，隐藏 Markdown 标记符号。
 *
 * 性能：拖拽选区会连续触发选区变化。若每次都遍历整篇文档并新建 DOM，
 * 中等长度文档单次约 30–40ms，拖选明显掉帧。这里按顶层块缓存"折叠态"装饰
 * （与光标位置无关），仅对光标命中的少数块按需重建。
 */

export interface SyntaxFoldingOptions {
  /** 编辑器当前是否获得焦点；未提供时始终视为聚焦 */
  isFocused?: () => boolean;
}

const CAPTION_MARKS: Record<string, [string, string]> = {
  strong: ["**", "**"],
  em: ["*", "*"],
  strike: ["~~", "~~"],
  code: ["`", "`"],
  highlight: ["==", "=="],
  superscript: ["^", "^"],
  subscript: ["~", "~"],
  inline_math: ["$", "$"],
};

function linkMarkers(attrs: Record<string, any>): [string, string] {
  if (attrs.reference) {
    return ["[", attrs.referenceCollapsed ? "][]" : `][${attrs.reference}]`];
  }
  return ["[", `](${attrs.href})`];
}

function metaSpan(className: string, text: string, visible: boolean): HTMLSpanElement {
  const el = document.createElement("span");
  el.className = `${className} ${visible ? "md-visible" : "md-hidden"}`;
  el.textContent = text;
  // 不设 contenteditable="false"：ProseMirror 的 widget 本身已不可编辑，
  // 额外标成 false 会让浏览器把它当成一个"整体对象"，光标无法越过它，
  // 表现为「光标移不到收尾 ** 后面」。
  el.setAttribute("aria-hidden", "true");
  return el;
}

/** 折叠态：整块所有标记都隐藏，结果与光标位置无关，可安全缓存 */
/** 展开态：标题井号常显，行内标记只在光标附近显现 */
function buildExpandedDecorations(
  block: PMNode,
  blockStart: number,
  from: number,
  to: number
): Decoration[] {
  const decorations: Decoration[] = [
    Decoration.node(blockStart, blockStart + block.nodeSize, { class: "md-focus-block" }),
  ];

  block.descendants((node, offset) => {
    const pos = blockStart + 1 + offset;

    if (node.type.name === "heading") {
      const level = node.attrs.level || 1;
      decorations.push(
        Decoration.widget(
          pos + 1,
          metaSpan("md-meta md-heading-mark", `${"#".repeat(level)} `, true),
          { side: -1, stopEvent: () => false }
        )
      );
    }

    if (!node.isText) return;

    for (const mark of node.marks) {
      const markers =
        mark.type.name === "link"
          ? linkMarkers(mark.attrs as Record<string, any>)
          : CAPTION_MARKS[mark.type.name];
      if (!markers) continue;

      const startPos = pos;
      const endPos = pos + node.nodeSize;
      const near = from <= endPos + 1 && to >= startPos - 1;

      // 光标正好停在标记文字的一端时，把该侧的标记隐藏掉。
      // 否则光标会被画在不可编辑 widget 的内侧，看起来像"移不过去"；
      // 与 Typora 一致：光标所在的那一端不需要显示标记。
      const caretAtStart = from === startPos && to === startPos;
      const caretAtEnd = from === endPos && to === endPos;

      decorations.push(
        Decoration.widget(
          startPos,
          metaSpan("md-meta md-inline-mark md-before", markers[0], near && !caretAtStart),
          { side: -1 }
        ),
        Decoration.widget(
          endPos,
          metaSpan("md-meta md-inline-mark md-after", markers[1], near && !caretAtEnd),
          { side: 1 }
        )
      );
    }
  });

  return decorations;
}

export function createSyntaxFoldingPlugin(options: SyntaxFoldingOptions = {}) {
  let focused = true;
  /**
   * 构建装饰集。
   *
   * 只有光标命中的块才会生成装饰（展开态）；其余块折叠态零装饰，
   * 因此这个函数对整篇文档的开销与「命中块数」成正比，而不是文档大小。
   */
  const collect = (doc: PMNode, from: number, to: number): DecorationSet => {
    const useFolding = focused;
    const all: Decoration[] = [];

    doc.forEach((block, offset) => {
      const blockStart = offset;
      const blockEnd = offset + block.nodeSize;
      const touched = useFolding && from <= blockEnd && to >= blockStart;
      if (touched) {
        all.push(...buildExpandedDecorations(block, blockStart, from, to));
      }
    });

    return DecorationSet.create(doc, all);
  };

  return new Plugin({
    key: syntaxFoldingKey,
    state: {
      init(_, { doc, selection }) {
        focused = options.isFocused ? options.isFocused() : true;
        return collect(doc, selection.from, selection.to);
      },
      apply(tr, oldSet, oldState, newState) {
        const meta = tr.getMeta(syntaxFoldingKey) as { focused?: boolean } | undefined;
        const selectionChanged = !oldState.selection.eq(newState.selection);
        const docChanged = tr.docChanged;

        if (meta && typeof meta.focused === "boolean") {
          if (focused === meta.focused && !docChanged && !selectionChanged) return oldSet;
          focused = meta.focused;
          return collect(newState.doc, newState.selection.from, newState.selection.to);
        }

        if (!docChanged && !selectionChanged) return oldSet;

        return collect(newState.doc, newState.selection.from, newState.selection.to);
      },
    },
    view(editorView: EditorView) {
      const refresh = (isFocused: boolean) => {
        focused = isFocused;
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
