import { describe, it, expect } from "vitest";
import { resolvePreviewModeOnAttach } from "../src/editor/diagram/mermaid-interactor";

describe("mermaid preview mode persistence", () => {
  it("uses the default mode on first attach", () => {
    expect(resolvePreviewModeOnAttach("standard", false, "custom")).toBe("custom");
    expect(resolvePreviewModeOnAttach("custom", false, "standard")).toBe("standard");
  });

  it("keeps the user's explicit mode across re-attach", () => {
    expect(resolvePreviewModeOnAttach("standard", true, "custom")).toBe("standard");
    expect(resolvePreviewModeOnAttach("custom", true, "standard")).toBe("custom");
  });
});
