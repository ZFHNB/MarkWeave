import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import os from "os";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "markweave-drag-"));

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: "new",
  defaultViewport: { width: 1280, height: 900 },
  args: ["--no-sandbox", "--disable-setuid-sandbox", `--user-data-dir=${profileDir}`],
});

try {
  const page = await browser.newPage();
  await page.goto("http://localhost:5174/", { waitUntil: "networkidle0" });

  await page.evaluate(() => {
    window.__MARKWEAVE_EDITOR__.setMarkdown(
      "第一段文字，用来测试拖拽选取是否跟手。\n\n第二段文字，也足够长，用来继续拖拽选择。\n\n第三段文字。",
      { resetHistory: true }
    );
  });
  await new Promise((r) => setTimeout(r, 500));

  const coords = await page.evaluate(() => {
    const ps = [...document.querySelectorAll(".ProseMirror p")];
    const first = document.createRange();
    first.selectNodeContents(ps[0]);
    const a = first.getClientRects()[0];
    const last = document.createRange();
    last.selectNodeContents(ps[2]);
    const z = last.getClientRects()[0];
    return {
      start: { x: a.left + 2, y: a.top + a.height / 2 },
      mid: { x: a.left + 40, y: a.top + a.height / 2 },
      end: { x: z.left + 60, y: z.top + z.height / 2 },
    };
  });

  await page.mouse.move(coords.start.x, coords.start.y);
  await page.mouse.down();

  const samples = [];
  for (let i = 1; i <= 8; i++) {
    const x = coords.start.x + ((coords.end.x - coords.start.x) * i) / 8;
    const y = coords.start.y + ((coords.end.y - coords.start.y) * i) / 8;
    await page.mouse.move(x, y, { steps: 4 });
    const sel = await page.evaluate(() => {
      const v = window.__MARKWEAVE_EDITOR__.view;
      const s = v.state.selection;
      return { from: s.from, to: s.to, empty: s.empty };
    });
    samples.push({ i, x: Math.round(x), y: Math.round(y), ...sel });
  }

  await page.mouse.up();
  const final = await page.evaluate(() => {
    const v = window.__MARKWEAVE_EDITOR__.view;
    const s = v.state.selection;
    return { from: s.from, to: s.to, text: v.state.doc.textBetween(s.from, s.to, "\n") };
  });

  console.log("drag samples:", JSON.stringify(samples, null, 1));
  console.log("final selection:", JSON.stringify(final));
} finally {
  await browser.close();
}
