import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import os from "os";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "markweave-pos-"));

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: "new",
  defaultViewport: { width: 1280, height: 900 },
  args: ["--no-sandbox", "--disable-setuid-sandbox", `--user-data-dir=${profileDir}`],
});

const probeDoc = (md) => `
(() => {
  const ed = window.__MARKWEAVE_EDITOR__;
  ed.setMarkdown(${JSON.stringify(md)}, { resetHistory: true });
  return true;
})()`;

try {
  const page = await browser.newPage();
  await page.goto("http://localhost:5174/", { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 400));

  for (const [label, md] of [
    ["trailing-empty-line", "```py\nfrom pathlib import Path\n\n```\n\nAfter"],
    ["no-trailing-empty", "```py\nfrom pathlib import Path\n```\n\nAfter"],
  ]) {
    await page.evaluate(probeDoc(md));
    await new Promise((r) => setTimeout(r, 350));

    const info = await page.evaluate(() => {
      const view = window.__MARKWEAVE_EDITOR__.view;
      const pre = document.querySelector(".md-fences-wrapper pre");
      pre.scrollIntoView({ block: "center" });
      const codeEl = pre.querySelector("code");

      // 用 Range 取出每一行可视矩形
      const rects = [];
      const walker = document.createTreeWalker(codeEl, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        if (!n.textContent) continue;
        const r = document.createRange();
        r.selectNodeContents(n);
        for (const cr of r.getClientRects()) {
          rects.push({ top: Math.round(cr.top), bottom: Math.round(cr.bottom), text: n.textContent.slice(0, 20) });
        }
      }
      const preRect = pre.getBoundingClientRect();
      const brRect = codeEl.querySelector("br")?.getBoundingClientRect();

      // 探测点击位置映射
      const probes = [];
      const base = preRect.top + preRect.height;
      for (const dy of [0, 4, 8, 12, 16, 20, 26, 32]) {
        const top = base - dy;
        const p = view.posAtCoords({ left: preRect.left + 60, top });
        probes.push({
          dy,
          top: Math.round(top),
          pos: p ? p.pos : null,
          inside: p ? p.inside : null,
        });
      }

      const text = view.state.doc.firstChild.textContent;
      return {
        text: JSON.stringify(text),
        size: view.state.doc.firstChild.content.size,
        preRect: { top: Math.round(preRect.top), bottom: Math.round(preRect.bottom), h: Math.round(preRect.height) },
        brTop: brRect ? Math.round(brRect.top) : null,
        brBottom: brRect ? Math.round(brRect.bottom) : null,
        lineRects: rects,
        probes,
      };
    });
    console.log(`\n=== ${label} ===`);
    console.log(JSON.stringify(info, null, 1));
  }
} finally {
  await browser.close();
}
