import puppeteer from "puppeteer-core";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

const docDir = fs.mkdtempSync(path.join(os.tmpdir(), "markweave-ctrls-doc-"));
const targetFile = path.join(docDir, "note.md");
fs.writeFileSync(targetFile, "# 标题\n\n初始内容\n", "utf8");

const electronBin = path.resolve("node_modules/electron/dist/electron.exe");

const child = spawn(
  electronBin,
  [".", "--remote-debugging-port=9444"],
  {
    env: { ...process.env, MARKWEAVE_DEV_URL: "http://localhost:5174" },
    stdio: "ignore",
  }
);

async function waitForCdp(port, timeoutMs = 40000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return true;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

try {
  const ready = await waitForCdp(9444);
  if (!ready) throw new Error("CDP not ready");

  const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9444", defaultViewport: null });
  const pages = await browser.pages();
  const page = pages.find((p) => p.url().includes("localhost:5174")) ?? pages[0];
  await page.bringToFront();
  await new Promise((r) => setTimeout(r, 2000));

  // 用 readFile + 模拟打开该文件，避免依赖原生对话框
  const opened = await page.evaluate(async (filePath) => {
    const api = window.markweave;
    const file = await api.readFile(filePath);
    if (!file) return { ok: false };
    window.__MARKWEAVE_TEST_OPEN__?.(file);
    return { ok: true, content: file.content.slice(0, 20) };
  }, targetFile);
  console.log("open file:", JSON.stringify(opened));

  // 如果没有测试钩子，直接通过编辑器写入并触发保存按钮
  const hasHook = await page.evaluate(() => typeof window.__MARKWEAVE_TEST_OPEN__ === "function");
  console.log("test hook:", hasHook);

  await browser.disconnect();
} finally {
  child.kill();
}
