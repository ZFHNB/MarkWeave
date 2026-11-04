"use strict";

const { app, BrowserWindow, protocol, ipcMain, dialog, shell, Menu, safeStorage } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFile } = require("child_process");
const { buildMenuTemplate } = require("./menu.cjs");

/**
 * 数据目录策略。
 *
 * - 便携版（有 PORTABLE_EXECUTABLE_DIR）：数据跟着 exe 走，
 *   方便整个文件夹拷到 U 盘继续用。
 * - 目录版：用系统标准位置（Windows 是 %APPDATA%/MarkWeave）。
 *   早期版本把数据放在 exe 旁边，结果每次重新打包（整个产物目录被删掉重建）
 *   都会连配置和 API Key 一起丢掉。改到系统目录后，重新打包、升级版本都不受影响。
 *
 * 旧布局的数据会在首次启动时自动迁移过来。
 */
function configureUserData() {
  if (!app.isPackaged) return;

  const portableRoot = process.env.PORTABLE_EXECUTABLE_DIR;
  if (portableRoot) {
    const dataDir = path.join(portableRoot, "MarkWeaveData");
    try {
      fs.mkdirSync(dataDir, { recursive: true });
    } catch (err) {
      console.error("Failed to create portable data directory:", err);
    }
    app.setPath("userData", dataDir);
    return;
  }

  // 目录版：保持系统默认位置，不覆盖 app.setPath("userData")

  // 兼容旧布局：exe 旁边如果还有 MarkWeaveData，把内容搬过来
  const legacyDir = path.join(path.dirname(app.getPath("exe")), "MarkWeaveData");
  const currentDir = app.getPath("userData");
  try {
    migrateLegacyData(legacyDir, currentDir);
  } catch (err) {
    console.error("Migrating legacy data failed:", err);
  }
}

/**
 * 把旧数据目录里的文件复制到新位置。
 *
 * 只补缺、不覆盖：新位置已有的文件优先（说明用户已经在用新位置了）。
 * 迁移完不删除旧目录，万一有遗漏用户还能自己找回来。
 */
function migrateLegacyData(legacyDir, targetDir) {
  if (!fs.existsSync(legacyDir)) return;
  if (path.resolve(legacyDir) === path.resolve(targetDir)) return;

  const entries = fs.readdirSync(legacyDir, { withFileTypes: true });
  if (entries.length === 0) return;

  fs.mkdirSync(targetDir, { recursive: true });

  let copied = 0;
  const copyEntry = (from, to) => {
    const stat = fs.statSync(from);
    if (stat.isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      for (const child of fs.readdirSync(from)) {
        copyEntry(path.join(from, child), path.join(to, child));
      }
      return;
    }
    // 新位置已有同名的就不动
    if (fs.existsSync(to)) return;
    fs.copyFileSync(from, to);
    copied += 1;
  };

  for (const entry of entries) {
    copyEntry(path.join(legacyDir, entry.name), path.join(targetDir, entry.name));
  }

  if (copied > 0) {
    console.log(`Migrated ${copied} legacy data file(s) to ${targetDir}`);
  }
}

configureUserData();

// Register custom privileged scheme
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

let mainWindow = null;
let currentLanguage = "zh";
/** 渲染层确认可以关闭后置为 true，避免 close 事件重复拦截 */
let allowClose = false;

function normalizeLanguage(lang) {
  if (typeof lang === "string" && lang.toLowerCase() === "en") {
    return "en";
  }
  return "zh";
}

function applyApplicationMenu() {
  const isDev = Boolean(process.env.MARKWEAVE_DEV_URL || !app.isPackaged);
  const menuTemplate = buildMenuTemplate((action) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("menu:action", action);
    }
  }, { isDev, language: currentLanguage });
  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
}

