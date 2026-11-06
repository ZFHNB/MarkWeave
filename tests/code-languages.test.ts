import { describe, it, expect } from "vitest";
import {
  normalizeLanguage,
  getLanguageLabel,
  searchLanguages,
} from "../src/editor/code/languages";

describe("language catalog", () => {
  it("normalizes common aliases", () => {
    expect(normalizeLanguage("js")).toBe("javascript");
    expect(normalizeLanguage("TS")).toBe("typescript");
    expect(normalizeLanguage("py")).toBe("python");
    expect(normalizeLanguage("sh")).toBe("bash");
    expect(normalizeLanguage("html")).toBe("xml");
    expect(normalizeLanguage("md")).toBe("markdown");
    expect(normalizeLanguage("c++")).toBe("cpp");
    expect(normalizeLanguage("c#")).toBe("csharp");
    expect(normalizeLanguage("yml")).toBe("yaml");
    expect(normalizeLanguage("mermaid")).toBe("mermaid");
    expect(normalizeLanguage("  TypeScript  extra ")).toBe("typescript");
  });

  it("keeps unknown languages as lowercase tokens", () => {
    expect(normalizeLanguage("MyLang")).toBe("mylang");
  });

  it("searches by id, label and alias", () => {
    expect(searchLanguages("type").some((l) => l.id === "typescript")).toBe(true);
    expect(searchLanguages("py").some((l) => l.id === "python")).toBe(true);
    expect(searchLanguages("").length).toBeGreaterThan(20);
    expect(searchLanguages("no-such-language")).toEqual([]);
  });

  it("provides display labels", () => {
    expect(getLanguageLabel("typescript")).toBe("TypeScript");
    expect(getLanguageLabel("plaintext")).toBe("纯文本");
    expect(getLanguageLabel("mylang")).toBe("mylang");
  });
});
