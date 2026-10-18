import puppeteer from "puppeteer-core";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function inspect() {
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: "new",
    args: ["--no-sandbox", "--user-data-dir=C:\\Users\\27953\\AppData\\Local\\Temp\\puppeteer-chrome-test"],
  });
  const page = await browser.newPage();
  await page.goto("http://localhost:5173/");
  await page.waitForSelector(".md-mermaid-block .md-diagram-preview svg", { timeout: 8000 });
  const structure = await page.evaluate(() => {
    const svg = document.querySelector(".md-mermaid-block .md-diagram-preview svg");
    const allGroups = Array.from(svg.querySelectorAll("g")).map((g) => ({
      tagName: g.tagName,
      className: g.className.baseVal || g.className,
      id: g.id,
    })).filter((g) => g.className);

    const allPaths = Array.from(svg.querySelectorAll("path")).map((p) => ({
      className: p.className.baseVal || p.className,
      id: p.id,
      d: p.getAttribute("d")?.slice(0, 80),
      parentClass: p.parentElement?.className?.baseVal || p.parentElement?.className,
      parentId: p.parentElement?.id,
    }));

    return {
      svgId: svg.id,
      groupClasses: Array.from(new Set(allGroups.map((g) => g.className))),
      pathCount: allPaths.length,
      samplePaths: allPaths,
    };
  });
  console.log(JSON.stringify(structure, null, 2));
  await browser.close();
}

inspect();