function findTargetFilePath(args) {
  if (!Array.isArray(args)) return null;
  for (const arg of args) {
    if (typeof arg === "string" && !arg.startsWith("--")) {
      const lower = arg.toLowerCase();
      if (lower.endsWith(".md") || lower.endsWith(".markdown") || lower.endsWith(".txt")) {
        return path.resolve(arg);
      }
    }
  }
  return null;
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      const filePath = findTargetFilePath(commandLine);
      if (filePath) {
        mainWindow.webContents.send("file:open-path", filePath);
      }
    }
  });

  app.whenReady().then(() => {
    // Register protocol handler for app://markweave/<path>
    protocol.handle("app", async (request) => {
      try {
        const url = new URL(request.url);
        if (url.hostname !== "markweave") {
          return new Response("Not Found", { status: 404 });
        }

        const decodedPath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
        const relativePath = path.normalize(decodedPath || "index.html");

        if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
          return new Response("Forbidden", { status: 403 });
        }

        const distDir = path.resolve(__dirname, "..", "dist");
        const filePath = path.resolve(distDir, relativePath);

        if (!filePath.startsWith(distDir + path.sep) && filePath !== distDir) {
          return new Response("Forbidden", { status: 403 });
        }

        const data = await fs.promises.readFile(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
          ".html": "text/html; charset=utf-8",
          ".js": "text/javascript; charset=utf-8",
          ".mjs": "text/javascript; charset=utf-8",
          ".css": "text/css; charset=utf-8",
          ".json": "application/json; charset=utf-8",
          ".svg": "image/svg+xml",
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".woff2": "font/woff2",
          ".wasm": "application/wasm",
          ".map": "application/json; charset=utf-8"
        };
        const contentType = mimeTypes[ext] || "application/octet-stream";

        return new Response(data, {
          status: 200,
          headers: {
            "Content-Type": contentType
          }
        });
      } catch (err) {
        if (err && err.code === "ENOENT") {
          return new Response("Not Found", { status: 404 });
        }
        return new Response("Internal Server Error", { status: 500 });
      }
    });

    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  applyApplicationMenu();

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  /**
   * 关窗前先让渲染层检查未保存修改：
   * 渲染层完成保存（或用户选择不保存）后回发 app:close-confirmed。
   */
  mainWindow.on("close", (event) => {
    if (allowClose) return;
    event.preventDefault();
    mainWindow.webContents.send("app:close-requested");
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (/^https?:\/\//i.test(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  const devUrl = process.env.MARKWEAVE_DEV_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadURL("app://markweave/index.html");
  }

  const initialFilePath = findTargetFilePath(process.argv.slice(1));
  if (initialFilePath) {
    mainWindow.webContents.once("did-finish-load", () => {
      mainWindow.webContents.send("file:open-path", initialFilePath);
    });
  }
}

// IPC Handlers
ipcMain.handle("file:open-dialog", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "打开文件",
    filters: [
      { name: "Markdown / 文本 / PDF", extensions: ["md", "markdown", "txt", "pdf"] },
      { name: "Markdown 文件", extensions: ["md", "markdown"] },
      { name: "PDF 文件", extensions: ["pdf"] },
      { name: "所有文件", extensions: ["*"] }
    ],
    properties: ["openFile"]
  });

  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return null;
  }

  const selectedPath = result.filePaths[0];
  try {
    const content = await fs.promises.readFile(selectedPath, "utf8");
    return { path: selectedPath, content };
  } catch (err) {
    console.error("Failed to read opened file:", err);
    return null;
  }
});

ipcMain.handle("file:save", async (_event, payload) => {
  if (!payload) return null;
  const { content, suggestedName } = payload;
  let targetPath = payload.path;

  if (!targetPath) {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Save File",
      defaultPath: suggestedName || "Untitled.md",
      filters: [
        { name: "Markdown Files", extensions: ["md", "markdown"] },
        { name: "Text Files", extensions: ["txt"] },
        { name: "All Files", extensions: ["*"] }
      ]
    });

    if (result.canceled || !result.filePath) {
      return null;
    }
    targetPath = result.filePath;
  }

  try {
    await fs.promises.writeFile(targetPath, content ?? "", "utf8");
    return { path: targetPath };
  } catch (err) {
    console.error("Failed to save file:", err);
    return null;
  }
});

ipcMain.handle("file:read", async (_event, targetPath) => {
  if (!targetPath || typeof targetPath !== "string") return null;
  try {
    const content = await fs.promises.readFile(targetPath, "utf8");
    return { path: targetPath, content };
  } catch (err) {
    console.error("Failed to read file:", err);
    return null;
  }
});

const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown", ".mdown", ".mkd", ".txt"]);

