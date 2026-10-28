import { describe, it, expect } from "vitest";
import { BUILT_IN_THEMES, getTheme, normalizeThemeId } from "../src/platform/themes";

describe("built-in themes", () => {
  it("includes the ported Typora themes", () => {
    const ids = BUILT_IN_THEMES.map((theme) => theme.id);
    expect(ids).toEqual(expect.arrayContaining(["default", "github", "newsprint", "pixyll", "whitey", "night"]));
  });

  it("marks night as dark", () => {
    expect(getTheme("night").dark).toBe(true);
    expect(getTheme("github").dark).toBe(false);
  });

  it("normalizes unknown ids to default", () => {
    expect(normalizeThemeId("nope")).toBe("default");
    expect(normalizeThemeId(null)).toBe("default");
    expect(normalizeThemeId("github")).toBe("github");
  });

  it("falls back to the default theme for unknown lookups", () => {
    expect(getTheme("missing").id).toBe("default");
  });
});
