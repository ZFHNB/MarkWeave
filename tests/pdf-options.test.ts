import { describe, it, expect } from "vitest";
import {
  DEFAULT_PDF_OPTIONS,
  PAPER_SIZES_MICRONS,
  buildPageCss,
  injectPrintStyles,
  normalizePdfOptions,
  toElectronPdfOptions,
} from "../src/platform/pdf-options";

describe("pdf options", () => {
  it("defaults to A4 portrait with sensible margins", () => {
    const o = normalizePdfOptions({});
    expect(o.paper).toBe("A4");
    expect(o.portrait ?? true).toBeTruthy();
    expect(o.landscape).toBe(false);
    expect(o.marginTopMm).toBe(DEFAULT_PDF_OPTIONS.marginTopMm);
  });

  it("falls back to A4 for unknown paper", () => {
    expect(normalizePdfOptions({ paper: "B5" as any }).paper).toBe("A4");
  });

  it("clamps margins and scale", () => {
    const o = normalizePdfOptions({ marginTopMm: 999, marginLeftMm: -5, scale: 9 });
    expect(o.marginTopMm).toBe(60);
    expect(o.marginLeftMm).toBe(0);
    expect(o.scale).toBe(2);
  });

  it("keeps printBackground on by default", () => {
    expect(normalizePdfOptions({}).printBackground).toBe(true);
    expect(normalizePdfOptions({ printBackground: false }).printBackground).toBe(false);
  });

  it("builds page css with orientation", () => {
    const css = buildPageCss({ ...DEFAULT_PDF_OPTIONS, landscape: true });
    expect(css).toContain("A4 landscape");
    expect(css).toContain("margin: 18mm 16mm 18mm 16mm");
  });

  it("injects print styles before </head>", () => {
    const html = "<html><head><title>x</title></head><body>b</body></html>";
    const out = injectPrintStyles(html, DEFAULT_PDF_OPTIONS);
    expect(out.indexOf("markweave-print-options")).toBeLessThan(out.indexOf("</head>"));
    expect(out).toContain("break-inside: avoid");
  });

  it("prepends styles when there is no head element", () => {
    const out = injectPrintStyles("<p>x</p>", DEFAULT_PDF_OPTIONS);
    expect(out.startsWith("<style")).toBe(true);
  });

  it("uses a Chromium-recognised paper name instead of micron objects", () => {
    // 曾经的 bug：把微米尺寸直接塞进 pageSize，Chromium 判为非法尺寸，
    // printToPDF 抛 "Failed to generate PDF: Printing failed"。
    const portrait = toElectronPdfOptions({ ...DEFAULT_PDF_OPTIONS, landscape: false });
    expect(portrait.pageSize).toBe("A4");
    expect(portrait.landscape).toBe(false);

    const landscape = toElectronPdfOptions({ ...DEFAULT_PDF_OPTIONS, landscape: true });
    // 横向由 landscape 标志处理，纸张名保持不变
    expect(landscape.pageSize).toBe("A4");
    expect(landscape.landscape).toBe(true);
  });

  it("falls back to inch dimensions for sizes Chromium has no name for", () => {
    const opts = toElectronPdfOptions({ ...DEFAULT_PDF_OPTIONS, paper: "Tabloid" });
    expect(typeof opts.pageSize).toBe("object");
    // 11 x 17 英寸
    expect(opts.pageSize).toEqual({ width: 11, height: 17 });
  });

  it("converts millimetre margins to inches", () => {
    const options = toElectronPdfOptions({ ...DEFAULT_PDF_OPTIONS, marginTopMm: 25.4 });
    expect(options.margins.top).toBeCloseTo(1, 5);
  });
});