async function listMarkdownFiles(rootDir, currentDir = rootDir, depth = 0, out = []) {
  if (depth > 12 || out.length > 2000) return out;
  let entries;
  try {
    entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      await listMarkdownFiles(rootDir, fullPath, depth + 1, out);
    } else if (MARKDOWN_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      const relative = path.relative(rootDir, fullPath).replace(/\\/g, "/");
      let stat = null;
      try {
        stat = await fs.promises.stat(fullPath);
      } catch {
        // ignore
      }
      out.push({
        name: entry.name,
        path: fullPath,
        relativePath: relative,
        size: stat?.size,
        mtime: stat?.mtimeMs,
      });
    }
  }
  return out;
}

ipcMain.handle("workspace:open-folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Open Folder",
    properties: ["openDirectory"],
  });
  if (result.canceled || !result.filePaths?.length) return null;
  const root = result.filePaths[0];
  const files = await listMarkdownFiles(root);
  return { root, files };
});

ipcMain.handle("workspace:list-files", async (_event, rootDir) => {
  if (!rootDir || typeof rootDir !== "string") return null;
  const files = await listMarkdownFiles(rootDir);
  return { root: rootDir, files };
});

ipcMain.handle("file:write", async (_event, payload) => {
  if (!payload || typeof payload.path !== "string") return null;
  try {
    await fs.promises.writeFile(payload.path, payload.content ?? "", "utf8");
    return { path: payload.path };
  } catch (err) {
    console.error("Failed to write file:", err);
    return null;
  }
});

ipcMain.handle("file:create", async (_event, payload) => {
  if (!payload || typeof payload.path !== "string") return null;
  try {
    await fs.promises.mkdir(path.dirname(payload.path), { recursive: true });
    await fs.promises.writeFile(payload.path, payload.content ?? "", {
      encoding: "utf8",
      flag: "wx",
    });
    return { path: payload.path };
  } catch (err) {
    console.error("Failed to create file:", err);
    return { error: err?.code || "unknown" };
  }
});

ipcMain.handle("file:create-folder", async (_event, targetPath) => {
  if (!targetPath || typeof targetPath !== "string") return null;
  try {
    await fs.promises.mkdir(targetPath, { recursive: false });
    return { path: targetPath };
  } catch (err) {
    console.error("Failed to create folder:", err);
    return { error: err?.code || "unknown" };
  }
});

ipcMain.handle("file:rename", async (_event, payload) => {
  if (!payload || typeof payload.from !== "string" || typeof payload.to !== "string") {
    return null;
  }
  try {
    await fs.promises.rename(payload.from, payload.to);
    return { path: payload.to };
  } catch (err) {
    console.error("Failed to rename:", err);
    return { error: err?.code || "unknown" };
  }
});

ipcMain.handle("file:trash", async (_event, targetPath) => {
  if (!targetPath || typeof targetPath !== "string") return null;
  try {
    await shell.trashItem(targetPath);
    return { path: targetPath };
  } catch (err) {
    console.error("Failed to trash item:", err);
    return { error: err?.code || "unknown" };
  }
});

/**
 * 使用 Electron 的 printToPDF 导出 PDF：不会弹出打印对话框，
 * 支持纸张、方向、页边距与背景色。
 */
/**
 * Pandoc 桥：把 Markdown 转成 docx / epub 等格式。
 *
 * 只调用系统已安装的 pandoc，不做任何下载或安装。
 * 未安装时返回明确的结构化错误，由界面提示用户。
 */
const PANDOC_TIMEOUT_MS = 60 * 1000;

/** 允许用户通过环境变量指定 pandoc 路径（便携场景常用） */
function pandocExecutable() {
  const custom = process.env.MARKWEAVE_PANDOC_PATH || process.env.PANDOC_PATH;
  return custom && custom.trim() ? custom.trim() : "pandoc";
}

function runPandoc(args) {
  return new Promise((resolve) => {
    const executable = pandocExecutable();
    // Windows 上 .cmd/.bat 必须经 shell 才能启动（直接 execFile 会 EINVAL）
    const needsShell = process.platform === "win32" && /\.(cmd|bat)$/i.test(executable);

    execFile(
      executable,
      args,
      {
        timeout: PANDOC_TIMEOUT_MS,
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
        ...(needsShell ? { shell: true } : {}),
      },
      (error, stdout, stderr) => {
        if (error) {
          resolve({
            ok: false,
            exitCode: typeof error.code === "number" ? error.code : null,
            stderr: String(stderr || error.message || ""),
          });
          return;
        }
        resolve({ ok: true, stdout: String(stdout || ""), stderr: String(stderr || "") });
      }
    );
  });
}

