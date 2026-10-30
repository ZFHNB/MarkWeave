import puppeteer from "puppeteer-core";

const connect = () =>
  puppeteer.connect({ browserURL: "http://127.0.0.1:9777", defaultViewport: null });

async function getPage(browser) {
  const pages = await browser.pages();
  const page = pages.find((p) => p.url().includes("app://markweave")) ?? pages[0];
  await page.bringToFront();
  await new Promise((r) => setTimeout(r, 1200));
  return page;
}

// ---- 情形 1：新建空白文档 → 关闭应直接退出、不弹窗 ----
{
  const browser = await connect();
  const page = await getPage(browser);
  await page.evaluate(() => document.getElementById("btn-new-file")?.click());
  await new Promise((r) => setTimeout(r, 900));

  const before = await page.evaluate(() => ({
    title: document.getElementById("doc-title")?.textContent,
    docTitle: document.title,
    markdown: window.__MARKWEAVE_EDITOR__.getMarkdown(),
  }));
  console.log("case1 before:", JSON.stringify(before));

  let overlayAppeared = null;
  let quit = false;
  try {
    await page.evaluate(() => window.__MARKWEAVE_TEST_CLOSE__());
    await new Promise((r) => setTimeout(r, 1500));
    overlayAppeared = await page.evaluate(() =>
      Boolean(document.getElementById("close-confirm-overlay"))
    );
  } catch (err) {
    // 窗口被销毁 → 连接断开，说明"未弹窗直接退出"
    quit = true;
  }
  console.log("case1 overlay:", overlayAppeared, "quit:", quit);
  try { await browser.disconnect(); } catch {}
}

await new Promise((r) => setTimeout(r, 1500));
let alive = true;
try {
  const res = await fetch("http://127.0.0.1:9777/json/version", { signal: AbortSignal.timeout(3000) });
  alive = res.ok;
} catch {
  alive = false;
}
console.log("app still running after case1:", alive);
