import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9444", defaultViewport: null });
const pages = await browser.pages();
const page = pages.find((p) => p.url().includes("localhost:5174") || p.url().includes("app://")) ?? pages[0];
await page.bringToFront();
await new Promise((r) => setTimeout(r, 1500));

// 1) Ctrl+S 是否被拦截（preventDefault）——用一个可观察的副作用判断
const ctrlSHandled = await page.evaluate(async () => {
  let prevented = false;
  const listener = (e) => {
    if (e.key.toLowerCase() === "s" && (e.ctrlKey || e.metaKey)) {
      // 微任务结束后读取 defaultPrevented
      queueMicrotask(() => {});
      prevented = e.defaultPrevented;
    }
  };
  window.addEventListener("keydown", listener, true);
  const ev = new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true, cancelable: true });
  document.body.dispatchEvent(ev);
  window.removeEventListener("keydown", listener, true);
  return { prevented: ev.defaultPrevented };
});
console.log("ctrl+s handled:", JSON.stringify(ctrlSHandled));

// 2) 保存状态元素的初始态
const statusBefore = await page.evaluate(() => {
  const el = document.getElementById("save-status");
  return el ? { text: el.textContent, visible: el.classList.contains("is-visible") } : null;
});
console.log("status before:", JSON.stringify(statusBefore));

// 3) 检查外部变更弹窗不再使用原生 confirm（改用应用内提示）
const usesConfirm = await page.evaluate(() => {
  const src = window.__MARKWEAVE_EDITOR__ ? "ok" : "no-editor";
  return { src, hasCustomDialog: Boolean(document.querySelector("#external-change-overlay")) };
});
console.log("dialog check:", JSON.stringify(usesConfirm));

await browser.disconnect();
