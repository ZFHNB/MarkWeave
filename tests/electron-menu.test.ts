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

  it("exposes the full file menu", () => {
    const template = buildMenuTemplate(() => {}, { isDev: false });
    const expected = [
      "new-file",
      "open-file",
      "open-folder",
      "quick-open",
      "open-recent",
      "reopen-closed",
      "save",
      "save-as",
      "save-all",
      "restore-snapshot",
      "import-pdf",
      "export",
      "doc-properties",
      "reveal-file",
      "show-in-sidebar",
      "move-file",
      "delete-file",
      "preferences",
      "quit",
    ];
    for (const id of expected) {
      expect(findItem(template, "file", id), `缺少菜单项: ${id}`).toBeTruthy();
    }
  });

  it("groups all export formats under one submenu", () => {
    const template = buildMenuTemplate(() => {}, { isDev: false });
    const exportMenu = findItem(template, "file", "export");
    const ids = exportMenu.submenu.map((item: any) => item.id).filter(Boolean);

    expect(ids).toContain("export-markdown");
    expect(ids).toContain("export-html");
    expect(ids).toContain("export-pdf");
    expect(ids).toContain("export-pandoc");

    // 导出项不应再散落在文件菜单顶层
    const fileIds = template
      .find((entry: any) => entry.id === "file")
      .submenu.map((item: any) => item.id)
      .filter(Boolean);
    expect(fileIds).not.toContain("export-markdown");
    expect(fileIds).not.toContain("export-html");
  });

  it("routes every file action through the dispatcher", () => {
    const sent: string[] = [];
    const template = buildMenuTemplate((action: string) => sent.push(action), { isDev: false });

    findItem(template, "file", "restore-snapshot").click();
    findItem(template, "file", "import-pdf").click();
    findItem(template, "file", "save-all").click();
    findItem(template, "file", "doc-properties").click();

    expect(sent).toEqual(["restore-snapshot", "import-pdf", "save-all", "doc-properties"]);
  });
});
