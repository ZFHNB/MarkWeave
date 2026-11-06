export type MermaidThemePreference = "auto" | "light" | "dark";
export type MermaidRenderTheme = "default" | "dark";

export const MERMAID_THEME_STORAGE_KEY = "markweave_mermaid_theme";

export function normalizeMermaidTheme(value: unknown): MermaidThemePreference {
  if (typeof value !== "string") {
    return "auto";
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "light" || normalized === "dark" || normalized === "auto") {
    return normalized;
  }
  return "auto";
}

export function resolveMermaidTheme(
  preference: MermaidThemePreference,
  isNightUi: boolean
): MermaidRenderTheme {
  if (preference === "light") {
    return "default";
  }
  if (preference === "dark") {
    return "dark";
  }
  return isNightUi ? "dark" : "default";
}

export function getMermaidThemePreference(): MermaidThemePreference {
  try {
    if (typeof localStorage !== "undefined") {
      return normalizeMermaidTheme(localStorage.getItem(MERMAID_THEME_STORAGE_KEY));
    }
  } catch {
    // fallback to auto if localStorage is inaccessible
  }
  return "auto";
}
