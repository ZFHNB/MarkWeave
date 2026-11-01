import { EditorState, TextSelection, Selection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";
import { history, undo, redo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { baseKeymap, toggleMark, setBlockType, wrapIn } from "prosemirror-commands";
import { splitListItem, liftListItem, sinkListItem } from "prosemirror-schema-list";

import { schema } from "./schema";
import { createSyntaxFoldingPlugin } from "./plugins/syntax-folding";
import { createCodeHighlightPlugin } from "./code/highlight-plugin";
import { buildInputRules } from "./plugins/input-rules";
import { CodeBlockView } from "./nodeviews/code-block";
import { MathBlockView } from "./nodeviews/math-block";
import { TaskItemView } from "./nodeviews/task-item";
import { TocView } from "./nodeviews/toc";
import { YamlFrontmatterView } from "./nodeviews/yaml-frontmatter";
import { createFootnoteHoverPlugin } from "./plugins/footnote-hover";
import { createEmojiAutocompletePlugin } from "./plugins/emoji-autocomplete";
import { createSearchPlugin } from "./search/search-plugin";
import { SearchPanel } from "./search/search-panel";
import { ContextMenu } from "./context-menu";
import { createTypewriterPlugin } from "./plugins/typewriter";
import { createImagePlugin } from "./plugins/images";
import { createAutoPairPlugin } from "./plugins/auto-pair";
import { createCodeIndentPlugin } from "./plugins/code-indent";
import { createBlockDragPlugin } from "./plugins/block-drag";
import { createImageResolvePlugin } from "./plugins/image-resolve";
import { ImageView } from "./nodeviews/image";
import {
  jumpToTop,
  jumpToBottom,
  selectBlock,
  deleteBlock,
  selectLine,
  increaseHeadingLevel,
  decreaseHeadingLevel,
  clearFormatting,
  toggleTaskStatus,
} from "./commands/editing";
import { markdownToDoc, docToMarkdown } from "./serializer/markdown";
import { extractHeadings, type HeadingItem } from "./outline";
import { computeStats } from "./stats";
import { tableEditing, addRowAfter, deleteRow } from "prosemirror-tables";
import {
  insertTable,
  goToNextCellOrAppendRow,
  ensureTrailingParagraphNode,
  createTrailingParagraphPlugin,
  exitTerminalBlock,
} from "./table/commands";
import { createTableToolbarPlugin } from "./table/table-toolbar";
import { createTablePastePlugin } from "./plugins/paste-table";
import { createMarkdownPastePlugin } from "./plugins/paste-markdown";

export interface EditorOptions {
  mountEl: HTMLElement;
  initialMarkdown?: string;
  onDocChange?: (markdown: string) => void;
  onOutlineChange?: (headings: HeadingItem[]) => void;
  onWordCountChange?: (stats: { words: number; chars: number; lines: number }) => void;
  isTypewriterEnabled?: () => boolean;
  isAutoPairEnabled?: () => boolean;
  isSmartPunctuationEnabled?: () => boolean;
  getIndentSize?: () => number;
  onSelectionChange?: (cursorPos: number) => void;
  getDocumentPath?: () => string | null;
  isDesktop?: () => boolean;
}

export class MarkWeaveEditor {
  private view: EditorView;
  private options: EditorOptions;

  private createState(doc: PMNode): EditorState {
    const safeDoc = ensureTrailingParagraphNode(doc);
    const customKeymap = keymap({
      "Mod-z": undo,
      "Mod-y": redo,
      "Shift-Mod-z": redo,
      "Mod-b": toggleMark(schema.marks.strong),
      "Mod-i": toggleMark(schema.marks.em),
      "Mod-`": toggleMark(schema.marks.code),
      "Mod-1": setBlockType(schema.nodes.heading, { level: 1 }),
      "Mod-2": setBlockType(schema.nodes.heading, { level: 2 }),
      "Mod-3": setBlockType(schema.nodes.heading, { level: 3 }),
      "Mod-4": setBlockType(schema.nodes.heading, { level: 4 }),
      "Mod-5": setBlockType(schema.nodes.heading, { level: 5 }),
      "Mod-6": setBlockType(schema.nodes.heading, { level: 6 }),
      "Mod-0": setBlockType(schema.nodes.paragraph),
      "Mod-q": wrapIn(schema.nodes.blockquote),
      // 代码块/公式块内的回车始终在块内换行（与 Typora 一致）；
      // 退出块使用方向键或鼠标点击，避免末行回车时意外跳出
      Enter: splitListItem(schema.nodes.list_item),
      ArrowDown: exitTerminalBlock("down"),
      ArrowRight: exitTerminalBlock("right"),
      "Mod-[": liftListItem(schema.nodes.list_item),
      "Mod-]": sinkListItem(schema.nodes.list_item),
      Tab: goToNextCellOrAppendRow(1),
      "Shift-Tab": goToNextCellOrAppendRow(-1),
      "Ctrl-Enter": addRowAfter,
      "Mod-Enter": addRowAfter,
      "Ctrl-Shift-Backspace": deleteRow,
      "Mod-shift-Backspace": deleteRow,
      "Mod-Shift-Backspace": deleteRow,
      "Mod-Alt-1": increaseHeadingLevel,
      "Mod-Alt-2": decreaseHeadingLevel,
      "Mod-Shift-k": deleteBlock,
      "Mod-Shift-l": selectLine,
      "Mod-Shift-b": selectBlock,
      "Mod-Shift-\\": clearFormatting,
      "Mod-Shift-x": toggleTaskStatus,
      "Ctrl-Home": jumpToTop,
      "Ctrl-End": jumpToBottom,
    });

    return EditorState.create({
      doc: safeDoc,
      plugins: [
        history(),
        // Emoji 补全必须先于基础 keymap，否则 Enter/Escape 会被默认命令先消费
        createEmojiAutocompletePlugin(),
        customKeymap,
        keymap(baseKeymap),
        buildInputRules(schema),
        createSyntaxFoldingPlugin(),
        createCodeHighlightPlugin(),
        tableEditing(),
        createTrailingParagraphPlugin(),
        createTableToolbarPlugin(),
        createTablePastePlugin(),
        createMarkdownPastePlugin(),
        createFootnoteHoverPlugin(),
        createSearchPlugin(),
        createImagePlugin(),
        createAutoPairPlugin({
          isEnabled: () => this.options.isAutoPairEnabled?.() ?? true,
          smartPunctuation: () => this.options.isSmartPunctuationEnabled?.() ?? true,
        }),
        createCodeIndentPlugin({
          getIndentSize: () => this.options.getIndentSize?.() ?? 2,
        }),
        createImageResolvePlugin({
          getDocumentPath: () => this.options.getDocumentPath?.() ?? null,
          getRootUrl: () => null,
          isDesktop: () => this.options.isDesktop?.() ?? false,
        }),
        createBlockDragPlugin(),
        createTypewriterPlugin({
          isEnabled: () => this.options.isTypewriterEnabled?.() ?? false,
        }),
      ],
    });
  }

  constructor(options: EditorOptions) {
    this.options = options;

    const initialDoc = options.initialMarkdown
      ? markdownToDoc(options.initialMarkdown, schema)
      : schema.node("doc", null, [schema.node("paragraph", null, [])]);

    const state = this.createState(initialDoc);

    this.view = new EditorView(options.mountEl, {
      state,
      nodeViews: {
        code_block: (node, view, getPos) => new CodeBlockView(node, view, getPos),
        math_block: (node, view, getPos) => new MathBlockView(node, view, getPos),
        task_item: (node, view, getPos) => new TaskItemView(node, view, getPos),
        toc_block: (node, view, getPos) => new TocView(node, view, getPos),
        yaml_frontmatter: (node, view, getPos) => new YamlFrontmatterView(node, view, getPos),
        image: (node, view, getPos) => new ImageView(node, view, getPos),
      },
      dispatchTransaction: (tr) => {
        const newState = this.view.state.apply(tr);
        this.view.updateState(newState);

        if (tr.docChanged) {
          const md = this.getMarkdown();
          this.options.onDocChange?.(md);
          this.options.onOutlineChange?.(this.getHeadings());
          this.updateStats();
        }
        if (tr.docChanged || tr.selectionSet) {
          this.options.onSelectionChange?.(this.view.state.selection.from);
        }
      },
    });

    this.contextMenu = new ContextMenu(this, this.view);

    // 初始通知
    setTimeout(() => {
      this.options.onOutlineChange?.(this.getHeadings());
      this.updateStats();
    }, 0);
  }

  public getMarkdown(): string {
    return docToMarkdown(this.view.state.doc);
  }

  /** 只读文档快照，供导出/复制等多格式序列化使用 */
  public getDocument(): PMNode {
    return this.view.state.doc;
  }

  /** 当前光标位置（用于大纲同步高亮） */
  public getCursorPosition(): number {
    return this.view.state.selection.from;
  }

  /**
   * 光标所在的顶层块序号（从 0 开始）。
   * 源码视图切换到编辑视图时，用它把滚动位置对齐到同一块。
   */
  public getCursorBlockIndex(): number {
    const { $head } = this.view.state.selection;
    return $head.depth > 0 ? Math.min($head.index(0), this.view.state.doc.childCount - 1) : 0;
  }

  /** 顶层块总数，供源码行号映射使用 */
  public getBlockCount(): number {
    return this.view.state.doc.childCount;
  }

  /** 光标所在顶层块的纯文本（用于在源码中定位该块） */
  public getCursorBlockText(): string {
    const doc = this.view.state.doc;
    const index = this.getCursorBlockIndex();
    if (doc.childCount === 0) return "";
    return doc.child(index).textContent;
  }

  /** 指定位置所在顶层块的纯文本 */
  public getBlockTextAt(pos: number): string {
    const doc = this.view.state.doc;
    const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
    const index = Math.min($pos.index(0), doc.childCount - 1);
    return doc.child(index).textContent;
  }

  /** 滚动容器当前滚动位置与可视高度（用于两视图位置同步） */
  public getScrollMetrics(): { top: number; height: number; scrollHeight: number } {
    const scroller = this.view.dom.closest(".ty-editor-scroller") as HTMLElement | null;
    if (!scroller) return { top: 0, height: 0, scrollHeight: 0 };
    return {
      top: scroller.scrollTop,
      height: scroller.clientHeight,
      scrollHeight: scroller.scrollHeight,
    };
  }

  /** 把滚动容器定位到指定顶层块，使该块出现在可视区上部三分之一处 */
  public scrollToBlockIndex(index: number): void {
    const doc = this.view.state.doc;
    if (doc.childCount === 0) return;

    const clamped = Math.min(Math.max(0, index), doc.childCount - 1);
    let offset = 0;
    for (let i = 0; i < clamped; i++) offset += doc.child(i).nodeSize;

    const dom = this.view.nodeDOM(offset);
    const scroller = this.view.dom.closest(".ty-editor-scroller") as HTMLElement | null;
    if (!(dom instanceof HTMLElement) || !scroller) return;

    const domRect = dom.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    const relativeTop = domRect.top - scrollerRect.top + scroller.scrollTop;
    scroller.scrollTop = Math.max(0, relativeTop - scroller.clientHeight / 3);
  }

  /** 当前选区文本；无选区时返回空串 */
  public getSelectionText(): string {
    const { from, to, empty } = this.view.state.selection;
    if (empty) return "";
    return this.view.state.doc.textBetween(from, to, "\n");
  }

  public setMarkdown(markdownText: string, options?: { resetHistory?: boolean }) {
    const newDoc = markdownToDoc(markdownText, schema);
    if (options?.resetHistory) {
      const newState = this.createState(newDoc);
      this.view.updateState(newState);
      this.options.onOutlineChange?.(this.getHeadings());
      this.updateStats();
    } else {
      // 尽量保留原光标位置：按文档比例映射，避免切视图后跳回开头
      const oldSize = this.view.state.doc.content.size;
      const oldPos = this.view.state.selection.from;
      const ratio = oldSize > 0 ? oldPos / oldSize : 0;

      let tr = this.view.state.tr.replaceWith(0, oldSize, newDoc.content);
      const target = Math.max(1, Math.min(Math.round(ratio * tr.doc.content.size), tr.doc.content.size));
      tr = tr.setSelection(TextSelection.near(tr.doc.resolve(target), 1));
      this.view.dispatch(tr);
    }
  }

  /**
   * 把光标放到指定顶层块的开头（用于源码视图切回时恢复位置）。
   * 块序号越界时钳制到有效范围。
   */
  public setCursorToBlock(index: number) {
    const doc = this.view.state.doc;
    if (doc.childCount === 0) return;

    const clamped = Math.min(Math.max(0, index), doc.childCount - 1);
    let offset = 0;
    for (let i = 0; i < clamped; i++) offset += doc.child(i).nodeSize;

    const target = Math.min(offset + 1, doc.content.size);
    const tr = this.view.state.tr.setSelection(TextSelection.near(doc.resolve(target), 1));
    this.view.dispatch(tr);
  }

  public getHeadings(): HeadingItem[] {
    return extractHeadings(this.view.state.doc);
  }

  public scrollToHeading(pos: number) {
    let targetEl: HTMLElement | null = null;
    try {
      const dom = this.view.nodeDOM(pos);
      if (dom && dom instanceof HTMLElement) {
        targetEl = dom;
      } else {
        const domPos = this.view.domAtPos(pos);
        targetEl = (domPos.node.nodeType === Node.TEXT_NODE ? domPos.node.parentElement : domPos.node) as HTMLElement;
      }

      if (targetEl && targetEl.scrollIntoView) {
        targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
      }

      const doc = this.view.state.doc;
      const targetPos = Math.min(pos + 1, doc.content.size);
      const tr = this.view.state.tr.setSelection(TextSelection.create(doc, targetPos));
      this.view.dispatch(tr);
    } catch (err) {
      console.warn("Failed to scroll to heading:", err);
    }
    this.view.focus();
  }

  private updateStats() {
    const stats = computeStats(this.getMarkdown());
    this.options.onWordCountChange?.(stats);
  }

  public insertTable(rows: number, cols: number) {
    const cmd = insertTable(rows, cols);
    cmd(this.view.state, this.view.dispatch);
    this.view.focus();
  }

  public focusStart() {
    const tr = this.view.state.tr.setSelection(Selection.atStart(this.view.state.doc));
    this.view.dispatch(tr);
    this.view.focus();
  }

  public focus() {
    this.view.focus();
  }

  /** 让编辑器失焦：语法符号随之折叠为解析后的纯净排版 */
  public blur() {
    (this.view.dom as HTMLElement).blur();
  }

  private searchPanel: SearchPanel | null = null;
  private contextMenu: ContextMenu | null = null;

  /** 打开查找/替换面板（对标 Typora 的 Ctrl+F / Ctrl+H） */
  public openSearch(replaceMode = false) {
    if (!this.searchPanel) {
      this.searchPanel = new SearchPanel(this.view);
    }
    this.searchPanel.open(replaceMode);
  }

  public closeSearch() {
    this.searchPanel?.close();
  }

  public toggleSearch(replaceMode = false) {
    if (this.searchPanel?.isOpen()) {
      this.searchPanel.close();
    } else {
      this.openSearch(replaceMode);
    }
  }

  public getSearchPanel(): SearchPanel | null {
    return this.searchPanel;
  }

  public destroy() {
    this.contextMenu?.destroy();
    this.searchPanel?.destroy();
    this.view.destroy();
  }
}

export const TypemarkEditor = MarkWeaveEditor;
export type TypemarkEditor = MarkWeaveEditor;
