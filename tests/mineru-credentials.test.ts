import { describe, it, expect } from "vitest";
import {
  ENV_API_KEY,
  REDACTION_MASK,
  classifyMineruError,
  looksLikeApiKey,
  maskApiKey,
  preflightCheck,
  redact,
  resolveCredential,
} from "../src/platform/mineru-credentials";

describe("resolveCredential", () => {
  it("prefers the environment variable", () => {
    const r = resolveCredential({ envValue: "env-key-123456", keychainValue: "stored-key-abcdef" });
    expect(r.source).toBe("env");
    expect(r.apiKey).toBe("env-key-123456");
  });

  it("falls back to the keychain", () => {
    const r = resolveCredential({ envValue: null, keychainValue: "stored-key-abcdef" });
    expect(r.source).toBe("keychain");
  });

  it("ignores blank values", () => {
    const r = resolveCredential({ envValue: "   ", keychainValue: "  " });
    expect(r.source).toBe("none");
    expect(r.apiKey).toBeNull();
  });

  it("uses the documented env var name", () => {
    expect(ENV_API_KEY).toBe("MINERU_API_KEY");
  });
});

describe("looksLikeApiKey", () => {
  it("accepts a plausible key", () => {
    expect(looksLikeApiKey("sk-abcdef123456")).toBe(true);
  });

  it("rejects short, blank and placeholder values", () => {
    expect(looksLikeApiKey("")).toBe(false);
    expect(looksLikeApiKey("short")).toBe(false);
    expect(looksLikeApiKey("your-api-key")).toBe(false);
    expect(looksLikeApiKey("placeholder")).toBe(false);
    expect(looksLikeApiKey(null)).toBe(false);
  });
});

describe("redact", () => {
  it("masks every occurrence of a secret", () => {
    const out = redact("key=abc123456789 and again abc123456789", ["abc123456789"]);
    expect(out).not.toContain("abc123456789");
    expect(out.split(REDACTION_MASK).length - 1).toBe(2);
  });

  it("leaves text untouched when no secret appears", () => {
    expect(redact("普通日志", ["abc123456789"])).toBe("普通日志");
  });

  it("ignores null and very short secrets", () => {
    expect(redact("text", [null, "abc", ""])).toBe("text");
  });

  it("handles empty text", () => {
    expect(redact("", ["abc123456789"])).toBe("");
  });
});

describe("maskApiKey", () => {
  it("keeps the first and last four characters", () => {
    expect(maskApiKey("sk-1234567890abcd")).toBe("sk-1…abcd");
  });

  it("fully masks short keys", () => {
    expect(maskApiKey("short")).toBe(REDACTION_MASK);
  });
});

describe("classifyMineruError", () => {
  it("classifies authentication failures", () => {
    const f = classifyMineruError({ status: 401, mode: "cloud" });
    expect(f.kind).toBe("auth");
    expect(f.action).toBe("open-settings");
    expect(f.retryable).toBe(false);
  });

  it("classifies quota and rate limits", () => {
    const f = classifyMineruError({ status: 429, mode: "cloud" });
    expect(f.kind).toBe("quota");
    expect(f.retryable).toBe(true);
  });

  it("classifies network failures", () => {
    const f = classifyMineruError({ code: "ENOTFOUND", mode: "cloud" });
    expect(f.kind).toBe("network");
    expect(f.message).toContain("网络");
  });

  it("classifies a missing key", () => {
    const f = classifyMineruError({ message: "no api key configured", mode: "cloud" });
    expect(f.kind).toBe("not-configured");
    expect(f.action).toBe("open-settings");
  });

  it("classifies local runtime problems only in local mode", () => {
    expect(classifyMineruError({ message: "python runtime not ready", mode: "local" }).kind).toBe(
      "local-not-ready"
    );
    expect(classifyMineruError({ message: "python runtime not ready", mode: "cloud" }).kind).not.toBe(
      "local-not-ready"
    );
  });

  it("classifies parse failures", () => {
    const f = classifyMineruError({ status: 400, message: "invalid pdf", mode: "cloud" });
    expect(f.kind).toBe("parse");
  });

  it("treats 5xx as retryable", () => {
    expect(classifyMineruError({ status: 503, mode: "cloud" }).retryable).toBe(true);
    expect(classifyMineruError({ status: 400, mode: "cloud" }).retryable).toBe(false);
  });

  it("suggests switching to local on cloud quota errors", () => {
    expect(classifyMineruError({ status: 402, mode: "cloud" }).action).toBe("switch-local");
  });

  it("always returns an actionable result for unknown errors", () => {
    const f = classifyMineruError({ message: "???", mode: "cloud" });
    expect(f.kind).toBe("unknown");
    expect(f.action).not.toBe(undefined);
    expect(f.message.length).toBeGreaterThan(0);
  });
});

describe("preflightCheck", () => {
  it("passes when local is ready", () => {
    expect(preflightCheck({ mode: "local", apiKey: null, localReady: true })).toBeNull();
  });

  it("blocks local when the runtime is missing", () => {
    const f = preflightCheck({ mode: "local", apiKey: null, localReady: false });
    expect(f?.kind).toBe("local-not-ready");
  });

  it("passes for cloud with a valid key", () => {
    expect(
      preflightCheck({ mode: "cloud", apiKey: "sk-abcdef123456", localReady: false })
    ).toBeNull();
  });

  it("blocks cloud without a key", () => {
    const f = preflightCheck({ mode: "cloud", apiKey: null, localReady: true });
    expect(f?.kind).toBe("not-configured");
    expect(f?.action).toBe("open-settings");
  });
});
