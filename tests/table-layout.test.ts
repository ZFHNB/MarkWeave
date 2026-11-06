// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  setColumnLayout,
  setRowLayout,
  getTableLayoutState,
} from "../src/editor/table/table-layout";

describe("table layout state", () => {
  it("defaults to equal columns and wrapping rows", () => {
    const el = document.createElement("table");
    expect(getTableLayoutState(el)).toEqual({ columns: "equal", rows: "wrap" });
  });

  it("toggles auto/equal column layout via data attributes", () => {
    const el = document.createElement("table");
    setColumnLayout(el, "auto");
    expect(el.dataset.mdTableLayout).toBe("auto");
    expect(getTableLayoutState(el).columns).toBe("auto");
    setColumnLayout(el, "equal");
    expect(el.dataset.mdTableLayout).toBeUndefined();
    expect(getTableLayoutState(el).columns).toBe("equal");
  });

  it("toggles nowrap/wrap row layout via data attributes", () => {
    const el = document.createElement("table");
    setRowLayout(el, "nowrap");
    expect(el.dataset.mdTableNowrap).toBe("true");
    expect(getTableLayoutState(el).rows).toBe("nowrap");
    setRowLayout(el, "wrap");
    expect(el.dataset.mdTableNowrap).toBeUndefined();
    expect(getTableLayoutState(el).rows).toBe("wrap");
  });
});
