import { describe, it, expect } from "vitest";
import { DEFAULT_LANGUAGE, normalizeLanguage } from "../src/platform/i18n";

describe("language normalization", () => {
  it("defaults to Chinese", () => {
    expect(DEFAULT_LANGUAGE).toBe("zh");
    expect(normalizeLanguage(null)).toBe("zh");
    expect(normalizeLanguage("fr")).toBe("zh");
  });

  it("accepts supported languages case-insensitively", () => {
    expect(normalizeLanguage("zh")).toBe("zh");
    expect(normalizeLanguage("EN")).toBe("en");
  });
});
