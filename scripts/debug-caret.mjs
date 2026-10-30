import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import os from "os";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "markweave-caret-"));

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: "new",
  defaultViewport: { width: 1280, height: 900 },
  args: ["--no-sandbox", "--disable-setuid-sandbox", `--user-data-dir=${profileDir}`],
});

try {
  const page = await browser.newPage();
  await page.goto("http://localhost:5174/", { waitUntil: "networkidle0" });

  // 构造“代码块最后一行为空行”的文档
  const parsed = await page.evaluate(() => {
    const ed = window.__MARKWEAVE_EDITOR__;
    ed.setMarkdown("```py\nfrom pathlib import Path\n\n```\n\nAfter", { resetHistory: true });
    return null;
  });

  await new Promise((r) => setTimeout(r, 300));

  const info = await page.evaluate(() => {
    const view = window.__MARKWEAVE_EDITOR__.view;
    const blocks = [];
    view.state.doc.forEach((n, off) => {
      blocks.push({ name: n.type.name, off, text: JSON.stringify(n.textContent) });
    });
    const code = document.querySelector(".md-fences-wrapper code");
    return {
      blocks,
      codeHTML: code.innerHTML.slice(0, 300),
      codeText: JSON.stringify(code.textContent),
      trailingBreaks: code.querySelectorAll(".ProseMirror-trailingBreak").length,
    };
  });
  console.log(JSON.stringify(info, null, 1));

  // 点击代码块最后一行（末行区域）
  const rect = await page.evaluate(() => {
    const pre = document.querySelector(".md-fences-wrapper pre");
    pre.scrollIntoView({ block: "center" });
    const r = pre.getBoundingClientRect();
    return { x: r.left + 60, y: r.bottom - 10, top: r.top, bottom: r.bottom, h: r.height };
  });
  console.log("pre rect:", rect);

  await page.mouse.click(rect.x, rect.y);
  await new Promise((r) => setTimeout(r, 200));

  const sel = await page.evaluate(() => {
    const view = window.__MARKWEAVE_EDITOR__.view;
    const { from, to, empty } = view.state.selection;
    const $from = view.state.selection.$from;
    return {
      from,
      to,
      empty,
      parent: $from.parent.type.name,
      parentOffset: $from.parentOffset,
      parentSize: $from.parent.content.size,
      textAtCursor: JSON.stringify($from.parent.textContent),
      domAnchor: (() => {
        const s = window.getSelection();
        const n = s?.anchorNode;
        const el = n?.nodeType === 3 ? n.parentElement : n;
        return { tag: el?.nodeName, cls: el?.className, offset: s?.anchorOffset };
      })(),
    };
  });
  console.log("selection after click:", JSON.stringify(sel, null, 1));

  // 在末尾按 Enter，观察是否留在代码块内
  await page.keyboard.press("Enter");
  await new Promise((r) => setTimeout(r, 200));
  const afterEnter = await page.evaluate(() => {
    const view = window.__MARKWEAVE_EDITOR__.view;
    const $from = view.state.selection.$from;
    return {
      parent: $from.parent.type.name,
      parentOffset: $from.parentOffset,
      content: JSON.stringify($from.parent.textContent),
    };
  });
  console.log("after Enter:", JSON.stringify(afterEnter));
} finally {
  await browser.close();
}
