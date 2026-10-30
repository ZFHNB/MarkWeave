import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import os from "os";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "markweave-draglog-"));

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: "new",
  defaultViewport: { width: 1280, height: 900 },
  args: ["--no-sandbox", "--disable-setuid-sandbox", `--user-data-dir=${profileDir}`],
});

try {
  const page = await browser.newPage();
  await page.goto("http://localhost:5174/", { waitUntil: "networkidle0" });
  await page.evaluate(() =>
    window.__MARKWEAVE_EDITOR__.setMarkdown(
      "## A\n\n第一段。\n\n## B\n\n第二段。\n\n## C\n\n第三段。",
      { resetHistory: true }
    )
  );
  await new Promise((r) => setTimeout(r, 500));

  const geom = await page.evaluate(() => {
    const view = window.__MARKWEAVE_EDITOR__.view;
    const rows = [];
    view.state.doc.forEach((n, off) => {
      const dom = view.nodeDOM(off);
      const r = dom.getBoundingClientRect();
      rows.push({ off, name: n.type.name, top: Math.round(r.top), bottom: Math.round(r.bottom) });
    });
    return rows;
  });
  console.log("block geometry:", JSON.stringify(geom));

  // 悬浮第二段，取手柄
  const p2 = geom.find((g) => g.name === "paragraph" && g.off === 22) ?? geom[3];
  await page.mouse.move(500, Math.round((p2.top + p2.bottom) / 2));
  await new Promise((r) => setTimeout(r, 250));

  const h = await page.evaluate(() => {
    const el = document.querySelector(".md-block-handle");
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, blockPos: el.dataset.blockPos };
  });
  console.log("handle:", JSON.stringify(h));

  await page.mouse.move(h.x, h.y);
  await new Promise((r) => setTimeout(r, 100));
  await page.mouse.down();

  // 逐点移动，记录每次的指示线位置与推断落点
  const targets = [0.25, 0.5, 0.75, 0.95];
  for (const t of targets) {
    const last = geom[geom.length - 1];
    const y = Math.round(last.top + (last.bottom - last.top) * t);
    await page.mouse.move(600, y, { steps: 6 });
    await new Promise((r) => setTimeout(r, 120));
    const snap = await page.evaluate(() => {
      const el = document.querySelector(".md-drop-indicator");
      return el ? { top: Math.round(el.getBoundingClientRect().top) } : null;
    });
    console.log(`y=${y} t=${t} indicator=${JSON.stringify(snap)}`);
  }

  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 300));
  console.log("RESULT:\n" + (await page.evaluate(() => window.__MARKWEAVE_EDITOR__.getMarkdown())));
} finally {
  await browser.close();
}
