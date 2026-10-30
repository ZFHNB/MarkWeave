// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  BODY_CJK_FONTS,
  BODY_LATIN_FONTS,
  MONO_CJK_FONTS,
  MONO_LATIN_FONTS,
  FONT_GROUPS,
  genericFor,
  normalizeFontIdForGroup,
  resolveFontFamilies,
  resolveFontStack,
  sanitizeFontStack,
} from "../src/platform/fonts";

describe("font groups", () => {
  it("exposes four independent groups", () => {
    expect(Object.keys(FONT_GROUPS).sort()).toEqual(
      ["bodyCJK", "bodyLatin", "monoCJK", "monoLatin"].sort()
    );
  });

  it("offers mainstream programming fonts for code latin", () => {
    const ids = MONO_LATIN_FONTS.map((font) => font.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "jetbrains-mono",
        "fira-code",
        "cascadia",
        "source-code-pro",
        "ibm-plex-mono",
        "hack",
        "sf-mono",
        "menlo",
        "consolas",
        "monaco",
        "ubuntu-mono",
      ])
    );
  });

  it("offers Chinese body and code fonts", () => {
    expect(BODY_CJK_FONTS.map((f) => f.id)).toEqual(
      expect.arrayContaining(["pingfang", "yahei", "source-han-sans", "source-han-serif", "lxgw"])
    );
    expect(MONO_CJK_FONTS.map((f) => f.id)).toEqual(
      expect.arrayContaining(["source-han-mono", "sarasa-mono"])
    );
  });

  it("every group has a custom entry", () => {
    for (const list of Object.values(FONT_GROUPS)) {
      expect(list.some((font) => font.id === "custom")).toBe(true);
    }
  });
});

describe("font stack assembly", () => {
  it("resolves a latin body stack", () => {
    expect(resolveFontStack("bodyLatin", "georgia")).toContain("Georgia");
  });

  it("resolves a CJK body stack", () => {
    expect(resolveFontStack("bodyCJK", "pingfang")).toContain("PingFang SC");
  });

  it("keeps only one generic fallback at the end", () => {
    const stack = resolveFontStack("monoLatin", "ubuntu-mono");
    expect(stack.endsWith("monospace")).toBe(true);
    expect(stack.split("monospace").length - 1).toBe(1);
  });

  it("returns families without the generic fallback", () => {
    const families = resolveFontFamilies("monoLatin", "jetbrains-mono");
    expect(families).toContain("JetBrains Mono");
    expect(families).not.toContain("monospace");
  });

  it("uses the custom value when provided", () => {
    expect(resolveFontStack("monoLatin", "custom", "My Mono")).toBe('"My Mono", monospace');
    expect(resolveFontFamilies("bodyLatin", "custom", "A, B")).toEqual(["A", "B"]);
  });

  it("falls back to the group default for empty custom input", () => {
    expect(resolveFontFamilies("bodyLatin", "custom", "   ")).toEqual(
      BODY_LATIN_FONTS[0].families
    );
  });

  it("falls back for unknown ids", () => {
    expect(normalizeFontIdForGroup("monoLatin", "nope")).toBe("system");
    expect(resolveFontFamilies("bodyCJK", "nope")).toEqual(BODY_CJK_FONTS[0].families);
  });

  it("quotes font names containing spaces", () => {
    expect(resolveFontStack("monoLatin", "jetbrains-mono")).toContain('"JetBrains Mono"');
  });

  it("exposes the right generic per group", () => {
    expect(genericFor("monoLatin")).toBe("monospace");
    expect(genericFor("bodyCJK")).toBe("sans-serif");
  });
});

describe("sanitizing custom font input", () => {
  it("strips CSS-breaking characters", () => {
    expect(sanitizeFontStack("Arial; } body { color: red")).toBe("Arial body color: red");
  });

  it("collapses whitespace", () => {
    expect(sanitizeFontStack("  Font   Name  ")).toBe("Font Name");
  });

  it("caps the length", () => {
    expect(sanitizeFontStack("a".repeat(500)).length).toBe(200);
  });
});

describe("combined editor stacks", () => {
  /**
   * main.ts 把两组候选拼在一起、末尾只留一个 generic。
   * 这里复现该拼装方式，确保英文命中西文、中文命中中文字体。
   */
  function buildStack(
    latinGroup: "bodyLatin" | "monoLatin",
    cjkGroup: "bodyCJK" | "monoCJK",
    latinId: string,
    cjkId: string
  ) {
    return [
      ...resolveFontFamilies(latinGroup, latinId),
      ...resolveFontFamilies(cjkGroup, cjkId),
      genericFor(latinGroup),
    ].join(", ");
  }

  it("places latin families before CJK families", () => {
    const stack = buildStack("bodyLatin", "bodyCJK", "georgia", "pingfang");
    expect(stack.indexOf("Georgia")).toBeLessThan(stack.indexOf("PingFang SC"));
  });

  it("ends with exactly one generic", () => {
    const stack = buildStack("monoLatin", "monoCJK", "jetbrains-mono", "sarasa-mono");
    const generics = stack.match(/monospace/g) ?? [];
    expect(generics.length).toBe(1);
    expect(stack.endsWith("monospace")).toBe(true);
  });

  it("keeps code and body stacks distinct", () => {
    const body = buildStack("bodyLatin", "bodyCJK", "georgia", "pingfang");
    const mono = buildStack("monoLatin", "monoCJK", "jetbrains-mono", "sarasa-mono");
    expect(body).not.toBe(mono);
  });
});
