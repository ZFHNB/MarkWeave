/**
 * 验证打包产物：启动 released/v0.2.0 里的 MarkWeave.exe，
 * 通过 CDP 检查 0.2.0 的界面改动是否真的生效。
 */
import puppeteer from "puppeteer-core";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const exePath = path.join(
  root,
  "released",
  "v0.2.0",
  "MarkWeave-0.2.0-win-x64",
  "MarkWeave.exe"
);
const artifactsDir = path.join(root, "test-artifacts", "v0.2.0");

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`✅ ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail++;
    console.log(`❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  if (!fs.existsSync(exePath)) {
    console.error(`未找到打包产物：${exePath}`);
    process.exit(1);
  }

  console.log("启动打包后的 MarkWeave…");
  const child = spawn(exePath, ["--remote-debugging-port=9333"], {
    detached: false,
    stdio: "ignore",
  });

  // 等待 CDP 端口就绪
  let browser = null;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      browser = await puppeteer.connect({
        browserURL: "http://127.0.0.1:9333",
        defaultViewport: null,
      });
      break;
    } catch {
      // 还没起来，继续等
    }
  }

  if (!browser) {
    console.error("无法连接调试端口，启动失败");
    child.kill();
    process.exit(1);
  }

  const pages = await browser.pages();
  const page = pages.find((p) => p.url().startsWith("app://")) ?? pages[0];
  await page.waitForSelector("#write", { timeout: 20000 });

  const version = await page.evaluate(async () => {
    const info = await window.markweave?.getInfo?.();
    return info?.version ?? "unknown";
  });
  check("打包版本号为 0.2.0", version === "0.2.0", `实际: ${version}`);

  const ui = await page.evaluate(() => {
    const right = document.querySelector(".ty-header-right");
    return {
      fileMenu: Boolean(document.getElementById("btn-file-menu")),
      themeBtn: Boolean(document.getElementById("btn-toggle-theme")),
      settingsBtn: Boolean(document.getElementById("btn-open-settings-quick")),
      removed: ["btn-save-md", "btn-export-html", "btn-export-pdf", "btn-export-pandoc", "btn-insert-table"]
        .filter((id) => document.getElementById(id)),
      themeText: document.getElementById("btn-toggle-theme")?.textContent?.trim() ?? "",
      rightOrder: Array.from(right?.querySelectorAll("[id]") ?? []).map((el) => el.id),
    };
  });

  check("文件菜单按钮存在", ui.fileMenu);
  check("旧导出按钮已移除", ui.removed.length === 0, ui.removed.join(","));
  check("主题按钮无文字", ui.themeText === "");
  check(
    "偏好设置紧邻主题按钮",
    ui.rightOrder.indexOf("btn-open-settings-quick") ===
      ui.rightOrder.indexOf("btn-toggle-theme") + 1
  );

  // 打开文件菜单检查条目
  await page.click("#btn-file-menu");
  await page.waitForSelector(".ty-menu-popup", { timeout: 3000 });
  const labels = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".ty-menu-popup .ty-menu-label")).map((el) =>
      el.textContent?.trim()
    )
  );
  check("文件菜单含恢复历史版本", labels.includes("恢复历史版本…"));
  check("文件菜单含导入 PDF", labels.includes("导入 PDF 并解析…"));
  check("文件菜单含导出", labels.includes("导出"));
  check("文件菜单含保存全部", labels.includes("保存全部文件"));

  await page.screenshot({ path: path.join(artifactsDir, "05-packaged-file-menu.png") });
  await page.keyboard.press("Escape");
  await new Promise((r) => setTimeout(r, 200));

  // 检查原生菜单是否同步（Electron 里通过 window.markweave 无直接 API，
  // 改为检查渲染层菜单动作回调已注册）
  const hasMenuBridge = await page.evaluate(
    () => typeof window.markweave?.onMenuAction === "function"
  );
  check("原生菜单桥接已注册", hasMenuBridge);

  // 统一样式对话框
  await page.evaluate(() => {
    void window.__MARKWEAVE_TEST_CONFIRM__?.();
  });
  await new Promise((r) => setTimeout(r, 300));
  const dialog = await page.evaluate(() => {
    const card = document.querySelector(".ty-modal-card");
    return {
      exists: Boolean(card),
      role: card?.getAttribute("role"),
      unified: card?.querySelector(".ty-settings-header") !== null,
    };
  });
  check("对话框统一样式（打包后）", dialog.exists && dialog.role === "dialog" && dialog.unified);
  await page.screenshot({ path: path.join(artifactsDir, "06-packaged-dialog.png") });

  await browser.disconnect();
  child.kill();
  await new Promise((r) => setTimeout(r, 800));

  console.log(`\n结果：${pass} 通过，${fail} 失败`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error("验证失败：", err);
  process.exit(1);
});