ipcMain.handle("pandoc:detect", async () => {
  const result = await runPandoc(["--version"]);
  if (!result.ok) {
    return { available: false, version: null, error: classifyPandocFailure(result) };
  }
  const firstLine = (result.stdout || "").trim().split("\n")[0] || "";
  return { available: true, version: firstLine, error: null };
});

function classifyPandocFailure(result) {
  const text = (result.stderr || "").trim();
  if (!text) return "pandoc 执行失败";
  if (/ENOENT|not found/i.test(text)) return "未安装 pandoc 或不在 PATH 中";
  return text.split("\n")[0].slice(0, 200);
}

/**
 * 执行转换。
 * payload: { markdown, format, outputPath, metadata }
 * 未提供 outputPath 时弹出保存对话框。
 */
/* ================= MinerU：密钥安全存储 ================= */

/**
 * 密钥存放位置：%userData%/mineru-credentials.bin
 *
 * 用 Electron 的 safeStorage 加密后写盘（Windows 走 DPAPI，
 * macOS 走 Keychain，Linux 走 libsecret）。
 * 明文密钥在任何情况下都不落盘，也不写入 localStorage。
 */
function credentialFilePath() {
  return path.join(app.getPath("userData"), "mineru-credentials.bin");
}

ipcMain.handle("mineru:save-key", async (_event, apiKey) => {
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    return { ok: false, error: "empty" };
  }
  if (!safeStorage.isEncryptionAvailable()) {
    return { ok: false, error: "encryption-unavailable" };
  }

  try {
    const encrypted = safeStorage.encryptString(apiKey.trim());
    await fs.promises.writeFile(credentialFilePath(), encrypted, { mode: 0o600 });
    return { ok: true };
  } catch (err) {
    console.error("保存 MinerU 密钥失败:", err && err.message);
    return { ok: false, error: "write-failed" };
  }
});

ipcMain.handle("mineru:load-key", async () => {
  const file = credentialFilePath();
  if (!fs.existsSync(file)) {
    return { present: false, apiKey: null, source: "none" };
  }

  // 环境变量优先，便于 CI 与临时覆盖
  const envKey =
    (process.env.MINERU_TOKEN || process.env.MINERU_API_KEY || "").trim();
  if (envKey) {
    return { present: true, apiKey: envKey, source: "env", masked: mask(envKey) };
  }

  if (!safeStorage.isEncryptionAvailable()) {
    return { present: false, apiKey: null, source: "none", error: "encryption-unavailable" };
  }

  try {
    const encrypted = await fs.promises.readFile(file);
    const apiKey = safeStorage.decryptString(encrypted);
    return { present: true, apiKey, source: "keychain", masked: mask(apiKey) };
  } catch (err) {
    console.error("读取 MinerU 密钥失败:", err && err.message);
    return { present: false, apiKey: null, source: "none", error: "decrypt-failed" };
  }
});

/**
 * 测试云端连接：向官方接口发一个只读请求，验证密钥与网络。
 *
 * 用 `/api/v4/extract-results/batch/<不存在 id>`：
 * 有效密钥会得到业务错误（任务不存在），无效密钥得到鉴权错误。
 * 这样不会消耗解析额度，也不需要上传文件。
 */
