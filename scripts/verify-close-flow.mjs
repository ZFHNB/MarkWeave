import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9777", defaultViewport: null });
const pages = await browser.pages();
const page = pages.find((p) => p.url().includes("app://markweave")) ?? pages[0];
await page.bringToFront();
await new Promise((r) => setTimeout(r, 1500));

// 情形 1：新建空白文档后请求关闭 —— 不应出现弹窗
await page.evaluate(() => {
  document.getElementById("btn-new-file")?.click();
});
await new Promise((r) => setTimeout(r, 800));

const emptyDoc = await page.evaluate(() => {
  const w = window;
  return {
    title: document.getElementById("doc-title")?.textContent,
    hasHook: typeof w.__MARKWEAVE_TEST_CLOSE__ === "function",
  };
});
console.log("empty doc:", JSON.stringify(emptyDoc));

await page.evaluate(() => window.__MARKWEAVE_TEST_CLOSE__?.());
await new Promise((r) => setTimeout(r, 1200));

const afterEmptyClose = await page.evaluate(() => ({
  overlay: Boolean(document.getElementById("close-confirm-overlay")),
}));
console.log("empty doc close prompt:", JSON.stringify(afterEmptyClose));

// 情形 2：输入内容后再请求关闭 —— 应出现弹窗
await page.evaluate(() => {
  const ed = window.__MARKWEAVE_EDITOR__;
  ed.setMarkdown("# 临时草稿\n\n有内容需要保存", { resetHistory: true });
  // 让 onDocChange 记录脏状态：手动触发一次输入
  ed.view.dispatch(ed.view.state.tr.insertText("!", 1));
});
await new Promise((r) => setTimeout(r, 900));

await page.evaluate(() => window.__MARKWEAVE_TEST_CLOSE__?.());
await new Promise((r) => setTimeout(r, 1000));

const afterDirtyClose = await page.evaluate(() => ({
  overlay: Boolean(document.getElementById("close-confirm-overlay")),
  text: document.getElementById("close-confirm-title")?.textContent,
  buttons: [...document.querySelectorAll("#close-confirm-overlay .ty-btn")].map((b) => b.textContent?.trim()),
}));
console.log("dirty doc close prompt:", JSON.stringify(afterDirtyClose));

await page.screenshot({ path: "test-artifacts/close-prompt.png" });

await browser.disconnect();
