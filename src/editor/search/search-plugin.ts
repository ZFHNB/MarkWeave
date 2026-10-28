import { Plugin, PluginKey, TextSelection, type EditorState } from "prosemirror-state";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";

/**
 * 查找与替换（对标 Typora 的 Find / Find and Replace）。
 * 支持大小写、全字、正则；`n/N` 计数；上一个/下一个；单个替换与全部替换。
 */

export interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}

export interface SearchMatch {
  from: number;
  to: number;
}

export const searchKey = new PluginKey<DecorationSet>("markweave-search");

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildPattern(query: string, options: SearchOptions): RegExp | null {
  if (!query) return null;
  let source = options.regex ? query : escapeRegExp(query);
  if (options.wholeWord) source = `\\b(?:${source})\\b`;
  const flags = options.caseSensitive ? "g" : "gi";
  try {
    return new RegExp(source, flags);
  } catch {
    return null;
  }
}

/** 只搜索普通文本节点，跳过代码块以外仍会命中的场景由调用方决定 */
function collectTextRanges(doc: PMNode): { from: number; to: number; text: string }[] {
  const ranges: { from: number; to: number; text: string }[] = [];
  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      ranges.push({ from: pos, to: pos + node.text.length, text: node.text });
    }
    return true;
  });
  return ranges;
}

export function findMatches(doc: PMNode, query: string, options: SearchOptions): SearchMatch[] {
  const pattern = buildPattern(query, options);
  if (!pattern) return [];

  const matches: SearchMatch[] = [];
  for (const range of collectTextRanges(doc)) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(range.text)) !== null) {
      if (match[0].length === 0) {
        pattern.lastIndex++;
        continue;
      }
      matches.push({ from: range.from + match.index, to: range.from + match.index + match[0].length });
    }
  }
  return matches;
}

export function buildSearchDecorations(
  doc: PMNode,
  matches: SearchMatch[],
  activeIndex: number
): DecorationSet {
  if (matches.length === 0) return DecorationSet.empty;
  const decorations = matches.map((match, index) =>
    Decoration.inline(match.from, match.to, {
      class: index === activeIndex ? "md-search-match is-current" : "md-search-match",
    })
  );
  return DecorationSet.create(doc, decorations);
}

export interface SearchController {
  setQuery(query: string): void;
  setOptions(options: SearchOptions): void;
  next(): void;
  previous(): void;
  replaceCurrent(replacement: string): void;
  replaceAll(replacement: string): void;
  getMatchInfo(): { index: number; total: number };
  close(): void;
  getOptions(): SearchOptions;
}

export class SearchSession implements SearchController {
  private view: EditorView;
  private query = "";
  private options: SearchOptions = { caseSensitive: false, wholeWord: false, regex: false };
  private matches: SearchMatch[] = [];
  private activeIndex = 0;
  private onChange: () => void;

  constructor(view: EditorView, onChange: () => void = () => {}) {
    this.view = view;
    this.onChange = onChange;
  }

  getOptions(): SearchOptions {
    return { ...this.options };
  }

  setOptions(options: SearchOptions): void {
    this.options = { ...options };
    this.refresh(true);
  }

  setQuery(query: string): void {
    this.query = query;
    this.refresh(true);
  }

  private refresh(resetIndex: boolean): void {
    this.matches = findMatches(this.view.state.doc, this.query, this.options);
    if (resetIndex || this.activeIndex >= this.matches.length) this.activeIndex = 0;
    if (this.matches.length > 0) this.scrollToActive();
    this.dispatchDecorations();
    this.onChange();
  }

  private dispatchDecorations(): void {
    const tr = this.view.state.tr.setMeta(searchKey, {
      matches: this.matches,
      activeIndex: this.activeIndex,
    });
    this.view.dispatch(tr);
  }

  private scrollToActive(): void {
    const match = this.matches[this.activeIndex];
    if (!match) return;
    const view = this.view;
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, match.from, match.to)).scrollIntoView()
    );
  }

  next(): void {
    if (this.matches.length === 0) return;
    this.activeIndex = (this.activeIndex + 1) % this.matches.length;
    this.scrollToActive();
    this.dispatchDecorations();
    this.onChange();
  }

  previous(): void {
    if (this.matches.length === 0) return;
    this.activeIndex = (this.activeIndex - 1 + this.matches.length) % this.matches.length;
    this.scrollToActive();
    this.dispatchDecorations();
    this.onChange();
  }

  replaceCurrent(replacement: string): void {
    const match = this.matches[this.activeIndex];
    if (!match) return;
    const tr = this.view.state.tr.insertText(replacement, match.from, match.to);
    this.view.dispatch(tr);
    this.matches = findMatches(this.view.state.doc, this.query, this.options);
    if (this.activeIndex >= this.matches.length) this.activeIndex = 0;
    if (this.matches.length > 0) this.scrollToActive();
    this.dispatchDecorations();
    this.onChange();
  }

  replaceAll(replacement: string): void {
    if (this.matches.length === 0) return;
    let tr = this.view.state.tr;
    // 从后往前替换，避免位置偏移
    for (let i = this.matches.length - 1; i >= 0; i--) {
      const match = this.matches[i];
      tr = tr.insertText(replacement, match.from, match.to);
    }
    this.view.dispatch(tr);
    this.matches = findMatches(this.view.state.doc, this.query, this.options);
    this.activeIndex = 0;
    this.dispatchDecorations();
    this.onChange();
  }

  getMatchInfo(): { index: number; total: number } {
    return { index: this.matches.length === 0 ? 0 : this.activeIndex + 1, total: this.matches.length };
  }

  close(): void {
    this.matches = [];
    this.activeIndex = 0;
    this.view.dispatch(this.view.state.tr.setMeta(searchKey, { matches: [], activeIndex: 0 }));
    this.onChange();
  }
}

export function createSearchPlugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: searchKey,
    state: {
      init(): DecorationSet {
        return DecorationSet.empty;
      },
      apply(tr, oldSet, _oldState, newState): DecorationSet {
        const meta = tr.getMeta(searchKey) as
          | { matches: SearchMatch[]; activeIndex: number }
          | undefined;
        if (meta) {
          return buildSearchDecorations(newState.doc, meta.matches, meta.activeIndex);
        }
        if (tr.docChanged) {
          return oldSet.map(tr.mapping, tr.doc);
        }
        return oldSet;
      },
    },
    props: {
      decorations(state): DecorationSet {
        return searchKey.getState(state) ?? DecorationSet.empty;
      },
    },
  });
}

export function getSearchState(state: EditorState): DecorationSet {
  return searchKey.getState(state) ?? DecorationSet.empty;
}