ipcMain.handle("mineru:test-connection", async (_event, candidateKey) => {
  const apiKey =
    (typeof candidateKey === "string" && candidateKey.trim()) ||
    (process.env.MINERU_TOKEN || process.env.MINERU_API_KEY || "").trim() ||
    (fs.existsSync(credentialFilePath()) && safeStorage.isEncryptionAvailable()
      ? (() => {
          try {
            return safeStorage
              .decryptString(fs.readFileSync(credentialFilePath()))
              .trim();
          } catch {
            return "";
          }
        })()
      : "");

  if (!apiKey) {
    return { ok: false, kind: "not-configured", message: "尚未配置 API Key" };
  }

  const startedAt = Date.now();

  try {
    const res = await fetch(
      "https://mineru.net/api/v4/extract-results/batch/00000000-0000-0000-0000-000000000000",
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(20000),
      }
    );

    const elapsed = Date.now() - startedAt;
    const text = await res.text();

    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // 非 JSON 响应
    }

    // 鉴权失败
    if (res.status === 401 || res.status === 403) {
      const msgCode = json && (json.msgCode || json.code);
      return {
        ok: false,
        kind: "auth",
        status: res.status,
        message:
          msgCode === "A0211" || msgCode === "A0202"
            ? "API Key 无效或已过期"
            : "鉴权失败，请检查 API Key",
        elapsedMs: elapsed,
      };
    }

    if (res.status === 429) {
      return { ok: false, kind: "quota", status: res.status, message: "请求过于频繁", elapsedMs: elapsed };
    }

    if (!res.ok) {
      return {
        ok: false,
        kind: "unknown",
        status: res.status,
        message: (json && json.msg) || `HTTP ${res.status}`,
        elapsedMs: elapsed,
      };
    }

    // 200 且返回业务码：只要不是鉴权错误，就说明密钥可用
    if (json && typeof json.code === "number" && json.code !== 0) {
      return {
        ok: true,
        kind: "authenticated",
        status: res.status,
        message: `连接正常（已鉴权）`,
        elapsedMs: elapsed,
      };
    }

    return {
      ok: true,
      kind: "authenticated",
      status: res.status,
      message: "连接正常",
      elapsedMs: elapsed,
    };
  } catch (err) {
    const message = String(err && err.message ? err.message : err);
    const isTimeout = /timeout|aborted/i.test(message);
    return {
      ok: false,
      kind: isTimeout ? "network" : "network",
      message: isTimeout ? "连接超时，请检查网络" : `网络错误：${message.slice(0, 120)}`,
      elapsedMs: Date.now() - startedAt,
    };
  }
});

ipcMain.handle("mineru:clear-key", async () => {
  try {
    await fs.promises.rm(credentialFilePath(), { force: true });
    return { ok: true };
  } catch (err) {
    console.error("清除 MinerU 密钥失败:", err && err.message);
    return { ok: false, error: "remove-failed" };
  }
});

/** 只保留首尾 4 位，用于界面展示 */
function mask(value) {
  const v = String(value || "").trim();
  if (v.length <= 8) return "***";
  return `${v.slice(0, 4)}…${v.slice(-4)}`;
}

/* ================= MinerU：本地运行时探测 ================= */

const MINERU_LOCAL_CANDIDATES = ["mineru-kit", "mineru", "magic-pdf"];

function runCommand(command, args, timeoutMs = 15000) {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 2 * 1024 * 1024 },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          stdout: String(stdout || ""),
          stderr: String(stderr || ""),
          errorCode: error && error.code ? String(error.code) : null,
        });
      }
    );
  });
}

ipcMain.handle("mineru:detect-local", async () => {
  for (const command of MINERU_LOCAL_CANDIDATES) {
    const result = await runCommand(command, ["--version"]);
    if (result.ok || /\d+\.\d+/.test(result.stdout || result.stderr || "")) {
      const output = `${result.stdout}\n${result.stderr}`;
      const versionMatch = output.match(/(\d+\.\d+\.\d+(?:[-+][\w.]+)?)/);
      return {
        available: true,
        command,
        version: versionMatch ? versionMatch[1] : null,
        detail: `已检测到 ${command}${versionMatch ? " " + versionMatch[1] : ""}`,
      };
    }
  }

  return {
    available: false,
    command: null,
    version: null,
    detail: "未检测到本地 MinerU。可用 `pip install -U mineru` 安装，或切换到云端模式。",
  };
});

/**
 * 本地解析：运行一次命令行解析，返回产出的 Markdown。
 * 只读取输出文件，不执行任何来自 PDF 的代码。
 */
