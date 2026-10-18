import "./styles/typora-theme.css";
import { MarkWeaveEditor } from "./editor";
import type { HeadingItem } from "./editor/outline";

interface DocumentItem {
  id: string;
  title: string;
  content: string;
}

// 预设文档 1: 欢迎与特性演示
const docWelcome = `# 欢迎使用 MarkWeave (Typemark 对标 Typora 核心机制)

MarkWeave 是一款基于现代 Web 标准构建的 Markdown 即时渲染编辑器，并原生支持 Mermaid 图表的可视化拖拽、正交折线排版与双向源码同步。

## 🌟 核心特性展示

### 1. 极致无缝即时渲染 (Live Preview)
请将鼠标光标移动到以下文字中间试一试：
- 这是一个 **加粗文字 (Bold)**，光标靠近时展开原始 \`**\` 标记，移开时自动折叠。
- 这是一个 *斜体文字 (Italic)* 与 ~~删除线 (Strike)~~。
- 这是一个 [超链接示例 (Typora官网)](https://typora.io)。
- 这是一个行内代码：\`const answer = 42;\`。

### 2. 块级交互与快捷语法 (Input Rules)
在空行尝试输入：
- \`# \`、\`## \`、\`### \` 自动转为标题
- \`> \` 自动转为块级引用
- \`- [ ] \` 自动转为可点击任务列表：
  - [x] 完成 Typora 架构逆向分析
  - [x] 构建 ProseMirror AST 文档状态机
  - [x] 实现光标驱动的语法折叠插件 (Inline Syntax Folding)
  - [x] 修复 contenteditable 原生聚焦黑框问题
  - [x] 修复侧边栏大纲跳转与平滑定位
  - [x] 实现工作区多文件无缝切换与本地文件导入导出

### 3. 数学公式引擎 (KaTeX SVG 排版)
点击下方公式即可在弹出的编辑器中直接改写 LaTeX，按 Esc 或点击外部即时更新：

$$
\\frac{1}{\\sigma \\sqrt{2\\pi}} \\, e^{-\\frac{1}{2}\\left(\\frac{x-\\mu}{\\sigma}\\right)^2}
$$

### 4. 代码块组件 (Code Fences)
支持自定义编程语言与一键复制功能：

\`\`\`typescript
interface TyporaEngine {
  mode: "live-preview" | "source-code";
  syntaxFolding: boolean;
  theme: "github" | "night";
}

const engine: TyporaEngine = {
  mode: "live-preview",
  syntaxFolding: true,
  theme: "github"
};
console.log("Typemark Engine Initialized!");
\`\`\`

### 5. Mermaid 图表实时排版 (Flowchart / Sequence)
支持流程图、时序图、状态图等无缝可视化渲染，点击图表即可展开源码编辑：

\`\`\`mermaid
graph TD
    A[Markdown 纯文本] -->|解析| B(ProseMirror AST)
    B -->|语法折叠| C{光标位置判定}
    C -->|光标在外部| D[渲染为纯净排版]
    C -->|光标进入标记| E[展开原始 Markdown 符号]
    B -->|代码块探测| F[Mermaid 图表引擎即时重绘]
\`\`\`

> **Typora 核心交互哲学**：让排版退至幕后，使思想保持纯净。
`;

// 预设文档 2: 系统架构设计规范
const docArchitecture = `# 系统架构设计规范 (Typemark Architecture)

## 1. 总体分层模型

Typemark 继承了 Typora 的设计思想，采用解耦的分层设计：

- **UI 展示层**：侧边栏大纲、文件列表、源码模式切换、主题切换
- **编辑器内核**：ProseMirror State + Document Schema + Inline Syntax Folding
- **序列化层**：Markdown 双向转换引擎 (AST ↔ Markdown)
- **微组件体系**：Code Fences、KaTeX Math Block、Task Item

## 2. 核心状态转换

\`\`\`
Markdown 纯文本
     │ (markdownToDoc)
     ▼
ProseMirror Document (AST)
     │ (createSyntaxFoldingPlugin)
     ▼
交互式 HTML DOM (#write)
     │ (docToMarkdown)
     ▼
Markdown 纯文本 (完全保真)
\`\`\`

## 3. 性能与体积考量
相比传统 Electron 打包，Typemark 运行时无任何重型运行时开销，启动毫秒级响应。
`;

