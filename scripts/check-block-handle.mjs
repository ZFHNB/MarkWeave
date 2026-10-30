import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import os from "os";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "markweave-handle2-"));
const outDir = path.resolve("test-artifacts");

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: "new",
  defaultViewport: { width: 1280, height: 900, deviceScaleFactor: 2 },
  args: ["--no-sandbox", "--disable-setuid-sandbox", `--user-data-dir=${profileDir}`],
});

try {
  const page = await browser.newPage();
  await page.goto("http://localhost:5174/", { waitUntil: "networkidle0" });
  await page.evaluate(() =>
    window.__MARKWEAVE_EDITOR__.setMarkdown(
      "# 标题一\n\n第一段内容，用来测试手柄定位。\n\n## 标题二\n\n第二段内容。\n\n### 标题三\n\n第三段内容。",
      { resetHistory: true }
    )
  );
  await new Promise((r) => setTimeout(r, 700));

  // 1) 悬浮正文，检查手柄是否与块对齐
  const target = await page.evaluate(() => {
    const ps = [...document.querySelectorAll(".ProseMirror p")];
    ps[1].scrollIntoView({ block: "center" });
    const r = ps[1].getBoundingClientRect();
    return { x: r.left + 60, y: r.top + r.height / 2, blockLeft: r.left, blockTop: r.top, blockH: r.height };
  });
  await new Promise((r) => setTimeout(r, 250));
  await page.mouse.move(target.x, target.y);
  await new Promise((r) => setTimeout(r, 300));

  const handle = await page.evaluate(() => {
    const h = document.querySelector(".md-block-handle");
    if (!h) return null;
    const r = h.getBoundingClientRect();
    return {
      visible: h.classList.contains("is-visible"),
      cursor: getComputedStyle(h).cursor,
      position: getComputedStyle(h).position,
      rect: { left: Math.round(r.left), top: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
    };
  });
  console.log("handle:", JSON.stringify(handle));
  console.log("block left/top/height:", target.blockLeft, target.blockTop, target.blockH);

  // 2) 关键：把鼠标移到块左侧空白（手柄附近），手柄应保持
  const moveToHandle = await page.evaluate(() => {
    const h = document.querySelector(".md-block-handle");
    const r = h.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.move(moveToHandle.x, moveToHandle.y, { steps: 8 });
  await new Promise((r) => setTimeout(r, 350));
  const stillVisible = await page.evaluate(() => {
    const h = document.querySelector(".md-block-handle");
    return { visible: h?.classList.contains("is-visible"), opacity: getComputedStyle(h).opacity };
  });
  console.log("after moving onto handle:", JSON.stringify(stillVisible));

  await page.screenshot({
    path: path.join(outDir, "block-handle-fixed.png"),
    clip: { x: 250, y: Math.max(0, target.blockTop - 60), width: 900, height: 200 },
  });

  // 3) 拖动：从手柄拖到最后一块下方
  const hRect = await page.evaluate(() => {
    const r = document.querySelector(".md-block-handle").getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.move(hRect.x, hRect.y);
  await page.mouse.down();
  const dropTarget = await page.evaluate(() => {
    const ps = [...document.querySelectorAll(".ProseMirror p")];
    const last = ps[ps.length - 1].getBoundingClientRect();
    return { x: last.left + 100, y: last.bottom - 3 };
  });
  await page.mouse.move(dropTarget.x, dropTarget.y, { steps: 15 });
  await new Promise((r) => setTimeout(r, 300));

  const indicator = await page.evaluate(() => {
    const el = document.querySelector(".md-drop-indicator");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), position: getComputedStyle(el).position };
  });
  console.log("indicator:", JSON.stringify(indicator));

  await page.screenshot({
    path: path.join(outDir, "block-drag-fixed.png"),
    clip: { x: 250, y: 150, width: 900, height: 600 },
  });

  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 400));
  console.log("markdown:\n" + (await page.evaluate(() => window.__MARKWEAVE_EDITOR__.getMarkdown())));
} finally {
  await browser.close();
}
