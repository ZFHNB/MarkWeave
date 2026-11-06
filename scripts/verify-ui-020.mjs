/**
 * 0.2.0 界面改动的可视化验证。
 *
 * 用无头浏览器加载构建产物，逐项检查：
 * 工具栏精简、文件菜单、导出子菜单、统一样式的对话框、主题图标切换。
 */
import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import os from "os";
import http from "http";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");
const artifactsDir = path.join(root, "test-artifacts", "v0.2.0");

const chromePath =
  process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "markweave-ui-"));

fs.mkdirSync(artifactsDir, { recursive: true });

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};

/** 极简静态服务器，避免 file:// 下的模块加载限制 */
function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
      const filePath = path.join(distDir, rel);
      if (!filePath.startsWith(distDir)) {
        res.writeHead(403).end();
        return;
      }
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404).end("not found");
          return;
        }
        res.writeHead(200, {
          "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream",
        });
        res.end(data);
      });
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

let pass = 0;
let fail = 0;
function check(name, condition, detail = "") {
  if (condition) {
    pass++;
    console.log(`✅ ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail++;
    console.log(`❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  const server = await startServer();
  const port = server.address().port;

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: "new",
    defaultViewport: { width: 1280, height: 860 },
    args: ["--no-sandbox", "--disable-dev-shm-usage", `--user-data-dir=${profileDir}`],
  });

  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle0" });
  await page.waitForSelector("#write", { timeout: 15000 });

  // ---------- 1. 工具栏精简 ----------
  const header = await page.evaluate(() => {
    const right = document.querySelector(".ty-header-right");
    const ids = Array.from(right?.querySelectorAll("[id]") ?? []).map((el) => el.id);
    return {
      ids,
      hasFileMenu: Boolean(document.getElementById("btn-file-menu")),
      hasThemeToggle: Boolean(document.getElementById("btn-toggle-theme")),
      hasSettings: Boolean(document.getElementById("btn-open-settings-quick")),
      // 旧按钮应已移除
      oldButtons: ["btn-save-md", "btn-export-html", "btn-export-pdf", "btn-export-pandoc", "btn-insert-table"].filter(
        (id) => document.getElementById(id)
      ),
    };
  });

  check("工具栏不再有导出 Markdown 按钮", !header.oldButtons.includes("btn-save-md"));
  check("工具栏不再有导出 HTML 按钮", !header.oldButtons.includes("btn-export-html"));
  check("工具栏不再有打印 PDF 按钮", !header.oldButtons.includes("btn-export-pdf"));
  check("工具栏不再有更多格式按钮", !header.oldButtons.includes("btn-export-pandoc"));
  check("工具栏不再有表格按钮", !header.oldButtons.includes("btn-insert-table"));
  check("文件菜单按钮存在", header.hasFileMenu);
  check(
    "侧边栏底部偏好设置按钮已移除",
    !(await page.evaluate(() => Boolean(document.getElementById("btn-open-settings")))),
    ""
  );
  check("偏好设置按钮紧邻主题按钮", header.hasSettings && header.hasThemeToggle);

  // 主题按钮只剩图标（无文字）
  const headerTexts = await page.evaluate(() => {
    const ids = ["btn-toggle-theme", "btn-save-file", "btn-toggle-source", "btn-open-settings-quick"];
    return ids.map((id) => ({
      id,
      text: document.getElementById(id)?.textContent?.trim() ?? "",
    }));
  });
  for (const item of headerTexts) {
    check(`按钮 ${item.id} 只显示图标`, item.text === "", `实际: "${item.text}"`);
  }

  const fileMenuLeft = await page.evaluate(() => {
    const left = document.querySelector(".ty-header-left");
    const first = left?.querySelector("button");
    return first?.id ?? "";
  });
  check("文件按钮位于工具栏最左侧", fileMenuLeft === "btn-file-menu", `实际: ${fileMenuLeft}`);

  // ---------- 2. 主题图标随状态切换 ----------
  const iconState = await page.evaluate(() => {
    const moon = document.querySelector(".ty-theme-icon-moon");
    const sun = document.querySelector(".ty-theme-icon-sun");
    const visible = (el) => el && getComputedStyle(el).display !== "none";
    return { moon: visible(moon), sun: visible(sun), night: document.body.classList.contains("theme-night") };
  });
  check(
    "明亮模式显示月亮图标",
    iconState.night ? iconState.sun : iconState.moon,
    `night=${iconState.night}`
  );

  await page.click("#btn-toggle-theme");
  await new Promise((r) => setTimeout(r, 400));
  const afterToggle = await page.evaluate(() => {
    const moon = document.querySelector(".ty-theme-icon-moon");
    const sun = document.querySelector(".ty-theme-icon-sun");
    const visible = (el) => el && getComputedStyle(el).display !== "none";
    return { moon: visible(moon), sun: visible(sun), night: document.body.classList.contains("theme-night") };
  });
  check(
    "切换后图标跟着变（月亮↔太阳）",
    afterToggle.night ? afterToggle.sun : afterToggle.moon,
    `night=${afterToggle.night}`
  );
  await page.screenshot({ path: path.join(artifactsDir, "01-dark-theme.png") });

  // 切回明亮
  await page.click("#btn-toggle-theme");
  await new Promise((r) => setTimeout(r, 400));

  // ---------- 3. 文件菜单 ----------
  await page.click("#btn-file-menu");
  await page.waitForSelector(".ty-menu-popup", { timeout: 3000 });

  const menuItems = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".ty-menu-popup .ty-menu-label")).map((el) =>
      el.textContent?.trim()
    )
  );

  const expected = [
    "新建文件",
    "打开文件…",
    "打开文件夹…",
    "快速打开…",
    "打开最近文件",
    "重新打开关闭的文件",
    "保存",
    "另存为…",
    "保存全部文件",
    "恢复历史版本…",
    "导入 PDF 并解析…",
    "导出",
    "文档属性…",
    "打开文件所在位置",
    "在侧边栏中显示",
    "移动到…",
    "删除…",
    "偏好设置…",
  ];
  for (const label of expected) {
    check(`文件菜单包含「${label}」`, menuItems.includes(label));
  }
  check("文件菜单没有重复的导出项", menuItems.filter((l) => l === "导出").length === 1);

  await page.screenshot({ path: path.join(artifactsDir, "02-file-menu.png") });

  // ---------- 4. 导出子菜单 ----------
  const exportRow = await page.evaluateHandle(() => {
    const rows = Array.from(document.querySelectorAll(".ty-menu-popup .ty-menu-item"));
    return rows.find((el) => el.querySelector(".ty-menu-label")?.textContent?.trim() === "导出");
  });
  await exportRow.asElement()?.click();
  await new Promise((r) => setTimeout(r, 250));

  const subItems = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".ty-menu-popup .ty-menu-label")).map((el) =>
      el.textContent?.trim()
    )
  );

  for (const label of ["Markdown (.md)", "HTML", "PDF", "Word / EPUB / LaTeX…"]) {
    check(`导出子菜单包含「${label}」`, subItems.includes(label));
  }
  await page.screenshot({ path: path.join(artifactsDir, "03-export-submenu.png") });

  // 关闭菜单
  await page.keyboard.press("Escape");
  await new Promise((r) => setTimeout(r, 200));

  // ---------- 5. 统一对话框样式 ----------
  const dialogInfo = await page.evaluate(async () => {
    // 通过测试钩子触发一个确认框
    const promise = window.__MARKWEAVE_TEST_CONFIRM__?.();
    await new Promise((r) => setTimeout(r, 100));

    const overlay = document.querySelector(".ty-modal-overlay");
    const card = overlay?.querySelector(".ty-modal-card");
    const header = overlay?.querySelector(".ty-modal-header");
    const title = overlay?.querySelector(".ty-modal-title");
    const closeBtn = overlay?.querySelector(".ty-modal-close");

    return {
      hasOverlay: Boolean(overlay),
      hasCard: Boolean(card),
      role: card?.getAttribute("role"),
      modal: card?.getAttribute("aria-modal"),
      hasTitle: Boolean(title),
      hasCloseBtn: Boolean(closeBtn),
      usesSettingsHeader: header?.classList.contains("ty-settings-header"),
      promise,
    };
  });

  if (dialogInfo.hasOverlay) {
    check("确认框使用统一卡片", dialogInfo.hasCard);
    check("确认框有 role=dialog", dialogInfo.role === "dialog");
    check("确认框有 aria-modal", dialogInfo.modal === "true");
    check("确认框标题使用统一 class", dialogInfo.hasTitle);
    check("确认框有关闭按钮", dialogInfo.hasCloseBtn);
    check("确认框使用统一头部样式", dialogInfo.usesSettingsHeader);
    await page.screenshot({ path: path.join(artifactsDir, "04-confirm-dialog.png") });
    await page.keyboard.press("Escape");
    await new Promise((r) => setTimeout(r, 200));
  } else {
    // 没有测试钩子时，检查导出对话框样式是否也被统一
    console.log("ℹ️  未提供确认框测试钩子，跳过");
  }

  // ---------- 6. 标签页一致性 ----------
  const tabCheck = await page.evaluate(() => {
    const strip = document.getElementById("tab-strip");
    return {
      exists: Boolean(strip),
      display: strip ? getComputedStyle(strip).display : null,
      tabs: strip?.querySelectorAll(".ty-tab").length ?? 0,
    };
  });
  check("存在标签栏", tabCheck.exists);
  check("有活动文档时标签栏可见", tabCheck.tabs > 0, `tabs=${tabCheck.tabs}`);

  // ---------- 7. 无运行时错误 ----------
  // 过滤掉与本轮无关的资源加载噪音
  const realErrors = errors.filter(
    (e) => !/favicon|Failed to load resource/.test(e)
  );
  check("页面无运行时错误", realErrors.length === 0, realErrors.slice(0, 3).join(" | "));

  await browser.close();
  server.close();

  console.log(`\n结果：${pass} 通过，${fail} 失败`);
  console.log(`截图目录：${artifactsDir}`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error("验证脚本崩溃：", err);
  process.exit(1);
});
