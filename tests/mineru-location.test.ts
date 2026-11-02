import { describe, it, expect } from "vitest";
import {
  DEFAULT_OUTPUT_LOCATION,
  LOCATION_MODE_LABELS,
  normalizeOutputLocation,
  resolveOutputLocation,
  shouldAskLocation,
  stem,
  uniqueOutputName,
} from "../src/workspace/mineru-location";

const PDF = "C:/docs/paper.pdf";
const NOTE = "C:/notes/project/notes.md";

describe("defaults", () => {
  it("saves beside the source pdf and never asks", () => {
    expect(DEFAULT_OUTPUT_LOCATION.mode).toBe("same-as-pdf");
    expect(DEFAULT_OUTPUT_LOCATION.askEachTime).toBe(false);
  });

  it("labels every mode", () => {
    for (const mode of Object.keys(LOCATION_MODE_LABELS)) {
      expect(LOCATION_MODE_LABELS[mode as keyof typeof LOCATION_MODE_LABELS].length).toBeGreaterThan(0);
    }
  });

  it("normalizes missing input", () => {
    expect(normalizeOutputLocation(null)).toEqual(DEFAULT_OUTPUT_LOCATION);
    expect(normalizeOutputLocation({}).mode).toBe("same-as-pdf");
  });

  it("rejects an unknown mode", () => {
    expect(normalizeOutputLocation({ mode: "nope" }).mode).toBe("same-as-pdf");
  });

  it("keeps a custom subfolder name, falling back when blank", () => {
    expect(normalizeOutputLocation({ subfolderName: "  figs " }).subfolderName).toBe("figs");
    expect(normalizeOutputLocation({ subfolderName: "   " }).subfolderName).toBe("attachments");
  });
});

describe("resolveOutputLocation", () => {
  const base = { ...DEFAULT_OUTPUT_LOCATION };

  it("puts the result beside the pdf by default", () => {
    const r = resolveOutputLocation(base, { pdfPath: PDF, notePath: NOTE });
    expect(r.directory).toBe("C:/docs");
    expect(r.fileName).toBe("paper.md");
  });

  it("uses a fixed folder when configured", () => {
    const r = resolveOutputLocation(
      { ...base, mode: "fixed-folder", fixedFolder: "D:/parsed/" },
      { pdfPath: PDF, notePath: NOTE }
    );
    expect(r.directory).toBe("D:/parsed");
  });

  it("falls back to the pdf folder when the fixed folder is empty", () => {
    const r = resolveOutputLocation(
      { ...base, mode: "fixed-folder", fixedFolder: "" },
      { pdfPath: PDF, notePath: NOTE }
    );
    expect(r.directory).toBe("C:/docs");
  });

  it("uses the note folder when requested", () => {
    const r = resolveOutputLocation(
      { ...base, mode: "same-as-note" },
      { pdfPath: PDF, notePath: NOTE }
    );
    expect(r.directory).toBe("C:/notes/project");
  });

  it("uses a subfolder of the note", () => {
    const r = resolveOutputLocation(
      { ...base, mode: "subfolder-of-note", subfolderName: "attachments" },
      { pdfPath: PDF, notePath: NOTE }
    );
    expect(r.directory).toBe("C:/notes/project/attachments");
  });

  it("falls back to the pdf folder when there is no note", () => {
    for (const mode of ["same-as-note", "subfolder-of-note"] as const) {
      const r = resolveOutputLocation({ ...base, mode }, { pdfPath: PDF, notePath: null });
      expect(r.directory).toBe("C:/docs");
    }
  });

  it("normalizes backslashes", () => {
    const bs = "\\"; // 单个反斜杠，避免字面量转义歧义
    const windowsPath = `D:${bs}parsed${bs}out${bs}`;
    const r = resolveOutputLocation(
      { ...base, mode: "fixed-folder", fixedFolder: windowsPath },
      { pdfPath: PDF, notePath: NOTE }
    );
    expect(r.directory).toBe("D:/parsed/out");
  });
});

describe("stem", () => {
  it("drops the extension", () => {
    expect(stem("C:/docs/paper.pdf")).toBe("paper");
    expect(stem("paper.tar.gz")).toBe("paper.tar");
  });

  it("keeps a name without extension", () => {
    expect(stem("C:/docs/README")).toBe("README");
  });
});

describe("shouldAskLocation", () => {
  it("is off by default", () => {
    expect(shouldAskLocation(DEFAULT_OUTPUT_LOCATION)).toBe(false);
  });

  it("is on when enabled", () => {
    expect(shouldAskLocation({ ...DEFAULT_OUTPUT_LOCATION, askEachTime: true })).toBe(true);
  });
});

describe("uniqueOutputName", () => {
  it("keeps the name when free", () => {
    expect(uniqueOutputName("a.md", new Set())).toBe("a.md");
  });

  it("appends a counter on collision", () => {
    expect(uniqueOutputName("a.md", new Set(["a.md"]))).toBe("a-1.md");
    expect(uniqueOutputName("a.md", new Set(["a.md", "a-1.md"]))).toBe("a-2.md");
  });

  it("handles names without extension", () => {
    expect(uniqueOutputName("README", new Set(["README"]))).toBe("README-1");
  });
});
