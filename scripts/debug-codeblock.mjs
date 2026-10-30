import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import os from "os";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "markweave-debug-"));

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: "new",
  defaultViewport: { width: 1280, height: 900 },
  args: ["--no-sandbox", "--disable-setuid-sandbox", `--user-data-dir=${profileDir}`],
});

try {
  const page = await browser.newPage();
  await page.goto("http://localhost:5174/", { waitUntil: "networkidle0" });

  // 打开欢迎文档（默认第一份）
  const info = await page.evaluate(() => {
    const blocks = [...document.querySelectorAll(".md-fences-wrapper")];
    return blocks.map((b) => {
      const code = b.querySelector("code");
      return {
        lang: b.querySelector(".md-lang-label, .md-fences-lang")?.textContent,
        text: JSON.stringify(code?.textContent),
        lines: code?.textContent.split("\n").length,
        codeRect: code ? code.getBoundingClientRect().toJSON() : null,
        preRect: b.querySelector("pre")?.getBoundingClientRect().toJSON(),
      };
    });
  });
  console.log("code blocks:", JSON.stringify(info, null, 2));

  // 把第一个代码块滚入视口后再点击
  await page.evaluate(() => {
    document.querySelectorAll(".md-fences-wrapper")[0].scrollIntoView({ block: "center" });
  });
  await new Promise((r) => setTimeout(r, 300));

  const target = await page.evaluate(() => {
    const code = document.querySelectorAll(".md-fences-wrapper")[0].querySelector("code");
    const r = code.getBoundingClientRect();
    return { x: r.left + 60, y: r.bottom - 8, h: r.height, top: r.top, bottom: r.bottom };
  });
  console.log("click target", target);

  await page.mouse.click(target.x, target.y);
  await new Promise((r) => setTimeout(r, 150));

  const before = await page.evaluate(() => {
    const sel = window.getSelection();
    const node = sel?.anchorNode;
    const el = node?.nodeType === 3 ? node.parentElement : node;
    return {
      anchorInCode: Boolean(el?.closest("code")),
      anchorText: sel?.anchorNode?.textContent?.slice(0, 40),
      offset: sel?.anchorOffset,
      docMarkdown: document.querySelector(".md-fences-wrapper") ? "ok" : "none",
    };
  });
  console.log("before Enter:", before);

  await page.keyboard.press("Enter");
  await new Promise((r) => setTimeout(r, 200));

  const after = await page.evaluate(() => {
    const sel = window.getSelection();
    const node = sel?.anchorNode;
    const el = node?.nodeType === 3 ? node.parentElement : node;
    return {
      anchorInCode: Boolean(el?.closest("code")),
      anchorBlock: el?.closest("p, h1, h2, h3, pre")?.tagName,
      firstCodeText: document.querySelector(".md-fences-wrapper code")?.textContent,
    };
  });
  console.log("after Enter:", after);
} finally {
  await browser.close();
}
