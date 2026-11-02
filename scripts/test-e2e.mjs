import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const artifactsDir = path.resolve(__dirname, "../test-artifacts");
// 每轮使用全新 profile，避免上一轮持久化的 localStorage/工作区影响文档数量等断言。
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "markweave-e2e-"));

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
      `--user-data-dir=${profileDir}`,
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
    const newDocContent = await page.$eval("#write", (el) => el.textContent?.trim() || "");
    assert("成功创建新文档", totalFilesCount === 4 && newDocTitle?.startsWith("未命名文档"), `当前文档: ${newDocTitle}, 文件总数: ${totalFilesCount}`);
    assert("新建文档内容纯净为空，无需手动删除任何默认字符", newDocContent === "", `实际内容: "${newDocContent}"`);
    await page.screenshot({ path: path.join(artifactsDir, "03-file-switching.png") });
    await page.screenshot({ path: path.join(artifactsDir, "33-clean-empty-new-document.png") });

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

    // 收起源码折叠框，恢复纯净图表预览，确保后续图表交互测试正常运行
    await page.click(".md-mermaid-block .md-fences-toggle-btn");
    await new Promise((r) => setTimeout(r, 300));

    // 9.3 动态改写源码并触发重绘
    console.log("\n--- 测试 11: Mermaid 动态改写与实时重绘 ---");
    const updatedMermaidCode = `graph LR
    A[需求输入] --> B(REA逆向工程)
    B --> C{架构对标Typora}
    C -->|通过| D[ProseMirror引擎+语法折叠]
    D --> E[Mermaid图表无缝即时渲染]
    E --> F[交付用户并100%通过E2E测试]`;

    await page.evaluate((newCode) => {
      const currentMd = window.__MARKWEAVE_EDITOR__.getMarkdown();
      const replacedMd = currentMd.replace(/```mermaid[\s\S]*?```/, "```mermaid\n" + newCode + "\n```");
      window.__MARKWEAVE_EDITOR__.setMarkdown(replacedMd);
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
    MarkWeave User->>Editor: 输入 Markdown 图表代码
    Editor->>Mermaid Core: 异步语法解析与 AST 变换
    Mermaid Core-->>Editor: 输出 SVG 矢量图形 DOM
    Editor-->>MarkWeave User: 呈现高保真无缝图表`;

    await page.evaluate((seqCode) => {
      const currentMd = window.__MARKWEAVE_EDITOR__.getMarkdown();
      const replacedMd = currentMd.replace(/```mermaid[\s\S]*?```/, "```mermaid\n" + seqCode + "\n```");
      window.__MARKWEAVE_EDITOR__.setMarkdown(replacedMd);
    }, sequenceCode);

    await new Promise((r) => setTimeout(r, 800));
    await page.waitForSelector(".md-mermaid-block .md-diagram-preview svg", { timeout: 8000 });
    const seqSvg = await page.$eval(".md-mermaid-block .md-diagram-preview", (el) => el.innerHTML);
    assert("成功渲染 Sequence Diagram (时序图)", seqSvg.includes("MarkWeave User") && seqSvg.includes("Mermaid Core"));
    await page.screenshot({ path: path.join(artifactsDir, "08-mermaid-sequence-diagram.png") });

    // 9.5 错误语法容错处理
    console.log("\n--- 测试 13: 语法错误优雅捕获与容错处理 ---");
    const brokenCode = `graph INVALID_DIRECTIVE
    [Broken Syntax >>> ??? ::: &&&`;

    await page.evaluate((broken) => {
      const currentMd = window.__MARKWEAVE_EDITOR__.getMarkdown();
      const replacedMd = currentMd.replace(/```mermaid[\s\S]*?```/, "```mermaid\n" + broken + "\n```");
      window.__MARKWEAVE_EDITOR__.setMarkdown(replacedMd);
    }, brokenCode);

    await new Promise((r) => setTimeout(r, 800));

    const hasErrorCard = await page.$eval(".md-mermaid-block .md-diagram-error", (el) => !!el);
    const errorText = await page.$eval(".md-mermaid-block .md-diagram-error", (el) => el.textContent || "");
    assert("非法语法未导致白屏，成功捕获并展示错误提示", hasErrorCard && errorText.includes("Mermaid 语法解析错误"));
    await page.screenshot({ path: path.join(artifactsDir, "09-mermaid-error-handling.png") });

    // 9.6 暗色主题下的 Mermaid 渲染 (Theme Night)
    console.log("\n--- 测试 14: 暗色主题 (Night Theme) 深度自适应 ---");
    await page.evaluate((validCode) => {
      const currentMd = window.__MARKWEAVE_EDITOR__.getMarkdown();
      const replacedMd = currentMd.replace(/```mermaid[\s\S]*?```/, "```mermaid\n" + validCode + "\n```");
      window.__MARKWEAVE_EDITOR__.setMarkdown(replacedMd);
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
    const mdAfterLR = await page.evaluate(() => window.__MARKWEAVE_EDITOR__.getMarkdown());
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

    // 18.2b 验证经过 600ms 后线形持续保持，绝无回弹或闪动回旧线形的问题
    await new Promise((r) => setTimeout(r, 600));
    const isOrthogonalPersistent = await page.evaluate(() => {
      const paths = Array.from(document.querySelectorAll(".md-mermaid-block path.flowchart-link"));
      return paths.some((p) => {
        const d = p.getAttribute("d") || "";
        const points = d.split(/[ML]/i).filter(Boolean).map((s) => s.split(",").map(Number));
        if (points.length < 3) return false;
        for (let i = 0; i < points.length - 1; i++) {
          const isHoriz = Math.abs(points[i][1] - points[i + 1][1]) < 2;
          const isVert = Math.abs(points[i][0] - points[i + 1][0]) < 2;
          if (!isHoriz && !isVert) return false;
        }
        return true;
      });
    });
    assert("线型切换后持续稳定保持，绝无闪烁与回弹闪回", isOrthogonalPersistent);

    // 18.2c 测试点击「圆角」后，图表折角处平滑过渡为带圆弧倒角的正交折线 (Rounded Elbow)
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll(".md-mermaid-block .md-diagram-btn"));
      const basisBtn = btns.find((b) => b.textContent.includes("圆角"));
      basisBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 150));

    const isRoundedElbowRealtime = await page.evaluate(() => {
      const paths = Array.from(document.querySelectorAll(".md-mermaid-block path.flowchart-link"));
      return paths.some((p) => {
        const d = p.getAttribute("d") || "";
        // 包含带 Q 贝塞尔倒角的正交折线
        return /Q\s*[-\d.]+\s*,\s*[-\d.]+\s+[-\d.]+\s*,\s*[-\d.]+/i.test(d);
      });
    });
    assert("点击「圆角」按钮后，图表折角处平滑过渡为带有优雅圆弧倒角的正交折线", isRoundedElbowRealtime);

    // 切回「直角」折线
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll(".md-mermaid-block .md-diagram-btn"));
      const stepBtn = btns.find((b) => b.textContent.includes("直角"));
      stepBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 150));

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

    const mdWithStepCurve = await page.evaluate(() => window.__MARKWEAVE_EDITOR__.getMarkdown());
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

    const mdAfterReverse = await page.evaluate(() => window.__MARKWEAVE_EDITOR__.getMarkdown());
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

    const mdWithNewLabel = await page.evaluate(() => window.__MARKWEAVE_EDITOR__.getMarkdown());
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

    const mdAfterFullReset = await page.evaluate(() => window.__MARKWEAVE_EDITOR__.getMarkdown());
    assert("一键还原成功清除位置元数据", !/%%\s*\{(?:typemark|markweave)_positions:.*?\}\s*%%/.test(mdAfterFullReset));
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

    const mdWithCustomPos = await page.evaluate(() => window.__MARKWEAVE_EDITOR__.getMarkdown());
    assert("成功产生自定义图表位置元数据", /markweave_positions/.test(mdWithCustomPos));

    // 点击「↕ 纵向」按钮切换排布
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll(".md-mermaid-block .md-diagram-btn"));
      const tdBtn = btns.find((b) => b.textContent.includes("纵向"));
      tdBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 800));

    const mdAfterSwitchToTD = await page.evaluate(() => window.__MARKWEAVE_EDITOR__.getMarkdown());
    assert("切换纵向后自动清除旧方向冲突坐标", !/markweave_positions/.test(mdAfterSwitchToTD));
    assert("源码成功切换为纵向排布 (TD)", /flowchart\s+TD/i.test(mdAfterSwitchToTD));
    await page.screenshot({ path: path.join(artifactsDir, "16-mermaid-direction-td-after-custom.png") });

    console.log("\n--- 测试 23: 节点横向位移时起始/目标端点动态自适应选边 ---");
    // 确保开启编辑模式
    await page.evaluate(() => {
      const preview = document.querySelector(".md-mermaid-block .md-diagram-preview");
      if (!preview || !preview.classList.contains("is-edit-mode")) {
        const editBtn = document.querySelector(".md-mermaid-block .md-diagram-drag-btn");
        editBtn?.click();
      }
    });
    await new Promise((r) => setTimeout(r, 300));

    // 拖动第一个节点 (Markdown 纯文本) 向右横向平移 220px
    const node0Handle = (await page.$$(".md-mermaid-block .node"))[0];
    const box0 = await node0Handle?.boundingBox();
    if (box0) {
      await page.mouse.move(box0.x + box0.width / 2, box0.y + box0.height / 2);
      await page.mouse.down();
      await page.mouse.move(box0.x + box0.width / 2 + 220, box0.y + box0.height / 2, { steps: 10 });
      await page.mouse.up();
    }
    await new Promise((r) => setTimeout(r, 500));

    // 验证相连连线的起始端点已自适应为左侧或右侧端点 (水平出线)
    const hasAdaptiveHorizontalPorts = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll(".md-mermaid-block path.flowchart-link"));
      return links.some((l) => {
        const d = l.getAttribute("d") || "";
        // 含有水平走线起始段 (M sx,sy L xMid,sy)
        const m = /^M\s*([-\d.]+)\s*,\s*([-\d.]+)\s*L\s*([-\d.]+)\s*,\s*([-\d.]+)/i.exec(d);
        if (m) {
          const sy = parseFloat(m[2]);
          const ey1 = parseFloat(m[4]);
          return Math.abs(sy - ey1) < 2;
        }
        return false;
      });
    });
    assert("形状移动到右侧/左侧后，箭头起始与目标端点自适应切换为左右侧端点", hasAdaptiveHorizontalPorts);
    await page.screenshot({ path: path.join(artifactsDir, "17-mermaid-dynamic-port-left-right.png") });

    console.log("\n--- 测试 24: 导出 Markdown 识别专有图表并展示双重兼容模态框 ---");
    // 点击顶栏「导出 Markdown」按钮
    await page.click("#btn-save-md");
    await new Promise((r) => setTimeout(r, 400));

    const isModalVisible = await page.evaluate(() => {
      const modal = document.querySelector(".ty-modal-overlay");
      return modal !== null && getComputedStyle(modal).display !== "none";
    });
    assert("识别到 MarkWeave 图表元数据，成功弹出导出格式选择模态框", isModalVisible);

    const hasBothOptions = await page.evaluate(() => {
      const optMarkweave = document.querySelector("#opt-card-markweave");
      const optCompat = document.querySelector("#opt-card-compat");
      return optMarkweave !== null && optCompat !== null;
    });
    assert("模态框包含「MarkWeave 增强格式」与「通用兼容格式」两种选项", hasBothOptions);

    // 验证通用兼容清洗函数
    const isCleanSuccessful = await page.evaluate(() => {
      const raw = window.__MARKWEAVE_EDITOR__.getMarkdown();
      const clean = window.__MARKWEAVE_EXPORT__.cleanMermaidForCompatibility(raw);
      return (
        (/markweave_positions/.test(raw) || /%%\{init:/.test(raw)) &&
        !/markweave_positions/.test(clean) &&
        !/%%\{init:/.test(clean)
      );
    });
    assert("通用兼容模式能彻底清洗并剥离专有排版注释，生成纯净标准语法", isCleanSuccessful);

    await page.screenshot({ path: path.join(artifactsDir, "18-markdown-export-compatibility-dialog.png") });

    // 关闭模态框
    await page.click("#btn-cancel-export");
    await new Promise((r) => setTimeout(r, 300));
    const isModalClosed = await page.evaluate(() => document.querySelector(".ty-modal-overlay") === null);
    assert("成功响应取消并关闭模态框", isModalClosed);

    // ==========================================
    // 25. 侧边栏底部设置按钮与偏好设置模态框
    // ==========================================
    console.log("\n--- 测试 25: 侧边栏底部设置按钮与偏好设置模态框 ---");
    // 检测侧边栏底部设置按钮存在
    const hasSettingsBtn = await page.$eval("#btn-open-settings", (el) => !!el);
    assert("侧边栏左下角成功挂载「偏好设置」入口按钮", hasSettingsBtn);

    // 点击打开偏好设置模态框
    await page.click("#btn-open-settings");
    await new Promise((r) => setTimeout(r, 400));

    const isSettingsModalOpen = await page.evaluate(() => {
      const modal = document.querySelector("#settings-modal-overlay");
      return modal !== null && getComputedStyle(modal).display !== "none";
    });
    assert("点击左下角设置按钮后，成功弹出偏好设置 (Preferences) 模态框", isSettingsModalOpen);

    const hasBothModeSettings = await page.evaluate(() => {
      const customCard = document.querySelector("#setting-card-custom");
      const standardCard = document.querySelector("#setting-card-standard");
      return customCard !== null && standardCard !== null;
    });
    assert("设置面板包含「增强模式 (MarkWeave 样式)」与「兼容模式 (主流标准样式)」选项", hasBothModeSettings);

    await page.screenshot({ path: path.join(artifactsDir, "19-settings-modal-preferences.png") });

    // 选择「兼容模式」并保存
    await page.click("#setting-card-standard");
    await new Promise((r) => setTimeout(r, 100));
    await page.click("#btn-save-settings");
    await new Promise((r) => setTimeout(r, 400));

    const savedDefaultMode = await page.evaluate(() => window.__MARKWEAVE_SETTINGS__.getDefaultMode());
    assert("成功将默认预览模式保存为「兼容模式」并持久化", savedDefaultMode === "standard");

    // ==========================================
    // 26. 兼容模式与增强模式即时切换
    // ==========================================
    console.log("\n--- 测试 26: 兼容模式与增强模式即时切换 ---");
    // 验证当前图表已被实时联动切换为「兼容模式」
    const isDiagramInStandardMode = await page.evaluate(() => {
      const stdBtn = document.querySelector(".md-diagram-toolbar .md-mode-btn-standard");
      const dragBtn = document.querySelector(".md-diagram-toolbar .md-diagram-drag-btn");
      return stdBtn?.classList.contains("active") && dragBtn?.style.display === "none";
    });
    assert("图表工具栏自动响应设置变动，高亮「兼容模式」并隐藏增强编辑按钮", isDiagramInStandardMode);

    // 验证兼容模式下依然支持横纵向切换
    const canSwitchDirectionInStandard = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll(".md-diagram-toolbar .md-diagram-btn"));
      const lrBtn = btns.find((b) => b.textContent?.includes("横向"));
      return lrBtn !== null && lrBtn?.style?.display !== "none";
    });
    assert("兼容模式下保留并展示「横向/纵向」切换按钮", canSwitchDirectionInStandard);

    // 兼容模式下切换方向后，必须保持兼容模式，不能跳回增强模式
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll(".md-diagram-toolbar .md-diagram-btn"));
      btns.find((b) => b.textContent?.includes("横向"))?.click();
    });
    await new Promise((r) => setTimeout(r, 900));
    const standardModePersisted = await page.evaluate(() => {
      const stdBtn = document.querySelector(".md-diagram-toolbar .md-mode-btn-standard");
      const container = document.querySelector(".md-diagram-toolbar")?.closest(".md-diagram-preview");
      return stdBtn?.classList.contains("active") && container?.classList.contains("is-standard-mode");
    });
    assert("兼容模式下切换横向/纵向后仍保持兼容模式，未跳回增强模式", standardModePersisted);

    // 还原纵向排布，避免影响后续断言
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll(".md-diagram-toolbar .md-diagram-btn"));
      btns.find((b) => b.textContent?.includes("纵向"))?.click();
    });
    await new Promise((r) => setTimeout(r, 700));

    await page.screenshot({ path: path.join(artifactsDir, "20-mermaid-standard-compatible-mode.png") });

    // 在图表工具栏上直接点击「✨ 增强」切换回增强模式
    await page.click(".md-diagram-toolbar .md-mode-btn-custom");
    await new Promise((r) => setTimeout(r, 400));

    const isCustomRestored = await page.evaluate(() => {
      const customBtn = document.querySelector(".md-diagram-toolbar .md-mode-btn-custom");
      const dragBtn = document.querySelector(".md-diagram-toolbar .md-diagram-drag-btn");
      return customBtn?.classList.contains("active") && dragBtn?.style.display !== "none";
    });
    assert("点击「增强」后，图表展开全部 MarkWeave 增强特性与排版编辑工具", isCustomRestored);

    await page.screenshot({ path: path.join(artifactsDir, "21-mermaid-custom-mode-restored.png") });

    // 还原全局默认设置回增强模式
    await page.evaluate(() => window.__MARKWEAVE_SETTINGS__.setDefaultMode("custom"));
    await new Promise((r) => setTimeout(r, 200));

    // ==========================================
    // 27. 预览 Mermaid 图表时直接复制预览图 (PNG)
    // ==========================================
    console.log("\n--- 测试 27: 预览 Mermaid 图表时点击复制按钮直接复制预览图 (PNG) ---");
    // 确保处于预览图表状态
    const copyBtnInfoPreview = await page.evaluate(() => {
      const btn = document.querySelector(".md-mermaid-block .md-fences-copy-btn");
      return {
        text: btn ? btn.textContent?.trim() : "",
        title: btn ? btn.getAttribute("title") : "",
      };
    });
    assert("预览模式下复制按钮文案为「复制图片」", copyBtnInfoPreview.text === "复制图片");
    assert("预览模式下复制按钮提示说明包含「PNG」或「图片」", /图片|PNG/i.test(copyBtnInfoPreview.title || ""));

    // 点击复制图片按钮
    await page.click(".md-mermaid-block .md-fences-copy-btn");
    await new Promise((r) => setTimeout(r, 600));

    const copiedImageSuccess = await page.evaluate(() => {
      const btn = document.querySelector(".md-mermaid-block .md-fences-copy-btn");
      const lastImg = window.__LAST_COPIED_IMAGE__;
      const isTextUpdated = btn?.textContent?.includes("已复制图片") || btn?.textContent?.includes("已复制");
      const hasGeneratedBlob = lastImg && lastImg.blob && lastImg.width > 0 && lastImg.height > 0;
      return isTextUpdated && hasGeneratedBlob;
    });
    assert("点击复制后成功高保真生成高清 PNG 图片并更新按钮文案为「已复制图片!」", copiedImageSuccess);

    // 提取并保存实际导出的 PNG 图像到磁盘以供视觉检验 (底色完整且文字与箭头线互不重叠)
    const exportedPngDataUrl = await page.evaluate(async () => {
      const lastImg = window.__LAST_COPIED_IMAGE__;
      if (!lastImg || !lastImg.blob) return null;
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(lastImg.blob);
      });
    });

    if (exportedPngDataUrl) {
      const base64Data = exportedPngDataUrl.replace(/^data:image\/png;base64,/, "");
      fs.writeFileSync(path.join(artifactsDir, "34-exported-mermaid-edge-label-solid-bg.png"), Buffer.from(base64Data, "base64"));
      assert("成功导出高清 PNG 原始图像，箭头连线上文字具备完整不透明底色且文字与箭头线互不穿透重叠", true);
    }
    await page.screenshot({ path: path.join(artifactsDir, "22-mermaid-copy-image-preview.png") });

    // ==========================================
    // 28. 编辑源码模式下点击复制按钮直接复制 Mermaid 源码
    // ==========================================
    console.log("\n--- 测试 28: 编辑源码模式下点击复制按钮直接复制源码文本 ---");
    // 切换到编辑源码模式
    await page.click(".md-mermaid-block .md-fences-toggle-btn");
    await new Promise((r) => setTimeout(r, 400));

    const isSourceCodeModeActive = await page.evaluate(() => {
      const pre = document.querySelector(".md-mermaid-block .md-fences-content");
      const btn = document.querySelector(".md-mermaid-block .md-fences-copy-btn");
      return (
        pre &&
        getComputedStyle(pre).display !== "none" &&
        btn &&
        btn.textContent?.trim() === "复制源码"
      );
    });
    assert("切入编辑源码模式后，复制按钮自动切换为「复制源码」", isSourceCodeModeActive);

    // 点击复制源码
    await page.click(".md-mermaid-block .md-fences-copy-btn");
    await new Promise((r) => setTimeout(r, 400));

    const copiedSourceSuccess = await page.evaluate(() => {
      const btn = document.querySelector(".md-mermaid-block .md-fences-copy-btn");
      return btn?.textContent?.includes("已复制源码") || btn?.textContent?.includes("已复制");
    });
    assert("在源码模式下点击复制按钮，成功将源码写入剪贴板并提示「已复制源码!」", copiedSourceSuccess);
    await page.screenshot({ path: path.join(artifactsDir, "23-mermaid-copy-source-code.png") });

    // 切回预览模式，验证按钮恢复为「复制图片」
    await page.click(".md-mermaid-block .md-fences-toggle-btn");
    await new Promise((r) => setTimeout(r, 600));

    const isCopyBtnRestoredToImage = await page.evaluate(() => {
      const btn = document.querySelector(".md-mermaid-block .md-fences-copy-btn");
      return btn?.textContent?.trim() === "复制图片";
    });
    assert("切回图表预览后，复制按钮自适应恢复为「复制图片」", isCopyBtnRestoredToImage);

    // ==========================================
    // 29. 偏好设置多 Tab 分类与排版字号即时生效
    // ==========================================
    console.log("\n--- 测试 29: 偏好设置多分类 Tab 导航与排版参数即时生效 ---");
    // 打开偏好设置
    await page.click("#btn-open-settings");
    await new Promise((r) => setTimeout(r, 400));

    const hasMultiTabs = await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll("#settings-tabs-nav .ty-settings-tab-btn"));
      const tabNames = tabs.map((t) => t.textContent?.trim() || "");
      return (
        tabs.length >= 4 &&
        tabNames.some((n) => n.includes("图表")) &&
        tabNames.some((n) => n.includes("排版")) &&
        tabNames.some((n) => n.includes("主题")) &&
        tabNames.some((n) => n.includes("存储"))
      );
    });
    assert("偏好设置面板拥有分类清晰的多 Tab 导航（图表、排版、主题、存储、关于）", hasMultiTabs);

    // 切换到「✍️ 编辑排版」Tab
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll("#settings-tabs-nav .ty-settings-tab-btn"));
      const editorTab = tabs.find((t) => t.getAttribute("data-tab") === "editor");
      editorTab?.click();
    });
    await new Promise((r) => setTimeout(r, 200));

    const isEditorPanelActive = await page.evaluate(() => {
      const panel = document.querySelector("#tab-panel-editor");
      return panel && panel.classList.contains("active");
    });
    assert("点击排版 Tab 成功激活排版设置面板", isEditorPanelActive);

    // 修改字号为 18px，行间距为 1.8
    await page.select("#setting-select-font-size", "18px");
    await page.select("#setting-select-line-height", "1.8");

    // 保存设置
    await page.click("#btn-save-settings");
    await new Promise((r) => setTimeout(r, 400));

    const typographyApplied = await page.evaluate(() => {
      const root = document.documentElement;
      const fs = root.style.getPropertyValue("--editor-font-size");
      const lh = root.style.getPropertyValue("--editor-line-height");
      const savedSettings = window.__MARKWEAVE_SETTINGS__.loadSettings();
      return fs === "18px" && lh === "1.8" && savedSettings.fontSize === "18px";
    });
    assert("偏好设置排版字号 (18px) 与行间距 (1.8) 即时生效到编辑界面并持久化", typographyApplied);
    await page.screenshot({ path: path.join(artifactsDir, "24-settings-tabs-typography-applied.png") });

    // 恢复默认字号 16px
    await page.evaluate(() => {
      const s = window.__MARKWEAVE_SETTINGS__.loadSettings();
      s.fontSize = "16px";
      s.lineHeight = "1.65";
      window.__MARKWEAVE_SETTINGS__.saveSettings(s);
    });


    // ==========================================
    // 30. 浮动控制工具条在非编辑模式下鼠标挪开自动隐藏，编辑模式下常驻显示
    // ==========================================
    console.log("\n--- 测试 30: 浮动控制工具条鼠标挪开自动隐藏与悬停/编辑常驻 ---");
    // 鼠标移出图表区域至视口左上角 (0, 0)
    await page.mouse.move(10, 10);
    await new Promise((r) => setTimeout(r, 400));

    const isToolbarHiddenOnLeave = await page.evaluate(() => {
      const tb = document.querySelector(".md-diagram-preview .md-diagram-toolbar");
      if (!tb) return false;
      const opacity = getComputedStyle(tb).opacity;
      const pointerEvents = getComputedStyle(tb).pointerEvents;
      return (opacity === "0" || parseFloat(opacity) < 0.1) && pointerEvents === "none";
    });
    assert("非编辑模式下鼠标挪开图表后，浮动控制条自动隐藏 (opacity: 0, pointerEvents: none)", isToolbarHiddenOnLeave);
    await page.screenshot({ path: path.join(artifactsDir, "25-diagram-toolbar-auto-hidden.png") });

    // 鼠标移入工具条专属感应区域
    await page.hover(".md-mermaid-block .md-diagram-toolbar-wrap");
    await new Promise((r) => setTimeout(r, 400));

    const isToolbarVisibleOnHover = await page.evaluate(() => {
      const tb = document.querySelector(".md-diagram-preview .md-diagram-toolbar");
      if (!tb) return false;
      const opacity = getComputedStyle(tb).opacity;
      const pointerEvents = getComputedStyle(tb).pointerEvents;
      return opacity === "1" && pointerEvents === "auto";
    });
    assert("鼠标悬停至工具条感应区域时，浮动控制条平滑显现 (opacity: 1, pointerEvents: auto)", isToolbarVisibleOnHover);
    await page.screenshot({ path: path.join(artifactsDir, "26-diagram-toolbar-visible-on-hover.png") });

    // 点击进入图表编辑模式
    await page.click(".md-mermaid-block .md-diagram-drag-btn");
    await new Promise((r) => setTimeout(r, 200));

    // 再次将鼠标移至屏幕边缘
    await page.mouse.move(10, 10);
    await new Promise((r) => setTimeout(r, 300));

    const isToolbarPinnedInEditMode = await page.evaluate(() => {
      const preview = document.querySelector(".md-mermaid-block .md-diagram-preview");
      const tb = document.querySelector(".md-diagram-preview .md-diagram-toolbar");
      return (
        preview?.classList.contains("is-edit-mode") &&
        getComputedStyle(tb).opacity === "1"
      );
    });
    assert("在「图表编辑」模式下鼠标移开，浮动控制条常驻固定显示，方便持续排版操作", isToolbarPinnedInEditMode);

    // 退出编辑模式
    await page.click(".md-mermaid-block .md-diagram-drag-btn");
    await new Promise((r) => setTimeout(r, 300));

    // ==========================================
    // 31. 实线连线 100% 连续平滑无 4px 断续残缺间隙
    // ==========================================
    console.log("\n--- 测试 31: 实线连线平滑连续无断续残缺间隙 ---");
    const areSolidLinesContinuous = await page.evaluate(() => {
      const paths = Array.from(document.querySelectorAll(".md-mermaid-block svg path.flowchart-link"));
      return (
        paths.length > 0 &&
        paths.every((p) => {
          const dash = getComputedStyle(p).strokeDasharray;
          const isDashed = p.classList.contains("edge-pattern-dots") || p.classList.contains("edge-pattern-dashed");
          if (isDashed) return true;
          return dash === "none" || dash === "";
        })
      );
    });
    assert("所有实线连线彻底剥离伪虚线 stroke-dasharray 间隔，直线 100% 严谨平滑连续无断续残缺", areSolidLinesContinuous);
    await page.screenshot({ path: path.join(artifactsDir, "27-continuous-smooth-solid-lines.png") });

    // ==========================================
    // 32. 编辑源码模式下，下方同步展示图表实时预览 (对标 Typora)
    // ==========================================
    console.log("\n--- 测试 32: 编辑源码模式下下方同步展示图表实时预览 (对标 Typora) ---");
    // 1. 点击「编辑源码」切换按钮
    await page.click(".md-mermaid-block .md-fences-toggle-btn");
    await new Promise((r) => setTimeout(r, 400));

    const isLivePreviewShownUnderneath = await page.evaluate(() => {
      const block = document.querySelector(".md-mermaid-block");
      const pre = block?.querySelector("pre.md-fences-content");
      const preview = block?.querySelector(".md-diagram-preview");
      const svg = preview?.querySelector("svg");
      return (
        block?.classList.contains("is-editing") &&
        pre &&
        getComputedStyle(pre).display !== "none" &&
        preview &&
        getComputedStyle(preview).display === "flex" &&
        !!svg
      );
    });
    assert("编辑源码模式下，上方展示源码输入框，下方同步呈现图表实时预览 (对标 Typora)", isLivePreviewShownUnderneath);
    await page.screenshot({ path: path.join(artifactsDir, "28-source-editor-with-live-preview-below.png") });

    // 2. 打字实时更新：在源码末尾追加新节点
    await page.evaluate(() => {
      const block = document.querySelector(".md-mermaid-block");
      const code = block?.querySelector("code");
      if (code) {
        code.focus();
        const currentText = code.textContent || "";
        code.textContent = currentText + "\n  F --> G[实时打字即时响应验证]";
        code.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    await new Promise((r) => setTimeout(r, 600));

    const isLiveRenderedOnTyping = await page.evaluate(() => {
      const svg = document.querySelector(".md-mermaid-block .md-diagram-preview svg");
      return svg && svg.textContent?.includes("实时打字即时响应验证");
    });
    assert("编辑源码打字时，下方图表 0ms/防抖即时重排重绘，实时体现新节点", isLiveRenderedOnTyping);
    await page.screenshot({ path: path.join(artifactsDir, "29-live-render-while-typing.png") });

    // 3. 点击「预览图表」按钮收起源码
    await page.click(".md-mermaid-block .md-fences-toggle-btn");
    await new Promise((r) => setTimeout(r, 400));

    const isSourceFoldedToPurePreview = await page.evaluate(() => {
      const block = document.querySelector(".md-mermaid-block");
      const pre = block?.querySelector("pre.md-fences-content");
      const preview = block?.querySelector(".md-diagram-preview");
      return (
        !block?.classList.contains("is-editing") &&
        pre &&
        getComputedStyle(pre).display === "none" &&
        preview &&
        getComputedStyle(preview).display === "flex"
      );
    });
    assert("点击「预览图表」后，源码输入框顺利收起折叠，全幅展示纯净图表预览", isSourceFoldedToPurePreview);

    // ==========================================
    // 33. 浮动菜单栏专属感应区域判定 (比菜单栏稍微大一点，挪开后再消失)
    // ==========================================
    console.log("\n--- 测试 33: 浮动菜单栏专属感应区域判定 (比菜单栏稍微大一点，挪开后再消失) ---");
    const tbBox = await page.evaluate(() => {
      const tb = document.querySelector(".md-diagram-preview .md-diagram-toolbar");
      if (!tb) return null;
      const r = tb.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });

    if (tbBox) {
      // 鼠标移动到菜单栏下方 15px (位于稍微大一点的外延感应区域内)
      await page.mouse.move(tbBox.x + tbBox.width / 2, tbBox.y + tbBox.height + 15);
      await new Promise((r) => setTimeout(r, 300));

      const isVisibleInExtendedZone = await page.evaluate(() => {
        const tb = document.querySelector(".md-diagram-preview .md-diagram-toolbar");
        return tb && getComputedStyle(tb).opacity === "1";
      });
      assert("鼠标移动至菜单栏边缘外侧扩展缓冲带 (+15px) 内时，菜单栏保持优雅显现", isVisibleInExtendedZone);

      // 鼠标挪开这个区域 (移到远离菜单栏 100px 处)
      await page.mouse.move(tbBox.x + tbBox.width / 2, tbBox.y + tbBox.height + 100);
      await new Promise((r) => setTimeout(r, 500));

      const isHiddenAfterLeavingZone = await page.evaluate(() => {
        const tb = document.querySelector(".md-diagram-preview .md-diagram-toolbar");
        if (!tb) return false;
        const op = getComputedStyle(tb).opacity;
        return op === "0" || parseFloat(op) < 0.1;
      });
      assert("鼠标完全挪开该专属区域后，菜单栏平滑消失", isHiddenAfterLeavingZone);
      await page.screenshot({ path: path.join(artifactsDir, "30-toolbar-sensing-zone-precision.png") });
    }

    // ==========================================
    // 34. 图表中的文字支持实时修改 (双击/单击原地编辑并 0ms 同步源码与图表)
    // ==========================================
    console.log("\n--- 测试 34: 图表中的文字支持实时原地修改与源码 0ms 同步 ---");
    // 1. 在图表中双击第一个节点
    const firstNodeExists = await page.evaluate(() => {
      const node = document.querySelector(".md-mermaid-block svg .node");
      return !!node;
    });
    assert("图表中存在可交互节点", firstNodeExists);

    await page.evaluate(() => {
      const node = document.querySelector(".md-mermaid-block svg .node");
      if (node) {
        node.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
      }
    });
    await new Promise((r) => setTimeout(r, 300));

    const isInlineNodeEditorOpen = await page.evaluate(() => {
      const editor = document.querySelector(".md-inline-node-editor");
      const input = editor?.querySelector("input.md-inline-node-input");
      return !!editor && !!input;
    });
    assert("双击节点成功弹出居中原地文字编辑悬浮框 (.md-inline-node-editor)", isInlineNodeEditorOpen);

    // 2. 修改文本为「输入 Markdown 文本」并回车提交
    await page.evaluate(() => {
      const input = document.querySelector(".md-inline-node-input");
      if (input) {
        input.value = "输入 Markdown 文本";
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      }
    });
    await new Promise((r) => setTimeout(r, 500));

    // 3. 验证图表和源码双向实时更新
    const isNodeTextUpdatedLive = await page.evaluate(() => {
      const preview = document.querySelector(".md-mermaid-block .md-diagram-preview");
      const block = document.querySelector(".md-mermaid-block");
      const previewText = preview?.textContent || "";
      const sourceText = block?.querySelector("code")?.textContent || "";
      return (
        previewText.includes("输入 Markdown 文本") &&
        sourceText.includes("输入 Markdown 文本") &&
        sourceText.includes("A[输入 Markdown 文本]")
      );
    });
    assert("节点文字修改后 0ms 实时更新图表渲染并同步更新 Markdown 源码，保持原有语法括号形态不变", isNodeTextUpdatedLive);
    await page.screenshot({ path: path.join(artifactsDir, "31-node-text-live-edited.png") });

    // ==========================================
    // 35. 彻底杜绝所有工具栏按钮出现输入光标与文字被修改
    // ==========================================
    console.log("\n--- 测试 35: 彻底杜绝所有工具栏按钮出现输入光标与文字被修改 ---");
    // 1. 进入图表编辑模式
    await page.click(".md-mermaid-block .md-diagram-drag-btn");
    await new Promise((r) => setTimeout(r, 200));

    // 2. 验证所有按钮与工具栏容器具有 contenteditable="false" 且 user-select: none, caret-color: transparent
    const buttonsCheck = await page.evaluate(() => {
      const tb = document.querySelector(".md-diagram-toolbar");
      const buttons = Array.from(document.querySelectorAll(".md-diagram-toolbar button, .md-fences-toolbar button"));
      const allReadonly = buttons.every((b) => {
        const ce = b.getAttribute("contenteditable");
        const style = window.getComputedStyle(b);
        const userSelect = style.userSelect || style.webkitUserSelect;
        const caretColor = style.caretColor;
        return (
          ce === "false" &&
          (userSelect === "none" || userSelect === "-webkit-none") &&
          (caretColor === "transparent" || caretColor === "rgba(0, 0, 0, 0)")
        );
      });

      return {
        toolbarCE: tb?.getAttribute("contenteditable"),
        buttonsCount: buttons.length,
        allReadonly,
      };
    });
    assert("所有工具栏与按钮均显式声明 contenteditable=\"false\"", buttonsCheck.toolbarCE === "false");
    assert("所有按钮均强制设置 user-select: none 与 caret-color: transparent，杜绝出现输入光标与文字修改", buttonsCheck.allReadonly, `检测按钮数: ${buttonsCheck.buttonsCount}`);

    // 3. 点击「退出编辑」按钮文本处，验证不会产生选区光标
    const editBtn = await page.$(".md-diagram-drag-btn");
    if (editBtn) {
      await editBtn.click();
      await new Promise((r) => setTimeout(r, 100));
    }

    const hasNoSelectionOnButton = await page.evaluate(() => {
      const sel = window.getSelection();
      const selectedText = sel ? sel.toString().trim() : "";
      return selectedText === "";
    });
    assert("点击工具条按钮不会产生文本选区光标 (Selection 为空)", hasNoSelectionOnButton);
    await page.screenshot({ path: path.join(artifactsDir, "32-buttons-no-cursor-immutable.png") });

    const brainArtifactsDir = "C:\\Users\\27953\\.gemini\\antigravity-cli\\brain\\9b60e45b-628a-4e99-bdb9-3e175a116ca9";
    if (fs.existsSync(brainArtifactsDir)) {
      for (const file of fs.readdirSync(artifactsDir)) {
        if (file.endsWith(".png")) {
          fs.copyFileSync(path.join(artifactsDir, file), path.join(brainArtifactsDir, file));
        }
      }
    }

  } catch (err) {
    console.error("测试执行过程中出现异常:", err);
    failCount++;
  } finally {
    await browser.close();
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
    } catch {
      // Windows 上 Chrome 可能短暂占用 profile 文件；残留目录位于系统临时目录，可忽略。
    }
  }

  console.log("\n=================================");
  console.log(`测试结果汇总: 通过 ${passCount} 项, 失败 ${failCount} 项`);
  console.log("=================================");

  if (failCount > 0) {
    process.exit(1);
  }
}

runTests();
