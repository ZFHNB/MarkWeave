/**
 * 导出选项（PDF / HTML）的纯逻辑：生成打印专用样式与文档外壳。
 * 与 Electron 的 printToPDF 参数共享同一份定义，便于单测。
 */

export type PaperSize = "A4" | "A3" | "Letter" | "Legal" | "Tabloid";

export interface PdfOptions {
  paper: PaperSize;
  marginTopMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  marginRightMm: number;
  landscape: boolean;
  printBackground: boolean;
  headerFooter: boolean;
  scale: number;
}

export const DEFAULT_PDF_OPTIONS: PdfOptions = {
  paper: "A4",
  marginTopMm: 18,
  marginBottomMm: 18,
  marginLeftMm: 16,
  marginRightMm: 16,
  landscape: false,
  printBackground: true,
  headerFooter: false,
  scale: 1,
};

/**
 * 纸张尺寸（微米）。仅用于设置界面与 CSS @page 文案展示。
 *
 * 注意：**不能**直接当作 printToPDF 的 pageSize——Electron 的
 * `PrintToPDFOptions.pageSize` 对象单位是英寸，传微米会被 Chromium 判为
 * 非法尺寸并抛 "Failed to generate PDF"。
 */
export const PAPER_SIZES_MICRONS: Record<PaperSize, { width: number; height: number }> = {
  A4: { width: 210000, height: 297000 },
  A3: { width: 297000, height: 420000 },
  Letter: { width: 215900, height: 279400 },
  Legal: { width: 215900, height: 355600 },
  Tabloid: { width: 279400, height: 431800 },
};

export function clampMargin(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.max(0, Math.min(60, value)) * 10) / 10;
}

export function normalizePdfOptions(input: Partial<PdfOptions>): PdfOptions {
  const merged = { ...DEFAULT_PDF_OPTIONS, ...input };
  const paper = (Object.keys(PAPER_SIZES_MICRONS) as PaperSize[]).includes(merged.paper)
    ? merged.paper
    : "A4";
  return {
    paper,
    marginTopMm: clampMargin(merged.marginTopMm),
    marginBottomMm: clampMargin(merged.marginBottomMm),
    marginLeftMm: clampMargin(merged.marginLeftMm),
    marginRightMm: clampMargin(merged.marginRightMm),
    landscape: Boolean(merged.landscape),
    printBackground: merged.printBackground !== false,
    headerFooter: Boolean(merged.headerFooter),
    scale: Math.max(0.5, Math.min(2, Number(merged.scale) || 1)),
  };
}

/** 生成网页版打印用的 @page 规则 */
export function buildPageCss(options: PdfOptions): string {
  const o = normalizePdfOptions(options);
  return `@page {
  size: ${o.paper}${o.landscape ? " landscape" : ""};
  margin: ${o.marginTopMm}mm ${o.marginRightMm}mm ${o.marginBottomMm}mm ${o.marginLeftMm}mm;
}`;
}

/** 在导出的 HTML 中注入分页与打印样式 */
export function injectPrintStyles(html: string, options: PdfOptions): string {
  const css = buildPageCss(options);
  const style = `<style id="markweave-print-options">${css}
body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
h1, h2, h3, h4, h5, h6 { break-after: avoid; }
table, pre, blockquote, img, figure { break-inside: avoid; }
</style>`;
  if (html.includes("</head>")) {
    return html.replace("</head>", `${style}\n</head>`);
  }
  return `${style}\n${html}`;
}

/** Electron printToPDF 参数 */
function roundInches(mm: number): number {
  return Math.round((mm / 25.4) * 1000) / 1000;
}

export function toElectronPdfOptions(options: PdfOptions) {
  const o = normalizePdfOptions(options);
  return {
    landscape: o.landscape,
    printBackground: o.printBackground,
    scale: o.scale,
    displayHeaderFooter: o.headerFooter,
    // 优先用 Chromium 内置的纸张名（A4/Legal/...），它自己会按平台换算；
    // 只有内置名没有的尺寸才退回英寸对象。
    pageSize: ELECTRON_PAGE_SIZE_NAMES[o.paper] ?? {
      width: PAPER_SIZES_INCHES[o.paper].width,
      height: PAPER_SIZES_INCHES[o.paper].height,
    },
    // Electron 的 margin 单位是英寸
    margins: {
      top: roundInches(o.marginTopMm),
      bottom: roundInches(o.marginBottomMm),
      left: roundInches(o.marginLeftMm),
      right: roundInches(o.marginRightMm),
    },
  };
}

/** Chromium 内置纸张名；Tabloid 在部分平台上不可用，故走英寸对象 */
const ELECTRON_PAGE_SIZE_NAMES: Partial<Record<PaperSize, string>> = {
  A4: "A4",
  A3: "A3",
  Letter: "Letter",
  Legal: "Legal",
};

/** 英寸尺寸（1 英寸 = 25400 微米），供内置名不可用时兜底 */
const PAPER_SIZES_INCHES: Record<PaperSize, { width: number; height: number }> = {
  A4: { width: 8.2677, height: 11.6929 },
  A3: { width: 11.6929, height: 16.5354 },
  Letter: { width: 8.5, height: 11 },
  Legal: { width: 8.5, height: 14 },
  Tabloid: { width: 11, height: 17 },
};
