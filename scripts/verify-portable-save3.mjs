import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9555", defaultViewport: null });
const pages = await browser.pages();
const page = pages.find((p) => p.url().includes("app://markweave")) ?? pages[0];
await page.bringToFront();
await new Promise((r) => setTimeout(r, 1200));

await page.evaluate(() => {
  window.__MARKWEAVE_EDITOR__.setMarkdown("# 标题\n\n正文内容\n", { resetHistory: true });
});
await new Promise((r) => setTimeout(r, 600));

const before = await page.evaluate(() => {
  const el = document.getElementById("save-status");
  return { text: el.textContent, visible: el.classList.contains("is-visible") };
});
console.log("before:", JSON.stringify(before));

// 触发 Ctrl+S（无路径 → 走另存为对话框）
await page.keyboard.down("Control");
await page.keyboard.press("s");
await page.keyboard.up("Control");

// 观察状态随时间的变化
for (const wait of [500, 1500, 3000]) {
  await new Promise((r) => setTimeout(r, wait));
  const s = await page.evaluate(() => {
    const el = document.getElementById("save-status");
    return { text: el.textContent, visible: el.classList.contains("is-visible"), tone: el.dataset.tone };
  });
  console.log(`after ~${wait}ms:`, JSON.stringify(s));
}

await browser.disconnect();
