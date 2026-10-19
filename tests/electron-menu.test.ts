import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildMenuTemplate } = require("../electron/menu.cjs");

function findItem(template: any[], menuId: string, itemId: string) {
  const menu = template.find((entry) => entry.id === menuId);
  return menu?.submenu?.find((item: any) => item.id === itemId);
}

describe("electron menu", () => {
  it("binds Ctrl+T to insert table", () => {
    const sent: string[] = [];
    const template = buildMenuTemplate((action: string) => sent.push(action), { isDev: false });
    const item = findItem(template, "insert", "insert-table");
    expect(item).toBeTruthy();
    expect(item.accelerator).toBe("CmdOrCtrl+T");
    item.click();
    expect(sent).toContain("insert-table");
  });

  it("binds save and open accelerators", () => {
    const template = buildMenuTemplate(() => {}, { isDev: false });
    expect(findItem(template, "file", "open-file").accelerator).toBe("CmdOrCtrl+O");
    expect(findItem(template, "file", "save").accelerator).toBe("CmdOrCtrl+S");
    expect(findItem(template, "file", "save-as").accelerator).toBe("CmdOrCtrl+Shift+S");
  });

  it("does not expose devtools outside development", () => {
    const prod = buildMenuTemplate(() => {}, { isDev: false });
    expect(findItem(prod, "view", "toggle-devtools")).toBeUndefined();
    const dev = buildMenuTemplate(() => {}, { isDev: true });
    expect(findItem(dev, "view", "toggle-devtools")).toBeTruthy();
  });
});
