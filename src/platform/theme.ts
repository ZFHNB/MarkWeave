export type ThemeSetting = "light" | "night" | "system";

export function resolveTheme(theme: ThemeSetting, prefersDark: boolean): "light" | "night" {
  if (theme === "system") {
    return prefersDark ? "night" : "light";
  }
  return theme;
}
