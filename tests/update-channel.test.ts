import { describe, it, expect } from "vitest";
import {
  INITIAL_UPDATE_STATE,
  compareVersions,
  createUnsupportedChannel,
  statusForVersions,
} from "../src/platform/update-channel";

describe("compareVersions", () => {
  it("detects a newer version", () => {
    expect(compareVersions("0.2.0", "0.1.1")).toBe(1);
    expect(compareVersions("1.0.0", "0.9.9")).toBe(1);
  });

  it("detects an older version", () => {
    expect(compareVersions("0.1.0", "0.1.1")).toBe(-1);
  });

  it("treats equal versions as equal", () => {
    expect(compareVersions("0.1.1", "0.1.1")).toBe(0);
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
  });

  it("ignores a leading v", () => {
    expect(compareVersions("v0.2.0", "0.1.1")).toBe(1);
    expect(compareVersions("v1.0.0", "v1.0.0")).toBe(0);
  });

  it("compares numerically, not lexically", () => {
    // "10" > "9" 在数值上成立，字符串比较则相反
    expect(compareVersions("0.10.0", "0.9.0")).toBe(1);
  });

  it("ignores pre-release suffixes", () => {
    expect(compareVersions("1.0.0-beta.1", "1.0.0")).toBe(0);
    expect(compareVersions("1.0.0+build.5", "1.0.0")).toBe(0);
  });

  it("pads missing segments with zero", () => {
    expect(compareVersions("1.2", "1.2.1")).toBe(-1);
    expect(compareVersions("1.2.0", "1.2")).toBe(0);
  });
});

describe("statusForVersions", () => {
  it("reports an available update", () => {
    expect(statusForVersions("0.1.1", "0.2.0")).toBe("available");
  });

  it("reports up to date", () => {
    expect(statusForVersions("0.2.0", "0.2.0")).toBe("up-to-date");
  });

  it("reports an error for a blank latest version", () => {
    expect(statusForVersions("0.1.1", "")).toBe("error");
  });
});

describe("unsupported channel", () => {
  const channel = createUnsupportedChannel("0.1.1");

  it("reports the current version", () => {
    expect(channel.getCurrentVersion()).toBe("0.1.1");
  });

  it("declares itself unsupported", () => {
    expect(channel.isSupported()).toBe(false);
  });

  it("returns a typed unsupported state rather than pretending to work", async () => {
    for (const state of [await channel.check(), await channel.download(), await channel.install()]) {
      expect(state.status).toBe("unsupported");
      expect(state.current).toBe("0.1.1");
      expect(state.error).toBeTruthy();
    }
  });

  it("keeps the initial state neutral", () => {
    expect(INITIAL_UPDATE_STATE.status).toBe("idle");
    expect(INITIAL_UPDATE_STATE.progress).toBe(0);
  });
});
