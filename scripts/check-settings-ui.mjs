import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "markweave-settings-"));
const outDir = path.resolve(__dirname, "../test-artifacts");

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: "new",
  defaultViewport: { width: 1280, height: 900, deviceScaleFactor: 2 },
  args: ["--no-sandbox", "--disable-setuid-sandbox", `--user-data-dir=${profileDir}`],
});

try {
  const page = await browser.newPage();
  await page.goto("http://localhost:5174/", { waitUntil: "networkidle0" });

  // 通过「更多」菜单里的偏好设置入口打开（与用户路径一致）
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    const target = btns.find((b) => /偏好设置/.test(b.getAttribute("title") || b.textContent || ""));
    if (target) target.click();
  });
  await new Promise((r) => setTimeout(r, 600));

  let has = await page.$("#settings-modal-overlay");
  if (!has) {
    // 回退：直接触发菜单动作
    await page.evaluate(() => {
      window.__markweaveOpenSettings?.();
    });
    await new Promise((r) => setTimeout(r, 400));
    has = await page.$("#settings-modal-overlay");
  }

  console.log("settings modal present:", Boolean(has));
  if (has) {
    const card = await page.$(".ty-settings-dialog");
    await card.screenshot({ path: path.join(outDir, "settings-light.png") });

    const info = await page.evaluate(() => {
      const close = document.querySelector(".ty-modal-close");
      const cs = close ? getComputedStyle(close) : null;
      return {
        closeWidth: cs?.width,
        closeBorder: cs?.borderTopWidth,
        closeFontSize: cs?.fontSize,
        tabs: [...document.querySelectorAll(".ty-settings-tab-btn")].map((t) => t.textContent?.trim()),
        headerAlign: getComputedStyle(document.querySelector(".ty-settings-header")).justifyContent,
        titles: [...document.querySelectorAll(".ty-export-option-title")].map((t) => t.textContent?.trim()),
      };
    });
    console.log(JSON.stringify(info, null, 2));

    // 悬浮问号标，检查二级提示
    const btn = await page.$(".ty-settings-row .ty-info-btn");
    if (btn) {
      await btn.hover();
      await new Promise((r) => setTimeout(r, 400));
      const tip = await page.evaluate(() => {
        const el = document.querySelector(".ty-info-tooltip");
        if (!el) return null;
        const cs = getComputedStyle(el);
        return {
          hidden: el.hasAttribute("hidden"),
          text: el.textContent,
          display: cs.display,
          font: cs.fontSize,
        };
      });
      console.log("tooltip:", JSON.stringify(tip));
      await page.screenshot({ path: path.join(outDir, "settings-tooltip.png"), clip: await page.evaluate(() => {
        const r = document.querySelector(".ty-settings-row").getBoundingClientRect();
        return { x: r.x - 10, y: r.y - 10, width: Math.min(900, r.width + 20), height: 160 };
      })});
    }

    // 夜间模式对照
    await page.evaluate(() => document.body.classList.add("theme-night"));
    await new Promise((r) => setTimeout(r, 300));
    await card.screenshot({ path: path.join(outDir, "settings-night.png") });
  }
} finally {
  await browser.close();
}
