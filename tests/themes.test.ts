import { describe, it, expect, afterEach } from "vitest";
import {
  BUILT_IN_THEMES,
  applyBuiltInTheme,
  getAllThemes,
  getCustomThemes,
  getTheme,
  normalizeThemeId,
  registerCustomThemes,
} from "../src/platform/themes";

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

describe("custom themes", () => {
  afterEach(() => registerCustomThemes([]));

  const sample = {
    id: "custom:solarized",
    label: "Solarized",
    dark: false,
    description: "自定义主题：Solarized",
    css: "#write { color: #586e75; }",
  };

  it("registers custom themes alongside built-ins", () => {
    registerCustomThemes([sample]);
    const ids = getAllThemes().map((theme) => theme.id);
    expect(ids).toContain("custom:solarized");
    expect(ids).toContain("github");
    expect(getCustomThemes()).toHaveLength(1);
  });

  it("keeps a selected custom theme id", () => {
    registerCustomThemes([sample]);
    expect(normalizeThemeId("custom:solarized")).toBe("custom:solarized");
    expect(getTheme("custom:solarized").css).toBe(sample.css);
  });

  it("falls back when the custom theme file disappeared", () => {
    expect(normalizeThemeId("custom:deleted")).toBe("default");
  });

  it("injects a style tag and removes the built-in link", () => {
    document.head.innerHTML = "";
    const link = document.createElement("link");
    link.id = "markweave-theme";
    document.head.appendChild(link);

    registerCustomThemes([sample]);
    applyBuiltInTheme("custom:solarized");

    expect(document.getElementById("markweave-theme")).toBeNull();
    expect(document.getElementById("markweave-theme-custom")?.textContent).toContain("#586e75");
    expect(document.body.dataset.markweaveTheme).toBe("custom:solarized");
  });

  it("removes the custom style when switching back to a built-in theme", () => {
    document.head.innerHTML = "";
    registerCustomThemes([sample]);
    applyBuiltInTheme("custom:solarized");
    applyBuiltInTheme("github");
    expect(document.getElementById("markweave-theme-custom")).toBeNull();
  });
});