// 预设文档 3: REA 逆向技术手记
const docReaNotes = `# REA 逆向技术手记 (Typora Internals)

基于 **REA (Reverse Engineer Anything)** 逆向分析成果记录：

## 1. 模块组织架构
- **Module 10 (JSBridge)**：处理 Electron 与 WebKit 原生 IPC、剪贴板多格式混合读写（HTML/Plain/FileNameW）。
- **Module 12 (toMark)**：AST 树转 Markdown 序列化器，通过 \`u.call(node)\` 递归序列化。
- **Module 13 (Node & NodeMap)**：双向链表 AST 结构，每个节点拥有 \`parent\`, \`before\`, \`after\`, \`children\`。
- **Module 14 (toHTML)**：AST 转 HTML 渲染器，动态附加 \`cid\` 与 \`mdtype\` 属性。
- **Module 1a (splitAt / breakOn)**：节点拆分、合并与回车换行事务。

## 2. 即时渲染核心秘诀
Typora 的即时预览并不是左右分屏，而是在同一 contenteditable 容器中：
1. 将标记符号包裹在 \`.md-meta\` 节点中；
2. 非编辑状态下 CSS 设置为折叠；
3. 光标移入当前段落时切换激活展开。
`;

// 工作区多文档管理状态
const documents: DocumentItem[] = [
  { id: "doc-1", title: "欢迎使用 Typemark.md", content: docWelcome },
  { id: "doc-2", title: "系统架构设计规范.md", content: docArchitecture },
  { id: "doc-3", title: "REA 逆向技术手记.md", content: docReaNotes },
];

let activeDocId = "doc-1";

// 初始化应用 DOM 结构
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <!-- 侧边栏 (Sidebar) -->
  <aside class="ty-sidebar" id="sidebar">
    <div class="ty-sidebar-tabs">
      <div class="ty-sidebar-tab active" data-tab="outline">大纲 (Outline)</div>
      <div class="ty-sidebar-tab" data-tab="files">文件 (Files)</div>
    </div>
    <div class="ty-sidebar-content" id="sidebar-content">
      <!-- 大纲目录容器 -->
      <div id="outline-container"></div>
      <!-- 文件列表容器 -->
      <div id="files-container" style="display: none;">
        <div class="ty-files-actions" style="display: flex; gap: 6px; margin-bottom: 12px; padding: 0 4px;">
          <button class="ty-icon-btn" id="btn-new-file" style="flex: 1; justify-content: center; border: 1px dashed var(--border-color); padding: 5px;">
            + 新建文档
          </button>
          <button class="ty-icon-btn" id="btn-open-file" style="flex: 1; justify-content: center; border: 1px dashed var(--border-color); padding: 5px;">
            📂 打开本地
          </button>
          <input type="file" id="local-file-input" accept=".md,.markdown,.txt" style="display: none;" />
        </div>
        <div id="file-list-items"></div>
      </div>
    </div>
  </aside>

  <!-- 主编辑区 -->
  <main class="ty-main-container">
    <!-- 顶部轻量工具栏 -->
    <header class="ty-header-bar">
      <div class="ty-header-left">
        <button class="ty-icon-btn" id="btn-toggle-sidebar" title="切换侧边栏">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
          侧边栏
        </button>
        <span class="ty-doc-title" id="doc-title">欢迎使用 Typemark.md</span>
      </div>
      <div class="ty-header-right">
        <button class="ty-icon-btn" id="btn-toggle-source" title="切换源码模式 (Ctrl+/)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
          源码模式
        </button>
        <button class="ty-icon-btn" id="btn-toggle-theme" title="切换明亮/暗色主题">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          主题
        </button>
        <button class="ty-icon-btn" id="btn-save-md" title="下载/保存为 .md 文件">
          保存 Markdown
        </button>
        <button class="ty-icon-btn" id="btn-export-html" title="导出为 HTML">
          导出 HTML
        </button>
        <button class="ty-icon-btn" id="btn-export-pdf" title="打印/导出 PDF">
          打印 PDF
        </button>
      </div>
    </header>

    <!-- 滚动容器与 ProseMirror 挂载点 -->
    <div class="ty-editor-scroller">
      <div id="write"></div>
    </div>

    <!-- 源码模式全屏编辑器 -->
    <textarea id="source-editor" spellcheck="false"></textarea>

    <!-- 底部状态栏 -->
    <footer class="ty-footer">
      <div class="ty-footer-left">
        <span id="stat-words">0 词</span>
        <span id="stat-chars">0 字符</span>
        <span id="stat-lines">0 行</span>
      </div>
      <div class="ty-footer-right">
        <button class="ty-footer-btn" id="btn-focus-mode">专注模式</button>
        <button class="ty-footer-btn" id="btn-typewriter-mode">打字机模式</button>
      </div>
    </footer>
  </main>
