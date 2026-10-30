import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import os from "os";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "mw-dragfinal-"));

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: "new",
  defaultViewport: { width: 1400, height: 800 },
  args: ["--no-sandbox", "--disable-setuid-sandbox", `--user-data-dir=${profileDir}`],
});

const results = [];

try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));
  await page.goto("http://localhost:5174/", { waitUntil: "networkidle0" });

  await page.evaluate(() => {
    const parts = [];
    for (let i = 0; i < 20; i++) parts.push(`## 第 ${i} 节\n\n第 ${i} 段内容。`);
    window.__MARKWEAVE_EDITOR__.setMarkdown(parts.join("\n\n"), { resetHistory: true });
  });
  await new Promise((r) => setTimeout(r, 900));

  async function dragUnderScroll(scrollTop, label) {
    await page.evaluate((st) => {
      document.querySelector(".ty-editor-scroller").scrollTop = st;
    }, scrollTop);
    await new Promise((r) => setTimeout(r, 500));

    const probe = await page.evaluate(() => {
      const ps = [...document.querySelectorAll(".ProseMirror > p")];
      const el = ps.find((p) => {
        const r = p.getBoundingClientRect();
        return r.top > 250 && r.bottom < 600;
      });
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { text: el.textContent.slice(0, 14), left: r.left, centerY: r.top + r.height / 2 };
    });
    if (!probe) return results.push({ label, skipped: true });

    await page.mouse.move(probe.left + 60, probe.centerY);
    await new Promise((r) => setTimeout(r, 350));

    const h = await page.evaluate(() => {
      const el = document.querySelector(".md-block-handle");
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, visible: el.classList.contains("is-visible") };
    });
    if (!h.visible) return results.push({ label, handleVisible: false });

    // 拖到视口内另一个块的边界
    const dest = await page.evaluate(() => {
      const hs = [...document.querySelectorAll(".ProseMirror > h2")];
      const el = hs.find((x) => {
        const r = x.getBoundingClientRect();
        return r.top > 120 && r.bottom < 700;
      });
      const r = el.getBoundingClientRect();
      return { x: r.left + 100, y: r.top + 3 };
    });

    await page.mouse.move(h.x, h.y);
    await page.mouse.down();
    await page.mouse.move(dest.x, dest.y, { steps: 18 });
    await new Promise((r) => setTimeout(r, 300));

    const ind = await page.evaluate(() => {
      const el = document.querySelector(".md-drop-indicator");
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top), inViewport: r.top > 0 && r.top < window.innerHeight };
    });

    await page.mouse.up();
    await new Promise((r) => setTimeout(r, 400));

    results.push({
      label,
      dragged: probe.text,
      indicator: ind,
      moved: await page.evaluate((t) => {
        const md = window.__MARKWEAVE_EDITOR__.getMarkdown();
        const idx = md.indexOf(t);
        return { present: idx >= 0, position: idx };
      }, probe.text),
    });
  }

  await dragUnderScroll(0, "top");
  await dragUnderScroll(900, "scrolled");

  console.log(JSON.stringify(results, null, 1));
} finally {
  await browser.close();
}
