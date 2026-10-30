import puppeteer from "puppeteer-core";
import fs from "fs";
import os from "os";
import path from "path";

const port = 9666;
const docDir = fs.mkdtempSync(path.join(os.tmpdir(), "mw-save-"));
const targetFile = path.join(docDir, "note.md");
fs.writeFileSync(targetFile, "# 旧内容\n", "utf8");

const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}`, defaultViewport: null });
const pages = await browser.pages();
const page = pages.find((p) => p.url().includes("app://markweave")) ?? pages[0];
await page.bringToFront();
await new Promise((r) => setTimeout(r, 1500));

// 绑定到真实文件，模拟"已打开该文件"
const bound = await page.evaluate((p) => window.__MARKWEAVE_TEST_BIND__?.(p), targetFile);
console.log("bound:", bound);

// 修改内容
await page.evaluate(() => {
  window.__MARKWEAVE_EDITOR__.setMarkdown("# 修改后的内容\n\n新增段落\n", { resetHistory: true });
});
await new Promise((r) => setTimeout(r, 900));

const dirtyBefore = await page.evaluate(() => document.title);
console.log("title before save:", dirtyBefore);

// Ctrl+S
await page.keyboard.down("Control");
await page.keyboard.press("s");
await page.keyboard.up("Control");
await new Promise((r) => setTimeout(r, 2000));

const status = await page.evaluate(() => {
  const el = document.getElementById("save-status");
  return { text: el.textContent, visible: el.classList.contains("is-visible"), tone: el.dataset.tone };
});
console.log("status after Ctrl+S:", JSON.stringify(status));

const onDisk = fs.readFileSync(targetFile, "utf8");
console.log("disk content:", JSON.stringify(onDisk));

// 等待多轮外部轮询，确认不误报
await new Promise((r) => setTimeout(r, 7000));
const falsePrompt = await page.evaluate(() => /已在外部被修改/.test(document.body.innerText));
console.log("false external prompt:", falsePrompt);

await browser.disconnect();
