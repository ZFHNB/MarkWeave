import { describe, it, expect } from "vitest";
import fs from "node:fs";

describe("table toolbar nowrap removal", () => {
  it("removes row wrap/nowrap controls", () => {
    const toolbar = fs.readFileSync("src/editor/table/table-toolbar.ts", "utf8");
    expect(toolbar).not.toContain("rows-nowrap");
    expect(toolbar).not.toContain("rows-wrap");
  });

  it("removes table-level nowrap CSS", () => {
    const css = fs.readFileSync("src/styles/typora-theme.css", "utf8");
    expect(css).not.toMatch(/data-md-table-nowrap/);
  });

  it("keeps column width controls", () => {
    const toolbar = fs.readFileSync("src/editor/table/table-toolbar.ts", "utf8");
    expect(toolbar).toContain('data-action="cols-auto"');
    expect(toolbar).toContain('data-action="cols-equal"');
  });
});
