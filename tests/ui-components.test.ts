// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  alertDialog,
  confirmDialog,
  escapeHtml,
  openDialog,
  openMenu,
  toast,
} from "../src/ui/components";

function cleanup() {
  document.body.innerHTML = "";
}

describe("escapeHtml", () => {
  it("escapes the five dangerous characters", () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;'");
  });

  it("leaves plain text untouched", () => {
    expect(escapeHtml("普通文本 123")).toBe("普通文本 123");
  });
});

describe("openDialog", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it("renders title, body and actions", () => {
    const handle = openDialog({
      title: "测试标题",
      body: "<p>正文</p>",
      actions: [{ label: "取消" }, { label: "确定", variant: "primary" }],
    });

    expect(handle.overlay.querySelector("#ty-dialog-title")?.textContent).toBe("测试标题");
    expect(handle.overlay.querySelector(".ty-dialog-body")?.innerHTML).toContain("正文");
    expect(handle.overlay.querySelectorAll("[data-action-index]")).toHaveLength(2);
  });

  it("marks the dialog as modal and labelled", () => {
    const handle = openDialog({ title: "无障碍" });
    const card = handle.overlay.querySelector(".ty-modal-card")!;
    expect(card.getAttribute("role")).toBe("dialog");
    expect(card.getAttribute("aria-modal")).toBe("true");
    expect(card.getAttribute("aria-labelledby")).toBe("ty-dialog-title");
  });

  it("runs the action callback then closes", () => {
    const onClick = vi.fn();
    const handle = openDialog({
      title: "x",
      actions: [{ label: "确定", variant: "primary", onClick }],
    });

    handle.overlay.querySelector<HTMLButtonElement>("[data-action-index]")!.click();
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".ty-modal-overlay")).toBeNull();
  });

  it("keeps the dialog open when close is false", () => {
    const handle = openDialog({
      title: "x",
      actions: [{ label: "清空", close: false }],
    });

    handle.overlay.querySelector<HTMLButtonElement>("[data-action-index]")!.click();
    expect(document.querySelector(".ty-modal-overlay")).not.toBeNull();
  });

  it("closes on the × button", () => {
    const onClose = vi.fn();
    const handle = openDialog({ title: "x", onClose });
    handle.overlay.querySelector<HTMLButtonElement>(".ty-modal-close")!.click();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".ty-modal-overlay")).toBeNull();
  });

  it("closes on backdrop click unless dismissible is false", () => {
    openDialog({ title: "a" });
    const overlay = document.querySelector<HTMLElement>(".ty-modal-overlay")!;
    overlay.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.querySelector(".ty-modal-overlay")).toBeNull();

    cleanup();
    openDialog({ title: "b", dismissible: false });
    const fixed = document.querySelector<HTMLElement>(".ty-modal-overlay")!;
    fixed.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.querySelector(".ty-modal-overlay")).not.toBeNull();
  });

  it("closes on Escape", () => {
    openDialog({ title: "x" });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector(".ty-modal-overlay")).toBeNull();
  });

  it("only closes once even if close is called twice", () => {
    const onClose = vi.fn();
    const handle = openDialog({ title: "x", onClose });
    handle.close();
    handle.close();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("returns null for a missing selector instead of throwing", () => {
    const handle = openDialog({ title: "x" });
    expect(handle.query(".does-not-exist")).toBeNull();
  });
});

describe("alertDialog", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it("resolves when dismissed", async () => {
    const promise = alertDialog("出错了");
    expect(document.body.textContent).toContain("出错了");
    document.querySelector<HTMLButtonElement>("[data-action-index]")!.click();
    await expect(promise).resolves.toBeUndefined();
  });

  it("converts newlines to line breaks", () => {
    void alertDialog("第一行\n第二行");
    expect(document.querySelector(".ty-modal-desc")?.innerHTML).toContain("<br>");
  });

  it("escapes HTML in the message", () => {
    void alertDialog("<script>alert(1)</script>");
    expect(document.querySelector(".ty-modal-desc")?.innerHTML).not.toContain("<script>");
  });
});

