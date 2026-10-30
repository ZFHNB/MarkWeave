/**
 * 设置项说明的二级提示。
 *
 * 面板里每项下方原本有一行灰色小字；为了保持界面简洁，
 * 这里把说明收进行右上角的圆形问号标：
 * - 悬浮整行 1000ms 后展示
 * - 悬浮或聚焦问号标时立即展示
 * - 点击问号标可固定展示，再次点击收起
 */
export const HOVER_DELAY_MS = 1000;

const TOOLTIP_CLASS = "ty-info-tooltip";
const BUTTON_CLASS = "ty-info-btn";
const SHOWING_CLASS = "ty-info-btn-active";

interface TooltipController {
  destroy: () => void;
}

export interface EnhanceOptions {
  /** 悬浮延迟，便于测试注入 */
  hoverDelayMs?: number;
}

/** 生成问号标按钮（纯 DOM，便于单测与复用） */
export function createInfoButton(text: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = BUTTON_CLASS;
  button.textContent = "?";
  button.setAttribute("aria-label", text);
  button.dataset.tooltip = text;
  return button;
}

/**
 * 把 `root` 内所有 `.ty-settings-desc` 收进二级提示。
 * 返回的控制器用于解绑监听，避免模态框关闭后残留。
 */
export function enhanceSettingsDescriptions(
  root: HTMLElement,
  options: EnhanceOptions = {}
): TooltipController {
  const delay = options.hoverDelayMs ?? HOVER_DELAY_MS;
  const rows = [...root.querySelectorAll<HTMLElement>(".ty-settings-row")];

  const tooltip = document.createElement("div");
  tooltip.className = TOOLTIP_CLASS;
  tooltip.setAttribute("role", "tooltip");
  tooltip.hidden = true;
  document.body.appendChild(tooltip);

  const cleanups: (() => void)[] = [];
  let timer: number | null = null;
  let pinned = false;
  let activeButton: HTMLButtonElement | null = null;

  const clearTimer = () => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  };

  const hide = () => {
    clearTimer();
    pinned = false;
    tooltip.hidden = true;
    if (activeButton) {
      activeButton.classList.remove(SHOWING_CLASS);
      activeButton = null;
    }
  };

  const show = (button: HTMLButtonElement) => {
    clearTimer();
    const text = button.dataset.tooltip || "";
    if (!text) return;
    activeButton = button;
    button.classList.add(SHOWING_CLASS);
    tooltip.textContent = text;
    tooltip.hidden = false;

    // 定位到问号标下方，超出视口时自动翻转
    const rect = button.getBoundingClientRect();
    const margin = 8;
    const width = tooltip.offsetWidth;
    const height = tooltip.offsetHeight;

    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));

    let top = rect.bottom + 6;
    if (top + height > window.innerHeight - margin) {
      top = rect.top - height - 6;
    }

    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(Math.max(margin, top))}px`;
  };

  for (const row of rows) {
    const info = row.querySelector<HTMLElement>(".ty-settings-info");
    const descs = info ? [...info.querySelectorAll<HTMLElement>(".ty-settings-desc")] : [];
    if (!info || descs.length === 0) continue;

    const text = descs
      .map((node) => (node.textContent || "").trim())
      .filter(Boolean)
      .join(" ");
    if (!text) {
      descs.forEach((node) => node.remove());
      continue;
    }

    const button = createInfoButton(text);
    descs.forEach((node) => node.remove());

    // 问号标紧贴标签右上角
    const label = info.querySelector<HTMLElement>(".ty-settings-label");
    if (label) {
      const labelRow = document.createElement("div");
      labelRow.className = "ty-settings-label-row";
      label.replaceWith(labelRow);
      labelRow.appendChild(label);
      labelRow.appendChild(button);
    } else {
      info.appendChild(button);
    }

    const onRowEnter = () => {
      clearTimer();
      timer = window.setTimeout(() => show(button), delay);
    };
    const onRowLeave = (event: MouseEvent) => {
      const next = event.relatedTarget as Node | null;
      if (next && tooltip.contains(next)) return;
      if (pinned) return;
      hide();
    };
    const onButtonEnter = () => show(button);
    const onButtonFocus = () => show(button);
    const onButtonClick = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (!tooltip.hidden && pinned) {
        hide();
      } else {
        show(button);
        pinned = true;
      }
    };

    row.addEventListener("mouseenter", onRowEnter);
    row.addEventListener("mouseleave", onRowLeave);
    button.addEventListener("mouseenter", onButtonEnter);
    button.addEventListener("focus", onButtonFocus);
    button.addEventListener("click", onButtonClick);

    cleanups.push(() => {
      row.removeEventListener("mouseenter", onRowEnter);
      row.removeEventListener("mouseleave", onRowLeave);
      button.removeEventListener("mouseenter", onButtonEnter);
      button.removeEventListener("focus", onButtonFocus);
      button.removeEventListener("click", onButtonClick);
    });
  }

  const onTooltipEnter = () => clearTimer();
  const onTooltipLeave = () => {
    if (!pinned) hide();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") hide();
  };
  tooltip.addEventListener("mouseenter", onTooltipEnter);
  tooltip.addEventListener("mouseleave", onTooltipLeave);
  document.addEventListener("keydown", onKeyDown);

  return {
    destroy() {
      clearTimer();
      cleanups.forEach((fn) => fn());
      tooltip.removeEventListener("mouseenter", onTooltipEnter);
      tooltip.removeEventListener("mouseleave", onTooltipLeave);
      document.removeEventListener("keydown", onKeyDown);
      tooltip.remove();
    },
  };
}
