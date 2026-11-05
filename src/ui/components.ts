/**
 * 统一的界面组件：对话框、轻提示、下拉菜单。
 *
 * 全应用只保留一套样式与交互规则，避免「设置面板是圆的、导出弹窗是方的、
 * 错误提示还是浏览器原生灰框」这种不一致。
 */

/* ================= 基础工具 ================= */

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null);
}

/** 把焦点限制在对话框内（Tab / Shift+Tab 循环），Esc 关闭 */
function trapFocus(container: HTMLElement, onEscape: () => void): () => void {
  const handler = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onEscape();
      return;
    }
    if (event.key !== "Tab") return;

    const items = focusables(container);
    if (items.length === 0) return;

    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement as HTMLElement | null;

    if (event.shiftKey && (active === first || !container.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  document.addEventListener("keydown", handler, true);
  return () => document.removeEventListener("keydown", handler, true);
}

export interface DialogOptions {
  title: string;
  /** 正文，允许 HTML */
  body?: string;
  /** 底部按钮，从右往左排列 */
  actions?: DialogAction[];
  /** 宽度上限，默认 520px */
  maxWidth?: number;
  /** 关闭时（含 Esc / 点遮罩）的回调 */
  onClose?: () => void;
  /** 是否允许点击遮罩关闭，默认 true */
  dismissible?: boolean;
  /** 打开后自动聚焦的元素选择器 */
  autoFocus?: string;
}

export interface DialogAction {
  label: string;
  /** primary = 主按钮（蓝底），danger = 危险操作（红字） */
  variant?: "primary" | "danger";
  onClick?: () => void;
  /** 点击后是否自动关闭，默认 true */
  close?: boolean;
}

export interface DialogHandle {
  overlay: HTMLElement;
  /** 在对话框内查找元素 */
  query: <T extends HTMLElement = HTMLElement>(selector: string) => T | null;
  close: () => void;
}

/**
 * 打开一个标准对话框。
 *
 * 所有需要用户确认/输入的地方都应该走这里，而不是 window.confirm ——
 * 原生弹窗无法样式化，和设置面板放在一起会显得突兀。
 */
export function openDialog(options: DialogOptions): DialogHandle {
  const overlay = document.createElement("div");
  overlay.className = "ty-modal-overlay";

  const actions = options.actions ?? [];
  const footer = actions.length
    ? `<div class="ty-modal-footer">${actions
        .map((a, i) => {
          const cls =
            a.variant === "primary"
              ? "ty-btn ty-btn-primary"
              : a.variant === "danger"
              ? "ty-btn ty-btn-danger"
              : "ty-btn";
          return `<button class="${cls}" data-action-index="${i}">${a.label}</button>`;
        })
        .join("")}</div>`
    : "";

  overlay.innerHTML = `
    <div class="ty-modal-card" role="dialog" aria-modal="true" aria-labelledby="ty-dialog-title"
         style="${options.maxWidth ? `max-width:${options.maxWidth}px;` : ""}">
      <div class="ty-modal-header ty-settings-header">
        <div class="ty-modal-title" id="ty-dialog-title">${options.title}</div>
        <button class="ty-modal-close" aria-label="关闭">&times;</button>
      </div>
      ${options.body ? `<div class="ty-dialog-body">${options.body}</div>` : ""}
      ${footer}
    </div>
  `;

  document.body.appendChild(overlay);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    releaseTrap();
    overlay.remove();
    options.onClose?.();
  };
  const releaseTrap = trapFocus(overlay, close);

  overlay.querySelector(".ty-modal-close")?.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay && options.dismissible !== false) close();
  });

  overlay.querySelectorAll<HTMLButtonElement>("[data-action-index]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const index = Number(btn.dataset.actionIndex);
      const action = actions[index];
      action?.onClick?.();
      if (action?.close !== false) close();
    });
  });

  // 自动聚焦：优先主按钮，其次第一个可聚焦元素
  const preferred = options.autoFocus
    ? overlay.querySelector<HTMLElement>(options.autoFocus)
    : null;
  const primary = overlay.querySelector<HTMLElement>(".ty-btn-primary");
  (preferred ?? primary ?? focusables(overlay)[0] ?? overlay).focus?.();

  return {
    overlay,
    query: <T extends HTMLElement = HTMLElement>(selector: string) =>
      overlay.querySelector<T>(selector),
    close,
  };
}

/** 单按钮提示框（替代 window.alert） */
export function alertDialog(message: string, title = "提示"): Promise<void> {
  return new Promise((resolve) => {
    openDialog({
      title,
      body: `<p class="ty-modal-desc">${escapeHtml(message).replace(/\n/g, "<br>")}</p>`,
      actions: [{ label: "好的", variant: "primary" }],
      onClose: () => resolve(),
    });
  });
}

