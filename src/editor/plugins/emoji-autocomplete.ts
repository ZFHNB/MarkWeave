import { Plugin, PluginKey } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { EMOJI_MAP } from "../serializer/emoji";

/**
 * Emoji 自动补全（Typora 的 ESC / 自动触发行为）。
 * 在当前行末尾检测 `:name` 片段，展示候选列表；Enter / Tab 接受，Esc 关闭。
 */

export const emojiAutocompleteKey = new PluginKey("emoji-autocomplete");

const MAX_SUGGESTIONS = 8;

interface EmojiCandidate {
  name: string;
  emoji: string;
}

let popupEl: HTMLElement | null = null;
let candidates: EmojiCandidate[] = [];
let activeIndex = 0;
let activeView: EditorView | null = null;
let activeRange: { from: number; to: number } | null = null;
// Escape 之后抑制重新弹出，直到用户继续输入新的字符
let suppressed = false;

function ensurePopup(): HTMLElement {
  if (popupEl && document.body.contains(popupEl)) return popupEl;
  popupEl = document.createElement("div");
  popupEl.className = "md-emoji-popup";
  popupEl.setAttribute("contenteditable", "false");
  document.body.appendChild(popupEl);
  return popupEl;
}

function hidePopup(): void {
  if (popupEl) popupEl.style.display = "none";
  candidates = [];
  activeRange = null;
}

function renderPopup(): void {
  const popup = popupEl;
  if (!popup) return;
  popup.innerHTML = "";
  candidates.forEach((candidate, index) => {
    const row = document.createElement("div");
    row.className = `md-emoji-item ${index === activeIndex ? "is-active" : ""}`;
    row.setAttribute("data-emoji-name", candidate.name);

    const emoji = document.createElement("span");
    emoji.className = "md-emoji-glyph";
    emoji.textContent = candidate.emoji;

    const name = document.createElement("span");
    name.className = "md-emoji-name";
    name.textContent = `:${candidate.name}:`;

    row.appendChild(emoji);
    row.appendChild(name);
    row.addEventListener("mousedown", (e) => {
      e.preventDefault();
      activeIndex = index;
      acceptCandidate();
    });
    popup.appendChild(row);
  });
}

function positionPopup(view: EditorView): void {
  const popup = popupEl;
  if (!popup || !activeRange) return;
  const coords = view.coordsAtPos(activeRange.to);
  const rect = popup.getBoundingClientRect();
  let left = coords.left;
  left = Math.max(8, Math.min(left, window.innerWidth - rect.width - 8));
  let top = coords.bottom + 6;
  if (top + rect.height > window.innerHeight - 8) {
    top = coords.top - rect.height - 6;
  }
  popup.style.left = `${Math.round(left)}px`;
  popup.style.top = `${Math.round(top)}px`;
}

function searchEmoji(query: string): EmojiCandidate[] {
  const q = query.toLowerCase();
  const result: EmojiCandidate[] = [];
  for (const [name, emoji] of Object.entries(EMOJI_MAP)) {
    if (name.startsWith(q)) result.push({ name, emoji });
    if (result.length >= MAX_SUGGESTIONS) break;
  }
  if (result.length < MAX_SUGGESTIONS) {
    for (const [name, emoji] of Object.entries(EMOJI_MAP)) {
      if (!name.startsWith(q) && name.includes(q)) {
        result.push({ name, emoji });
        if (result.length >= MAX_SUGGESTIONS) break;
      }
    }
  }
  return result;
}

function updateSuggestions(view: EditorView): void {
  if (suppressed) return;
  const { $from } = view.state.selection;
  const textBefore = $from.parent.textBetween(
    Math.max(0, $from.parentOffset - 40),
    $from.parentOffset,
    undefined,
    "￼"
  );
  const match = /(?:^|\s):([a-z0-9_+\-]{1,30})$/.exec(textBefore);
  if (!match) {
    hidePopup();
    return;
  }

  const query = match[1];
  const found = searchEmoji(query);
  if (found.length === 0) {
    hidePopup();
    return;
  }

  candidates = found;
  activeIndex = 0;
  activeView = view;
  const to = $from.pos;
  activeRange = { from: to - query.length - 1, to };

  const popup = ensurePopup();
  popup.style.display = "block";
  renderPopup();
  positionPopup(view);
}

function acceptCandidate(): void {
  if (!activeView || !activeRange || candidates.length === 0) return;
  const candidate = candidates[activeIndex];
  const view = activeView;
  const { from, to } = activeRange;
  view.dispatch(
    view.state.tr.insertText(`${candidate.emoji} `, from, to)
  );
  view.focus();
  hidePopup();
}

export function createEmojiAutocompletePlugin(): Plugin {
  return new Plugin({
    key: emojiAutocompleteKey,
    props: {
      handleKeyDown(_view, event) {
        if (!popupEl || popupEl.style.display === "none" || candidates.length === 0) {
          return false;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          activeIndex = (activeIndex + 1) % candidates.length;
          renderPopup();
          return true;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          activeIndex = (activeIndex - 1 + candidates.length) % candidates.length;
          renderPopup();
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault();
          acceptCandidate();
          return true;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          suppressed = true;
          hidePopup();
          return true;
        }
        return false;
      },
    },
    view(editorView) {
      const handler = (event: KeyboardEvent) => {
        // 只有真正的字符输入才恢复补全；Esc/方向键/Enter 不恢复
        if (event.key.length === 1 || event.key === "Backspace") {
          suppressed = false;
        }
        requestAnimationFrame(() => {
          if (editorView.isDestroyed) return;
          updateSuggestions(editorView);
        });
      };
      editorView.dom.addEventListener("keyup", handler);
      editorView.dom.addEventListener("click", hidePopup);
      return {
        update(view, prevState) {
          if (
            view.state.doc !== prevState.doc ||
            view.state.selection !== prevState.selection
          ) {
            requestAnimationFrame(() => {
              if (!view.isDestroyed) updateSuggestions(view);
            });
          }
        },
        destroy() {
          editorView.dom.removeEventListener("keyup", handler);
          editorView.dom.removeEventListener("click", hidePopup);
          hidePopup();
        },
      };
    },
  });
}
