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

  it("defaults to the unpacked dir target so startup skips NSIS extraction", () => {
    // 便携版每次启动要把约 475MB 解压到临时目录（实测约 17 秒）；
    // dir 形式免解压，冷启动约 1.5 秒。分发时仍可手动指定 portable。
    expect(pkg.build.win.target).toContain("dir");
    expect(pkg.build.files).toContain("dist/**/*");
    expect(pkg.build.files).toContain("electron/**/*");
  });

  it("keeps the portable artifact name available for distribution", () => {
    expect(pkg.build.portable.artifactName).toBe("MarkWeave-${version}-portable.exe");
    // 使用默认压缩：store 会让产物从 98MB 膨胀到 387MB，不划算
    expect(pkg.build.compression).toBeUndefined();
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