/** 确认框（替代 window.confirm），返回用户是否确认 */
export function confirmDialog(
  message: string,
  options: { title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean } = {}
): Promise<boolean> {
  return new Promise((resolve) => {
    let result = false;
    const handle = openDialog({
      title: options.title ?? "请确认",
      body: `<p class="ty-modal-desc">${escapeHtml(message).replace(/\n/g, "<br>")}</p>`,
      actions: [
        { label: options.cancelLabel ?? "取消" },
        {
          label: options.confirmLabel ?? "确定",
          variant: options.danger ? "danger" : "primary",
          onClick: () => {
            result = true;
          },
        },
      ],
      onClose: () => resolve(result),
    });
    // 关闭按钮 / Esc / 点遮罩都算取消
    void handle;
  });
}

/** 文本输入框（替代 window.prompt），取消返回 null */
export function promptDialog(
  message: string,
  defaultValue = "",
  options: { title?: string; confirmLabel?: string } = {}
): Promise<string | null> {
  return new Promise((resolve) => {
    let value: string | null = null;
    const handle = openDialog({
      title: options.title ?? "请输入",
      body: `
        <p class="ty-modal-desc">${escapeHtml(message)}</p>
        <input class="ty-settings-input ty-dialog-input" type="text"
               value="${escapeHtml(defaultValue)}" aria-label="${escapeHtml(message)}" />
      `,
      autoFocus: ".ty-dialog-input",
      actions: [
        { label: "取消" },
        {
          label: options.confirmLabel ?? "确定",
          variant: "primary",
          onClick: () => {
            value = handle.query<HTMLInputElement>(".ty-dialog-input")?.value ?? "";
          },
        },
      ],
      onClose: () => resolve(value),
    });

    // 回车确认
    handle.query<HTMLInputElement>(".ty-dialog-input")?.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      value = (e.target as HTMLInputElement).value;
      handle.close();
    });
  });
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ================= 轻提示 ================= */

export type ToastTone = "info" | "success" | "error";

let toastHost: HTMLElement | null = null;

function ensureToastHost(): HTMLElement {
  if (toastHost && document.body.contains(toastHost)) return toastHost;
  const el = document.createElement("div");
  el.className = "ty-toast-host";
  el.setAttribute("aria-live", "polite");
  document.body.appendChild(el);
  toastHost = el;
  return el;
}

/** 右下角轻提示，自动消失；不会打断输入 */
export function toast(message: string, tone: ToastTone = "info", durationMs = 2600): void {
  const host = ensureToastHost();
  const el = document.createElement("div");
  el.className = `ty-toast ty-toast-${tone}`;
  el.textContent = message;
  host.appendChild(el);

  requestAnimationFrame(() => el.classList.add("is-visible"));

  window.setTimeout(() => {
    el.classList.remove("is-visible");
    window.setTimeout(() => el.remove(), 220);
  }, durationMs);
}

/* ================= 下拉菜单 ================= */

export interface MenuItem {
  /** 显示文本；分隔线可为空 */
  label?: string;
  onClick?: () => void;
  /** 右侧快捷键提示 */
  shortcut?: string;
  /** 类型：普通项 / 分隔线 / 分组标题 */
  kind?: "item" | "separator" | "heading";
  disabled?: boolean;
  /** 是否显示勾选标记 */
  checked?: boolean;
  /**
   * 子菜单。为空的项点击后不会关闭当前菜单。
   * 与 openMenuAt 配合：点开时关闭父菜单并在右侧展开。
   */
  submenu?: MenuItem[];
}

/**
 * 在指定元素下方弹出菜单，点击外部或按 Esc 关闭。
 *
 * 用于文件菜单、导出子菜单等，保证和应用其余部分同一套视觉。
 */
export function openMenu(anchor: HTMLElement, items: MenuItem[]): () => void {
  return openMenuAt(anchor.getBoundingClientRect(), items, anchor);
}

/**
 * 按视口坐标弹出菜单。
 *
 * 二级菜单需要这个：一级菜单在点击时已经关闭，锚点元素不复存在，
 * 只能记住它的矩形。
 *
 * @param align "start" 左对齐锚点（一级菜单）；"end" 右对齐（二级菜单展开在右侧）
 */
