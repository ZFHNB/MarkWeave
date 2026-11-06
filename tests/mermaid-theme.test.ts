import { describe, it, expect } from "vitest";
import {
  normalizeMermaidTheme,
  resolveMermaidTheme,
} from "../src/platform/mermaid-theme";

describe("mermaid theme preference", () => {
  it("normalizes invalid values to auto", () => {
    expect(normalizeMermaidTheme("light")).toBe("light");
    expect(normalizeMermaidTheme("DARK")).toBe("dark");
    expect(normalizeMermaidTheme("sepia")).toBe("auto");
    expect(normalizeMermaidTheme(null)).toBe("auto");
  });

  it("follows the UI theme in auto mode", () => {
    expect(resolveMermaidTheme("auto", true)).toBe("dark");
    expect(resolveMermaidTheme("auto", false)).toBe("default");
  });

  it("honors explicit light and dark", () => {
    expect(resolveMermaidTheme("light", true)).toBe("default");
    expect(resolveMermaidTheme("dark", false)).toBe("dark");
  });
});
