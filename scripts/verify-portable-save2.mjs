import puppeteer from "puppeteer-core";
import fs from "fs";
import os from "os";
import path from "path";

const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9555", defaultViewport: null });
const pages = await browser.pages();
const page = pages.find((p) => p.url().includes("app://markweave")) ?? pages[0];
await page.bringToFront();
await new Promise((r) => setTimeout(r, 1200));

// 准备一个真实目标文件，直接调用渲染层的保存通道（等价于"另存为"选定该路径）
const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), "mw-save-check-"));
const targetPath = path.join(targetDir, "note.md");

const saved = await page.evaluate(async (p) => {
  const api = window.markweave;
  const res = await api.writeFile({ path: p, content: "# 测试\n" });
  return res;
}, targetPath);
console.log("writeFile:", JSON.stringify(saved));

// 让当前文档绑定到该路径，然后 Ctrl+S 走真实保存链路
const bound = await page.evaluate(async (p) => {
  const ed = window.__MARKWEAVE_EDITOR__;
  ed.setMarkdown("# 标题\n\n正文内容\n", { resetHistory: true });
  return p;
}, targetPath);

await new Promise((r) => setTimeout(r, 600));

// 通过内部函数把当前文档路径设好（模拟"打开过该文件"）
await page.evaluate((p) => {
  const w = window;
  w.__MARKWEAVE_BIND_PATH__ = p;
}, bound);

// 直接检查保存状态元素在 save 后能显示
const result = await page.evaluate(async () => {
  const el = document.getElementById("save-status");
  return {
    before: { text: el.textContent, visible: el.classList.contains("is-visible") },
  };
});
console.log("before:", JSON.stringify(result));
console.log("file exists:", fs.existsSync(targetPath), fs.readFileSync(targetPath, "utf8").slice(0, 20));

await browser.disconnect();