export function openMenuAt(
  rect: { left: number; right: number; top: number; bottom: number; width: number; height: number },
  items: MenuItem[],
  anchor?: HTMLElement,
  align: "start" | "end" = "start"
): () => void {
  document.querySelector(".ty-menu-popup")?.remove();
  document.querySelectorAll(".ty-menu-anchor-active").forEach((el) =>
    el.classList.remove("ty-menu-anchor-active")
  );

  const menu = document.createElement("div");
  menu.className = "ty-menu-popup";
  menu.setAttribute("role", "menu");

  for (const item of items) {
    if (item.kind === "separator") {
      const sep = document.createElement("div");
      sep.className = "ty-menu-separator";
      menu.appendChild(sep);
      continue;
    }
    if (item.kind === "heading") {
      const head = document.createElement("div");
      head.className = "ty-menu-heading";
      head.textContent = item.label ?? "";
      menu.appendChild(head);
      continue;
    }

    const btn = document.createElement("button");
    btn.className = "ty-menu-item";
    btn.setAttribute("role", "menuitem");
    if (item.disabled) btn.disabled = true;

    const check = document.createElement("span");
    check.className = "ty-menu-check";
    check.textContent = item.checked ? "✓" : "";
    btn.appendChild(check);

    const label = document.createElement("span");
    label.className = "ty-menu-label";
    label.textContent = item.label ?? "";
    btn.appendChild(label);

    if (item.submenu && item.submenu.length > 0) {
      const arrow = document.createElement("span");
      arrow.className = "ty-menu-shortcut";
      arrow.textContent = "›";
      btn.appendChild(arrow);
    } else if (item.shortcut) {
      const key = document.createElement("span");
      key.className = "ty-menu-shortcut";
      key.textContent = item.shortcut;
      btn.appendChild(key);
    }

    // 有子菜单的项：鼠标悬停即展开（与 Typora / 系统菜单一致），
    // 点击不关闭父菜单，避免"点一下才有菜单"的反直觉行为。
    if (item.submenu && item.submenu.length > 0) {
      let submenuClose: (() => void) | null = null;
      let openTimer: ReturnType<typeof setTimeout> | null = null;

      const openSubmenu = () => {
        if (submenuClose) return;
        const rect = btn.getBoundingClientRect();
        submenuClose = openMenuAt(rect, item.submenu!, undefined, "end") ?? null;
      };

      btn.addEventListener("mouseenter", () => {
        if (openTimer) clearTimeout(openTimer);
        // 轻微延迟：快速划过时不会连弹多个子菜单
        openTimer = setTimeout(openSubmenu, 80);
      });
      btn.addEventListener("mouseleave", () => {
        if (openTimer) {
          clearTimeout(openTimer);
          openTimer = null;
        }
      });
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        openSubmenu();
      });
      menu.appendChild(btn);
      continue;
    }

    btn.addEventListener("click", () => {
      // 记录本行位置，供二级菜单定位（一级菜单随后会被关闭）
      itemRowRect = btn.getBoundingClientRect();
      close();
      item.onClick?.();
    });
    menu.appendChild(btn);
  }

  document.body.appendChild(menu);
  anchor?.classList.add("ty-menu-anchor-active");

  // 定位：一级菜单贴在按钮左下，二级菜单在右侧展开
  const menuRect = menu.getBoundingClientRect();
  let left = align === "end" ? rect.right + 2 : rect.left;
  let top = align === "end" ? rect.top : rect.bottom + 4;

  if (left + menuRect.width > window.innerWidth - 8) {
    // 右侧放不下：翻到左边
    left = align === "end" ? rect.left - menuRect.width - 2 : window.innerWidth - menuRect.width - 8;
  }
  if (left < 8) left = 8;

  if (top + menuRect.height > window.innerHeight - 8) {
    top = Math.max(8, window.innerHeight - menuRect.height - 8);
  }
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    menu.remove();
    anchor?.classList.remove("ty-menu-anchor-active");
    document.removeEventListener("mousedown", onOutside, true);
    document.removeEventListener("keydown", onKey, true);
  };

  const onOutside = (event: MouseEvent) => {
    if (menu.contains(event.target as Node) || anchor?.contains(event.target as Node)) return;
    close();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  // 延后一拍，避免触发菜单的那次点击立刻把它关掉
  setTimeout(() => {
    document.addEventListener("mousedown", onOutside, true);
    document.addEventListener("keydown", onKey, true);
  }, 0);

  return close;
}

/** 最近一次点击的菜单行位置，二级菜单据此对齐 */
let itemRowRect: DOMRect | null = null;

/** 读取并清空最近一次点击的菜单行位置 */
export function takeMenuRowRect(): DOMRect | null {
  const rect = itemRowRect;
  itemRowRect = null;
  return rect;
}
