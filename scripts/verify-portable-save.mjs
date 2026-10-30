import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9555", defaultViewport: null });
const pages = await browser.pages();
const page = pages.find((p) => p.url().includes("app://markweave")) ?? pages[0];
await page.bringToFront();
await new Promise((r) => setTimeout(r, 1500));

// 1) 设置页签改名
await page.evaluate(() => {
  [...document.querySelectorAll("button")].find((b) => /偏好设置/.test(b.getAttribute("title") || ""))?.click();
});
await new Promise((r) => setTimeout(r, 600));
const tabs = await page.evaluate(() =>
  [...document.querySelectorAll(".ty-settings-tab-btn")].map((t) => t.textContent.trim())
);
console.log("tabs:", JSON.stringify(tabs));
await page.evaluate(() => document.querySelector("#settings-modal-overlay")?.remove());

// 2) Ctrl+S 保存反馈（真实桌面 API）
await page.evaluate(() => {
  window.__MARKWEAVE_EDITOR__.setMarkdown("# 测试\n\n内容\n", { resetHistory: true });
});
await new Promise((r) => setTimeout(r, 800));

const statusBefore = await page.evaluate(() => {
  const el = document.getElementById("save-status");
  return { text: el.textContent, visible: el.classList.contains("is-visible") };
});
console.log("status before:", JSON.stringify(statusBefore));

await page.keyboard.down("Control");
await page.keyboard.press("s");
await page.keyboard.up("Control");
await new Promise((r) => setTimeout(r, 2500));

const statusAfter = await page.evaluate(() => {
  const el = document.getElementById("save-status");
  return { text: el.textContent, visible: el.classList.contains("is-visible"), tone: el.dataset.tone };
});
console.log("status after Ctrl+S:", JSON.stringify(statusAfter));

// 3) 等待外部轮询若干轮，确认没有误弹"外部被修改"
await new Promise((r) => setTimeout(r, 6000));
const promptShown = await page.evaluate(() => /已在外部被修改/.test(document.body.innerText));
console.log("false external prompt after save:", promptShown);

await browser.disconnect();
