"use strict";

const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("markweave", {
  isDesktop: true,
  openFile: () => ipcRenderer.invoke("file:open-dialog"),
  /**
   * 取拖入文件的磁盘路径。
   *
   * Electron 32 起移除了非标准的 `File.path`，必须改用 webUtils。
   * 这里包一层是因为 webUtils 只能在 preload 里访问。
   * 拿不到（例如拖入的是内存中的 File）时返回 null。
   */
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file) || null;
    } catch {
      return null;
    }
  },
  saveFile: (payload) => ipcRenderer.invoke("file:save", payload),
  readFile: (filePath) => ipcRenderer.invoke("file:read", filePath),
  readImage: (filePath) => ipcRenderer.invoke("file:read-image", filePath),
  writeFile: (payload) => ipcRenderer.invoke("file:write", payload),
  saveImage: (payload) => ipcRenderer.invoke("file:save-image", payload),
  statFile: (filePath) => ipcRenderer.invoke("file:stat", filePath),
  printToPdf: (payload) => ipcRenderer.invoke("print:pdf", payload),
  createFile: (payload) => ipcRenderer.invoke("file:create", payload),
  createFolder: (folderPath) => ipcRenderer.invoke("file:create-folder", folderPath),
  renamePath: (payload) => ipcRenderer.invoke("file:rename", payload),
  trashPath: (filePath) => ipcRenderer.invoke("file:trash", filePath),
  revealInFolder: (filePath) => ipcRenderer.invoke("file:reveal", filePath),
  openFolder: () => ipcRenderer.invoke("workspace:open-folder"),
  listFolder: (rootDir) => ipcRenderer.invoke("workspace:list-files", rootDir),
  openExternal: (url) => ipcRenderer.invoke("shell:open-external", url),
  getInfo: () => ipcRenderer.invoke("app:get-info"),
  setLanguage: (language) => ipcRenderer.invoke("app:set-language", language),
  listCustomThemes: () => ipcRenderer.invoke("themes:list-custom"),
  writeHistory: (payload) => ipcRenderer.invoke("history:write", payload),
  listHistory: (dir) => ipcRenderer.invoke("history:list", dir),
  removeHistory: (payload) => ipcRenderer.invoke("history:remove", payload),
  chooseDirectory: () => ipcRenderer.invoke("dialog:choose-directory"),
  detectPandoc: () => ipcRenderer.invoke("pandoc:detect"),
  mineruSaveKey: (apiKey) => ipcRenderer.invoke("mineru:save-key", apiKey),
  mineruLoadKey: () => ipcRenderer.invoke("mineru:load-key"),
  mineruClearKey: () => ipcRenderer.invoke("mineru:clear-key"),
  mineruTestConnection: (apiKey) => ipcRenderer.invoke("mineru:test-connection", apiKey),
  mineruDetectLocal: () => ipcRenderer.invoke("mineru:detect-local"),
  mineruParseLocal: (payload) => ipcRenderer.invoke("mineru:parse-local", payload),
  mineruParseCloud: (payload) => ipcRenderer.invoke("mineru:parse-cloud", payload),
  convertWithPandoc: (payload) => ipcRenderer.invoke("pandoc:convert", payload),
  openThemesFolder: () => ipcRenderer.invoke("themes:open-folder"),
  onMenuAction: (callback) => {
    if (typeof callback !== "function") return () => {};
    const subscription = (_event, action) => callback(action);
    ipcRenderer.on("menu:action", subscription);
    return () => {
      ipcRenderer.removeListener("menu:action", subscription);
    };
  },
  onCloseRequested: (callback) => {
    if (typeof callback !== "function") return () => {};
    const subscription = () => callback();
    ipcRenderer.on("app:close-requested", subscription);
    return () => {
      ipcRenderer.removeListener("app:close-requested", subscription);
    };
  },
  confirmClose: () => ipcRenderer.send("app:close-confirmed"),
  onOpenPath: (callback) => {
    if (typeof callback !== "function") return () => {};
    const subscription = (_event, filePath) => callback(filePath);
    ipcRenderer.on("file:open-path", subscription);
    return () => {
      ipcRenderer.removeListener("file:open-path", subscription);
    };
  }
});