ipcMain.handle("mineru:parse-local", async (_event, payload) => {
  if (!payload || typeof payload.pdfPath !== "string") {
    return { ok: false, error: "缺少 PDF 路径" };
  }

  const pdfPath = payload.pdfPath;
  if (!fs.existsSync(pdfPath)) {
    return { ok: false, error: "PDF 文件不存在" };
  }

  const command = payload.command || "mineru-kit";
  let tmpDir = null;

  try {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "markweave-mineru-"));
    const base = path.basename(pdfPath).replace(/\.[^.]+$/, "");
    const outPath = path.join(tmpDir, `${base}.md`);

    let args;
    if (command === "mineru-kit") {
      args = ["parse", pdfPath, "-o", outPath];
    } else if (command === "magic-pdf") {
      args = ["-p", pdfPath, "-o", tmpDir, "-m", "auto"];
    } else {
      args = [pdfPath, "--pages", "all", "-o", outPath];
    }

    const result = await runCommand(command, args, payload.timeoutMs || 10 * 60 * 1000);
    if (!result.ok) {
      return {
        ok: false,
        error: (result.stderr || result.stdout || "本地解析失败").slice(0, 500),
        command,
      };
    }

    // 输出路径因命令而异，逐一尝试
    const candidates = [
      outPath,
      path.join(tmpDir, base, `${base}.md`),
      path.join(tmpDir, base, "auto", `${base}.md`),
      path.join(tmpDir, base, `${base}.md`),
      path.join(tmpDir, base, "ocr", `${base}.md`),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        const markdown = await fs.promises.readFile(candidate, "utf8");
        return { ok: true, markdown, command, source: candidate };
      }
    }

    return { ok: false, error: "解析完成但未找到 Markdown 输出", command };
  } catch (err) {
    console.error("本地 MinerU 解析失败:", err && err.message);
    return { ok: false, error: String(err && err.message ? err.message : err) };
  } finally {
    if (tmpDir) {
      fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }
});

/* ================= MinerU：云端解析代理 ================= */

/**
 * 云端解析在主进程发起：密钥不进入渲染进程，
 * 也避免渲染层的跨域限制。
 */
