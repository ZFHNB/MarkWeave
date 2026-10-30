import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import os from "os";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "mw-dragv2-"));

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: "new",
  defaultViewport: { width: 1400, height: 800 },
  args: ["--no-sandbox", "--disable-setuid-sandbox", `--user-data-dir=${profileDir}`],
});

const report = [];

try {
  const page = await browser.newPage();
  await page.goto("http://localhost:5174/", { waitUntil: "networkidle0" });

  await page.evaluate(() => {
    const parts = [];
    for (let i = 0; i < 30; i++) parts.push(`## 第 ${i} 节\n\n第 ${i} 段内容。`);
    window.__MARKWEAVE_EDITOR__.setMarkdown(parts.join("\n\n"), { resetHistory: true });
  });
  await new Promise((r) => setTimeout(r, 900));

  // 三组场景：顶部 / 滚动后 / 再次滚动
  for (const scrollTop of [0, 900, 1800]) {
    await page.evaluate((st) => {
      document.querySelector(".ty-editor-scroller").scrollTop = st;
    }, scrollTop);
    await new Promise((r) => setTimeout(r, 500));

    // 实时选取视口内一个完整可见的段落
    const probe = await page.evaluate(() => {
      const ps = [...document.querySelectorAll(".ProseMirror > p")];
      const el = ps.find((p) => {
        const r = p.getBoundingClientRect();
        return r.top > 200 && r.bottom < 700;
      });
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        text: el.textContent.slice(0, 14),
        left: r.left,
        top: r.top,
        bottom: r.bottom,
        centerY: r.top + r.height / 2,
      };
    });
    if (!probe) continue;

    await page.mouse.move(probe.left + 60, probe.centerY);
    await new Promise((r) => setTimeout(r, 350));

    const h = await page.evaluate(() => {
      const el = document.querySelector(".md-block-handle");
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        visible: el.classList.contains("is-visible"),
        left: Math.round(r.left),
        centerY: Math.round(r.top + r.height / 2),
        blockPos: el.dataset.blockPos,
      };
    });

    report.push({
      scrollTop,
      block: probe.text,
      blockCenterY: Math.round(probe.centerY),
      handleCenterY: h ? h.centerY : null,
      deltaY: h ? Math.abs(h.centerY - Math.round(probe.centerY)) : null,
      leftGap: h ? Math.round(probe.left - h.left) : null,
      visible: h ? h.visible : false,
    });
  }

  console.log(JSON.stringify(report, null, 1));
} finally {
  await browser.close();
}
