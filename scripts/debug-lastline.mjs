import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import os from "os";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "markweave-lastline-"));

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: "new",
  defaultViewport: { width: 1280, height: 900 },
  args: ["--no-sandbox", "--disable-setuid-sandbox", `--user-data-dir=${profileDir}`],
});

try {
  const page = await browser.newPage();
  await page.goto("http://localhost:5174/", { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 400));

  // 复现用户示例：最后一行是空行
  await page.evaluate(() => {
    window.__MARKWEAVE_EDITOR__.setMarkdown(
      "```python\nfrom pathlib import Path\n\n```\n\n后面的段落",
      { resetHistory: true }
    );
  });
  await new Promise((r) => setTimeout(r, 500));

  const geom = await page.evaluate(() => {
    const view = window.__MARKWEAVE_EDITOR__.view;
    const pre = document.querySelector(".md-fences-wrapper pre");
    pre.scrollIntoView({ block: "center" });
    const code = pre.querySelector("code");
    const pr = pre.getBoundingClientRect();
    const cr = code.getBoundingClientRect();

    // 每一行的真实盒模型
    const lines = [];
    const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const r = document.createRange();
      r.selectNodeContents(n);
      for (const rect of r.getClientRects()) {
        lines.push({ top: Math.round(rect.top), bottom: Math.round(rect.bottom), h: Math.round(rect.height) });
      }
    }
    const br = code.querySelector("br");
    const brRect = br?.getBoundingClientRect();

    // 扫描 pre 内每一像素高度，看 posAtCoords 落在哪里
    const scan = [];
    for (let y = Math.round(pr.top) + 2; y < Math.round(pr.bottom) - 2; y += 4) {
      const p = view.posAtCoords({ left: pr.left + 40, top: y });
      scan.push({ y, pos: p?.pos ?? null, inside: p?.inside ?? null });
    }
    return {
      preHeight: Math.round(pr.height),
      preTop: Math.round(pr.top),
      preBottom: Math.round(pr.bottom),
      codeHeight: Math.round(cr.height),
      codePaddingBottom: getComputedStyle(pre).paddingBottom,
      lineHeight: getComputedStyle(pre).lineHeight,
      lines,
      brRect: brRect ? { top: Math.round(brRect.top), bottom: Math.round(brRect.bottom), h: Math.round(brRect.height) } : null,
      scan,
    };
  });

  console.log(JSON.stringify(geom, null, 1));
} finally {
  await browser.close();
}
