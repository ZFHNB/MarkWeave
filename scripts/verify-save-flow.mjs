import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import os from "os";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "markweave-savedbg-"));

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: "new",
  defaultViewport: { width: 1280, height: 900 },
  args: ["--no-sandbox", "--disable-setuid-sandbox", `--user-data-dir=${profileDir}`],
});

try {
  const page = await browser.newPage();

  // 在页面脚本执行前注入假的 markweave API，模拟桌面端
  await page.evaluateOnNewDocument(() => {
    const files = new Map();
    window.__FAKE_FILES__ = {};
    window.markweave = {
      isDesktop: true,
      openFile: async () => null,
      saveFile: async (payload) => {
        const target = payload.path || `/fake/${payload.suggestedName || "untitled.md"}`;
        window.__FAKE_FILES__[target] = payload.content;
        return { path: target };
      },
      readFile: async (p) => (window.__FAKE_FILES__[p] ? { path: p, content: window.__FAKE_FILES__[p] } : null),
      writeFile: async (payload) => {
        window.__FAKE_FILES__[payload.path] = payload.content;
        return { path: payload.path };
      },
      statFile: async (p) => {
        const content = window.__FAKE_FILES__[p];
        if (content === undefined) return null;
        // 用内容长度模拟 size，写入时间模拟 mtime
        return { path: p, mtime: window.__FAKE_MTIME__?.[p] ?? 1000, size: content.length };
      },
      writeHistory: async ({ path: p, content }) => {
        window.__FAKE_FILES__[p] = content;
        return { path: p };
      },
      listHistory: async () => [],
      removeHistory: async () => 0,
      chooseDirectory: async () => null,
      listCustomThemes: async () => [],
      openThemesFolder: async () => ({ path: null }),
      printToPdf: async () => null,
      createFile: async () => null,
      createFolder: async () => null,
      renamePath: async () => null,
      trashPath: async () => null,
      revealInFolder: async () => true,
      openFolder: async () => null,
      listFolder: async () => null,
      openExternal: async () => true,
      getInfo: async () => ({ version: "0.1.0", dataDir: "/tmp", portable: true }),
      setLanguage: async () => true,
      onMenuAction: () => () => {},
      onOpenPath: () => () => {},
      onCloseRequested: () => () => {},
      confirmClose: () => {},
    };
  });

  await page.goto("http://localhost:5174/", { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 800));

  const desktop = await page.evaluate(() => Boolean(window.markweave?.saveFile));
  console.log("fake desktop API:", desktop);

  // 先把当前文档"另存为"到假路径，然后按 Ctrl+S
  const saved = await page.evaluate(async () => {
    const api = window.markweave;
    const res = await api.saveFile({ content: "test", suggestedName: "note.md" });
    return res;
  });
  console.log("initial save:", JSON.stringify(saved));

  // 触发 Ctrl+S，观察 save-status
  await page.keyboard.down("Control");
  await page.keyboard.press("s");
  await page.keyboard.up("Control");
  await new Promise((r) => setTimeout(r, 800));

  const status = await page.evaluate(() => {
    const el = document.getElementById("save-status");
    return { text: el.textContent, visible: el.classList.contains("is-visible"), tone: el.dataset.tone };
  });
  console.log("status after Ctrl+S:", JSON.stringify(status));

} finally {
  await browser.close();
}