ipcMain.handle("mineru:parse-cloud", async (_event, payload) => {
  if (!payload || typeof payload.pdfPath !== "string") {
    return { ok: false, error: "缺少 PDF 路径", kind: "parse" };
  }

  // 读取密钥：环境变量优先，其次加密存储
  const envKey = (process.env.MINERU_TOKEN || process.env.MINERU_API_KEY || "").trim();
  let apiKey = envKey;

  if (!apiKey && fs.existsSync(credentialFilePath()) && safeStorage.isEncryptionAvailable()) {
    try {
      apiKey = safeStorage.decryptString(await fs.promises.readFile(credentialFilePath())).trim();
    } catch {
      return { ok: false, error: "无法读取已保存的 API Key", kind: "auth" };
    }
  }

  if (!apiKey) {
    return { ok: false, error: "尚未配置 API Key", kind: "not-configured" };
  }

  try {
    const bytes = await fs.promises.readFile(payload.pdfPath);
    const fileName = path.basename(payload.pdfPath);

    // 1) 申请上传地址
    const reqRes = await fetch("https://mineru.net/api/v4/file-urls/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        files: [{ name: fileName, is_ocr: payload.enableOcr !== false }],
        enable_formula: payload.enableFormula !== false,
        language: payload.language || "ch",
      }),
    });
    const reqJson = await reqRes.json();

    if (reqJson.code !== 0) {
      return {
        ok: false,
        error: reqJson.msg || "申请上传地址失败",
        code: String(reqJson.code),
        kind: classifyKind(String(reqJson.code), reqRes.status),
      };
    }

    const batchId = reqJson.data.batch_id;
    const uploadUrl = reqJson.data.file_urls[0];

    // 2) 上传：切勿设置 Content-Type，否则 OSS 签名校验失败
    const putRes = await fetch(uploadUrl, { method: "PUT", body: bytes });
    if (!putRes.ok) {
      return { ok: false, error: `上传失败（HTTP ${putRes.status}）`, kind: "network" };
    }

    // 3) 轮询
    const deadline = Date.now() + (payload.timeoutMs || 10 * 60 * 1000);
    let zipUrl = null;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, payload.pollIntervalMs || 3000));
      const res = await fetch(`https://mineru.net/api/v4/extract-results/batch/${batchId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const json = await res.json();
      const item = json?.data?.extract_result?.[0];
      if (!item) continue;

      if (item.state === "failed") {
        return {
          ok: false,
          error: item.err_msg || "解析失败",
          kind: "parse",
        };
      }
      if (item.state === "done") {
        zipUrl = item.full_zip_url;
        break;
      }
    }

    if (!zipUrl) {
      return { ok: false, error: "解析超时", kind: "network", retryable: true };
    }

    // 4) 下载并解压 full.md
    const zipRes = await fetch(zipUrl);
    const zipBuf = Buffer.from(await zipRes.arrayBuffer());
    const markdown = await extractMarkdownFromZipBuffer(zipBuf);

    return { ok: true, markdown, zipUrl };
  } catch (err) {
    const message = String(err && err.message ? err.message : err);
    return {
      ok: false,
      error: message,
      // 网络层异常通常是 fetch 抛出
      kind: /fetch failed|ENOTFOUND|ECONN/i.test(message) ? "network" : "unknown",
      retryable: true,
    };
  }
});

/** 官方业务码 → 界面动作类别 */
function classifyKind(code, status) {
  if (code === "A0202" || code === "A0211" || status === 401) return "auth";
  if (code === "-60018" || code === "-60019" || status === 429) return "quota";
  if (/^-6000[3-7]$/.test(code)) return "parse";
  return "unknown";
}

/**
 * 从 zip 字节里取出 full.md。
 * 主进程没有 DecompressionStream 的类型约束问题，直接用 zlib 解压。
 */
async function extractMarkdownFromZipBuffer(buf) {
  const zlib = require("zlib");

  // 定位 EOCD
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 65558; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("结果包不是合法 zip");

  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);

  let chosen = null;
  let fallback = null;

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buf.readUInt16LE(offset + 10);
    const compSize = buf.readUInt32LE(offset + 20);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.subarray(offset + 46, offset + 46 + nameLen).toString("utf8");

    if (name.toLowerCase().endsWith(".md")) {
      const localNameLen = buf.readUInt16LE(localOffset + 26);
      const localExtraLen = buf.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLen + localExtraLen;
      const raw = buf.subarray(dataStart, dataStart + compSize);
      const text =
        method === 0 ? raw.toString("utf8") : zlib.inflateRawSync(raw).toString("utf8");

      if (/^full\.md$/i.test(name)) chosen = text;
      else if (fallback === null) fallback = text;
    }

    offset += 46 + nameLen + extraLen + commentLen;
  }

  const result = chosen ?? fallback;
  if (result === null) throw new Error("结果包中没有 Markdown 文件");
  return result;
}

ipcMain.handle("pandoc:convert", async (_event, payload) => {
  if (!payload || typeof payload.markdown !== "string") {
    return { ok: false, error: "缺少输入内容" };
  }

  const format = typeof payload.format === "string" ? payload.format : "docx";
  const EXTENSIONS = {
    docx: "docx", odt: "odt", epub: "epub", latex: "tex", rtf: "rtf",
    pptx: "pptx", rst: "rst", org: "org", mediawiki: "wiki", plain: "txt",
  };
  const ext = EXTENSIONS[format] || "txt";

  let outputPath = payload.outputPath;
  if (!outputPath) {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "导出文档",
      defaultPath: payload.suggestedName || `document.${ext}`,
      filters: [{ name: format.toUpperCase(), extensions: [ext] }],
    });
    if (result.canceled || !result.filePath) {
      return { ok: false, canceled: true, error: null };
    }
    outputPath = result.filePath;
  }

  // 先写临时 Markdown，再让 pandoc 读取
  let tmpDir = null;
  try {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "markweave-pandoc-"));
    const inputPath = path.join(tmpDir, "input.md");
    await fs.promises.writeFile(inputPath, payload.markdown, "utf8");

    const args = [
      inputPath,
      "-f",
      "markdown+pipe_tables+task_lists+footnotes+strikeout",
      "-t",
      format,
      "-o",
      outputPath,
      "--standalone",
    ];

    for (const [key, value] of Object.entries(payload.metadata || {})) {
      if (typeof value === "string" && value.trim()) {
        args.push("-M", `${key}=${value}`);
      }
    }

    const result = await runPandoc(args);
    if (!result.ok) {
      return { ok: false, error: classifyPandocFailure(result), exitCode: result.exitCode };
    }

    const stat = await fs.promises.stat(outputPath);
    return { ok: true, path: outputPath, bytes: stat.size };
  } catch (err) {
    console.error("Pandoc 转换失败:", err);
    return { ok: false, error: String(err && err.message ? err.message : err) };
  } finally {
    if (tmpDir) {
      fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }
});

ipcMain.handle("print:pdf", async (_event, payload) => {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  const options = payload?.options || {};
  try {
    const data = await mainWindow.webContents.printToPDF({
      landscape: Boolean(options.landscape),
      printBackground: options.printBackground !== false,
      scale: typeof options.scale === "number" ? options.scale : 1,
      displayHeaderFooter: Boolean(options.displayHeaderFooter),
      pageSize: options.pageSize,
      margins: options.margins,
    });

    if (payload?.path) {
      await fs.promises.writeFile(payload.path, data);
      return { path: payload.path, bytes: data.length };
    }
    return { data: data.toString("base64"), bytes: data.length };
  } catch (err) {
    console.error("Failed to export PDF:", err);
    return null;
  }
});

ipcMain.handle("file:stat", async (_event, targetPath) => {
  if (!targetPath || typeof targetPath !== "string") return null;
  try {
    const stat = await fs.promises.stat(targetPath);
    return { path: targetPath, mtime: stat.mtimeMs, size: stat.size };
  } catch {
    return null;
  }
});

ipcMain.handle("file:reveal", async (_event, targetPath) => {
  if (!targetPath || typeof targetPath !== "string") return false;
  shell.showItemInFolder(targetPath);
  return true;
});

ipcMain.handle("shell:open-external", async (_event, targetUrl) => {
  if (typeof targetUrl !== "string") return false;
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      await shell.openExternal(targetUrl);
      return true;
    }
  } catch {
    // Ignore invalid URL
  }
  return false;
});

ipcMain.handle("app:get-info", async () => {
  return {
    version: app.getVersion(),
    dataDir: app.getPath("userData"),
    portable: Boolean(process.env.PORTABLE_EXECUTABLE_DIR)
  };
});

/**
 * 自定义主题目录：%userData%/themes/*.css
 * 仅读取文件名与内容，不执行其中任何脚本。
 */
const MAX_THEME_BYTES = 512 * 1024;

function customThemesDir() {
  return path.join(app.getPath("userData"), "themes");
}

async function listCustomThemes() {
  const dir = customThemesDir();
  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const themes = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".css")) continue;
    const fullPath = path.join(dir, entry.name);
    try {
      const stat = await fs.promises.stat(fullPath);
      if (stat.size > MAX_THEME_BYTES) continue;
      const css = await fs.promises.readFile(fullPath, "utf8");
      themes.push({
        id: `custom:${entry.name.replace(/\.css$/i, "")}`,
        label: entry.name.replace(/\.css$/i, ""),
        css,
        path: fullPath,
      });
    } catch {
      // 跳过不可读文件
    }
  }
  return themes;
}

ipcMain.handle("themes:list-custom", async () => listCustomThemes());

ipcMain.handle("themes:open-folder", async () => {
  const dir = customThemesDir();
  try {
    await fs.promises.mkdir(dir, { recursive: true });
  } catch {
    return { path: null };
  }
  shell.openPath(dir);
  return { path: dir };
});

/**
 * 历史副本：写入、列举、清理。
 * 副本只写不读回编辑器，属于纯备份文件。
 */
ipcMain.handle("history:write", async (_event, payload) => {
  if (!payload || typeof payload.path !== "string") return null;
  try {
    await fs.promises.mkdir(path.dirname(payload.path), { recursive: true });
    await fs.promises.writeFile(payload.path, payload.content ?? "", "utf8");
    return { path: payload.path };
  } catch (err) {
    console.error("Failed to write history copy:", err);
    return null;
  }
});

ipcMain.handle("history:list", async (_event, dir) => {
  if (!dir || typeof dir !== "string") return [];
  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
});

ipcMain.handle("history:remove", async (_event, payload) => {
  if (!payload || typeof payload.dir !== "string" || !Array.isArray(payload.names)) return 0;
  let removed = 0;
  for (const name of payload.names) {
    if (typeof name !== "string" || name.includes("/") || name.includes("\\")) continue;
    try {
      await fs.promises.unlink(path.join(payload.dir, name));
      removed += 1;
    } catch {
      // 文件可能已被外部删除
    }
  }
  return removed;
});

ipcMain.handle("dialog:choose-directory", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "选择历史副本目录",
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled || !result.filePaths?.length) return null;
  return result.filePaths[0];
});

ipcMain.on("app:close-confirmed", () => {
  allowClose = true;
  if (!mainWindow || mainWindow.isDestroyed()) {
    app.quit();
    return;
  }

  // 第一次 close 已被 preventDefault 取消，Electron 会把窗口标记为
  // "正在关闭"，再调 close() 不会生效。这里显式销毁并退出应用。
  mainWindow.destroy();
  app.quit();
});

ipcMain.handle("app:set-language", async (_event, lang) => {
  currentLanguage = normalizeLanguage(lang);
  applyApplicationMenu();
  return true;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
