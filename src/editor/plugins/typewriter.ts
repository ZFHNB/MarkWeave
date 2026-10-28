import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

/**
 * 打字机模式：光标始终保持在视口垂直中部。
 * 专注模式：由 CSS 处理（当前块高亮 + 其余淡出）。
 */
export const typewriterKey = new PluginKey("typewriter");

export interface TypewriterOptions {
  isEnabled: () => boolean;
}

export function createTypewriterPlugin(options: TypewriterOptions): Plugin {
  return new Plugin({
    key: typewriterKey,
    view(editorView: EditorView) {
      const recenter = () => {
        if (!options.isEnabled()) return;
        const { $head } = editorView.state.selection;
        if (!editorView.dom.contains(editorView.dom.ownerDocument.activeElement)) return;

        try {
          const coords = editorView.coordsAtPos($head.pos);
          const scroller = editorView.dom.closest(".ty-editor-scroller") as HTMLElement | null;
          if (!scroller) return;
          const rect = scroller.getBoundingClientRect();
          const target = rect.top + rect.height / 2;
          const delta = coords.top - target;
          if (Math.abs(delta) > 8) {
            scroller.scrollTop += delta;
          }
        } catch {
          // coordsAtPos can throw during teardown
        }
      };

      const onKeyUp = () => requestAnimationFrame(recenter);
      const onMouseUp = () => requestAnimationFrame(recenter);

      editorView.dom.addEventListener("keyup", onKeyUp);
      editorView.dom.addEventListener("mouseup", onMouseUp);

      return {
        update(view, prevState) {
          if (!prevState.selection.eq(view.state.selection)) {
            requestAnimationFrame(recenter);
          }
        },
        destroy() {
          editorView.dom.removeEventListener("keyup", onKeyUp);
          editorView.dom.removeEventListener("mouseup", onMouseUp);
        },
      };
    },
  });
}
