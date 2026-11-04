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
import { createImageResolvePlugin, resolveImageSrc } from "./plugins/image-resolve";
import { ImageView } from "./nodeviews/image";
import {
  jumpToTop,
  jumpToBottom,
  selectBlock,
  increaseHeadingLevel,
  decreaseHeadingLevel,
  clearFormatting,
  toggleTaskStatus,
  insertBlockAfterCurrent,
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
  /**
   * 图片落盘：返回写进 Markdown 的 src（通常是 `attachments/x.png`）。
   * 返回 null 时退回 data URL 内联。
   */
  persistImage?: (file: File) => Promise<string | null>;
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
      // 注意：Mod-Shift+<字母> 的组合在 Electron 里会先被原生菜单的
      // accelerator 截走（见 electron/menu.cjs），生效的是菜单那一项。
      // 这里保留绑定，是为了 Web 版和没有原生菜单的场景。
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
        createImagePlugin({
          // 注意：这里写进 Markdown 的必须是相对路径或 data URL，
          // 不能是 file:// 绝对路径——否则文档一换机器就全裂图。
          persistFile: (file) => this.options.persistImage?.(file) ?? Promise.resolve(null),
        }),
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
        image: (node, view, getPos) =>
          new ImageView(node, view, getPos, {
            // 相对路径在编辑器里要能显示出来：解析成 file:// 只影响 DOM，
            // Markdown 里存的仍然是原始的相对路径。
            resolveSrc: (src) =>
              resolveImageSrc(
                src,
                this.options.getDocumentPath?.() ?? null,
                null,
                this.options.isDesktop?.() ?? false
              ),
          }),
      },
      dispatchTransaction: (tr) => {
        const newState = this.view.state.apply(tr);
        this.view.updateState(newState);

        if (tr.docChanged) {
          // 序列化是这条链路上最贵的一步，每次输入只做一次并复用
          const md = this.getMarkdown();
          this.options.onDocChange?.(md);

          // 统计与大纲对实时性要求不高，合并到空闲时统一刷新。
          // 大文档下逐键重算会明显拖慢输入。
          this.scheduleDerivedRefresh(md);
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

  /**
   * 把指定顶层块滚到可视区顶部。
   *
   * 与 scrollToBlockIndex 的区别：这里不做「上部三分之一」的偏移，
   * 也不移动光标——视图切换时用户只该看到同一段文字出现在同一位置。
   */
  public scrollBlockToTop(index: number): void {
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
    scroller.scrollTop = Math.max(0, relativeTop);
  }

  /**
   * 视口顶部第一个可见的顶层块——「用户此刻在读哪一段」的锚点。
   *
   * 视图切换时用它而不是光标：光标可能停在视口外的某一行，
   * 按光标同步会让用户丢失阅读位置。返回 null 表示取不到可信值。
   */
  public getTopVisibleBlock(): { index: number; text: string } | null {
    const doc = this.view.state.doc;
    if (doc.childCount === 0) return null;

    const scroller = this.view.dom.closest(".ty-editor-scroller") as HTMLElement | null;
    if (!scroller) return null;

    const scrollerRect = scroller.getBoundingClientRect();
    let offset = 0;
    let best: { index: number; text: string; top: number } | null = null;

    for (let i = 0; i < doc.childCount; i++) {
      const node = doc.child(i);
      const dom = this.view.nodeDOM(offset);
      offset += node.nodeSize;
      if (!(dom instanceof HTMLElement)) continue;

      const rect = dom.getBoundingClientRect();
      // 块底边还在视口顶部之上：完全滚过去了，继续找
      if (rect.bottom <= scrollerRect.top + 1) continue;

      const text = node.textContent.replace(/\s+/g, " ").trim();
      // 空块（分隔线、占位段落等）读不出文字，不能当锚点
      if (!text) {
        // 但它是第一个可见块时仍要记住，供兜底使用
        if (!best) best = { index: i, text: "", top: rect.top - scrollerRect.top };
        continue;
      }
      best = { index: i, text, top: rect.top - scrollerRect.top };
      break;
    }

    return best ? { index: best.index, text: best.text } : null;
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
  public setCursorToBlock(index: number, inlineOffset = 0) {
    const doc = this.view.state.doc;
    if (doc.childCount === 0) return;

    const clamped = Math.min(Math.max(0, index), doc.childCount - 1);
    let offset = 0;
    for (let i = 0; i < clamped; i++) offset += doc.child(i).nodeSize;

    const block = doc.child(clamped);
    // 块内相对偏移钳制到块内容长度内，保证光标落在同一块的同一位置附近
    const inner = Math.min(Math.max(0, inlineOffset), Math.max(0, block.content.size));
    const target = Math.min(offset + 1 + inner, doc.content.size);

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

  /**
   * 更新字数统计。
   * `markdown` 可由调用方传入已序列化的结果，避免重复遍历整篇文档。
   */
  private updateStats(markdown?: string) {
    const stats = computeStats(markdown ?? this.getMarkdown());
    this.options.onWordCountChange?.(stats);
  }

  /** 派生数据（大纲、字数）的刷新句柄 */
  private derivedTimer: ReturnType<typeof setTimeout> | null = null;

  /** 合并连续的文档变更，空闲后再重建大纲与字数统计 */
  private scheduleDerivedRefresh(markdown: string) {
    if (this.derivedTimer) clearTimeout(this.derivedTimer);
    this.derivedTimer = setTimeout(() => {
      this.derivedTimer = null;
      this.options.onOutlineChange?.(this.getHeadings());
      this.updateStats(markdown);
    }, 200);
  }

  public insertTable(rows: number, cols: number) {
    const cmd = insertTable(rows, cols);
    cmd(this.view.state, this.view.dispatch);
    this.view.focus();
  }

  /**
   * 在当前块之后插入一个新块并把光标放进去。
   *
   * 用于菜单里的「插入代码块 / 公式块」——它们对应 Typora 的
   * Ctrl+Shift+K / Ctrl+Shift+M，用户期望是「新建一个块」，而不是
   * 把当前段落转换掉。
   */
  private runInsertBlock(node: PMNode): void {
    if (insertBlockAfterCurrent(node)(this.view.state, this.view.dispatch)) {
      this.view.focus();
    }
  }

  /** 插入一个代码块（语言留空，由块上的语言下拉选择） */
  public insertCodeBlock(language = ""): void {
    this.runInsertBlock(schema.nodes.code_block.create({ params: language }));
  }

  /** 插入一个空的公式块 */
  public insertMathBlock(formula = ""): void {
    this.runInsertBlock(schema.nodes.math_block.create({ formula }));
  }

  /** 插入图片节点；src 由调用方决定（data URL 或相对路径） */
  public insertImage(src: string, alt = "", title: string | null = null): void {
    const node = schema.nodes.image.create({ src, alt, title });
    this.view.dispatch(this.view.state.tr.replaceSelectionWith(node).scrollIntoView());
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
    if (this.derivedTimer) {
      clearTimeout(this.derivedTimer);
      this.derivedTimer = null;
    }
    this.contextMenu?.destroy();
    this.searchPanel?.destroy();
    this.view.destroy();
  }
}
