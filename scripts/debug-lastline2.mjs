import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import os from "os";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "markweave-ll2-"));

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: "new",
  defaultViewport: { width: 1280, height: 900 },
  args: ["--no-sandbox", "--disable-setuid-sandbox", `--user-data-dir=${profileDir}`],
});

try {
  const page = await browser.newPage();
  await page.goto("http://localhost:5174/", { waitUntil: "networkidle0" });

  const md = "```python\nfrom pathlib import Path\n\n```\n\n后面";

  for (const y of [208, 214, 222]) {
    await page.evaluate((m) => window.__MARKWEAVE_EDITOR__.setMarkdown(m, { resetHistory: true }), md);
    await new Promise((r) => setTimeout(r, 300));
    const box = await page.evaluate(() => {
      const el = document.querySelector(".md-fences-wrapper pre");
      el.scrollIntoView({ block: "center" });
      return null;
    });
    await new Promise((r) => setTimeout(r, 250));
    const rect = await page.evaluate(() => {
      const r = document.querySelector(".md-fences-wrapper pre").getBoundingClientRect();
      return { left: r.left, top: r.top, bottom: r.bottom };
    });
    const absY = rect.top + y - 168;
    await page.mouse.click(rect.left + 40, absY);
    await new Promise((r) => setTimeout(r, 150));
    const sel = await page.evaluate(() => {
      const v = window.__MARKWEAVE_EDITOR__.view;
      const s = v.state.selection;
      const rects = window.getSelection().getRangeAt(0).getClientRects();
      return {
        pos: s.from,
        offset: s.$from.parentOffset,
        caretTop: rects[0] ? Math.round(rects[0].top) : null,
        caretBottom: rects[0] ? Math.round(rects[0].bottom) : null,
      };
    });
    await page.keyboard.type("X");
    await new Promise((r) => setTimeout(r, 150));
    const text = await page.evaluate(() => {
      const v = window.__MARKWEAVE_EDITOR__.view;
      return JSON.stringify(v.state.doc.firstChild.textContent);
    });
    console.log(JSON.stringify({ clickY: Math.round(absY), ...sel, text }));
  }
} finally {
  await browser.close();
}
