import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import os from "os";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "mw-fontswitch-"));
const outDir = path.resolve("test-artifacts");

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: "new",
  defaultViewport: { width: 1280, height: 1000, deviceScaleFactor: 2 },
  args: ["--no-sandbox", "--disable-setuid-sandbox", `--user-data-dir=${profileDir}`],
});

try {
  const page = await browser.newPage();
  await page.goto("http://localhost:5174/", { waitUntil: "networkidle0" });

  await page.evaluate(() => {
    window.__MARKWEAVE_EDITOR__.setMarkdown(
      "正文 English mixed 中文混排测试\n\n```bash\ncd /path && echo \"中文注释\"\n```",
      { resetHistory: true }
    );
  });
  await new Promise((r) => setTimeout(r, 600));

  const before = await page.evaluate(() => ({
    pre: getComputedStyle(document.querySelector(".md-fences-content")).fontFamily,
    code: getComputedStyle(document.querySelector(".md-fences-content code")).fontFamily,
  }));

  // 直接改设置并应用，模拟用户在设置面板里选 Ubuntu Mono
  const after = await page.evaluate(() => {
    const settings = JSON.parse(localStorage.getItem("markweave_settings_backup") || "null");
    // 走内部 API：改 localStorage 再触发应用
    localStorage.setItem("markweave_mono_latin_font", "ubuntu-mono");
    // 通过设置面板的保存逻辑重放一次
    const evt = new Event("storage");
    window.dispatchEvent(evt);
    return localStorage.getItem("markweave_mono_latin_font");
  });
  console.log("set mono latin:", after, "| before:", JSON.stringify(before));

  // 打开设置 → 字体排版 → 改代码西文字体 → 保存
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /偏好设置/.test(b.getAttribute("title") || ""))?.click();
  });
  await new Promise((r) => setTimeout(r, 600));
  await page.evaluate(() => document.querySelector('[data-tab="editor"]')?.click());
  await new Promise((r) => setTimeout(r, 400));

  const options = await page.evaluate(() => ({
    bodyLatin: [...(document.querySelector("#setting-select-body-latin")?.options ?? [])].map((o) => o.value),
    bodyCJK: [...(document.querySelector("#setting-select-body-cjk")?.options ?? [])].map((o) => o.value),
    monoLatin: [...(document.querySelector("#setting-select-mono-latin")?.options ?? [])].map((o) => o.value),
    monoCJK: [...(document.querySelector("#setting-select-mono-cjk")?.options ?? [])].map((o) => o.value),
  }));
  console.log("font groups:", JSON.stringify(options, null, 1));

  // 选择 ubuntu-mono 并保存
  await page.evaluate(() => {
    const sel = document.querySelector("#setting-select-mono-latin");
    sel.value = "ubuntu-mono";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.evaluate(() => document.getElementById("btn-save-settings")?.click());
  await new Promise((r) => setTimeout(r, 1200));

  const applied = await page.evaluate(() => ({
    cssVar: getComputedStyle(document.documentElement).getPropertyValue("--monospace").trim(),
    pre: getComputedStyle(document.querySelector(".md-fences-content")).fontFamily,
    code: getComputedStyle(document.querySelector(".md-fences-content code")).fontFamily,
    stored: localStorage.getItem("markweave_mono_latin_font"),
  }));
  console.log("after save:", JSON.stringify(applied, null, 1));

  await page.screenshot({
    path: path.join(outDir, "font-switch.png"),
    clip: { x: 100, y: 100, width: 1000, height: 400 },
  });
} finally {
  await browser.close();
}
