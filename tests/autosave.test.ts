import { describe, it, expect } from "vitest";
import {
  DEFAULT_AUTO_SAVE,
  autoSaveIntervalMs,
  formatHistoryStamp,
  historyFileName,
  normalizeAutoSaveSettings,
  resolveHistoryDir,
  selectExpiredHistory,
  shouldPromptOnClose,
  shouldSaveOnChange,
} from "../src/workspace/autosave";

describe("auto save settings", () => {
  it("defaults to off with a 5 minute interval", () => {
    expect(DEFAULT_AUTO_SAVE.mode).toBe("off");
    expect(DEFAULT_AUTO_SAVE.intervalMinutes).toBe(5);
    expect(DEFAULT_AUTO_SAVE.historyEnabled).toBe(true);
  });

  it("normalizes partial and invalid input", () => {
    expect(normalizeAutoSaveSettings(null)).toEqual(DEFAULT_AUTO_SAVE);
    expect(normalizeAutoSaveSettings({ mode: "nope" }).mode).toBe("off");
    expect(normalizeAutoSaveSettings({ mode: "interval", intervalMinutes: 0 }).intervalMinutes).toBe(1);
    expect(normalizeAutoSaveSettings({ mode: "interval", intervalMinutes: 999 }).intervalMinutes).toBe(120);
    expect(normalizeAutoSaveSettings({ maxHistory: 0 }).maxHistory).toBe(1);
    expect(normalizeAutoSaveSettings({ maxHistory: 9999 }).maxHistory).toBe(200);
    expect(normalizeAutoSaveSettings({ historyDir: "  /tmp/h  " }).historyDir).toBe("/tmp/h");
  });

  it("computes the interval only in interval mode", () => {
    expect(autoSaveIntervalMs({ ...DEFAULT_AUTO_SAVE, mode: "interval", intervalMinutes: 3 })).toBe(180000);
    expect(autoSaveIntervalMs({ ...DEFAULT_AUTO_SAVE, mode: "onChange" })).toBeNull();
    expect(autoSaveIntervalMs({ ...DEFAULT_AUTO_SAVE, mode: "off" })).toBeNull();
  });

  it("saves on change only in onChange mode", () => {
    expect(shouldSaveOnChange({ ...DEFAULT_AUTO_SAVE, mode: "onChange" }, true)).toBe(true);
    expect(shouldSaveOnChange({ ...DEFAULT_AUTO_SAVE, mode: "onChange" }, false)).toBe(false);
    expect(shouldSaveOnChange({ ...DEFAULT_AUTO_SAVE, mode: "interval" }, true)).toBe(false);
    expect(shouldSaveOnChange({ ...DEFAULT_AUTO_SAVE, mode: "off" }, true)).toBe(false);
  });
});

describe("history copies", () => {
  it("formats a sortable timestamp", () => {
    const date = new Date(2026, 9, 30, 11, 22, 33);
    expect(formatHistoryStamp(date)).toBe("20261030-112233");
  });

  it("builds a timestamped file name beside the original", () => {
    const date = new Date(2026, 9, 30, 11, 22, 33);
    expect(historyFileName("/docs/note.md", date)).toBe("/docs/note.20261030-112233.md");
    expect(historyFileName("C:\\docs\\note.txt", date)).toBe("C:/docs/note.20261030-112233.txt");
    expect(historyFileName("note.md", date)).toBe("note.20261030-112233.md");
  });

  it("handles names without an extension", () => {
    const date = new Date(2026, 0, 2, 3, 4, 5);
    expect(historyFileName("/docs/README", date)).toBe("/docs/README.20260102-030405.md");
  });

  it("resolves the history directory", () => {
    expect(resolveHistoryDir("/docs/note.md", DEFAULT_AUTO_SAVE)).toBe("/docs/.markweave-history");
    expect(
      resolveHistoryDir("/docs/note.md", { ...DEFAULT_AUTO_SAVE, historyDir: "/backup/" })
    ).toBe("/backup");
  });

  it("selects the oldest copies beyond the limit", () => {
    const files = ["a.3.md", "a.1.md", "a.2.md"];
    expect(selectExpiredHistory(files, 2)).toEqual(["a.1.md"]);
    expect(selectExpiredHistory(files, 3)).toEqual([]);
    expect(selectExpiredHistory(files, 5)).toEqual([]);
  });
});

describe("close prompt", () => {
  it("never prompts when nothing is dirty", () => {
    expect(shouldPromptOnClose(false, "off")).toBe(false);
    expect(shouldPromptOnClose(false, "onChange")).toBe(false);
  });

  it("prompts only when auto save is off", () => {
    expect(shouldPromptOnClose(true, "off")).toBe(true);
    expect(shouldPromptOnClose(true, "onChange")).toBe(false);
    expect(shouldPromptOnClose(true, "interval")).toBe(false);
  });
});
