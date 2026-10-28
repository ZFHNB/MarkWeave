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
import { markdownToDoc, docToMarkdown } from "./serializer/markdown";
import { extractHeadings, type HeadingItem } from "./outline";
import { computeStats } from "./stats";
import { tableEditing, addRowAfter, deleteRow } from "prosemirror-tables";
import {
  insertTable,
  goToNextCellOrAppendRow,
  ensureTrailingParagraphNode,
  createTrailingParagraphPlugin,
} from "./table/commands";
import { createTableToolbarPlugin } from "./table/table-toolbar";
import { createTablePastePlugin } from "./plugins/paste-table";

export interface EditorOptions {
  mountEl: HTMLElement;
  initialMarkdown?: string;
  onDocChange?: (markdown: string) => void;
  onOutlineChange?: (headings: HeadingItem[]) => void;
  onWordCountChange?: (stats: { words: number; chars: number; lines: number }) => void;
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
      Enter: splitListItem(schema.nodes.list_item),
      "Mod-[": liftListItem(schema.nodes.list_item),
      "Mod-]": sinkListItem(schema.nodes.list_item),
      Tab: goToNextCellOrAppendRow(1),
      "Shift-Tab": goToNextCellOrAppendRow(-1),
      "Ctrl-Enter": addRowAfter,
      "Mod-Enter": addRowAfter,
      "Ctrl-Shift-Backspace": deleteRow,
      "Mod-Shift-Backspace": deleteRow,
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
        createFootnoteHoverPlugin(),
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
      },
    });

    // 初始通知
    setTimeout(() => {
      this.options.onOutlineChange?.(this.getHeadings());
      this.updateStats();
    }, 0);
  }

  public getMarkdown(): string {
    return docToMarkdown(this.view.state.doc);
  }

  public setMarkdown(markdownText: string, options?: { resetHistory?: boolean }) {
    const newDoc = markdownToDoc(markdownText, schema);
    if (options?.resetHistory) {
      const newState = this.createState(newDoc);
      this.view.updateState(newState);
      this.options.onOutlineChange?.(this.getHeadings());
      this.updateStats();
    } else {
      let tr = this.view.state.tr.replaceWith(0, this.view.state.doc.content.size, newDoc.content);
      tr = tr.setSelection(Selection.atStart(tr.doc));
      this.view.dispatch(tr);
    }
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

  public destroy() {
    this.view.destroy();
  }
}

export const TypemarkEditor = MarkWeaveEditor;
export type TypemarkEditor = MarkWeaveEditor;
