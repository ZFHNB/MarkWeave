"use strict";

const { app, BrowserWindow, protocol, ipcMain, dialog, shell, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const { buildMenuTemplate } = require("./menu.cjs");

// Configure portable userData directory before app is ready
if (app.isPackaged) {
  const portableRoot = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(app.getPath("exe"));
  const dataDir = path.join(portableRoot, "MarkWeaveData");
  if (!fs.existsSync(dataDir)) {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
    } catch (err) {
      console.error("Failed to create portable data directory:", err);
    }
  }
  app.setPath("userData", dataDir);
}

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
    title: "Open Markdown File",
    filters: [
      { name: "Markdown / Text Files", extensions: ["md", "markdown", "txt"] },
      { name: "All Files", extensions: ["*"] }
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
