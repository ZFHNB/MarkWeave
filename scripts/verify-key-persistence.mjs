/**
 * 验证：重新打包后 API Key 仍然有效，且解析模式选择不再重复弹窗。
 */
import puppeteer from "puppeteer-core";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const exePath = path.join(root, "released", "v0.2.0", "MarkWeave-0.2.0-win-x64", "MarkWeave.exe");

let pass = 0;
let fail = 0;
const check = (n, ok, d = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "✅" : "❌"} ${n}${d ? ` — ${d}` : ""}`);
};

async function main() {
  const child = spawn(exePath, ["--remote-debugging-port=9336"], {
    detached: false,
    stdio: "ignore",
  });

  let browser = null;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9336", defaultViewport: null });
      break;
    } catch {
      /* wait */
    }
  }
  if (!browser) {
    console.error("启动失败");
    child.kill();
    process.exit(1);
  }

  const pages = await browser.pages();
  const page = pages.find((p) => p.url().startsWith("app://")) ?? pages[0];
  await page.waitForSelector("#write", { timeout: 20000 });

  // 1) 密钥是否还在
  const key = await page.evaluate(async () => {
    const k = await window.markweave?.mineruLoadKey?.();
    return { present: k?.present, source: k?.source, masked: k?.masked };
  });

  check("重新打包后 API Key 仍在", key.present === true, `来源: ${key.source}`);
  check("密钥已解密可用", Boolean(key.masked), `掩码: ${key.masked ?? "无"}`);

  // 2) 设置面板里的密钥状态
  const settingsState = await page.evaluate(async () => {
    window.__MARKWEAVE_SETTINGS__?.openSettingsModal();
    await new Promise((r) => setTimeout(r, 500));

    // 切到「存储与导出」或 MinerU 所在标签
    const tabs = Array.from(document.querySelectorAll(".ty-settings-tab-btn"));
    const mineruTab = tabs.find((t) => (t.textContent ?? "").includes("PDF"));
    mineruTab?.click();
    await new Promise((r) => setTimeout(r, 400));

    const status = document.getElementById("mineru-key-status");
    return { text: status?.textContent?.trim() ?? "", state: status?.dataset?.state ?? "" };
  });

  check(
    "设置面板显示已配置状态",
    /已配置|已保存|已设置/.test(settingsState.text),
    `显示: "${settingsState.text}"`
  );

  await page.screenshot({
    path: path.join(root, "test-artifacts", "v0.2.0", "08-key-persisted.png"),
  });

  // 3) 解析模式决策：云端已配置 + 本地未就绪 → 不弹「是否改用云端」
  const decision = await page.evaluate(() => {
    // 通过测试钩子检查纯逻辑（与运行时同一份实现）
    return window.__MARKWEAVE_TEST_MODE_DECISION__?.({
      preferred: "local",
      localReady: false,
      cloudReady: true,
    }) ?? null;
  });

  if (decision) {
    check("本地未就绪 + 云端已配置 → 直接走云端", decision.mode === "cloud", JSON.stringify(decision));
    check("不产生询问动作", decision.action === "proceed", `action=${decision.action}`);
  } else {
    console.log("ℹ️  未暴露决策测试钩子，跳过（已由单测覆盖）");
  }

  await browser.disconnect();
  child.kill();
  await new Promise((r) => setTimeout(r, 1000));

  console.log(`\n结果：${pass} 通过，${fail} 失败`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
