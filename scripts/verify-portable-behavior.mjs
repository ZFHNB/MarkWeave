import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9333", defaultViewport: null });
const pages = await browser.pages();
const page = pages.find((p) => p.url().includes("app://markweave")) ?? pages[0];
await page.bringToFront();
await new Promise((r) => setTimeout(r, 800));

// 关闭可能残留的设置弹窗
await page.evaluate(() => document.querySelector("#settings-modal-overlay")?.remove());

// 1) 代码块末行回车应留在块内
await page.evaluate(() =>
  window.__MARKWEAVE_EDITOR__.setMarkdown("```python\nfrom pathlib import Path\n```\n\n后面段落", {
    resetHistory: true,
  })
);
await new Promise((r) => setTimeout(r, 500));

const clickPt = await page.evaluate(() => {
  const pre = document.querySelector(".md-fences-wrapper pre");
  pre.scrollIntoView({ block: "center" });
  const r = pre.getBoundingClientRect();
  return { x: r.left + 60, y: r.bottom - 10 };
});
await new Promise((r) => setTimeout(r, 250));
await page.mouse.click(clickPt.x, clickPt.y);
await new Promise((r) => setTimeout(r, 200));
await page.keyboard.press("Enter");
await new Promise((r) => setTimeout(r, 250));

const afterEnter = await page.evaluate(() => {
  const v = window.__MARKWEAVE_EDITOR__.view;
  return { parent: v.state.selection.$from.parent.type.name, text: JSON.stringify(v.state.selection.$from.parent.textContent) };
});
console.log("Enter in code block:", JSON.stringify(afterEnter));

// 2) 块拖动手柄应出现
await page.evaluate(() =>
  window.__MARKWEAVE_EDITOR__.setMarkdown("## A\n\n第一段。\n\n## B\n\n第二段。\n\n## C\n\n第三段。", {
    resetHistory: true,
  })
);
await new Promise((r) => setTimeout(r, 500));

const pRect = await page.evaluate(() => {
  const ps = [...document.querySelectorAll(".ProseMirror p")];
  ps[1].scrollIntoView({ block: "center" });
  const r = ps[1].getBoundingClientRect();
  return { x: r.left + 40, y: r.top + r.height / 2 };
});
await new Promise((r) => setTimeout(r, 250));
await page.mouse.move(pRect.x, pRect.y);
await new Promise((r) => setTimeout(r, 300));

const handle = await page.evaluate(() => {
  const h = document.querySelector(".md-block-handle");
  return h ? { visible: h.classList.contains("is-visible"), cursor: getComputedStyle(h).cursor, pos: h.dataset.blockPos } : null;
});
console.log("block handle:", JSON.stringify(handle));

// 3) 自动保存设置持久化
const persisted = await page.evaluate(() => {
  localStorage.setItem("markweave_autosave", JSON.stringify({ mode: "interval", intervalMinutes: 7, historyDir: "", maxHistory: 12, historyEnabled: true }));
  return localStorage.getItem("markweave_autosave");
});
console.log("autosave persisted:", persisted);

await browser.disconnect();
