import { describe, it, expect } from "vitest";
import { resolveTheme } from "../src/platform/theme";

describe("theme resolution", () => {
  it("honors explicit light and night", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("night", false)).toBe("night");
  });

  it("follows the system preference", () => {
    expect(resolveTheme("system", true)).toBe("night");
    expect(resolveTheme("system", false)).toBe("light");
  });
});
