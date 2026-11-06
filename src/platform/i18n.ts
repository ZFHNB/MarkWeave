export type Language = "zh" | "en";
export const DEFAULT_LANGUAGE: Language = "zh";

export function normalizeLanguage(value: unknown): Language {
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (lower === "zh" || lower === "en") {
      return lower;
    }
  }
  return DEFAULT_LANGUAGE;
}
