"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("markweave", {
  isDesktop: true,
  openFile: () => ipcRenderer.invoke("file:open-dialog"),
  saveFile: (payload) => ipcRenderer.invoke("file:save", payload),
  readFile: (filePath) => ipcRenderer.invoke("file:read", filePath),
  openExternal: (url) => ipcRenderer.invoke("shell:open-external", url),
  getInfo: () => ipcRenderer.invoke("app:get-info"),
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
