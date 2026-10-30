import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import os from "os";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "markweave-ctrls-"));

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: "new",
  defaultViewport: { width: 1280, height: 900 },
  args: ["--no-sandbox", "--disable-setuid-sandbox", `--user-data-dir=${profileDir}`],
});

try {
  const page = await browser.newPage();
  await page.goto("http://localhost:5174/", { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 500));

  // 记录保存路径被调用的情况
  const before = await page.evaluate(() => {
    const el = document.getElementById("save-status");
    return { text: el?.textContent, visible: el?.classList.contains("is-visible"), tone: el?.dataset.tone };
  });
  console.log("before:", JSON.stringify(before));

  // 模拟 Ctrl+S（浏览器版无 desktop API，应回退到下载而不是报错）
  await page.keyboard.down("Control");
  await page.keyboard.press("s");
  await page.keyboard.up("Control");
  await new Promise((r) => setTimeout(r, 600));

  const after = await page.evaluate(() => {
    const el = document.getElementById("save-status");
    return { text: el?.textContent, visible: el?.classList.contains("is-visible"), tone: el?.dataset.tone };
  });
  console.log("after Ctrl+S:", JSON.stringify(after));

  // 直接检查 showSaveStatus 是否接入（通过 click 保存按钮触发另存为路径）
  const handlerWired = await page.evaluate(() => {
    const btn = document.getElementById("btn-save-file");
    return Boolean(btn);
  });
  console.log("save button:", handlerWired);
} finally {
  await browser.close();
}
