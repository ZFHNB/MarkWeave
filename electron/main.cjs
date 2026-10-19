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

  const isDev = Boolean(process.env.MARKWEAVE_DEV_URL || !app.isPackaged);
  const menuTemplate = buildMenuTemplate((action) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("menu:action", action);
    }
  }, { isDev });
  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
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

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
