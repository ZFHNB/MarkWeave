import { Node as PMNode } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";

/**
 * 脚注悬浮预览插件：
 * - 给 `footnote_ref` 节点添加 `.md-footnote-ref` 类（已有）
 * - 鼠标悬浮时展示对应 `footnote_definition` 的内容
 */
export const footnoteHoverKey = new PluginKey("footnote-hover");

function collectDefinitions(doc: PMNode): Map<string, string> {
  const map = new Map<string, string>();
  doc.descendants((node) => {
    if (node.type.name === "footnote_definition") {
      map.set(node.attrs.id || "", node.attrs.content || "");
    }
    return true;
  });
  return map;
}

export function createFootnoteHoverPlugin(): Plugin {
  return new Plugin({
    key: footnoteHoverKey,
    props: {
      handleDOMEvents: {
        mouseover(view, event) {
          const target = event.target as HTMLElement | null;
          const ref = target?.closest?.(".md-footnote-ref") as HTMLElement | null;
          if (!ref) return false;

          const id = ref.getAttribute("data-footnote-id") || "";
          const defs = collectDefinitions(view.state.doc);
          const content = defs.get(id);
          if (!content) return false;

          showFootnoteTooltip(ref, id, content);
          return false;
        },
        mouseout(_view, event) {
          const target = event.target as HTMLElement | null;
          if (target?.closest?.(".md-footnote-ref")) {
            scheduleHideTooltip();
          }
          return false;
        },
      },
    },
  });
}

let tooltipEl: HTMLElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

function showFootnoteTooltip(anchor: HTMLElement, id: string, content: string): void {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  if (!tooltipEl) {
    tooltipEl = document.createElement("div");
    tooltipEl.className = "md-footnote-tooltip";
    tooltipEl.setAttribute("contenteditable", "false");
    tooltipEl.addEventListener("mouseenter", () => {
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = null;
    });
    tooltipEl.addEventListener("mouseleave", scheduleHideTooltip);
    document.body.appendChild(tooltipEl);
  }

  tooltipEl.innerHTML = "";
  const label = document.createElement("div");
  label.className = "md-footnote-tooltip-id";
  label.textContent = `[^${id}]`;
  const body = document.createElement("div");
  body.className = "md-footnote-tooltip-body";
  body.textContent = content;
  tooltipEl.appendChild(label);
  tooltipEl.appendChild(body);

  const rect = anchor.getBoundingClientRect();
  tooltipEl.style.display = "block";
  const tooltipRect = tooltipEl.getBoundingClientRect();
  let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
  left = Math.max(12, Math.min(left, window.innerWidth - tooltipRect.width - 12));
  let top = rect.bottom + 6;
  if (top + tooltipRect.height > window.innerHeight - 12) {
    top = rect.top - tooltipRect.height - 6;
  }
  tooltipEl.style.left = `${Math.round(left)}px`;
  tooltipEl.style.top = `${Math.round(top)}px`;
}

function scheduleHideTooltip(): void {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (tooltipEl) tooltipEl.style.display = "none";
  }, 180);
}