`;

// 获取界面元素
const mountEl = document.getElementById("write")!;
const sourceEditor = document.getElementById("source-editor") as HTMLTextAreaElement;
const outlineContainer = document.getElementById("outline-container")!;
const fileListContainer = document.getElementById("file-list-items")!;
const sidebar = document.getElementById("sidebar")!;
const docTitleEl = document.getElementById("doc-title")!;
const btnToggleSidebar = document.getElementById("btn-toggle-sidebar")!;
const btnToggleSource = document.getElementById("btn-toggle-source")!;
const btnToggleTheme = document.getElementById("btn-toggle-theme")!;
const btnFocusMode = document.getElementById("btn-focus-mode")!;
const btnTypewriterMode = document.getElementById("btn-typewriter-mode")!;
const btnSaveMd = document.getElementById("btn-save-md")!;
const btnExportHtml = document.getElementById("btn-export-html")!;
const btnExportPdf = document.getElementById("btn-export-pdf")!;
const btnNewFile = document.getElementById("btn-new-file")!;
const btnOpenFile = document.getElementById("btn-open-file")!;
const localFileInput = document.getElementById("local-file-input") as HTMLInputElement;

const statWords = document.getElementById("stat-words")!;
const statChars = document.getElementById("stat-chars")!;
const statLines = document.getElementById("stat-lines")!;

// 实例化 MarkWeave 核心编辑器
const currentDoc = documents.find((d) => d.id === activeDocId)!;
const editor = new MarkWeaveEditor({
  mountEl,
  initialMarkdown: currentDoc.content,
  onDocChange: (md) => {
    // 自动将修改同步回当前文档内存对象
    const doc = documents.find((d) => d.id === activeDocId);
    if (doc) {
      doc.content = md;
    }
  },
  onOutlineChange: (headings) => {
    renderOutline(headings);
  },
  onWordCountChange: (stats) => {
    statWords.textContent = `${stats.words} 词`;
    statChars.textContent = `${stats.chars} 字符`;
    statLines.textContent = `${stats.lines} 行`;
  },
});

(window as any).__TYPEMARK_EDITOR__ = editor;
(window as any).__MARKWEAVE_EDITOR__ = editor;

// 渲染文件列表
function renderFileList() {
  fileListContainer.innerHTML = documents
    .map(
      (doc) => `
    <div class="ty-file-item ${doc.id === activeDocId ? "active" : ""}" data-id="${doc.id}">
      📄 ${doc.title}
    </div>
  `
    )
    .join("");

  fileListContainer.querySelectorAll(".ty-file-item").forEach((el) => {
    el.addEventListener("click", () => {
      const docId = el.getAttribute("data-id")!;
      switchDocument(docId);
    });
  });
}

// 切换文档函数
function switchDocument(newDocId: string) {
  if (newDocId === activeDocId) return;

  // 1. 保存当前文档最新编辑内容
  const prevDoc = documents.find((d) => d.id === activeDocId);
  if (prevDoc) {
    prevDoc.content = editor.getMarkdown();
  }

  // 2. 切换至新文档
  activeDocId = newDocId;
  const nextDoc = documents.find((d) => d.id === activeDocId)!;
  docTitleEl.textContent = nextDoc.title;

  // 3. 加载新文档到编辑器
  editor.setMarkdown(nextDoc.content);

  // 如果处于源码模式，同步更新 textarea
  if (isSourceMode) {
    sourceEditor.value = nextDoc.content;
  }

  // 4. 更新文件列表高亮
  renderFileList();
}

// 初始渲染文件列表
renderFileList();

// 渲染实时大纲目录
function renderOutline(headings: HeadingItem[]) {
  if (headings.length === 0) {
    outlineContainer.innerHTML = `<div style="color: #999; font-size: 12px; padding: 12px;">大纲为空</div>`;
    return;
  }

  outlineContainer.innerHTML = headings
    .map(
      (h) => `
    <a class="ty-outline-item level-${h.level}" data-pos="${h.pos}">
      ${h.text}
    </a>
  `
    )
    .join("");

  outlineContainer.querySelectorAll(".ty-outline-item").forEach((el) => {
    el.addEventListener("click", () => {
      outlineContainer.querySelectorAll(".ty-outline-item").forEach((item) => item.classList.remove("active"));
      el.classList.add("active");
      const pos = parseInt(el.getAttribute("data-pos")!, 10);
      editor.scrollToHeading(pos);
    });
  });
}

// 新建文档按钮
btnNewFile.addEventListener("click", () => {
  const newId = `doc-${Date.now()}`;
  const newTitle = `未命名文档_${documents.length + 1}.md`;
  const newContent = `# ${newTitle.replace(".md", "")}\n\n开始撰写您的精彩内容...`;

  documents.push({
    id: newId,
    title: newTitle,
    content: newContent,
  });

  renderFileList();
  switchDocument(newId);
});

