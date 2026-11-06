import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";
import { tokenizeCode } from "./highlight";
import { normalizeLanguage } from "./languages";

export const codeHighlightKey = new PluginKey<DecorationSet>("codeHighlight");

function buildDecorations(doc: PMNode): DecorationSet {
  const decorations: Decoration[] = [];
  try {
    doc.descendants((node, pos) => {
      if (node.type.name === "code_block") {
        const rawParams = node.attrs.params || "";
        const lang = normalizeLanguage(rawParams);
        if (!lang || lang === "mermaid" || lang === "plaintext") {
          return false;
        }

        const code = node.textContent;
        if (!code) {
          return false;
        }

        const tokens = tokenizeCode(code, lang);
        for (const token of tokens) {
          if (token.start < token.end && token.classes.length > 0) {
            decorations.push(
              Decoration.inline(pos + 1 + token.start, pos + 1 + token.end, {
                class: `hljs ${token.classes.join(" ")}`,
              })
            );
          }
        }
        return false;
      }
      return true;
    });

    return DecorationSet.create(doc, decorations);
  } catch (err) {
    console.error("Failed to build code decorations:", err);
    return DecorationSet.empty;
  }
}

export function createCodeHighlightPlugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: codeHighlightKey,
    state: {
      init(_, state): DecorationSet {
        return buildDecorations(state.doc);
      },
      apply(tr, oldSet, _oldState, newState): DecorationSet {
        if (!tr.docChanged) {
          return oldSet;
        }
        return buildDecorations(newState.doc);
      },
    },
    props: {
      decorations(state): DecorationSet {
        return codeHighlightKey.getState(state) ?? DecorationSet.empty;
      },
    },
  });
}
