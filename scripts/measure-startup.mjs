import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

const exe = path.resolve(process.argv[2] || "release/MarkWeave-0.1.0-portable.exe");
if (!fs.existsSync(exe)) {
  console.log("portable exe not found:", exe);
  process.exit(1);
}

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "mw-startup-"));
const port = 9999;

const start = Date.now();
const child = spawn(exe, [`--remote-debugging-port=${port}`], {
  cwd: path.dirname(exe),
  env: { ...process.env },
  stdio: "ignore",
  detached: false,
});

async function waitFor(fn, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

try {
  // 1) CDP 端口可用（主进程起来了）
  const cdp = await waitFor(async () => {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`);
    return res.ok ? Date.now() : null;
  }, 60000);
  console.log("process ready (CDP):", cdp ? `${cdp - start}ms` : "timeout");

  // 2) 页面加载完成（编辑器可交互）
  const puppeteer = (await import("puppeteer-core")).default;
  const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}`, defaultViewport: null });
  const pages = await browser.pages();
  const page = pages.find((p) => p.url().includes("app://")) ?? pages[0];

  const ready = await waitFor(async () => {
    const ok = await page.evaluate(() => Boolean(window.__MARKWEAVE_EDITOR__));
    return ok ? Date.now() : null;
  }, 60000);
  console.log("editor ready:", ready ? `${ready - start}ms` : "timeout");

  // 3) 首屏渲染完成
  const painted = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const paint = performance.getEntriesByType("paint").find((p) => p.name === "first-contentful-paint");
    return {
      domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      loadEvent: nav ? Math.round(nav.loadEventEnd) : null,
      firstPaint: paint ? Math.round(paint.startTime) : null,
      domNodes: document.querySelectorAll("*").length,
      scripts: performance.getEntriesByType("resource").filter((r) => r.name.endsWith(".js")).length,
      totalJsBytes: Math.round(
        performance.getEntriesByType("resource")
          .filter((r) => r.name.endsWith(".js"))
          .reduce((sum, r) => sum + (r.transferSize || r.encodedBodySize || 0), 0) / 1024
      ),
    };
  });
  console.log("page metrics:", JSON.stringify(painted));

  await browser.disconnect();
} finally {
  child.kill();
}
