import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import os from "os";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "markweave-mm-"));

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

  // 1) mermaid 预览态：尝试在图表区域点击
  await page.evaluate(() =>
    window.__MARKWEAVE_EDITOR__.setMarkdown("```mermaid\ngraph TD\n    A --> B\n    B --> C\n```", {
      resetHistory: true,
    })
  );
  await new Promise((r) => setTimeout(r, 1200));

  const mermaidInfo = await page.evaluate(() => {
    const wrap = document.querySelector(".md-fences-wrapper");
    const diagram = wrap.querySelector(".md-diagram-preview");
    const svg = diagram.querySelector("svg");
    const r = diagram.getBoundingClientRect();
    const sr = svg?.getBoundingClientRect();
    return {
      diagramDisplay: getComputedStyle(diagram).display,
      diagramRect: { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), h: Math.round(r.height) },
      svgRect: sr ? { top: Math.round(sr.top), left: Math.round(sr.left), h: Math.round(sr.height) } : null,
      preDisplay: getComputedStyle(wrap.querySelector("pre")).display,
      hasToggle: Boolean(wrap.querySelector(".md-fences-toggle-btn")),
    };
  });
  console.log("mermaid:", JSON.stringify(mermaidInfo));

  // 点击图表空白区域（非节点）看是否进入编辑
  const clickPt = { x: mermaidInfo.diagramRect.left + 12, y: mermaidInfo.diagramRect.top + 12 };
  await page.mouse.click(clickPt.x, clickPt.y);
  await new Promise((r) => setTimeout(r, 500));
  const afterClick = await page.evaluate(() => {
    const wrap = document.querySelector(".md-fences-wrapper");
    const v = window.__MARKWEAVE_EDITOR__.view;
    return {
      editingClass: wrap.className.includes("is-editing"),
      preDisplay: getComputedStyle(wrap.querySelector("pre")).display,
      selParent: v.state.selection.$from.parent.type.name,
      selPos: v.state.selection.from,
    };
  });
  console.log("after chart click:", JSON.stringify(afterClick));

  // 2) 普通代码块：末尾空行点击 + 输入
  await page.evaluate(() =>
    window.__MARKWEAVE_EDITOR__.setMarkdown("```python\nfrom pathlib import Path\n\n```\n\n后面段落", {
      resetHistory: true,
    })
  );
  await new Promise((r) => setTimeout(r, 500));
  const geo = await page.evaluate(() => {
    const pre = document.querySelector(".md-fences-wrapper pre");
    pre.scrollIntoView({ block: "center" });
    const r = pre.getBoundingClientRect();
    const br = pre.querySelector("br.ProseMirror-trailingBreak");
    const b = br?.getBoundingClientRect();
    return { left: r.left, top: r.top, bottom: r.bottom, brTop: b?.top, brBottom: b?.bottom };
  });
  await new Promise((r) => setTimeout(r, 250));
  const brY = (geo.brTop + geo.brBottom) / 2;
  await page.mouse.click(geo.left + 60, brY);
  await new Promise((r) => setTimeout(r, 200));
  await page.keyboard.type("X");
  await new Promise((r) => setTimeout(r, 200));
  const typed = await page.evaluate(() => {
    const v = window.__MARKWEAVE_EDITOR__.view;
    return {
      text: JSON.stringify(v.state.doc.firstChild.textContent),
      offset: v.state.selection.$from.parentOffset,
    };
  });
  console.log("typed on last line:", JSON.stringify(typed));
} finally {
  await browser.close();
}
