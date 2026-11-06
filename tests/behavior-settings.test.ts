import { describe, it, expect } from "vitest";
import {
  DEFAULT_EDITOR_BEHAVIOR,
  clampCursorPosition,
  normalizeEditorBehavior,
  shouldRestoreSession,
} from "../src/editor/behavior-settings";

describe("editor behavior defaults", () => {
  it("keeps spellcheck and code wrap off by default", () => {
    expect(DEFAULT_EDITOR_BEHAVIOR.spellcheck).toBe(false);
    expect(DEFAULT_EDITOR_BEHAVIOR.codeWrap).toBe(false);
  });

  it("enables auto link and session restore by default", () => {
    expect(DEFAULT_EDITOR_BEHAVIOR.autoLink).toBe(true);
    expect(DEFAULT_EDITOR_BEHAVIOR.restoreSession).toBe(true);
  });
});

describe("normalizeEditorBehavior", () => {
  it("returns defaults for empty input", () => {
    expect(normalizeEditorBehavior(null)).toEqual(DEFAULT_EDITOR_BEHAVIOR);
    expect(normalizeEditorBehavior(undefined)).toEqual(DEFAULT_EDITOR_BEHAVIOR);
  });

  it("accepts explicit booleans", () => {
    const result = normalizeEditorBehavior({
      spellcheck: true,
      autoLink: false,
      restoreSession: false,
      codeWrap: true,
    });
    expect(result).toEqual({
      spellcheck: true,
      autoLink: false,
      restoreSession: false,
      codeWrap: true,
    });
  });

  it("ignores non-boolean values", () => {
    const result = normalizeEditorBehavior({
      spellcheck: "yes",
      autoLink: 1,
      restoreSession: null,
      codeWrap: {},
    });
    expect(result).toEqual(DEFAULT_EDITOR_BEHAVIOR);
  });

  it("fills only the missing fields", () => {
    const result = normalizeEditorBehavior({ codeWrap: true });
    expect(result.codeWrap).toBe(true);
    expect(result.spellcheck).toBe(DEFAULT_EDITOR_BEHAVIOR.spellcheck);
  });
});

describe("shouldRestoreSession", () => {
  it("restores when enabled and a session exists", () => {
    expect(shouldRestoreSession(DEFAULT_EDITOR_BEHAVIOR, { documents: [] })).toBe(true);
  });

  it("does not restore when disabled, even if a session exists", () => {
    expect(
      shouldRestoreSession({ ...DEFAULT_EDITOR_BEHAVIOR, restoreSession: false }, { documents: [] })
    ).toBe(false);
  });

  it("does not restore when there is no session", () => {
    expect(shouldRestoreSession(DEFAULT_EDITOR_BEHAVIOR, null)).toBe(false);
  });
});

describe("clampCursorPosition", () => {
  it("keeps a valid position", () => {
    expect(clampCursorPosition(42, 100)).toBe(42);
  });

  it("clamps beyond the document size", () => {
    expect(clampCursorPosition(500, 100)).toBe(100);
  });

  it("rejects negative and non-numeric input", () => {
    expect(clampCursorPosition(-5, 100)).toBe(0);
    expect(clampCursorPosition("12", 100)).toBe(0);
    expect(clampCursorPosition(NaN, 100)).toBe(0);
  });

  it("floors fractional positions", () => {
    expect(clampCursorPosition(12.9, 100)).toBe(12);
  });
});
