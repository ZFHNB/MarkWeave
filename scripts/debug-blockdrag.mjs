import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import os from "os";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "markweave-blockdrag-"));
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
      "## 第一块标题\n\n第一段内容。\n\n## 第二块标题\n\n第二段内容。\n\n## 第三块标题\n\n第三段内容。",
      { resetHistory: true }
    )
  );
  await new Promise((r) => setTimeout(r, 500));

  // 悬浮到第 3 个块（第二段内容），检查手柄出现
  const pRect = await page.evaluate(() => {
    const ps = [...document.querySelectorAll(".ProseMirror p")];
    const target = ps[1];
    target.scrollIntoView({ block: "center" });
    const r = target.getBoundingClientRect();
    return { x: r.left + 40, y: r.top + r.height / 2 };
  });
  await new Promise((r) => setTimeout(r, 250));

  await page.mouse.move(pRect.x, pRect.y);
  await new Promise((r) => setTimeout(r, 250));

  const handleInfo = await page.evaluate(() => {
    const h = document.querySelector(".md-block-handle");
    if (!h) return null;
    const r = h.getBoundingClientRect();
    const cs = getComputedStyle(h);
    return {
      visible: h.classList.contains("is-visible"),
      opacity: cs.opacity,
      pointerEvents: cs.pointerEvents,
      cursor: cs.cursor,
      rect: { left: Math.round(r.left), top: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
    };
  });
  console.log("handle:", JSON.stringify(handleInfo));

  await page.screenshot({ path: path.join(outDir, "block-handle.png"), clip: { x: 300, y: 200, width: 700, height: 400 } });

  // 拖动第一段到第三段之前
  if (handleInfo) {
    const hx = handleInfo.rect.left + handleInfo.rect.w / 2;
    const hy = handleInfo.rect.top + handleInfo.rect.h / 2;

    await page.mouse.move(hx, hy);
    await new Promise((r) => setTimeout(r, 150));
    const beforeDown = await page.evaluate(() => ({ pos: document.querySelector('.md-block-handle')?.dataset.blockPos, visible: document.querySelector('.md-block-handle')?.className }));
    console.log('before down:', JSON.stringify(beforeDown));
    await page.mouse.down();
    const afterDown = await page.evaluate(() => ({ dragging: document.body.classList.contains('md-block-dragging') }));
    console.log('after down:', JSON.stringify(afterDown));
    const target = await page.evaluate(() => {
      const ps = [...document.querySelectorAll(".ProseMirror p")];
      const last = ps[ps.length - 1].getBoundingClientRect();
      return { x: last.left + 100, y: last.top + 4 };
    });
    await page.mouse.move(target.x, target.y, { steps: 12 });
    await new Promise((r) => setTimeout(r, 250));

    const dropInfo = await page.evaluate(() => {
      const h = document.querySelector(".md-block-handle");
      const v = window.__MARKWEAVE_EDITOR__.view;
      const blocks = [];
      v.state.doc.forEach((n, off) => blocks.push({ name: n.type.name, off, text: n.textContent.slice(0, 12), size: n.nodeSize }));
      return { blockPos: h?.dataset.blockPos, blocks };
    });
    console.log("drag block:", JSON.stringify(dropInfo));

    const indicator = await page.evaluate(() => {
      const el = document.querySelector(".md-drop-indicator");
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top), h: Math.round(r.height), bg: getComputedStyle(el).backgroundColor };
    });
    console.log("indicator:", JSON.stringify(indicator));
    await page.screenshot({ path: path.join(outDir, "block-drag-indicator.png"), clip: { x: 300, y: 150, width: 800, height: 500 } });

    await page.mouse.up();
    await new Promise((r) => setTimeout(r, 400));

    const md = await page.evaluate(() => window.__MARKWEAVE_EDITOR__.getMarkdown());
    console.log("markdown after drag:\n" + md);
  }
} finally {
  await browser.close();
}
