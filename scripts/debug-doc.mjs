import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import os from "os";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "markweave-dbg2-"));

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: "new",
  defaultViewport: { width: 1280, height: 900 },
  args: ["--no-sandbox", "--disable-setuid-sandbox", `--user-data-dir=${profileDir}`],
});

function dump(node) {
  const out = [];
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i);
    out.push({
      name: c.type.name,
      attrs: c.attrs.params ?? undefined,
      text: c.textContent.slice(0, 80),
      lines: c.textContent ? c.textContent.split("\n").length : 0,
      size: c.nodeSize,
    });
  }
  return out;
}

try {
  const page = await browser.newPage();
  await page.goto("http://localhost:5174/", { waitUntil: "networkidle0" });

  const structure = await page.evaluate(() => {
    const ed = window.__MARKWEAVE_EDITOR__;
    const doc = ed.getDocument();
    const out = [];
    doc.forEach((child, offset) => {
      out.push({
        offset,
        name: child.type.name,
        params: child.attrs.params,
        firstText: child.textContent.slice(0, 50),
        lines: child.textContent ? child.textContent.split("\n").length : 0,
      });
    });
    return out;
  });
  console.log("doc structure:", JSON.stringify(structure.slice(0, 20), null, 1));

  // 直接跳到最后一个代码块的末尾
  const probe = await page.evaluate(() => {
    const ed = window.__MARKWEAVE_EDITOR__;
    const view = ed.view ?? ed["view"];
    const doc = view.state.doc;
    const blocks = [];
    doc.forEach((child, offset) => {
      if (child.type.name === "code_block") blocks.push({ offset, node: child });
    });
    const last = blocks[blocks.length - 1];
    return {
      count: blocks.length,
      lastOffset: last.offset,
      lastText: JSON.stringify(last.node.textContent),
      lastEnd: last.offset + last.node.nodeSize,
    };
  });
  console.log("last code block:", probe);
} finally {
  await browser.close();
}
