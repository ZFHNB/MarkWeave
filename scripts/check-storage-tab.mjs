import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import os from "os";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "markweave-storagetab-"));
const outDir = path.resolve("test-artifacts");

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: "new",
  defaultViewport: { width: 1280, height: 1200, deviceScaleFactor: 2 },
  args: ["--no-sandbox", "--disable-setuid-sandbox", `--user-data-dir=${profileDir}`],
});

try {
  const page = await browser.newPage();
  await page.goto("http://localhost:5174/", { waitUntil: "networkidle0" });
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    btns.find((b) => /偏好设置/.test(b.getAttribute("title") || ""))?.click();
  });
  await new Promise((r) => setTimeout(r, 500));

  await page.evaluate(() => {
    document.querySelector('[data-tab="storage"]')?.click();
  });
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: path.join(outDir, "settings-storage.png"), clip: await page.evaluate(() => {
    const r = document.querySelector(".ty-settings-dialog").getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, 1150) };
  })});

  const info = await page.evaluate(() => ({
    autosaveMode: document.querySelector("#setting-select-autosave-mode")?.value,
    interval: document.querySelector("#setting-input-autosave-interval")?.value,
    historyDir: document.querySelector("#setting-input-history-dir")?.value,
    historyMax: document.querySelector("#setting-input-history-max")?.value,
    historyToggle: document.querySelector("#setting-toggle-history")?.checked,
    descCount: document.querySelectorAll(".ty-settings-desc").length,
    infoBtnCount: document.querySelectorAll(".ty-info-btn").length,
  }));
  console.log(JSON.stringify(info, null, 1));

  await page.evaluate(() => document.querySelector('[data-tab="editor"]')?.click());
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: path.join(outDir, "settings-editor-tab.png"), clip: await page.evaluate(() => {
    const r = document.querySelector(".ty-settings-dialog").getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, 1150) };
  })});
} finally {
  await browser.close();
}
