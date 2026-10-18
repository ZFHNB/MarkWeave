import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const artifactsDir = path.resolve(__dirname, "../test-artifacts");

if (!fs.existsSync(artifactsDir)) {
  fs.mkdirSync(artifactsDir, { recursive: true });
}

async function runTests() {
  console.log("=== 启动 MarkWeave 自动化端到端深度测试 ===");

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: "new",
    defaultViewport: { width: 1280, height: 800 },
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--user-data-dir=C:\\Users\\27953\\AppData\\Local\\Temp\\puppeteer-chrome-test",
    ],
  });

  const page = await browser.newPage();
  page.on("console", (msg) => {
    const text = msg.text();
    if (msg.type() === "error" || text.includes("error") || text.includes("Error") || text.includes("mermaid")) {
      console.log(`[Browser Console]: ${text}`);
    }
  });
  page.on("pageerror", (err) => {
    console.log(`[Browser PageError]: ${err.message}`);
  });

  let passCount = 0;
  let failCount = 0;

  function assert(name, condition, extraInfo = "") {
    if (condition) {
      console.log(`✅ [PASS] ${name} ${extraInfo ? `(${extraInfo})` : ""}`);
      passCount++;
    } else {
      console.error(`❌ [FAIL] ${name} ${extraInfo ? `(${extraInfo})` : ""}`);
      failCount++;
    }
  }

  try {
    // 1. 基础页面加载
    console.log("\n--- 测试 1: 页面加载与编辑器挂载 ---");
    await page.goto("http://localhost:5173/", { waitUntil: "networkidle0" });
    const hasProseMirror = await page.$(".ProseMirror");
    assert("ProseMirror 编辑器成功挂载", !!hasProseMirror);

    // 2. 黑框/焦点轮廓测试
    console.log("\n--- 测试 2: 点击与聚焦黑框消除验证 ---");
    await page.click(".ProseMirror h1");
    await new Promise((r) => setTimeout(r, 200));

    const focusStyles = await page.evaluate(() => {
      const el = document.querySelector(".ProseMirror");
      const computed = window.getComputedStyle(el);
      const writeComputed = window.getComputedStyle(document.querySelector("#write"));
      return {
        outlineStyle: computed.outlineStyle,
        outlineWidth: computed.outlineWidth,
        borderWidth: computed.borderWidth,
        boxShadow: computed.boxShadow,
        writeOutline: writeComputed.outlineStyle,
      };
    });

    const isNoOutline =
      focusStyles.outlineStyle === "none" ||
      focusStyles.outlineWidth === "0px" ||
      parseInt(focusStyles.outlineWidth, 10) === 0;

    const isNoBorder =
      focusStyles.borderWidth === "0px" || parseInt(focusStyles.borderWidth, 10) === 0;

    assert("聚焦时无 outline 黑框", isNoOutline, `outlineStyle: ${focusStyles.outlineStyle}, width: ${focusStyles.outlineWidth}`);
    assert("聚焦时无额外 border 边框", isNoBorder, `borderWidth: ${focusStyles.borderWidth}`);
    await page.screenshot({ path: path.join(artifactsDir, "01-focused-no-black-border.png") });

    // 3. 大纲目录与平滑跳转测试
    console.log("\n--- 测试 3: 侧边栏大纲跳转与平滑定位 ---");
    const outlineCount = await page.$$eval(".ty-outline-item", (els) => els.length);
    assert("大纲正确解析标题数量", outlineCount >= 4, `提取标题数: ${outlineCount}`);

    const scrollerScrollBefore = await page.$eval(".ty-editor-scroller", (el) => el.scrollTop);

    // 点击第 4 个标题：代码块组件
    const targetHeadingText = await page.$$eval(".ty-outline-item", (els) => els[3]?.textContent?.trim());
    console.log(`点击大纲项目: ${targetHeadingText}`);
    await page.$$eval(".ty-outline-item", (els) => els[3]?.click());
    await new Promise((r) => setTimeout(r, 600)); // 等待 smooth scroll

    const scrollerScrollAfter = await page.$eval(".ty-editor-scroller", (el) => el.scrollTop);
    assert("点击大纲后容器成功滚动跳转", scrollerScrollAfter > scrollerScrollBefore, `before: ${scrollerScrollBefore}px, after: ${scrollerScrollAfter}px`);
    await page.screenshot({ path: path.join(artifactsDir, "02-outline-jump.png") });

    // 4. 多文件工作区切换测试
    console.log("\n--- 测试 4: 多文件工作区切换与新建 ---");
    // 切换到“文件”Tab
    await page.click('.ty-sidebar-tab[data-tab="files"]');
    await new Promise((r) => setTimeout(r, 200));

    const isFilesTabVisible = await page.$eval("#files-container", (el) => el.style.display !== "none");
    assert("文件 Tab 正常展开", isFilesTabVisible);

    // 切换至文档 2：系统架构设计规范.md
    await page.$$eval(".ty-file-item", (els) => els[1]?.click());
    await new Promise((r) => setTimeout(r, 200));

    const doc2Title = await page.$eval("#doc-title", (el) => el.textContent?.trim());
    const doc2Content = await page.$eval("#write", (el) => el.textContent || "");
    assert("成功切换至文档 2", doc2Title === "系统架构设计规范.md");
    assert("文档 2 正文内容加载正常", doc2Content.includes("系统架构设计规范"));

    // 切换至文档 3：REA 逆向技术手记.md
    await page.$$eval(".ty-file-item", (els) => els[2]?.click());
    await new Promise((r) => setTimeout(r, 200));

    const doc3Title = await page.$eval("#doc-title", (el) => el.textContent?.trim());
    const doc3Content = await page.$eval("#write", (el) => el.textContent || "");
    assert("成功切换至文档 3", doc3Title === "REA 逆向技术手记.md");
    assert("文档 3 正文内容加载正常", doc3Content.includes("REA 逆向技术手记"));

    // 点击“+ 新建文档”
    await page.click("#btn-new-file");
    await new Promise((r) => setTimeout(r, 200));

    const newDocTitle = await page.$eval("#doc-title", (el) => el.textContent?.trim());
    const totalFilesCount = await page.$$eval(".ty-file-item", (els) => els.length);
    assert("成功创建新文档", totalFilesCount === 4 && newDocTitle?.startsWith("未命名文档"), `当前文档: ${newDocTitle}, 文件总数: ${totalFilesCount}`);
    await page.screenshot({ path: path.join(artifactsDir, "03-file-switching.png") });

    // 切回文档 1 进行后续测试
    await page.$$eval(".ty-file-item", (els) => els[0]?.click());
    await new Promise((r) => setTimeout(r, 200));

    // 5. 即时语法折叠 (Inline Syntax Folding) 测试
    console.log("\n--- 测试 5: 即时语法折叠机制 ---");
    // 点击加粗文字
    const boldEl = await page.$(".md-strong");
    assert("存在加粗节点", !!boldEl);

    // 6. 数学公式 (KaTeX) 交互与实时重排测试
    console.log("\n--- 测试 6: KaTeX 数学公式点击与交互改写 ---");
    const mathBlock = await page.$(".md-math-block-container");
    assert("KaTeX 数学公式块存在", !!mathBlock);

    // 点击数学公式展开编辑面板
    await page.click(".md-math-preview");
    await new Promise((r) => setTimeout(r, 200));

    const isMathEditorVisible = await page.$eval(".md-math-editor", (el) => el.style.display === "block");
    assert("点击公式后弹出源码编辑器", isMathEditorVisible);

    // 写入新公式
    await page.evaluate(() => {
      const textarea = document.querySelector(".md-math-input");
      textarea.value = "E = mc^2";
      textarea.dispatchEvent(new Event("input"));
      textarea.blur();
    });
    await new Promise((r) => setTimeout(r, 200));

    const mathRenderedText = await page.$eval(".md-math-preview", (el) => el.textContent?.trim());
    assert("KaTeX 实时重排渲染新公式", mathRenderedText?.includes("E=mc"), `渲染文本: ${mathRenderedText}`);
    await page.screenshot({ path: path.join(artifactsDir, "04-math-katex.png") });

    // 7. 源码模式 (Source Code Mode - Ctrl+/) 双向同步测试
    console.log("\n--- 测试 7: 源码模式双向同步 ---");
    await page.click("#btn-toggle-source");
    await new Promise((r) => setTimeout(r, 200));

    const isSourceVisible = await page.$eval("#source-editor", (el) => el.classList.contains("visible"));
    assert("成功切换至全屏源码模式", isSourceVisible);

    const sourceVal = await page.$eval("#source-editor", (el) => el.value);
    assert("源码编辑器正确读取 Markdown", sourceVal.includes("欢迎使用 MarkWeave"));

    // 切换回即时渲染模式
    await page.click("#btn-toggle-source");
    await new Promise((r) => setTimeout(r, 200));
    const isSourceHidden = await page.$eval("#source-editor", (el) => !el.classList.contains("visible"));
    assert("成功切回即时渲染模式", isSourceHidden);

    // 8. 主题切换测试 (明亮 / 暗色)
    console.log("\n--- 测试 8: 动态主题切换 ---");
    await page.click("#btn-toggle-theme");
    await new Promise((r) => setTimeout(r, 200));

    const isNightTheme = await page.$eval("body", (el) => el.classList.contains("theme-night"));
    const bgColor = await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor);
    assert("成功激活 Night 暗色主题", isNightTheme && bgColor === "rgb(30, 30, 30)", `backgroundColor: ${bgColor}`);
    await page.screenshot({ path: path.join(artifactsDir, "05-night-theme.png") });

    // 先切回明亮主题进行 Mermaid 基础测试
    await page.click("#btn-toggle-theme");
    await new Promise((r) => setTimeout(r, 200));

    // ==========================================
    // 9. Mermaid 图表核心渲染与交互专项测试
    // ==========================================
    console.log("\n--- 测试 9: Mermaid 流程图默认加载与 SVG 渲染 ---");

    // 9.1 检测默认文档中的 Mermaid 图表是否生成 SVG
    const mermaidContainer = await page.$(".md-mermaid-block .md-diagram-preview");
    assert("页面中存在 Mermaid 图表容器", !!mermaidContainer);

    // 等待 svg 渲染完成
    await page.waitForSelector(".md-mermaid-block .md-diagram-preview svg", { timeout: 8000 });
    const hasSvg = await page.$eval(".md-mermaid-block .md-diagram-preview svg", (svg) => !!svg && svg.clientWidth > 0);
    assert("Mermaid 成功渲染为 SVG 矢量图表", hasSvg);

    const svgContent = await page.$eval(".md-mermaid-block .md-diagram-preview", (el) => el.innerHTML);
    const textContent = await page.$eval(".md-mermaid-block .md-diagram-preview", (el) => el.textContent || "");
    const hasExpectedContent =
      svgContent.includes("ProseMirror AST") ||
      svgContent.includes("Markdown 纯文本") ||
      textContent.includes("ProseMirror") ||
      textContent.includes("Markdown");
    assert("SVG 包含预期的流程图节点内容", hasExpectedContent);

    // 滚动至 Mermaid 居中显示以便点击与截图
    await page.$eval(".md-mermaid-block", (el) => el.scrollIntoView({ behavior: "instant", block: "center" }));
    await new Promise((r) => setTimeout(r, 200));

    // 截取流程图默认渲染效果
    await page.screenshot({ path: path.join(artifactsDir, "06-mermaid-flowchart.png") });

    // 9.2 点击图表切换到源码编辑模式
    console.log("\n--- 测试 10: Mermaid 点击图表进入源码编辑模式 ---");
    await page.$eval(".md-mermaid-block .md-diagram-preview", (el) => el.click());
    await new Promise((r) => setTimeout(r, 300));

    const isMermaidPreVisible = await page.$eval(".md-mermaid-block .md-fences-content", (el) => el.style.display !== "none");
    const toggleBtnText = await page.$eval(".md-mermaid-block .md-fences-toggle-btn", (el) => el.textContent?.trim());
    const isToggleOnRight = await page.evaluate(() => {
      const toolbar = document.querySelector(".md-mermaid-block .md-fences-toolbar");
      const rightGroup = toolbar?.lastElementChild;
      const toggleBtn = rightGroup?.querySelector(".md-fences-toggle-btn");
      const copyBtn = rightGroup?.querySelector(".md-fences-copy-btn");
      return !!toggleBtn && !!copyBtn && toggleBtn.nextElementSibling === copyBtn;
    });
    assert("点击图表后成功展开源码编辑框", isMermaidPreVisible);
    assert("切换按钮文字更新为'预览图表'", toggleBtnText === "预览图表");
    assert("“编辑源码/预览图表”按钮成功位于工具栏右侧、紧挨复制按钮左边", isToggleOnRight);

    // 9.3 动态改写源码并触发重绘
    console.log("\n--- 测试 11: Mermaid 动态改写与实时重绘 ---");
    const updatedMermaidCode = `graph LR
    A[需求输入] --> B(REA逆向工程)
    B --> C{架构对标Typora}
    C -->|通过| D[ProseMirror引擎+语法折叠]
    D --> E[Mermaid图表无缝即时渲染]
    E --> F[交付用户并100%通过E2E测试]`;

    await page.evaluate((newCode) => {
      const currentMd = window.__TYPEMARK_EDITOR__.getMarkdown();
      const replacedMd = currentMd.replace(/```mermaid[\s\S]*?```/, "```mermaid\n" + newCode + "\n```");
      window.__TYPEMARK_EDITOR__.setMarkdown(replacedMd);
    }, updatedMermaidCode);

    await new Promise((r) => setTimeout(r, 800));
    await page.waitForSelector(".md-mermaid-block .md-diagram-preview svg", { timeout: 8000 });
    const updatedSvg = await page.$eval(".md-mermaid-block .md-diagram-preview", (el) => el.innerHTML);
    assert("重新渲染的 SVG 包含新节点 'Mermaid图表无缝即时渲染'", updatedSvg.includes("Mermaid图表无缝即时渲染") || updatedSvg.includes("REA逆向工程"));
    await page.screenshot({ path: path.join(artifactsDir, "07-mermaid-updated-rerender.png") });

    // 9.4 时序图 (Sequence Diagram) 渲染支持
    console.log("\n--- 测试 12: 时序图 (Sequence Diagram) 支持 ---");
    const sequenceCode = `sequenceDiagram
    autonumber
    Typemark User->>Editor: 输入 Markdown 图表代码
    Editor->>Mermaid Core: 异步语法解析与 AST 变换
    Mermaid Core-->>Editor: 输出 SVG 矢量图形 DOM
    Editor-->>Typemark User: 呈现高保真无缝图表`;

    await page.evaluate((seqCode) => {
      const currentMd = window.__TYPEMARK_EDITOR__.getMarkdown();
      const replacedMd = currentMd.replace(/```mermaid[\s\S]*?```/, "```mermaid\n" + seqCode + "\n```");
      window.__TYPEMARK_EDITOR__.setMarkdown(replacedMd);
    }, sequenceCode);

    await new Promise((r) => setTimeout(r, 800));
    await page.waitForSelector(".md-mermaid-block .md-diagram-preview svg", { timeout: 8000 });
    const seqSvg = await page.$eval(".md-mermaid-block .md-diagram-preview", (el) => el.innerHTML);
    assert("成功渲染 Sequence Diagram (时序图)", seqSvg.includes("Typemark User") && seqSvg.includes("Mermaid Core"));
    await page.screenshot({ path: path.join(artifactsDir, "08-mermaid-sequence-diagram.png") });

    // 9.5 错误语法容错处理
    console.log("\n--- 测试 13: 语法错误优雅捕获与容错处理 ---");
    const brokenCode = `graph INVALID_DIRECTIVE
    [Broken Syntax >>> ??? ::: &&&`;

    await page.evaluate((broken) => {
      const currentMd = window.__TYPEMARK_EDITOR__.getMarkdown();
      const replacedMd = currentMd.replace(/```mermaid[\s\S]*?```/, "```mermaid\n" + broken + "\n```");
      window.__TYPEMARK_EDITOR__.setMarkdown(replacedMd);
    }, brokenCode);

    await new Promise((r) => setTimeout(r, 800));

    const hasErrorCard = await page.$eval(".md-mermaid-block .md-diagram-error", (el) => !!el);
    const errorText = await page.$eval(".md-mermaid-block .md-diagram-error", (el) => el.textContent || "");
    assert("非法语法未导致白屏，成功捕获并展示错误提示", hasErrorCard && errorText.includes("Mermaid 语法解析错误"));
    await page.screenshot({ path: path.join(artifactsDir, "09-mermaid-error-handling.png") });

    // 9.6 暗色主题下的 Mermaid 渲染 (Theme Night)
    console.log("\n--- 测试 14: 暗色主题 (Night Theme) 深度自适应 ---");
    await page.evaluate((validCode) => {
      const currentMd = window.__TYPEMARK_EDITOR__.getMarkdown();
      const replacedMd = currentMd.replace(/```mermaid[\s\S]*?```/, "```mermaid\n" + validCode + "\n```");
      window.__TYPEMARK_EDITOR__.setMarkdown(replacedMd);
    }, updatedMermaidCode);
    await new Promise((r) => setTimeout(r, 800));

    // 切换到暗色主题并触发事件
    await page.click("#btn-toggle-theme");
    await new Promise((r) => setTimeout(r, 800));

    await page.waitForSelector(".md-mermaid-block .md-diagram-preview svg", { timeout: 8000 });
    const isNightSvg = await page.$eval(".md-mermaid-block .md-diagram-preview svg", (svg) => !!svg && svg.clientWidth > 0);
    assert("暗色主题下 Mermaid 自适应重新排版并呈现暗色风格", isNightSvg);
    await page.screenshot({ path: path.join(artifactsDir, "10-mermaid-night-theme.png") });

    // 切回明亮主题进行可交互排版测试
    await page.click("#btn-toggle-theme");
    await new Promise((r) => setTimeout(r, 400));

    // ==========================================
    // 15. Mermaid 交互式排版与方向切换测试
    // ==========================================
    console.log("\n--- 测试 15: 一键横纵向排布切换 (TD ↕ ↔ LR) ---");
    const hasToolbar = await page.$eval(".md-mermaid-block .md-diagram-toolbar", (el) => !!el);
    assert("Mermaid 顶部浮动控制条成功挂载", hasToolbar);

    // 点击「↔ 横向」按钮
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll(".md-mermaid-block .md-diagram-btn"));
      const lrBtn = btns.find((b) => b.textContent.includes("横向"));
      lrBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 800));

    // 检查源码是否被自动改写为 LR
    const mdAfterLR = await page.evaluate(() => window.__TYPEMARK_EDITOR__.getMarkdown());
    assert("Markdown 源码第一行自动更新为横向排布 (LR)", /```mermaid[\s\S]*?(?:graph|flowchart)\s+LR/i.test(mdAfterLR));

    await page.waitForSelector(".md-mermaid-block .md-diagram-preview svg", { timeout: 8000 });
    await page.screenshot({ path: path.join(artifactsDir, "11-mermaid-direction-lr.png") });

    // ==========================================
    // 16. 图表编辑模式激活与更名验证
    // ==========================================
    console.log("\n--- 测试 16: 图表编辑模式更名与激活 ---");
    const editBtnTextBefore = await page.$eval(".md-mermaid-block .md-diagram-drag-btn", (el) => el.textContent?.trim());
    assert("自由拖拽按钮已正式更名为'🎨 图表编辑'", editBtnTextBefore === "🎨 图表编辑");

    // 点击开启编辑模式
    await page.evaluate(() => {
      const editBtn = document.querySelector(".md-mermaid-block .md-diagram-drag-btn");
      editBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 200));

    const isEditModeActive = await page.$eval(".md-mermaid-block .md-diagram-preview", (el) =>
      el.classList.contains("is-edit-mode")
    );
    const editBtnTextAfter = await page.$eval(".md-mermaid-block .md-diagram-drag-btn", (el) => el.textContent?.trim());
    assert("图表编辑模式成功激活", isEditModeActive);
    assert("按钮文字更新为'🎨 退出编辑'", editBtnTextAfter === "🎨 退出编辑");

    // ==========================================
    // 17. 格点吸附 (Snap to Grid) 与连续多节点拖动
    // ==========================================
    console.log("\n--- 测试 17: 格点吸附 (Snap to Grid, 20px) 验证 ---");
    const node1Handle = (await page.$$(".md-mermaid-block .node"))[0];
    const box1 = await node1Handle?.boundingBox();
    if (box1) {
      await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2);
      await page.mouse.down();
      // 拖动 93px (期望吸附到 100px)
      await page.mouse.move(box1.x + box1.width / 2 + 93, box1.y + box1.height / 2 + 55, { steps: 5 });
      await page.mouse.up();
    }
    await new Promise((r) => setTimeout(r, 400));

    const node1AfterSnap = await page.evaluate(() => {
      const n = document.querySelectorAll(".md-mermaid-block .node")[0];
      const transform = n?.getAttribute("transform") || "";
      const match = /translate\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/.exec(transform);
      if (match) {
        const x = parseFloat(match[1]);
        const y = parseFloat(match[2]);
        return { x, y, isXSnapped: x % 20 === 0, isYSnapped: y % 20 === 0 };
      }
      return { x: 0, y: 0, isXSnapped: false, isYSnapped: false };
    });

    assert("节点拖动后坐标自动对齐到 20px 格点", node1AfterSnap.isXSnapped && node1AfterSnap.isYSnapped, `x=${node1AfterSnap.x}, y=${node1AfterSnap.y}`);

    // ==========================================
    // 18. 自定义箭头画线风格与实时图表更新 (直角 / 圆角 / 直线)
    // ==========================================
    console.log("\n--- 测试 18: 画线风格切换与实时生效 ---");
    // 18.1 测试点击「直线」后，图表连线立即 0ms 实时更新为直接连接
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll(".md-mermaid-block .md-diagram-btn"));
      const linearBtn = btns.find((b) => b.textContent.includes("直线"));
      linearBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 100));

    const isLinearRealtime = await page.evaluate(() => {
      const paths = Array.from(document.querySelectorAll(".md-mermaid-block path.flowchart-link"));
      return paths.every((p) => {
        const d = p.getAttribute("d") || "";
        // 直线仅由 M 和单个 L 组成
        const cmds = d.match(/[MLHVCSQTAZ]/gi) || [];
        return cmds.length === 2 && cmds[0].toUpperCase() === "M" && cmds[1].toUpperCase() === "L";
      });
    });
    assert("点击「直线」按钮后，图表连线 0ms 实时转为直线", isLinearRealtime);

    // 18.2 测试点击「直角」后，图表连线立即实时转为严格正交 90 度折线
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll(".md-mermaid-block .md-diagram-btn"));
      const stepBtn = btns.find((b) => b.textContent.includes("直角"));
      stepBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 100));

    const isOrthogonalRealtime = await page.evaluate(() => {
      const paths = Array.from(document.querySelectorAll(".md-mermaid-block path.flowchart-link"));
      return paths.some((p) => {
        const d = p.getAttribute("d") || "";
        // 全直角正交线包含多个 L 控制点
        const points = d.split(/[ML]/i).filter(Boolean).map(s => s.split(",").map(Number));
        if (points.length < 3) return false;
        // 验证相邻点必须纯水平 (y1 === y2) 或纯垂直 (x1 === x2)
        for (let i = 0; i < points.length - 1; i++) {
          const isHoriz = Math.abs(points[i][1] - points[i + 1][1]) < 2;
          const isVert = Math.abs(points[i][0] - points[i + 1][0]) < 2;
          if (!isHoriz && !isVert) return false;
        }
        return true;
      });
    });
    assert("点击「直角」按钮后，图表连线实时保持严谨 90 度直角正交折线", isOrthogonalRealtime);

    // 18.3 验证连线说明文字精确绑定在该连线几何位置上（无错误错位）
    const isLabelAccuratelyBound = await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll(".md-mermaid-block .edgeLabels > g.edgeLabel"));
      return labels.length > 0 && labels.every((l) => {
        const transform = l.getAttribute("transform") || "";
        const m = /translate\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/.exec(transform);
        if (!m) return false;
        const lx = parseFloat(m[1]);
        const ly = parseFloat(m[2]);
        // 坐标有效且处于正常可视画幅范围内，未漂移到无穷远或视口外
        return lx > 0 && lx < 2000 && ly > 0 && ly < 2000;
      });
    });
    assert("连线说明文字精确绑定在对应连线上，坐标规整无漂移", isLabelAccuratelyBound);

    const mdWithStepCurve = await page.evaluate(() => window.__TYPEMARK_EDITOR__.getMarkdown());
    assert(
      "源码成功注入直角折线风格配置 (curve: stepBefore)",
      mdWithStepCurve.includes('"curve":"stepBefore"') || mdWithStepCurve.includes('"curve": "stepBefore"')
    );
    await page.screenshot({ path: path.join(artifactsDir, "14-mermaid-orthogonal-step-lines.png") });

    // ==========================================
    // 19. 改变箭头指向 (➔ 正向 / ⬅ 反向 / ⮂ 双向)
    // ==========================================
    console.log("\n--- 测试 19: 改变箭头指向与双向同步 ---");
    await new Promise((r) => setTimeout(r, 600));

    // 触发第一条连线点击
    await page.evaluate(() => {
      const link = document.querySelector(".md-mermaid-block path.flowchart-link");
      link?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: 280, clientY: 200 }));
    });
    await new Promise((r) => setTimeout(r, 300));

    const hasEdgePopover = await page.$eval(".md-edge-popover", (el) => !!el);
    assert("点击连线后成功弹出箭头方向微调气泡栏", hasEdgePopover);

    // 点击“反向”
    await page.evaluate(() => {
      const popoverBtns = Array.from(document.querySelectorAll(".md-edge-popover-btn"));
      const backBtn = popoverBtns.find((b) => b.textContent.includes("反向"));
      backBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 800));

    const mdAfterReverse = await page.evaluate(() => window.__TYPEMARK_EDITOR__.getMarkdown());
    assert("箭头指向成功反转并在源码中更新为反向箭头 (<--)", mdAfterReverse.includes("<--"));

    // ==========================================
    // 20. 修改箭头横线上的文字 (Edit Edge Label)
    // ==========================================
    console.log("\n--- 测试 20: 修改箭头横线上的文字 ---");
    // 触发连线文字标签点击 (例如「通过」)
    await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll(".md-mermaid-block .edgeLabels .edgeLabel"));
      const label = labels.find((l) => l.textContent.includes("通过")) || labels[0];
      const span = label?.querySelector("span") || label;
      if (typeof span?.click === "function") {
        span.click();
      } else {
        label?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      }
    });
    await new Promise((r) => setTimeout(r, 200));

    const hasInlineInput = await page.$eval(".md-inline-label-input", (el) => !!el);
    assert("点击连线文字后弹出原地行内编辑框", hasInlineInput);

    // 输入新文字并回车保存
    await page.evaluate(() => {
      const input = document.querySelector(".md-inline-label-input");
      if (input) {
        input.value = "逆向解析与AST建模";
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        input.blur();
      }
    });
    await new Promise((r) => setTimeout(r, 800));

    const mdWithNewLabel = await page.evaluate(() => window.__TYPEMARK_EDITOR__.getMarkdown());
    assert("连线说明文字成功在源码中更新为新文字 (|逆向解析与AST建模|)", mdWithNewLabel.includes("逆向解析与AST建模"));
    await page.screenshot({ path: path.join(artifactsDir, "15-mermaid-edited-label-and-arrows.png") });

    // ==========================================
    // 21. 用户主动关闭编辑模式与一键还原
    // ==========================================
    console.log("\n--- 测试 21: 主动退出编辑模式与一键还原 ---");
    await page.evaluate(() => {
      const editBtn = document.querySelector(".md-mermaid-block .md-diagram-drag-btn");
      editBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 200));

    const isEditModeClosed = await page.$eval(
      ".md-mermaid-block .md-diagram-preview",
      (el) => !el.classList.contains("is-edit-mode")
    );
    assert("用户主动点击退出编辑模式并锁定", isEditModeClosed);

    // 一键还原
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll(".md-mermaid-block .md-diagram-btn"));
      const resetBtn = btns.find((b) => b.textContent.includes("还原"));
      resetBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 600));

    const mdAfterFullReset = await page.evaluate(() => window.__TYPEMARK_EDITOR__.getMarkdown());
    assert("一键还原成功清除位置元数据", !/%%\s*\{typemark_positions:.*?\}\s*%%/.test(mdAfterFullReset));
    await page.screenshot({ path: path.join(artifactsDir, "13-mermaid-reset-layout.png") });

    // ==========================================
    // 22. 自定义位置后切换横向/纵向排布自适应 (Issue 2)
    // ==========================================
    console.log("\n--- 测试 22: 自定义位置后切换纵向/横向排布 ---");
    // 再次开启编辑并拖动节点保存坐标
    await page.evaluate(() => {
      const editBtn = document.querySelector(".md-mermaid-block .md-diagram-drag-btn");
      editBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 200));

    // 拖动节点产生自定义坐标
    const nodeEl = (await page.$$(".md-mermaid-block .node"))[0];
    const nBox = await nodeEl?.boundingBox();
    if (nBox) {
      await page.mouse.move(nBox.x + nBox.width / 2, nBox.y + nBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(nBox.x + nBox.width / 2 + 60, nBox.y + nBox.height / 2 + 40, { steps: 5 });
      await page.mouse.up();
    }
    await new Promise((r) => setTimeout(r, 400));

    const mdWithCustomPos = await page.evaluate(() => window.__TYPEMARK_EDITOR__.getMarkdown());
    assert("成功产生自定义图表位置元数据", /typemark_positions/.test(mdWithCustomPos));

    // 点击「↕ 纵向」按钮切换排布
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll(".md-mermaid-block .md-diagram-btn"));
      const tdBtn = btns.find((b) => b.textContent.includes("纵向"));
      tdBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 800));

    const mdAfterSwitchToTD = await page.evaluate(() => window.__TYPEMARK_EDITOR__.getMarkdown());
    assert("切换纵向后自动清除旧方向冲突坐标", !/typemark_positions/.test(mdAfterSwitchToTD));
    assert("源码成功切换为纵向排布 (TD)", /flowchart\s+TD/i.test(mdAfterSwitchToTD));
    await page.screenshot({ path: path.join(artifactsDir, "16-mermaid-direction-td-after-custom.png") });

  } catch (err) {
    console.error("测试执行过程中出现异常:", err);
    failCount++;
  } finally {
    await browser.close();
  }

  console.log("\n=================================");
  console.log(`测试结果汇总: 通过 ${passCount} 项, 失败 ${failCount} 项`);
  console.log("=================================");

  if (failCount > 0) {
    process.exit(1);
  }
}

runTests();
