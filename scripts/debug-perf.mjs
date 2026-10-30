import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import os from "os";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "markweave-perf-"));

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: "new",
  defaultViewport: { width: 1280, height: 900 },
  args: ["--no-sandbox", "--disable-setuid-sandbox", `--user-data-dir=${profileDir}`],
});

try {
  const page = await browser.newPage();
  await page.goto("http://localhost:5174/", { waitUntil: "networkidle0" });

  // 生成中等规模文档：200 段，含行内标记
  await page.evaluate(() => {
    const parts = [];
    for (let i = 0; i < 200; i++) {
      parts.push(
        `## 标题 ${i}\n\n这是第 ${i} 段，包含 **加粗**、*斜体*、\`代码\` 与 [链接](https://example.com) 标记，用来衡量选区更新开销。\n`
      );
    }
    window.__MARKWEAVE_EDITOR__.setMarkdown(parts.join("\n"), { resetHistory: true });
  });
  await new Promise((r) => setTimeout(r, 1500));

  const result = await page.evaluate(() => {
    const ed = window.__MARKWEAVE_EDITOR__;
    const view = ed.view;
    const docSize = view.state.doc.content.size;

    const times = [];
    for (let i = 0; i < 40; i++) {
      const pos = 1 + Math.floor((docSize - 2) * (i / 40));
      const t0 = performance.now();
      const sel = window.__PM_TEXT_SELECTION__ ?? null;
      const SelectionCtor = sel ?? Object.getPrototypeOf(view.state.selection).constructor;
      view.dispatch(view.state.tr.setSelection(SelectionCtor.create(view.state.doc, pos)));
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    return {
      docSize,
      median: +times[Math.floor(times.length / 2)].toFixed(2),
      p90: +times[Math.floor(times.length * 0.9)].toFixed(2),
      max: +times[times.length - 1].toFixed(2),
    };
  }).catch(async (e) => {
    return { error: String(e) };
  });

  console.log("selection dispatch cost:", JSON.stringify(result));

  // 用真实鼠标拖拽测帧间隔
  const dragTiming = await page.evaluate(async () => {
    const view = window.__MARKWEAVE_EDITOR__.view;
    const frames = [];
    let last = performance.now();
    let running = true;
    const tick = () => {
      const now = performance.now();
      frames.push(now - last);
      last = now;
      if (running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    await new Promise((r) => setTimeout(r, 1500));
    running = false;
    frames.sort((a, b) => a - b);
    return {
      count: frames.length,
      median: +frames[Math.floor(frames.length / 2)].toFixed(1),
      p95: +frames[Math.floor(frames.length * 0.95)].toFixed(1),
      max: +frames[frames.length - 1].toFixed(1),
    };
  });
  console.log("idle frame timing:", JSON.stringify(dragTiming));
} finally {
  await browser.close();
}
