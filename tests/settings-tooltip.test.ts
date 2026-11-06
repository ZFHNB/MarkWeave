// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  HOVER_DELAY_MS,
  createInfoButton,
  enhanceSettingsDescriptions,
} from "../src/ui/settings-tooltip";

function buildPanel(): HTMLElement {
  const panel = document.createElement("div");
  panel.innerHTML = `
    <div class="ty-settings-row" id="row-a">
      <div class="ty-settings-info">
        <span class="ty-settings-label">折线风格</span>
        <span class="ty-settings-desc">新图表默认连线形态</span>
      </div>
      <select><option>a</option></select>
    </div>
    <div class="ty-settings-row" id="row-b">
      <div class="ty-settings-info">
        <span class="ty-settings-label">无说明项</span>
      </div>
      <input type="checkbox" />
    </div>
  `;
  document.body.appendChild(panel);
  return panel;
}

describe("settings description tooltip", () => {
  let panel: HTMLElement;
  let controller: { destroy: () => void } | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    panel = buildPanel();
  });

  afterEach(() => {
    controller?.destroy();
    controller = null;
    panel.remove();
    document.querySelectorAll(".ty-info-tooltip").forEach((el) => el.remove());
    vi.useRealTimers();
  });

  it("moves descriptions into a question-mark button", () => {
    controller = enhanceSettingsDescriptions(panel);
    const row = panel.querySelector("#row-a")!;
    expect(row.querySelector(".ty-settings-desc")).toBeNull();
    const btn = row.querySelector<HTMLButtonElement>(".ty-info-btn")!;
    expect(btn).toBeTruthy();
    expect(btn.dataset.tooltip).toBe("新图表默认连线形态");
    expect(btn.getAttribute("aria-label")).toBe("新图表默认连线形态");
    // 问号标紧贴标签
    expect(btn.closest(".ty-settings-label-row")).toBeTruthy();
  });

  it("leaves rows without a description untouched", () => {
    controller = enhanceSettingsDescriptions(panel);
    expect(panel.querySelector("#row-b .ty-info-btn")).toBeNull();
  });

  it("shows the tooltip only after the hover delay", () => {
    controller = enhanceSettingsDescriptions(panel);
    const row = panel.querySelector<HTMLElement>("#row-a")!;
    const tooltip = document.querySelector<HTMLElement>(".ty-info-tooltip")!;

    row.dispatchEvent(new MouseEvent("mouseenter"));
    vi.advanceTimersByTime(HOVER_DELAY_MS - 50);
    expect(tooltip.hidden).toBe(true);

    vi.advanceTimersByTime(60);
    expect(tooltip.hidden).toBe(false);
    expect(tooltip.textContent).toBe("新图表默认连线形态");
  });

  it("shows immediately when hovering the button itself", () => {
    controller = enhanceSettingsDescriptions(panel);
    const btn = panel.querySelector<HTMLButtonElement>("#row-a .ty-info-btn")!;
    const tooltip = document.querySelector<HTMLElement>(".ty-info-tooltip")!;

    btn.dispatchEvent(new MouseEvent("mouseenter"));
    expect(tooltip.hidden).toBe(false);
  });

  it("hides on row leave", () => {
    controller = enhanceSettingsDescriptions(panel);
    const row = panel.querySelector<HTMLElement>("#row-a")!;
    const tooltip = document.querySelector<HTMLElement>(".ty-info-tooltip")!;

    row.dispatchEvent(new MouseEvent("mouseenter"));
    vi.advanceTimersByTime(HOVER_DELAY_MS + 10);
    expect(tooltip.hidden).toBe(false);

    row.dispatchEvent(new MouseEvent("mouseleave"));
    expect(tooltip.hidden).toBe(true);
  });

  it("cancels the timer when the pointer leaves early", () => {
    controller = enhanceSettingsDescriptions(panel);
    const row = panel.querySelector<HTMLElement>("#row-a")!;
    const tooltip = document.querySelector<HTMLElement>(".ty-info-tooltip")!;

    row.dispatchEvent(new MouseEvent("mouseenter"));
    vi.advanceTimersByTime(400);
    row.dispatchEvent(new MouseEvent("mouseleave"));
    vi.advanceTimersByTime(HOVER_DELAY_MS);
    expect(tooltip.hidden).toBe(true);
  });

  it("pins on click and unpins on a second click", () => {
    controller = enhanceSettingsDescriptions(panel);
    const btn = panel.querySelector<HTMLButtonElement>("#row-a .ty-info-btn")!;
    const tooltip = document.querySelector<HTMLElement>(".ty-info-tooltip")!;

    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(tooltip.hidden).toBe(false);
    expect(btn.classList.contains("ty-info-btn-active")).toBe(true);

    // 固定状态下行离开不消失
    panel.querySelector<HTMLElement>("#row-a")!.dispatchEvent(new MouseEvent("mouseleave"));
    expect(tooltip.hidden).toBe(false);

    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(tooltip.hidden).toBe(true);
  });

  it("closes on Escape", () => {
    controller = enhanceSettingsDescriptions(panel);
    const btn = panel.querySelector<HTMLButtonElement>("#row-a .ty-info-btn")!;
    const tooltip = document.querySelector<HTMLElement>(".ty-info-tooltip")!;

    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(tooltip.hidden).toBe(false);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(tooltip.hidden).toBe(true);
  });

  it("removes the tooltip and listeners on destroy", () => {
    controller = enhanceSettingsDescriptions(panel);
    controller.destroy();
    controller = null;
    expect(document.querySelector(".ty-info-tooltip")).toBeNull();
  });

  it("honors a custom hover delay", () => {
    controller = enhanceSettingsDescriptions(panel, { hoverDelayMs: 100 });
    const row = panel.querySelector<HTMLElement>("#row-a")!;
    const tooltip = document.querySelector<HTMLElement>(".ty-info-tooltip")!;

    row.dispatchEvent(new MouseEvent("mouseenter"));
    vi.advanceTimersByTime(120);
    expect(tooltip.hidden).toBe(false);
  });

  it("merges multiple description lines into one tooltip", () => {
    const multi = document.createElement("div");
    multi.className = "ty-settings-row";
    multi.innerHTML = `
      <div class="ty-settings-info">
        <span class="ty-settings-label">多行说明</span>
        <span class="ty-settings-desc">第一段</span>
        <span class="ty-settings-desc">第二段</span>
      </div>`;
    panel.appendChild(multi);

    controller = enhanceSettingsDescriptions(panel);
    const btn = multi.querySelector<HTMLButtonElement>(".ty-info-btn")!;
    expect(btn.dataset.tooltip).toBe("第一段 第二段");
  });

  it("creates accessible buttons", () => {
    const btn = createInfoButton("说明文本");
    expect(btn.type).toBe("button");
    expect(btn.textContent).toBe("?");
    expect(btn.getAttribute("aria-label")).toBe("说明文本");
  });
});
