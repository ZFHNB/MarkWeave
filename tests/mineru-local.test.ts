import { describe, it, expect } from "vitest";
import {
  LOCAL_COMMANDS,
  buildLocalArgs,
  candidateMarkdownPaths,
  evaluateLocalRuntime,
  indicatesMissingModels,
  majorVersion,
  parseLocalVersion,
} from "../src/platform/mineru-local";

describe("command candidates", () => {
  it("prefers mineru-kit, then mineru, then the legacy command", () => {
    expect(LOCAL_COMMANDS[0]).toBe("mineru-kit");
    expect(LOCAL_COMMANDS).toContain("mineru");
    expect(LOCAL_COMMANDS).toContain("magic-pdf");
  });
});

describe("parseLocalVersion", () => {
  it("extracts a semver from typical output", () => {
    expect(parseLocalVersion("mineru 4.1.4")).toBe("4.1.4");
    expect(parseLocalVersion("magic-pdf version 1.3.12")).toBe("1.3.12");
  });

  it("keeps a pre-release suffix", () => {
    expect(parseLocalVersion("mineru 4.2.0-beta.1")).toBe("4.2.0-beta.1");
  });

  it("returns null when no version appears", () => {
    expect(parseLocalVersion("command not found")).toBeNull();
    expect(parseLocalVersion("")).toBeNull();
  });
});

describe("majorVersion", () => {
  it("reads the leading number", () => {
    expect(majorVersion("4.1.4")).toBe(4);
    expect(majorVersion("1.3.12")).toBe(1);
  });

  it("handles null", () => {
    expect(majorVersion(null)).toBeNull();
  });
});

describe("evaluateLocalRuntime", () => {
  it("reports a missing runtime with an install hint", () => {
    const info = evaluateLocalRuntime({ command: null, versionOutput: null, modelsReady: false });
    expect(info.command).toBeNull();
    expect(info.detail).toContain("pip install");
    expect(info.detail).toContain("云端模式");
  });

  it("reports ready when both command and models are present", () => {
    const info = evaluateLocalRuntime({
      command: "mineru",
      versionOutput: "mineru 4.1.4",
      modelsReady: true,
    });
    expect(info.modelsReady).toBe(true);
    expect(info.version).toBe("4.1.4");
    expect(info.detail).toContain("就绪");
  });

  it("reports a present-but-unprepared runtime", () => {
    const info = evaluateLocalRuntime({
      command: "magic-pdf",
      versionOutput: "magic-pdf 1.3.12",
      modelsReady: false,
    });
    expect(info.modelsReady).toBe(false);
    expect(info.detail).toContain("模型");
  });
});

describe("buildLocalArgs", () => {
  it("uses the stateless parse form for mineru-kit", () => {
    const args = buildLocalArgs({
      command: "mineru-kit",
      inputPath: "C:/in/a.pdf",
      outputDir: "C:/out/a.md",
    });
    expect(args).toEqual(["parse", "C:/in/a.pdf", "-o", "C:/out/a.md"]);
  });

  it("requires all pages for the 4.x library mode", () => {
    // 库模式默认只取前 10 页，不显式指定会静默截断
    const args = buildLocalArgs({
      command: "mineru",
      inputPath: "a.pdf",
      outputDir: "out",
    });
    expect(args).toContain("--pages");
    expect(args[args.indexOf("--pages") + 1]).toBe("all");
    expect(args[0]).toBe("a.pdf");
  });

  it("skips the page flag when only the first pages are wanted", () => {
    const args = buildLocalArgs({
      command: "mineru",
      inputPath: "a.pdf",
      outputDir: "out",
      allPages: false,
    });
    expect(args).not.toContain("--pages");
  });

  it("uses the legacy -p form for magic-pdf", () => {
    const args = buildLocalArgs({
      command: "magic-pdf",
      inputPath: "a.pdf",
      outputDir: "out",
    });
    expect(args).toEqual(["-p", "a.pdf", "-o", "out", "-m", "auto"]);
  });
});

describe("candidateMarkdownPaths", () => {
  it("covers the documented layouts", () => {
    const paths = candidateMarkdownPaths("C:/out", "paper");
    expect(paths).toContain("C:/out/paper/paper.md");
    expect(paths).toContain("C:/out/paper/auto/paper.md");
    expect(paths.length).toBeGreaterThanOrEqual(4);
  });

  it("accepts a direct .md output path", () => {
    const paths = candidateMarkdownPaths("C:/out/paper.md", "paper");
    expect(paths[0]).toBe("C:/out/paper.md");
  });

  it("normalizes trailing separators", () => {
    const bs = "\\";
    // 无扩展名的目录输入，第一个候选是 "C:/out.md"
    expect(candidateMarkdownPaths(`C:${bs}out${bs}`, "paper")).toContain("C:/out/paper/paper.md");
  });
});

describe("indicatesMissingModels", () => {
  it("detects common missing-model messages", () => {
    expect(indicatesMissingModels("model weights not found")).toBe(true);
    expect(indicatesMissingModels("请先下载模型")).toBe(true);
  });

  it("ignores ordinary output", () => {
    expect(indicatesMissingModels("Processing page 1/3")).toBe(false);
    expect(indicatesMissingModels("")).toBe(false);
  });
});
