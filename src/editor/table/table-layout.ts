export type ColumnLayout = "equal" | "auto";
export type RowLayout = "wrap" | "nowrap";

export function setColumnLayout(el: HTMLElement, layout: ColumnLayout): void {
  if (layout === "auto") {
    el.dataset.mdTableLayout = "auto";
  } else {
    delete el.dataset.mdTableLayout;
  }
}

export function setRowLayout(el: HTMLElement, layout: RowLayout): void {
  if (layout === "nowrap") {
    el.dataset.mdTableNowrap = "true";
  } else {
    delete el.dataset.mdTableNowrap;
  }
}

export function getTableLayoutState(el: HTMLElement): {
  columns: ColumnLayout;
  rows: RowLayout;
} {
  return {
    columns: el.dataset.mdTableLayout === "auto" ? "auto" : "equal",
    rows: el.dataset.mdTableNowrap === "true" ? "nowrap" : "wrap",
  };
}
