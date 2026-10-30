import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9333",
  defaultViewport: null,
});

const pages = await browser.pages();
const page = pages.find((p) => p.url().includes("app://markweave")) ?? pages[0];
await page.bringToFront();
await new Promise((r) => setTimeout(r, 1200));

const result = await page.evaluate(() => {
  const api = window.markweave ?? null;
  const ed = window.__MARKWEAVE_EDITOR__;
  return {
    desktop: Boolean(api),
    isDesktop: api?.isDesktop,
    hasSaveHistory: typeof api?.writeHistory === "function",
    hasListHistory: typeof api?.listHistory === "function",
    hasRemoveHistory: typeof api?.removeHistory === "function",
    hasChooseDirectory: typeof api?.chooseDirectory === "function",
    hasCustomThemes: typeof api?.listCustomThemes === "function",
    hasCloseRequested: typeof api?.onCloseRequested === "function",
    hasConfirmClose: typeof api?.confirmClose === "function",
    saveButton: Boolean(document.getElementById("btn-save-file")),
    saveStatus: Boolean(document.getElementById("save-status")),
    editorReady: Boolean(ed),
    blockDragCss: Boolean(document.querySelector('style, link')) && Array.from(document.styleSheets).some((s) => {
      try { return Array.from(s.cssRules).some((r) => r.cssText.includes(".md-block-handle")); } catch { return false; }
    }),
    url: location.href,
  };
});
console.log(JSON.stringify(result, null, 1));

// 打开设置，确认新页签内容
await page.evaluate(() => {
  const btns = [...document.querySelectorAll("button")];
  btns.find((b) => /偏好设置/.test(b.getAttribute("title") || ""))?.click();
});
await new Promise((r) => setTimeout(r, 600));
await page.evaluate(() => document.querySelector('[data-tab="storage"]')?.click());
await new Promise((r) => setTimeout(r, 400));

const settings = await page.evaluate(() => ({
  autosaveMode: document.querySelector("#setting-select-autosave-mode")?.value,
  interval: document.querySelector("#setting-input-autosave-interval")?.value,
  historyToggle: document.querySelector("#setting-toggle-history")?.checked,
  historyMax: document.querySelector("#setting-input-history-max")?.value,
  chooseDirButton: Boolean(document.querySelector("#setting-btn-history-dir")),
  infoButtons: document.querySelectorAll(".ty-info-btn").length,
}));
console.log("storage tab:", JSON.stringify(settings));

await page.evaluate(() => document.querySelector('[data-tab="editor"]')?.click());
await new Promise((r) => setTimeout(r, 400));
const fonts = await page.evaluate(() => ({
  bodyOptions: [...(document.querySelector("#setting-select-font-family")?.options ?? [])].map((o) => o.value),
  monoOptions: [...(document.querySelector("#setting-select-mono-font")?.options ?? [])].map((o) => o.value),
}));
console.log("fonts:", JSON.stringify(fonts));

await browser.disconnect();
