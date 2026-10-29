"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("markweave", {
  isDesktop: true,
  openFile: () => ipcRenderer.invoke("file:open-dialog"),
  saveFile: (payload) => ipcRenderer.invoke("file:save", payload),
  readFile: (filePath) => ipcRenderer.invoke("file:read", filePath),
  writeFile: (payload) => ipcRenderer.invoke("file:write", payload),
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
  openThemesFolder: () => ipcRenderer.invoke("themes:open-folder"),
  onMenuAction: (callback) => {
    if (typeof callback !== "function") return () => {};
    const subscription = (_event, action) => callback(action);
    ipcRenderer.on("menu:action", subscription);
    return () => {
      ipcRenderer.removeListener("menu:action", subscription);
    };
  },
  onOpenPath: (callback) => {
    if (typeof callback !== "function") return () => {};
    const subscription = (_event, filePath) => callback(filePath);
    ipcRenderer.on("file:open-path", subscription);
    return () => {
      ipcRenderer.removeListener("file:open-path", subscription);
    };
  }
});
