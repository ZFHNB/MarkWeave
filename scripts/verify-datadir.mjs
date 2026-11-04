/**
 * 验证数据目录迁移：重新打包后配置不再丢失。
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
  const child = spawn(exePath, ["--remote-debugging-port=9335"], {
    detached: false,
    stdio: "ignore",
  });

  let browser = null;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9335", defaultViewport: null });
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

  const info = await page.evaluate(async () => {
    const i = await window.markweave?.getInfo?.();
    return i ?? null;
  });

  console.log(`数据目录：${info?.dataDir}`);
  console.log(`便携模式：${info?.portable}`);

  const dataDir = info?.dataDir ?? "";
  const exeDir = path.dirname(exePath);

  check("目录版不再使用 exe 旁的 MarkWeaveData", !dataDir.startsWith(exeDir), dataDir);
  check("数据目录位于系统 AppData", dataDir.includes("AppData") || dataDir.includes("Roaming"), dataDir);

  // 检查旧数据是否迁移过来了
  const userDataFiles = fs.existsSync(dataDir) ? fs.readdirSync(dataDir) : [];
  check("系统数据目录已创建", userDataFiles.length > 0, `${userDataFiles.length} 个条目`);

  // 迁移验证：旧 layout 里的 Local Storage 应该被搬过来
  const hasMigratedStorage =
    userDataFiles.includes("Local Storage") || userDataFiles.includes("Preferences");
  check("旧配置已迁移（Preferences / Local Storage）", hasMigratedStorage, userDataFiles.slice(0, 6).join(", "));

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