// 打开本地 Markdown 文件
btnOpenFile.addEventListener("click", () => {
  localFileInput.click();
});

localFileInput.addEventListener("change", (e) => {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const content = event.target?.result as string;
    const newId = `doc-local-${Date.now()}`;
    documents.push({
      id: newId,
      title: file.name,
      content,
    });
    renderFileList();
    switchDocument(newId);
    target.value = "";
  };
  reader.readAsText(file);
});

// 侧边栏折叠切换
btnToggleSidebar.addEventListener("click", () => {
  sidebar.classList.toggle("collapsed");
});

// 侧边栏 Tab 切换 (大纲 vs 文件)
document.querySelectorAll(".ty-sidebar-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".ty-sidebar-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const target = tab.getAttribute("data-tab");
    if (target === "outline") {
      outlineContainer.style.display = "block";
      document.getElementById("files-container")!.style.display = "none";
    } else {
      outlineContainer.style.display = "none";
      document.getElementById("files-container")!.style.display = "block";
    }
  });
});

// 源码模式切换 (Ctrl+/ 或按钮)
let isSourceMode = false;
function toggleSourceMode() {
  isSourceMode = !isSourceMode;
  if (isSourceMode) {
    sourceEditor.value = editor.getMarkdown();
    sourceEditor.classList.add("visible");
    btnToggleSource.classList.add("active");
    sourceEditor.focus();
  } else {
    editor.setMarkdown(sourceEditor.value);
    sourceEditor.classList.remove("visible");
    btnToggleSource.classList.remove("active");
    editor.focus();
  }
}

btnToggleSource.addEventListener("click", toggleSourceMode);
window.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "/") {
    e.preventDefault();
    toggleSourceMode();
  }
  // Ctrl+S 保存文件
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    downloadMarkdown();
  }
});

// 保存/下载 Markdown
function downloadMarkdown() {
  const currentDoc = documents.find((d) => d.id === activeDocId);
  const content = isSourceMode ? sourceEditor.value : editor.getMarkdown();
  const filename = currentDoc ? currentDoc.title : "document.md";

  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

btnSaveMd.addEventListener("click", downloadMarkdown);

// 主题切换 (明亮 / 暗色)
btnToggleTheme.addEventListener("click", () => {
  document.body.classList.toggle("theme-night");
  window.dispatchEvent(new CustomEvent("theme-change"));
});

// 专注模式
btnFocusMode.addEventListener("click", () => {
  document.body.classList.toggle("mode-focus");
  btnFocusMode.classList.toggle("active");
});

// 打字机模式
btnTypewriterMode.addEventListener("click", () => {
  document.body.classList.toggle("mode-typewriter");
  btnTypewriterMode.classList.toggle("active");
});

// 导出为独立 HTML
btnExportHtml.addEventListener("click", () => {
  const currentDoc = documents.find((d) => d.id === activeDocId);
  const title = currentDoc ? currentDoc.title : "Typemark 导出文档";
  const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
  <style>
    body { max-width: 860px; margin: 40px auto; padding: 0 20px; font-family: -apple-system, sans-serif; line-height: 1.65; color: #333; }
    h1, h2, h3 { color: #111; margin-top: 1.2em; font-weight: 600; }
    blockquote { border-left: 4px solid #428bca; padding: 6px 16px; background: #f9f9f9; color: #666; margin: 1em 0; }
    pre { background: #f4f4f4; padding: 12px; border-radius: 4px; overflow-x: auto; font-family: monospace; }
    code { font-family: monospace; background: #f0f0f0; padding: 2px 4px; border-radius: 3px; }
  </style>
</head>
<body>
  ${mountEl.innerHTML}
</body>
</html>`;

  const blob = new Blob([htmlContent], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/\.md$/, "")}.html`;
  a.click();
  URL.revokeObjectURL(url);
});

// 导出/打印 PDF
btnExportPdf.addEventListener("click", () => {
  window.print();
});
