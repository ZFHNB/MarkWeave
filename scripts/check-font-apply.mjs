import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import os from "os";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "mw-fontcheck-"));

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
      "正文文字 mixed English 混排\n\n```bash\ncd /path && echo 中文注释\n```",
      { resetHistory: true }
    );
  });
  await new Promise((r) => setTimeout(r, 800));

  const info = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const pre = document.querySelector(".md-fences-content");
    const code = pre?.querySelector("code");
    const p = document.querySelector(".ProseMirror p");

    return {
      cssVarMonospace: root.getPropertyValue("--monospace").trim(),
      cssVarEditorFont: root.getPropertyValue("--editor-font-family").trim(),
      preFont: pre ? getComputedStyle(pre).fontFamily : null,
      codeFont: code ? getComputedStyle(code).fontFamily : null,
      paragraphFont: p ? getComputedStyle(p).fontFamily : null,
      fontsDiffer: (() => {
        if (!pre || !p) return null;
        return getComputedStyle(pre).fontFamily !== getComputedStyle(p).fontFamily;
      })(),
    };
  });
  console.log(JSON.stringify(info, null, 1));
} finally {
  await browser.close();
}
