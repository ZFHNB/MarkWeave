import { describe, it, expect } from "vitest";
import {
  decideParseMode,
  needsUploadConsent,
  type ParseAvailability,
} from "../src/platform/mineru-mode";

const both: ParseAvailability = { localReady: true, cloudReady: true };
const none: ParseAvailability = {
  localReady: false,
  cloudReady: false,
  localDetail: "未检测到本地 MinerU",
};
const cloudOnly: ParseAvailability = { localReady: false, cloudReady: true };
const localOnly: ParseAvailability = { localReady: true, cloudReady: false };

describe("decideParseMode — preferred local", () => {
  it("uses local when ready, without asking", () => {
    const d = decideParseMode("local", both);
    expect(d.action).toBe("proceed");
    expect(d.mode).toBe("local");
  });

  it("silently switches to cloud when local is missing but cloud has a key", () => {
    // 这是用户反馈的核心：已配置云端就不该再弹「是否改用云端」
    const d = decideParseMode("local", cloudOnly);
    expect(d.action).toBe("proceed");
    expect(d.mode).toBe("cloud");
    expect(d.message).toBeUndefined();
  });

  it("asks for setup when neither is ready", () => {
    const d = decideParseMode("local", none);
    expect(d.action).toBe("need-local-setup");
    expect(d.mode).toBeNull();
    expect(d.message).toContain("未检测到本地 MinerU");
    expect(d.message).toContain("pip install -U mineru");
  });
});

describe("decideParseMode — preferred cloud", () => {
  it("uses cloud when a key is configured", () => {
    const d = decideParseMode("cloud", both);
    expect(d.action).toBe("proceed");
    expect(d.mode).toBe("cloud");
  });

  it("silently switches to local when cloud has no key but local works", () => {
    const d = decideParseMode("cloud", localOnly);
    expect(d.action).toBe("proceed");
    expect(d.mode).toBe("local");
  });

  it("asks for a key when neither is ready", () => {
    const d = decideParseMode("cloud", none);
    expect(d.action).toBe("need-cloud-key");
    expect(d.mode).toBeNull();
    expect(d.message).toContain("API Key");
  });
});

describe("decideParseMode — never asks needlessly", () => {
  it("does not produce ask-switch in any ready combination", () => {
    // 只要有一条路能走通，就必须静默完成
    for (const [preferred, avail] of [
      ["local", both],
      ["local", cloudOnly],
      ["local", localOnly],
      ["cloud", both],
      ["cloud", localOnly],
      ["cloud", cloudOnly],
    ] as const) {
      const d = decideParseMode(preferred, avail);
      expect(d.action, `${preferred} + ${JSON.stringify(avail)}`).toBe("proceed");
      expect(d.mode).not.toBeNull();
    }
  });

  it("only fails when both routes are unavailable", () => {
    expect(decideParseMode("local", none).action).not.toBe("proceed");
    expect(decideParseMode("cloud", none).action).not.toBe("proceed");
  });
});

describe("needsUploadConsent", () => {
  it("asks once before the first cloud upload", () => {
    expect(needsUploadConsent("cloud", false)).toBe(true);
  });

  it("does not ask again after confirmation", () => {
    expect(needsUploadConsent("cloud", true)).toBe(false);
  });

  it("never asks for local parsing", () => {
    expect(needsUploadConsent("local", false)).toBe(false);
    expect(needsUploadConsent("local", true)).toBe(false);
  });

  it("still asks when silently switched to cloud", () => {
    // 静默切换不跳过隐私确认
    const d = decideParseMode("local", cloudOnly);
    expect(d.mode).toBe("cloud");
    expect(needsUploadConsent(d.mode!, false)).toBe(true);
  });
});
