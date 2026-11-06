import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildMenuTemplate } = require("../electron/menu.cjs");

function labels(template: any[]): string[] {
  const out: string[] = [];
  for (const menu of template) {
    if (menu.label) out.push(menu.label);
    for (const item of menu.submenu || []) {
      if (item.label) out.push(item.label);
    }
  }
  return out;
}

describe("electron menu language", () => {
  it("defaults to Chinese labels", () => {
    const text = labels(buildMenuTemplate(() => {}, {})).join("|");
    expect(text).toContain("文件");
    expect(text).toContain("插入表格");
  });

  it("supports English labels", () => {
    const text = labels(buildMenuTemplate(() => {}, { language: "en" })).join("|");
    expect(text).toContain("File");
    expect(text).toContain("Insert Table");
  });

  it("keeps menu ids and accelerators stable across languages", () => {
    const zh = buildMenuTemplate(() => {}, { language: "zh" });
    const en = buildMenuTemplate(() => {}, { language: "en" });
    const find = (template: any[], id: string) =>
      template.flatMap((m) => m.submenu || []).find((i) => i.id === id);
    expect(find(zh, "insert-table").accelerator).toBe("CmdOrCtrl+T");
    expect(find(en, "insert-table").accelerator).toBe("CmdOrCtrl+T");
    expect(find(zh, "save").id).toBe(find(en, "save").id);
  });
});
