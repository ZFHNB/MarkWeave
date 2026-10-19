import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

describe("electron shell configuration", () => {
  it("declares the electron entry and portable scripts", () => {
    expect(pkg.main).toBe("electron/main.cjs");
    expect(pkg.scripts["package:portable"]).toBeTruthy();
    expect(pkg.scripts["electron:start"]).toBeTruthy();
    expect(pkg.devDependencies.electron).toBeTruthy();
    expect(pkg.devDependencies["electron-builder"]).toBeTruthy();
  });

  it("configures the Windows portable target", () => {
    expect(pkg.build.win.target).toContain("portable");
    expect(pkg.build.files).toContain("dist/**/*");
    expect(pkg.build.files).toContain("electron/**/*");
  });

  it("hardens the browser window and keeps portable data beside the exe", () => {
    const main = fs.readFileSync(path.join(root, "electron/main.cjs"), "utf8");
    expect(main).toContain("contextIsolation: true");
    expect(main).toContain("nodeIntegration: false");
    expect(main).toContain("sandbox: true");
    expect(main).toContain("PORTABLE_EXECUTABLE_DIR");
    expect(main).toContain("app.setPath");
    expect(main).toContain("registerSchemesAsPrivileged");
    expect(main).toContain("protocol.handle");
  });

  it("exposes a whitelisted preload bridge", () => {
    const preload = fs.readFileSync(path.join(root, "electron/preload.cjs"), "utf8");
    expect(preload).toContain("contextBridge.exposeInMainWorld");
    expect(preload).toContain("markweave");
    expect(preload).toContain("openFile");
    expect(preload).toContain("saveFile");
    expect(preload).toContain("onMenuAction");
  });
});
