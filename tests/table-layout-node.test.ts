import { describe, it, expect } from "vitest";
import { schema } from "../src/editor/schema";
import { createTableNode } from "../src/editor/table/commands";

describe("table layout node attributes", () => {
  it("defaults to equal columns and wrapping rows", () => {
    const table = createTableNode(2, 2);
    expect(table.attrs.layout).toBe("equal");
    expect(table.attrs.rowLayout).toBe("wrap");
  });

  it("renders data attributes for auto columns and nowrap rows", () => {
    const base = createTableNode(1, 1);
    const table = base.type.create(
      { ...base.attrs, layout: "auto", rowLayout: "nowrap" },
      base.content
    );
    const spec = table.type.spec.toDOM!(table) as any[];
    expect(spec[1]["data-md-table-layout"]).toBe("auto");
    expect(spec[1]["data-md-table-nowrap"]).toBe("true");
  });

  it("omits data attributes in the default layout", () => {
    const table = createTableNode(1, 1);
    const spec = table.type.spec.toDOM!(table) as any[];
    expect(spec[1]["data-md-table-layout"]).toBeUndefined();
    expect(spec[1]["data-md-table-nowrap"]).toBeUndefined();
  });
});
