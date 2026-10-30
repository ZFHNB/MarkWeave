import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import os from "os";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "markweave-lastline3-"));

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: "new",
  defaultViewport: { width: 1280, height: 900 },
  args: ["--no-sandbox", "--disable-setuid-sandbox", `--user-data-dir=${profileDir}`],
});

/** 用 range 插入临时标记来测量光标实际渲染位置 */
const measureCaret = () => {
  const v = window.__MARKWEAVE_EDITOR__.view;
  const { from, to } = v.state.selection;
  const a = v.coordsAtPos(from);
  const b = v.coordsAtPos(to);
  return {
    from,
    to,
    fromCoords: a ? { top: Math.round(a.top), bottom: Math.round(a.bottom), left: Math.round(a.left) } : null,
    toCoords: b ? { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left) } : null,
  };
};

try {
  const page = await browser.newPage();
  await page.goto("http://localhost:5174/", { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 400));

  const cases = {
    normalTrailingBlank: "```python\nfrom pathlib import Path\n\n```\n\n后面段落",
    mermaidLast: "```mermaid\ngraph TD\n    A --> B\n```",
    mermaidTrailingBlank: "```mermaid\ngraph TD\n    A --> B\n\n```",
    plainNoTrailing: "```python\nfrom pathlib import Path\n```\n\n后面",
  };

  for (const [name, md] of Object.entries(cases)) {
    await page.evaluate((m) => window.__MARKWEAVE_EDITOR__.setMarkdown(m, { resetHistory: true }), md);
    await new Promise((r) => setTimeout(r, 600));

    const geom = await page.evaluate(() => {
      const pre = document.querySelector(".md-fences-wrapper pre");
      pre.scrollIntoView({ block: "center" });
      const r = pre.getBoundingClientRect();
      const code = pre.querySelector("code");
      const br = code.querySelector("br.ProseMirror-trailingBreak");
      return {
        preTop: Math.round(r.top),
        preBottom: Math.round(r.bottom),
        left: r.left,
        brTop: br ? Math.round(br.getBoundingClientRect().top) : null,
        brBottom: br ? Math.round(br.getBoundingClientRect().bottom) : null,
        isMermaidPreview: Boolean(document.querySelector(".md-diagram-preview:not([style*='display: none'])")),
      };
    });
    await new Promise((r) => setTimeout(r, 200));

    // 点最后一行
    const clickY = geom.brBottom ? (geom.brTop + geom.brBottom) / 2 : geom.preBottom - 12;
    await page.mouse.click(geom.left + 40, clickY);
    await new Promise((r) => setTimeout(r, 250));

    const after = await page.evaluate(measureCaret);
    const text = await page.evaluate(() =>
      JSON.stringify(window.__MARKWEAVE_EDITOR__.view.state.doc.firstChild.textContent)
    );

    console.log(
      JSON.stringify({
        name,
        geom,
        clickY: Math.round(clickY),
        ...after,
        text,
        caretOnLastLine:
          after.fromCoords && geom.brTop !== null
            ? after.fromCoords.top >= geom.brTop - 2
            : null,
      })
    );
  }
} finally {
  await browser.close();
}
