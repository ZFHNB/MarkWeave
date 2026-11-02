import { describe, it, expect } from "vitest";
import { deflateRawSync } from "zlib";
import {
  MINERU_API_BASE,
  MineruCloudError,
  extractMarkdownFromZip,
  isTerminalState,
} from "../src/export/mineru-cloud";

/** 构造一个最小 zip（stored / deflate 两种） */
function buildZip(entries: { name: string; content: string; deflate?: boolean }[]): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const raw = Buffer.from(entry.content, "utf8");
    const body = entry.deflate ? deflateRawSync(raw) : raw;
    const method = entry.deflate ? 8 : 0;
    const nameBuf = Buffer.from(entry.name, "utf8");
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    locals.push(local, nameBuf, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);

    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + body.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return new Uint8Array(Buffer.concat([...locals, centralBuf, eocd]));
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

describe("isTerminalState", () => {
  it("treats done and failed as terminal", () => {
    expect(isTerminalState("done")).toBe(true);
    expect(isTerminalState("failed")).toBe(true);
  });

  it("keeps polling for in-progress states", () => {
    for (const s of ["waiting-file", "pending", "running", "converting"]) {
      expect(isTerminalState(s)).toBe(false);
    }
  });
});

describe("API base", () => {
  it("targets the v4 endpoint", () => {
    expect(MINERU_API_BASE).toBe("https://mineru.net/api/v4");
  });
});

describe("extractMarkdownFromZip", () => {
  it("reads a stored full.md", async () => {
    const zip = buildZip([{ name: "full.md", content: "# 标题\n\n正文" }]);
    const { markdown, files } = await extractMarkdownFromZip(zip);
    expect(markdown).toBe("# 标题\n\n正文");
    expect(files).toEqual(["full.md"]);
  });

  it("reads a deflated full.md", async () => {
    const zip = buildZip([{ name: "full.md", content: "压缩内容".repeat(50), deflate: true }]);
    const { markdown } = await extractMarkdownFromZip(zip);
    expect(markdown).toBe("压缩内容".repeat(50));
  });

  it("prefers full.md over other markdown files", async () => {
    const zip = buildZip([
      { name: "other.md", content: "不该选中" },
      { name: "full.md", content: "应该选中" },
    ]);
    expect((await extractMarkdownFromZip(zip)).markdown).toBe("应该选中");
  });

  it("falls back to any markdown file", async () => {
    const zip = buildZip([{ name: "doc.md", content: "备用内容" }]);
    expect((await extractMarkdownFromZip(zip)).markdown).toBe("备用内容");
  });

  it("lists every file in the archive", async () => {
    const zip = buildZip([
      { name: "full.md", content: "x" },
      { name: "origin.pdf", content: "y" },
      { name: "layout.json", content: "{}" },
    ]);
    expect((await extractMarkdownFromZip(zip)).files).toHaveLength(3);
  });

  it("throws when there is no markdown", async () => {
    const zip = buildZip([{ name: "origin.pdf", content: "pdf" }]);
    await expect(extractMarkdownFromZip(zip)).rejects.toThrow(MineruCloudError);
  });

  it("throws on a non-zip buffer", async () => {
    await expect(extractMarkdownFromZip(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow(
      MineruCloudError
    );
  });
});

describe("MineruCloudError", () => {
  it("carries status and code", () => {
    const err = new MineruCloudError("boom", { status: 401, code: "-10001" });
    expect(err.name).toBe("MineruCloudError");
    expect(err.status).toBe(401);
    expect(err.code).toBe("-10001");
    expect(err.message).toBe("boom");
  });

  it("defaults to nulls", () => {
    const err = new MineruCloudError("boom");
    expect(err.status).toBeNull();
    expect(err.code).toBeNull();
  });
});
