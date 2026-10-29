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

  it("swaps width and height in landscape", () => {
    const portrait = toElectronPdfOptions({ ...DEFAULT_PDF_OPTIONS, landscape: false });
    const landscape = toElectronPdfOptions({ ...DEFAULT_PDF_OPTIONS, landscape: true });
    expect(portrait.pageSize).toEqual(PAPER_SIZES_MICRONS.A4);
    expect(landscape.pageSize).toEqual({
      width: PAPER_SIZES_MICRONS.A4.height,
      height: PAPER_SIZES_MICRONS.A4.width,
    });
  });

  it("converts millimetre margins to inches", () => {
    const options = toElectronPdfOptions({ ...DEFAULT_PDF_OPTIONS, marginTopMm: 25.4 });
    expect(options.margins.top).toBeCloseTo(1, 5);
  });
});
