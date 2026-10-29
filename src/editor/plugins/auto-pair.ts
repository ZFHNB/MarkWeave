import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

export const autoPairKey = new PluginKey("auto-pair");

/**
 * 自动配对括号与引号（对标 Typora 的 Auto Pair），以及智能标点。
 */
export interface AutoPairOptions {
  isEnabled: () => boolean;
  smartPunctuation?: () => boolean;
}

const PAIRS: Record<string, string> = {
  "(": ")",
  "[": "]",
  "{": "}",
  "'": "'",
  '"': '"',
};

function charAt(view: EditorView, pos: number): string {
  const size = view.state.doc.content.size;
  if (pos < 0 || pos >= size) return "";
  return view.state.doc.textBetween(pos, pos + 1, "", "");
}

export function createAutoPairPlugin(options: AutoPairOptions): Plugin {
  return new Plugin({
    key: autoPairKey,
    props: {
      handleTextInput(view, from, to, text) {
        // 智能标点：连续输入三个短横线时合并为长横线
        if (options.smartPunctuation?.() && text === "-" && from === to) {
          const twoBefore = view.state.doc.textBetween(Math.max(0, from - 2), from, "", "");
          if (twoBefore === "--") {
            const tr = view.state.tr.insertText("—", from - 2, from);
            tr.setSelection(TextSelection.create(tr.doc, from - 1));
            view.dispatch(tr);
            return true;
          }
          return false;
        }

        if (!options.isEnabled()) return false;

        const close = PAIRS[text];
        if (!close) return false;

        if (from !== to) return false;

        const tr = view.state.tr.insertText(text + close, from, to);
        tr.setSelection(TextSelection.create(tr.doc, from + 1));
        view.dispatch(tr);
        return true;
      },
      handleKeyDown(view, event) {
        if (!options.isEnabled()) return false;
        if (event.key !== "Backspace") return false;

        const { from, empty } = view.state.selection;
        if (!empty || from < 1) return false;

        const before = charAt(view, from - 1);
        const after = charAt(view, from);
        if (PAIRS[before] && PAIRS[before] === after) {
          view.dispatch(view.state.tr.delete(from - 1, from + 1));
          return true;
        }
        return false;
      },
    },
  });
}