describe("confirmDialog", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it("resolves true when confirmed", async () => {
    const promise = confirmDialog("确定吗？");
    const buttons = document.querySelectorAll<HTMLButtonElement>("[data-action-index]");
    buttons[1].click(); // 确定
    await expect(promise).resolves.toBe(true);
  });

  it("resolves false when cancelled", async () => {
    const promise = confirmDialog("确定吗？");
    document.querySelectorAll<HTMLButtonElement>("[data-action-index]")[0].click();
    await expect(promise).resolves.toBe(false);
  });

  it("resolves false when closed via Escape", async () => {
    const promise = confirmDialog("确定吗？");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await expect(promise).resolves.toBe(false);
  });

  it("applies the danger variant", () => {
    void confirmDialog("删除？", { danger: true });
    expect(document.querySelector(".ty-btn-danger")).not.toBeNull();
  });

  it("uses custom labels", () => {
    void confirmDialog("x", { confirmLabel: "移入回收站", cancelLabel: "算了" });
    const text = document.body.textContent ?? "";
    expect(text).toContain("移入回收站");
    expect(text).toContain("算了");
  });
});

describe("toast", () => {
  beforeEach(cleanup);
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("creates a live region host", () => {
    toast("已保存", "success");
    const host = document.querySelector(".ty-toast-host");
    expect(host?.getAttribute("aria-live")).toBe("polite");
  });

  it("applies the tone class", () => {
    toast("失败", "error");
    expect(document.querySelector(".ty-toast-error")).not.toBeNull();
  });

  it("stacks multiple toasts", () => {
    toast("一");
    toast("二");
    expect(document.querySelectorAll(".ty-toast")).toHaveLength(2);
  });

  it("removes itself after the duration", () => {
    vi.useFakeTimers();
    toast("短暂", "info", 1000);
    expect(document.querySelectorAll(".ty-toast")).toHaveLength(1);

    vi.advanceTimersByTime(1000); // 开始淡出
    vi.advanceTimersByTime(300); // 移除
    expect(document.querySelectorAll(".ty-toast")).toHaveLength(0);
  });
});

describe("openMenu", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it("renders items, shortcuts and separators", () => {
    const anchor = document.createElement("button");
    document.body.appendChild(anchor);

    openMenu(anchor, [
      { label: "新建", shortcut: "Ctrl+N" },
      { kind: "separator" },
      { label: "打开" },
    ]);

    expect(document.querySelectorAll(".ty-menu-item")).toHaveLength(2);
    expect(document.querySelector(".ty-menu-separator")).not.toBeNull();
    expect(document.querySelector(".ty-menu-shortcut")?.textContent).toBe("Ctrl+N");
  });

  it("runs the handler and closes", () => {
    const anchor = document.createElement("button");
    document.body.appendChild(anchor);
    const onClick = vi.fn();

    openMenu(anchor, [{ label: "执行", onClick }]);
    document.querySelector<HTMLButtonElement>(".ty-menu-item")!.click();

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".ty-menu-popup")).toBeNull();
  });

  it("does not fire disabled items", () => {
    const anchor = document.createElement("button");
    document.body.appendChild(anchor);
    const onClick = vi.fn();

    openMenu(anchor, [{ label: "禁用", disabled: true, onClick }]);
    const btn = document.querySelector<HTMLButtonElement>(".ty-menu-item")!;
    expect(btn.disabled).toBe(true);
    btn.click();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("shows a check mark for checked items", () => {
    const anchor = document.createElement("button");
    document.body.appendChild(anchor);

    openMenu(anchor, [{ label: "已启用", checked: true }]);
    expect(document.querySelector(".ty-menu-check")?.textContent).toBe("✓");
  });

  it("closes on Escape", async () => {
    const anchor = document.createElement("button");
    document.body.appendChild(anchor);

    openMenu(anchor, [{ label: "x" }]);
    // Esc 监听在下一拍才注册，先让出一次事件循环
    await new Promise((resolve) => setTimeout(resolve, 0));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector(".ty-menu-popup")).toBeNull();
  });

  it("replaces an already-open menu", () => {
    const anchor = document.createElement("button");
    document.body.appendChild(anchor);

    openMenu(anchor, [{ label: "一" }]);
    openMenu(anchor, [{ label: "二" }]);

    expect(document.querySelectorAll(".ty-menu-popup")).toHaveLength(1);
    expect(document.querySelector(".ty-menu-label")?.textContent).toBe("二");
  });

  it("renders group headings", () => {
    const anchor = document.createElement("button");
    document.body.appendChild(anchor);

    openMenu(anchor, [{ kind: "heading", label: "分组" }, { label: "项" }]);
    expect(document.querySelector(".ty-menu-heading")?.textContent).toBe("分组");
  });
});
