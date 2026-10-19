import { describe, it, expect } from "vitest";
import { tokenizeCode } from "../src/editor/code/highlight";

describe("highlight tokenization", () => {
  it("returns keyword and string ranges for JavaScript", () => {
    const code = 'const x = "hi";';
    const ranges = tokenizeCode(code, "javascript");
    expect(
      ranges.some(
        (r) => r.classes.includes("hljs-keyword") && code.slice(r.start, r.end) === "const"
      )
    ).toBe(true);
    expect(
      ranges.some(
        (r) => r.classes.includes("hljs-string") && code.slice(r.start, r.end).includes("hi")
      )
    ).toBe(true);
  });

  it("resolves aliases", () => {
    expect(tokenizeCode("const x = 1;", "js").length).toBeGreaterThan(0);
  });

  it("returns no ranges for plaintext, mermaid and unknown languages", () => {
    expect(tokenizeCode("const x = 1;", "plaintext")).toEqual([]);
    expect(tokenizeCode("flowchart TD\nA-->B", "mermaid")).toEqual([]);
    expect(tokenizeCode("const x = 1;", "no-such-language")).toEqual([]);
  });
});
