import "./styles/typora-theme.css";
import { MarkWeaveEditor } from "./editor";
import type { HeadingItem } from "./editor/outline";
import {
  buildOutlineTree,
  filterOutline,
  findActiveHeading,
  type OutlineNode,
} from "./editor/outline-tree";
import { openTableInsertDialog } from "./editor/table/insert-dialog";
import {
  type StoredDocument,
  type WorkspaceStateV1,
  createDocument,
  createWorkspace,
  loadWorkspace,
  saveWorkspace,
  uniqueTitle,
} from "./workspace/store";
import { applyDocumentSwitch } from "./workspace/session";
import { getDesktopAPI } from "./platform/desktop";
import {
  applyOpenedFile,
  extractFileName,
  markDocumentSaved,
  suggestedSaveName,
  type DesktopFile,
} from "./platform/documents";
import { resolveTheme, type ThemeSetting } from "./platform/theme";
import { normalizeLanguage, type Language } from "./platform/i18n";
import {
  type MermaidThemePreference,
  normalizeMermaidTheme,
} from "./platform/mermaid-theme";
import type { FlatFile } from "./workspace/file-tree";
import {
  type FolderWorkspace,
  loadLastFolder,
  openFolderWorkspace,
  refreshFolderWorkspace,
  rememberLastFolder,
  rememberRecentFile,
  getFileStat,
} from "./workspace/folder-workspace";
import { QuickOpen } from "./workspace/quick-open";
import {
  createMarkdownFile,
  renamePath,
  revealPath,
  trashPath,
} from "./workspace/file-ops-desktop";
import { isValidFileName, joinPath, normalizeMarkdownFileName } from "./workspace/file-ops";
import {
  computeSelectionStats,
  createTabState,
  openTab,
  closeTab,
  reopenClosedTab,
  type TabState,
} from "./workspace/tabs";
import {
  POLL_INTERVAL_MS,
  applyReload,
  createTrackedFile,
  hasExternalChange,
  markLocalWrite,
  type TrackedFile,
} from "./workspace/external-change";
import { toHtml } from "./editor/commands/clipboard-formats";
import { BUILT_IN_THEMES, applyBuiltInTheme, normalizeThemeId } from "./platform/themes";
import {
  DEFAULT_PDF_OPTIONS,
  normalizePdfOptions,
  toElectronPdfOptions,
  type PdfOptions,
  type PaperSize,
} from "./platform/pdf-options";

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

// 工作区多文档管理状态与种子文档
const seededDocuments: StoredDocument[] = [
  createDocument("欢迎使用 Typemark.md", docWelcome),
  createDocument("系统架构设计规范.md", docArchitecture),
  createDocument("REA 逆向技术手记.md", docReaNotes),
];

const seededWorkspace: WorkspaceStateV1 = createWorkspace(
  seededDocuments,
  seededDocuments[0].id
);

let workspaceState: WorkspaceStateV1;
try {
  workspaceState = loadWorkspace(localStorage, seededWorkspace);
} catch (err) {
  console.warn("Failed to load workspace, using fallback:", err);
  workspaceState = seededWorkspace;
}

if (!workspaceState.documents || workspaceState.documents.length === 0) {
  workspaceState = seededWorkspace;
}

let documents: StoredDocument[] = workspaceState.documents;
let activeDocId: string = workspaceState.activeDocId;
if (!documents.some((d) => d.id === activeDocId)) {
  activeDocId = documents[0].id;
}

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
      <div id="outline-container">
        <div class="ty-outline-toolbar">
          <input type="search" id="outline-filter" class="ty-outline-filter" placeholder="过滤标题…" />
          <button class="ty-outline-tool-btn" id="btn-outline-collapse" title="全部折叠">⊟</button>
          <button class="ty-outline-tool-btn" id="btn-outline-expand" title="全部展开">⊞</button>
        </div>
        <div id="outline-list"></div>
      </div>
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
        <div class="ty-files-actions" style="display: flex; gap: 6px; margin-bottom: 12px; padding: 0 4px;">
          <button class="ty-icon-btn" id="btn-open-folder" style="flex: 1; justify-content: center; border: 1px dashed var(--border-color); padding: 5px;" title="打开文件夹 (Ctrl+Shift+O)">
            🗂 打开文件夹
          </button>
          <button class="ty-icon-btn" id="btn-quick-open" style="flex: 1; justify-content: center; border: 1px dashed var(--border-color); padding: 5px;" title="快速打开 (Ctrl+P)">
            🔍 快速打开
          </button>
        </div>
        <div class="ty-workspace-bar" id="workspace-bar" style="display: none;">
          <span class="ty-workspace-path" id="workspace-path"></span>
          <div class="ty-workspace-actions">
            <button class="ty-workspace-btn" id="btn-new-workspace-file" title="在文件夹中新建文档">＋</button>
            <button class="ty-workspace-btn" id="btn-refresh-folder" title="刷新文件夹">↻</button>
            <button class="ty-workspace-btn" id="btn-close-folder" title="关闭文件夹">×</button>
          </div>
        </div>
        <div id="file-list-items"></div>
      </div>
    </div>
    <!-- 侧边栏底部设置 (Sidebar Footer) -->
    <div class="ty-sidebar-footer">
      <button class="ty-sidebar-footer-btn" id="btn-open-settings" title="偏好设置 (Settings)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
        <span>偏好设置</span>
      </button>
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
        <button class="ty-icon-btn" id="btn-insert-table" title="插入表格 (Ctrl+Alt+T)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>
          表格
        </button>
        <button class="ty-icon-btn" id="btn-toggle-theme" title="切换明亮/暗色主题">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          主题
        </button>
        <button class="ty-icon-btn" id="btn-save-md" title="导出为 Markdown 文件">
          导出 Markdown
        </button>
        <button class="ty-icon-btn" id="btn-export-html" title="导出为 HTML">
          导出 HTML
        </button>
        <button class="ty-icon-btn" id="btn-export-pdf" title="打印/导出 PDF">
          打印 PDF
        </button>
      </div>
    </header>

    <!-- 文档标签页 -->
    <div class="ty-tab-strip" id="tab-strip" style="display: none;"></div>

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
        <span id="stat-selection" class="ty-stat-selection" style="display: none;"></span>
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
const btnInsertTable = document.getElementById("btn-insert-table")!;
const btnToggleTheme = document.getElementById("btn-toggle-theme")!;
const btnFocusMode = document.getElementById("btn-focus-mode")!;
const btnTypewriterMode = document.getElementById("btn-typewriter-mode")!;
const btnSaveMd = document.getElementById("btn-save-md")!;
const btnExportHtml = document.getElementById("btn-export-html")!;
const btnExportPdf = document.getElementById("btn-export-pdf")!;
const btnNewFile = document.getElementById("btn-new-file")!;
const btnOpenFile = document.getElementById("btn-open-file")!;
const localFileInput = document.getElementById("local-file-input") as HTMLInputElement;
const btnOpenFolder = document.getElementById("btn-open-folder") as HTMLButtonElement;
const btnQuickOpen = document.getElementById("btn-quick-open") as HTMLButtonElement;
const btnRefreshFolder = document.getElementById("btn-refresh-folder") as HTMLButtonElement;
const btnNewWorkspaceFile = document.getElementById("btn-new-workspace-file") as HTMLButtonElement;
const btnCloseFolder = document.getElementById("btn-close-folder") as HTMLButtonElement;
const workspaceBar = document.getElementById("workspace-bar") as HTMLElement;
const workspacePathEl = document.getElementById("workspace-path") as HTMLElement;

const statWords = document.getElementById("stat-words")!;
const statChars = document.getElementById("stat-chars")!;
const statLines = document.getElementById("stat-lines")!;
const statSelection = document.getElementById("stat-selection") as HTMLElement;
const tabStrip = document.getElementById("tab-strip") as HTMLElement;

// 保存工作区防抖与即时落盘
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flushSave();
  }, 500);
}

function flushSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  try {
    if (isSourceMode) {
      const activeDoc = documents.find((d) => d.id === activeDocId);
      if (activeDoc && activeDoc.content !== sourceEditor.value) {
        activeDoc.content = sourceEditor.value;
        activeDoc.dirty = true;
        activeDoc.updatedAt = Date.now();
      }
    }
    const state: WorkspaceStateV1 = {
      version: 1,
      documents,
      activeDocId,
      savedAt: Date.now(),
    };
    saveWorkspace(state, localStorage);
  } catch (err) {
    console.error("Failed to save workspace to localStorage:", err);
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    flushSave();
  }
});

window.addEventListener("beforeunload", () => {
  flushSave();
});

// 标题同步辅助函数
function syncTitle(title: string) {
  const currentDoc = documents.find((d) => d.id === activeDocId);
  const isDirty = Boolean(currentDoc && currentDoc.filePath && currentDoc.dirty);
  const displayTitle = isDirty ? `• ${title}` : title;
  docTitleEl.textContent = title;
  document.title = displayTitle;
}

// 实例化 MarkWeave 核心编辑器
const currentDoc = documents.find((d) => d.id === activeDocId) || documents[0];
syncTitle(currentDoc.title);

const editor = new MarkWeaveEditor({
  mountEl,
  initialMarkdown: currentDoc.content,
  isTypewriterEnabled: () => document.body.classList.contains("mode-typewriter"),
  onSelectionChange: (cursorPos) => {
    syncActiveOutline(cursorPos);
    updateSelectionStats();
  },
  onDocChange: (md) => {
    // 自动将修改同步回当前文档内存对象并调度持久化
    const doc = documents.find((d) => d.id === activeDocId);
    if (doc) {
      if (doc.content !== md) {
        doc.content = md;
        doc.dirty = true;
        doc.updatedAt = Date.now();
        syncTitle(doc.title);
        scheduleSave();
      }
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

// 监听源码编辑器输入，实时同步修改并防抖保存
sourceEditor.addEventListener("input", () => {
  const doc = documents.find((d) => d.id === activeDocId);
  if (doc) {
    if (doc.content !== sourceEditor.value) {
      doc.content = sourceEditor.value;
      doc.dirty = true;
      doc.updatedAt = Date.now();
      syncTitle(doc.title);
      scheduleSave();
    }
  }
});

// 注入文件列表交互样式（悬停删除按钮与行内重命名输入框）
const fileItemStyle = document.createElement("style");
fileItemStyle.textContent = `
  .ty-file-item {
    position: relative;
    user-select: none;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    font-size: 13px;
    border-radius: 4px;
    cursor: pointer;
    color: var(--text-color);
  }
  .ty-file-title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ty-file-delete-btn {
    display: none;
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 3px;
    color: #999;
    align-items: center;
    justify-content: center;
    margin-left: auto;
  }
  .ty-file-delete-btn:hover {
    color: #e53935;
    background: rgba(229, 57, 53, 0.1);
  }
  .ty-file-item:hover .ty-file-delete-btn {
    display: inline-flex;
  }
  .ty-file-rename-input {
    flex: 1;
    border: 1px solid var(--primary-color, #4285f4);
    border-radius: 3px;
    padding: 1px 4px;
    font-size: 13px;
    outline: none;
    background: var(--bg-color, #fff);
    color: var(--text-color, #333);
  }
`;
document.head.appendChild(fileItemStyle);

// 渲染文件列表
let workspaceRoot: string | null = loadLastFolder();
let workspaceFiles: FlatFile[] = [];
let activeFilePath: string | null = null;

function updateSelectionStats(): void {
  const selection = editor.getSelectionText();
  if (!selection) {
    statSelection.style.display = "none";
    return;
  }
  const stats = computeSelectionStats(selection, true);
  statSelection.style.display = "inline";
  statSelection.textContent = `选区 ${stats.words} 词 · ${stats.chars} 字符`;
}

/* ================= 文档标签页 ================= */
let tabState: TabState = createTabState();

function syncTabsFromDocuments(): void {
  const current = documents.find((d) => d.id === activeDocId);
  if (!current) return;
  tabState = openTab(tabState, {
    docId: current.id,
    title: current.title,
    dirty: current.dirty,
    pinned: false,
  });
  renderTabs();
}

function renderTabs(): void {
  if (tabState.tabs.length === 0) {
    tabStrip.style.display = "none";
    return;
  }
  tabStrip.style.display = "flex";
  tabStrip.innerHTML = "";

  tabState.tabs.forEach((tab) => {
    const el = document.createElement("div");
    el.className = `ty-tab${tab.docId === tabState.activeTabId ? " active" : ""}${
      tab.dirty ? " is-dirty" : ""
    }`;
    el.setAttribute("data-doc-id", tab.docId);

    const label = document.createElement("span");
    label.className = "ty-tab-title";
    label.textContent = tab.title;
    label.title = tab.title;

    const close = document.createElement("button");
    close.className = "ty-tab-close";
    close.textContent = "×";
    close.title = "关闭标签";
    close.addEventListener("mousedown", (e) => e.preventDefault());
    close.addEventListener("click", (e) => {
      e.stopPropagation();
      tabState = closeTab(tabState, tab.docId);
      renderTabs();
      if (tabState.activeTabId) {
        switchDocument(tabState.activeTabId);
      }
    });

    el.appendChild(label);
    el.appendChild(close);
    el.addEventListener("click", () => switchDocument(tab.docId));
    el.addEventListener("auxclick", (e) => {
      if (e.button === 1) {
        tabState = closeTab(tabState, tab.docId);
        renderTabs();
      }
    });
    tabStrip.appendChild(el);
  });
}

/** 重新打开最近关闭的标签 */
function reopenLastTab(): void {
  const next = reopenClosedTab(
    tabState,
    documents.map((d) => d.id)
  );
  if (next === tabState) return;
  tabState = next;
  renderTabs();
  if (tabState.activeTabId) switchDocument(tabState.activeTabId);
}

document.addEventListener("keydown", (event) => {
  if (!(event.ctrlKey || event.metaKey) || !event.shiftKey) return;
  if (event.key.toLowerCase() === "t") {
    event.preventDefault();
    reopenLastTab();
  }
});

function renderFileList() {
  fileListContainer.innerHTML = "";

  // 已打开的文件夹：展示工作区文件（点击直接读盘）
  if (workspaceRoot && workspaceFiles.length > 0) {
    const header = document.createElement("div");
    header.className = "ty-file-group-title";
    header.textContent = `工作区文件 (${workspaceFiles.length})`;
    fileListContainer.appendChild(header);

    workspaceFiles.slice(0, 300).forEach((file) => {
      const row = document.createElement("div");
      row.className = `ty-file-item ty-workspace-file${
        file.path === activeFilePath ? " active" : ""
      }`;
      row.setAttribute("data-workspace-path", file.path);
      row.title = file.relativePath;

      const icon = document.createElement("span");
      icon.className = "ty-file-icon";
      icon.textContent = "📄";

      const label = document.createElement("span");
      label.className = "ty-file-title";
      label.textContent = file.relativePath;

      const actions = document.createElement("span");
      actions.className = "ty-file-row-actions";

      const renameBtn = document.createElement("button");
      renameBtn.className = "ty-file-delete-btn";
      renameBtn.textContent = "✎";
      renameBtn.title = "重命名";
      renameBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        void renameWorkspaceFile(file);
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "ty-file-delete-btn";
      deleteBtn.textContent = "🗑";
      deleteBtn.title = "删除（移入回收站）";
      deleteBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        void deleteWorkspaceFile(file);
      });

      actions.appendChild(renameBtn);
      actions.appendChild(deleteBtn);

      row.appendChild(icon);
      row.appendChild(label);
      row.appendChild(actions);
      row.addEventListener("click", () => void openWorkspaceFile(file.path));
      row.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        void revealPath(file.path);
      });
      fileListContainer.appendChild(row);
    });

    if (workspaceFiles.length > 300) {
      const more = document.createElement("div");
      more.className = "ty-file-group-title";
      more.textContent = `…另有 ${workspaceFiles.length - 300} 个文件，请使用快速打开`;
      fileListContainer.appendChild(more);
    }

    const divider = document.createElement("div");
    divider.className = "ty-file-group-title";
    divider.textContent = "已打开文档";
    fileListContainer.appendChild(divider);
  }

  documents.forEach((doc) => {
    const itemEl = document.createElement("div");
    itemEl.className = `ty-file-item ${doc.id === activeDocId ? "active" : ""}`;
    itemEl.setAttribute("data-id", doc.id);

    const iconSpan = document.createElement("span");
    iconSpan.className = "ty-file-icon";
    iconSpan.textContent = "📄";

    const titleSpan = document.createElement("span");
    titleSpan.className = "ty-file-title";
    titleSpan.textContent = doc.title;
    titleSpan.title = "双击重命名";

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "ty-file-delete-btn";
    deleteBtn.title = "删除文档";
    deleteBtn.setAttribute("data-id", doc.id);
    deleteBtn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      </svg>
    `;

    const startRename = () => {
      const inputEl = document.createElement("input");
      inputEl.type = "text";
      inputEl.className = "ty-file-rename-input";
      inputEl.value = doc.title;

      let finished = false;
      const finishRename = (save: boolean) => {
        if (finished) return;
        finished = true;
        if (save) {
          let newTitle = inputEl.value.trim();
          if (newTitle && newTitle !== doc.title) {
            if (!/\.md$/i.test(newTitle)) {
              newTitle = `${newTitle}.md`;
            }
            doc.title = newTitle;
            doc.updatedAt = Date.now();
            if (doc.id === activeDocId) {
              syncTitle(doc.title);
            }
            scheduleSave();
          }
        }
        renderFileList();
      };

      inputEl.addEventListener("keydown", (ke) => {
        if (ke.key === "Enter") {
          ke.preventDefault();
          finishRename(true);
        } else if (ke.key === "Escape") {
          ke.preventDefault();
          finishRename(false);
        }
      });
      inputEl.addEventListener("blur", () => finishRename(true));
      inputEl.addEventListener("click", (ce) => ce.stopPropagation());
      inputEl.addEventListener("dblclick", (de) => de.stopPropagation());

      itemEl.replaceChild(inputEl, titleSpan);
      deleteBtn.style.display = "none";
      inputEl.focus();
      const dotIdx = doc.title.lastIndexOf(".");
      if (dotIdx > 0) {
        inputEl.setSelectionRange(0, dotIdx);
      } else {
        inputEl.select();
      }
    };

    titleSpan.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      startRename();
    });

    itemEl.addEventListener("dblclick", (e) => {
      if ((e.target as HTMLElement).closest(".ty-file-delete-btn")) return;
      e.stopPropagation();
      startRename();
    });

    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (documents.length <= 1) {
        window.alert("工作区至少需要保留一篇文档");
        return;
      }
      const confirmed = window.confirm(`确定要删除文档 "${doc.title}" 吗？`);
      if (!confirmed) return;

      const isDeletingActive = doc.id === activeDocId;
      const deletedIndex = documents.findIndex((d) => d.id === doc.id);
      documents = documents.filter((d) => d.id !== doc.id);

      if (isDeletingActive) {
        const nextIndex = Math.min(deletedIndex, documents.length - 1);
        const nextDoc = documents[nextIndex];
        activeDocId = nextDoc.id;
        syncTitle(nextDoc.title);
        editor.setMarkdown(nextDoc.content, { resetHistory: true });
        if (isSourceMode) {
          sourceEditor.value = nextDoc.content;
        }
      }

      renderFileList();
      scheduleSave();
    });

    itemEl.addEventListener("click", (e) => {
      if (
        (e.target as HTMLElement).closest(".ty-file-delete-btn") ||
        (e.target as HTMLElement).closest(".ty-file-rename-input")
      ) {
        return;
      }
      switchDocument(doc.id);
    });

    itemEl.appendChild(iconSpan);
    itemEl.appendChild(titleSpan);
    itemEl.appendChild(deleteBtn);
    fileListContainer.appendChild(itemEl);
  });
}

// 切换文档函数
function switchDocument(newDocId: string) {
  if (newDocId === activeDocId) return;

  const result = applyDocumentSwitch({
    documents,
    activeDocId,
    nextDocId: newDocId,
    isSourceMode,
    sourceBuffer: isSourceMode ? sourceEditor.value : null,
    editorMarkdown: editor.getMarkdown(),
  });

  documents = result.documents;
  activeDocId = result.activeDocId;

  const nextDoc = documents.find((d) => d.id === activeDocId)!;
  syncTitle(nextDoc.title);

  editor.setMarkdown(result.contentForNextDoc, { resetHistory: true });
  syncTabsFromDocuments();

  if (isSourceMode) {
    sourceEditor.value = result.contentForNextDoc;
  }

  renderFileList();
  scheduleSave();
}

// 初始渲染文件列表
renderFileList();
syncTabsFromDocuments();

// 渲染实时大纲目录
let outlineHeadings: HeadingItem[] = [];
let outlineQuery = "";
let outlineFilterBound = false;
let outlineCollapseBound = false;
const collapsedOutline = new Set<string>();

function outlineFilterInput(): HTMLInputElement | null {
  return document.getElementById("outline-filter") as HTMLInputElement | null;
}

function bindOutlineToolbar(): void {
  const input = outlineFilterInput();
  if (input && !outlineFilterBound) {
    outlineFilterBound = true;
    input.addEventListener("input", () => {
      outlineQuery = input.value;
      renderOutline(outlineHeadings);
    });
  }

  const collapse = document.getElementById("btn-outline-collapse");
  const expand = document.getElementById("btn-outline-expand");
  if (collapse && expand && !outlineCollapseBound) {
    outlineCollapseBound = true;
    collapse.addEventListener("click", () => {
      outlineHeadings
        .filter((h) => h.level < 4)
        .forEach((h) => collapsedOutline.add(h.id));
      renderOutline(outlineHeadings);
    });
    expand.addEventListener("click", () => {
      collapsedOutline.clear();
      renderOutline(outlineHeadings);
    });
  }
}

function scrollToOutlineItem(item: HTMLElement): void {
  const pos = parseInt(item.getAttribute("data-pos") || "-1", 10);
  if (pos >= 0) editor.scrollToHeading(pos);
}

function highlightOutlineItem(id: string | null): void {
  outlineListEl?.querySelectorAll(".ty-outline-item").forEach((el) => {
    el.classList.toggle("active", el.getAttribute("data-id") === id);
  });
}

let outlineListEl: HTMLElement | null = null;

function renderOutline(headings: HeadingItem[]) {
  outlineHeadings = headings;
  bindOutlineToolbar();
  if (!outlineListEl) outlineListEl = document.getElementById("outline-list");
  const list = outlineListEl;
  if (!list) return;

  list.innerHTML = "";

  if (headings.length === 0) {
    list.innerHTML = `<div class="ty-outline-empty">大纲为空</div>`;
    return;
  }

  const items = headings.map((h, index) => ({
    id: h.id || `heading-${index + 1}`,
    level: h.level,
    text: h.text,
    pos: h.pos,
  }));

  const visible = filterOutline(items, outlineQuery);
  const visibleIds = new Set(visible.map((item) => item.id));

  const renderLevel = (nodes: OutlineNode[], depth: number) => {
    for (const node of nodes) {
      if (!visibleIds.has(node.id)) continue;

      const hasChildren = node.children.some((child) => visibleIds.has(child.id));
      const isCollapsed = collapsedOutline.has(node.id);

      const row = document.createElement("div");
      row.className = `ty-outline-row level-${node.level}`;
      row.setAttribute("data-id", node.id);
      row.setAttribute("data-pos", String(node.pos));

      if (hasChildren) {
        const toggle = document.createElement("span");
        toggle.className = `ty-outline-toggle${isCollapsed ? " is-collapsed" : ""}`;
        toggle.textContent = "▸";
        toggle.addEventListener("click", (event) => {
          event.stopPropagation();
          if (collapsedOutline.has(node.id)) collapsedOutline.delete(node.id);
          else collapsedOutline.add(node.id);
          renderOutline(outlineHeadings);
        });
        row.appendChild(toggle);
      } else {
        const spacer = document.createElement("span");
        spacer.className = "ty-outline-toggle-spacer";
        row.appendChild(spacer);
      }

      const label = document.createElement("a");
      label.className = "ty-outline-item";
      label.setAttribute("data-id", node.id);
      label.setAttribute("data-pos", String(node.pos));
      label.setAttribute("data-level", String(node.level));
      label.textContent = node.text;
      label.title = node.text;
      label.addEventListener("click", () => {
        highlightOutlineItem(node.id);
        scrollToOutlineItem(row);
      });
      row.appendChild(label);

      list.appendChild(row);

      if (hasChildren && !isCollapsed) {
        renderLevel(node.children, depth + 1);
      }
    }
  };

  const tree = buildOutlineTree(items);
  renderLevel(tree, 0);

  if (outlineActiveId) highlightOutlineItem(outlineActiveId);
}

/** 根据光标位置高亮当前标题 */
function syncActiveOutline(cursorPos: number): void {
  if (outlineHeadings.length === 0) return;
  const active = findActiveHeading(
    outlineHeadings.map((h, index) => ({
      id: h.id || `heading-${index + 1}`,
      level: h.level,
      text: h.text,
      pos: h.pos,
    })),
    cursorPos
  );
  setActiveOutlineById(active ? active.id : null);
}

let outlineActiveId: string | null = null;

function setActiveOutlineById(id: string | null): void {
  if (outlineActiveId === id) return;
  outlineActiveId = id;
  highlightOutlineItem(id);
}

// 新建文档按钮与操作
function handleNewFile() {
  const newTitle = uniqueTitle(documents, "未命名文档.md");
  const newDoc = createDocument(newTitle, "");

  documents.push(newDoc);
  renderFileList();
  switchDocument(newDoc.id);
  editor.focus();
}

btnNewFile.addEventListener("click", handleNewFile);

function handleFileOpened(file: DesktopFile) {
  if (isSourceMode) {
    const doc = documents.find((d) => d.id === activeDocId);
    if (doc && doc.content !== sourceEditor.value) {
      doc.content = sourceEditor.value;
      doc.dirty = true;
      doc.updatedAt = Date.now();
    }
  } else {
    const doc = documents.find((d) => d.id === activeDocId);
    const md = editor.getMarkdown();
    if (doc && doc.content !== md) {
      doc.content = md;
      doc.dirty = true;
      doc.updatedAt = Date.now();
    }
  }

  const result = applyOpenedFile(documents, file, activeDocId);
  documents = result.documents;
  activeDocId = result.activeDocId;

  const current = documents.find((d) => d.id === activeDocId)!;
  syncTitle(current.title);
  editor.setMarkdown(current.content, { resetHistory: true });
  if (isSourceMode) {
    sourceEditor.value = current.content;
  }
  renderFileList();
  flushSave();

  if (current.filePath) {
    rememberRecentFile(current.filePath, current.title);
  }
}

async function handleOpenFile() {
  const api = getDesktopAPI();
  if (api) {
    const file = await api.openFile();
    if (file) {
      handleFileOpened(file);
    }
  } else {
    localFileInput.click();
  }
}

/* ================= 文件夹工作区 / 快速打开 ================= */
let quickOpenPanel: QuickOpen | null = null;

function ensureQuickOpen(): QuickOpen {
  if (!quickOpenPanel) {
    quickOpenPanel = new QuickOpen((file) => {
      void openWorkspaceFile(file.path);
    });
    document.body.appendChild(quickOpenPanel.dom);
  }
  return quickOpenPanel;
}

function updateWorkspaceBar(): void {
  if (workspaceRoot) {
    workspaceBar.style.display = "flex";
    workspacePathEl.textContent = workspaceRoot;
    workspacePathEl.title = workspaceRoot;
  } else {
    workspaceBar.style.display = "none";
  }
}

function applyWorkspace(workspace: FolderWorkspace | null): void {
  if (!workspace) return;
  workspaceRoot = workspace.root;
  workspaceFiles = workspace.files;
  updateWorkspaceBar();
  ensureQuickOpen().setFiles(workspaceFiles);
  renderFileList();
  rememberLastFolder(workspace.root);
}

async function handleOpenFolder(): Promise<void> {
  const api = getDesktopAPI();
  if (!api?.openFolder) {
    window.alert("「打开文件夹」仅桌面版可用，Web 版请使用「打开本地」。");
    return;
  }
  const workspace = await openFolderWorkspace();
  if (workspace) {
    applyWorkspace(workspace);
  }
}

async function openWorkspaceFile(path: string): Promise<void> {
  const api = getDesktopAPI();
  if (!api?.readFile) return;
  const file = await api.readFile(path);
  if (file) {
    activeFilePath = path;
    handleFileOpened(file);
    renderFileList();
    rememberRecentFile(file.path, extractFileName(file.path));
  }
}

/* ================= 外部修改检测 ================= */
const trackedFiles = new Map<string, TrackedFile>();

async function refreshTrackedFile(docId: string, path: string): Promise<void> {
  const stat = await getFileStat(path);
  if (!stat) {
    trackedFiles.delete(docId);
    return;
  }
  const existing = trackedFiles.get(docId);
  trackedFiles.set(
    docId,
    existing && existing.path === path
      ? markLocalWrite(existing, stat)
      : createTrackedFile(docId, stat)
  );
}

async function pollExternalChanges(): Promise<void> {
  if (isSourceMode) return;
  const api = getDesktopAPI();
  if (!api?.statFile) return;

  for (const [docId, tracked] of Array.from(trackedFiles.entries())) {
    const stat = await getFileStat(tracked.path);
    if (!stat) continue;
    if (!hasExternalChange(tracked, stat)) continue;

    const doc = documents.find((d) => d.id === docId);
    if (!doc) {
      trackedFiles.delete(docId);
      continue;
    }

    const reload = window.confirm(
      `「${doc.title}」已在外部被修改。是否重新载入磁盘内容？（选择取消则保留当前编辑）`
    );
    if (!reload) {
      trackedFiles.set(docId, markLocalWrite(tracked, stat));
      continue;
    }

    const file = await api.readFile?.(tracked.path);
    if (!file) {
      trackedFiles.set(docId, markLocalWrite(tracked, stat));
      continue;
    }

    documents = applyReload(documents, docId, file.content);
    if (docId === activeDocId) {
      editor.setMarkdown(file.content, { resetHistory: true });
      if (isSourceMode) sourceEditor.value = file.content;
      syncTitle(doc.title);
    }
    renderFileList();
    flushSave();
    trackedFiles.set(docId, markLocalWrite(tracked, stat));
  }
}

async function handleCreateWorkspaceFile(): Promise<void> {
  if (!workspaceRoot) return;
  const name = window.prompt("新建文档名称", "未命名.md");
  if (name === null) return;
  const existing = workspaceFiles.map((f) => f.name);
  const result = await createMarkdownFile(workspaceRoot, name, existing);
  if (!result.ok || !result.path) {
    window.alert(`新建失败：${result.error ?? "未知错误"}`);
    return;
  }
  await refreshWorkspace();
  await openWorkspaceFile(result.path);
}

async function renameWorkspaceFile(file: FlatFile): Promise<void> {
  if (!workspaceRoot) return;
  const next = window.prompt("重命名文件", file.name);
  if (next === null) return;
  const trimmed = next.trim();
  if (!trimmed || trimmed === file.name) return;
  if (!isValidFileName(trimmed)) {
    window.alert("文件名包含非法字符");
    return;
  }

  const target = normalizeMarkdownFileName(trimmed);
  if (workspaceFiles.some((f) => f.path !== file.path && f.name === target)) {
    window.alert("同名文件已存在");
    return;
  }

  const toPath = joinPath(workspaceRoot, target);
  const result = await renamePath(file.path, toPath);
  if (!result.ok) {
    window.alert(`重命名失败：${result.error ?? "未知错误"}`);
    return;
  }

  const doc = documents.find((d) => d.filePath === file.path);
  if (doc) {
    documents = markDocumentSaved(documents, doc.id, toPath);
    doc.title = target;
    if (doc.id === activeDocId) syncTitle(target);
  }
  if (activeFilePath === file.path) activeFilePath = toPath;

  await refreshWorkspace();
  renderFileList();
  flushSave();
}

async function deleteWorkspaceFile(file: FlatFile): Promise<void> {
  const confirmed = window.confirm(`确定要将「${file.relativePath}」移入回收站吗？`);
  if (!confirmed) return;

  const result = await trashPath(file.path);
  if (!result.ok) {
    window.alert(`删除失败：${result.error ?? "未知错误"}`);
    return;
  }

  const doc = documents.find((d) => d.filePath === file.path);
  if (doc) {
    documents = documents.filter((d) => d.id !== doc.id);
    if (activeDocId === doc.id && documents.length > 0) {
      activeDocId = documents[0].id;
      syncTitle(documents[0].title);
      editor.setMarkdown(documents[0].content, { resetHistory: true });
    }
  }
  if (activeFilePath === file.path) activeFilePath = null;

  await refreshWorkspace();
  renderFileList();
  flushSave();
}

async function refreshWorkspace(): Promise<void> {
  if (!workspaceRoot) return;
  const workspace = await refreshFolderWorkspace(workspaceRoot);
  if (workspace) {
    applyWorkspace(workspace);
  }
}

btnOpenFolder.addEventListener("click", () => void handleOpenFolder());
btnQuickOpen.addEventListener("click", () => {
  const panel = ensureQuickOpen();
  if (panel.isOpen()) panel.close();
  else panel.open();
});
btnRefreshFolder.addEventListener("click", () => void refreshWorkspace());
btnNewWorkspaceFile.addEventListener("click", () => void handleCreateWorkspaceFile());
btnCloseFolder.addEventListener("click", () => {
  workspaceRoot = null;
  workspaceFiles = [];
  ensureQuickOpen().setFiles([]);
  rememberLastFolder(null);
  updateWorkspaceBar();
  renderFileList();
});
updateWorkspaceBar();

// 打开本地 Markdown 文件
btnOpenFile.addEventListener("click", () => {
  void handleOpenFile();
});

localFileInput.addEventListener("change", (e) => {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const content = event.target?.result as string;
    const title = uniqueTitle(documents, file.name);
    const newDoc = createDocument(title, content);
    documents.push(newDoc);
    renderFileList();
    switchDocument(newDoc.id);
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
    const doc = documents.find((d) => d.id === activeDocId);
    if (doc && doc.content !== sourceEditor.value) {
      doc.content = sourceEditor.value;
      doc.dirty = true;
      doc.updatedAt = Date.now();
      scheduleSave();
    }
    sourceEditor.classList.remove("visible");
    btnToggleSource.classList.remove("active");
    editor.focus();
  }
}

btnToggleSource.addEventListener("click", toggleSourceMode);

function handleOpenInsertTable() {
  if (isSourceMode) {
    toggleSourceMode();
  }
  openTableInsertDialog((rows, cols) => {
    editor.insertTable(rows, cols);
  });
}

btnInsertTable.addEventListener("click", handleOpenInsertTable);

async function handleSave() {
  if (isSourceMode) {
    const doc = documents.find((d) => d.id === activeDocId);
    if (doc && doc.content !== sourceEditor.value) {
      doc.content = sourceEditor.value;
      doc.dirty = true;
      doc.updatedAt = Date.now();
      scheduleSave();
    }
  }

  const api = getDesktopAPI();
  if (api) {
    const currentDoc = documents.find((d) => d.id === activeDocId);
    if (!currentDoc) return;
    const content = isSourceMode ? sourceEditor.value : editor.getMarkdown();
    let result: { path: string } | null = null;
    if (currentDoc.filePath) {
      result = await api.saveFile({ path: currentDoc.filePath, content });
    } else {
      const suggestedName = suggestedSaveName(documents, activeDocId);
      result = await api.saveFile({ content, suggestedName });
    }
    if (result && result.path) {
      documents = markDocumentSaved(documents, currentDoc.id, result.path);
      const fileName = extractFileName(result.path);
      const doc = documents.find((d) => d.id === currentDoc.id);
      if (doc && (!currentDoc.filePath || doc.title !== fileName)) {
        doc.title = fileName;
      }
      syncTitle(doc ? doc.title : currentDoc.title);
      renderFileList();
      flushSave();
      void refreshTrackedFile(currentDoc.id, result.path);
    }
  } else {
    downloadMarkdown();
  }
}

async function handleSaveAs() {
  if (isSourceMode) {
    const doc = documents.find((d) => d.id === activeDocId);
    if (doc && doc.content !== sourceEditor.value) {
      doc.content = sourceEditor.value;
      doc.dirty = true;
      doc.updatedAt = Date.now();
      scheduleSave();
    }
  }

  const api = getDesktopAPI();
  if (api) {
    const currentDoc = documents.find((d) => d.id === activeDocId);
    if (!currentDoc) return;
    const content = isSourceMode ? sourceEditor.value : editor.getMarkdown();
    const suggestedName = suggestedSaveName(documents, activeDocId);
    const result = await api.saveFile({ content, suggestedName });
    if (result && result.path) {
      documents = markDocumentSaved(documents, currentDoc.id, result.path);
      const fileName = extractFileName(result.path);
      const doc = documents.find((d) => d.id === currentDoc.id);
      if (doc && doc.title !== fileName) {
        doc.title = fileName;
      }
      syncTitle(doc ? doc.title : currentDoc.title);
      renderFileList();
      flushSave();
      void refreshTrackedFile(currentDoc.id, result.path);
    }
  } else {
    downloadMarkdown();
  }
}

window.addEventListener("keydown", (e) => {
  // 快速打开 (Ctrl+P)
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "p") {
    e.preventDefault();
    const panel = ensureQuickOpen();
    if (panel.isOpen()) panel.close();
    else panel.open();
    return;
  }
  // 打开文件夹 (Ctrl+Shift+O)
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "o") {
    e.preventDefault();
    void handleOpenFolder();
    return;
  }
  // 查找 / 替换 (Ctrl+F / Ctrl+H)
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
    e.preventDefault();
    editor.toggleSearch(false);
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "h") {
    e.preventDefault();
    editor.openSearch(true);
    return;
  }
  // 插入表格快捷键 (Ctrl+Alt+T / Cmd+Alt+T)
  if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === "t") {
    e.preventDefault();
    handleOpenInsertTable();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "/") {
    e.preventDefault();
    toggleSourceMode();
    return;
  }
  // Ctrl+S / Ctrl+Shift+S 保存文件
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    if (e.shiftKey) {
      void handleSaveAs();
    } else {
      void handleSave();
    }
  }
});

// 导出/保存 Markdown 功能实现 (支持识别 MarkWeave 形式 Mermaid 并提供双重兼容选项)
function hasMarkWeaveMermaid(markdown: string): boolean {
  return (
    /%%\s*\{(?:typemark|markweave)_positions:.*?\}\s*%%/.test(markdown) ||
    /%%\{init:\s*\{.*?\}\s*\}\s*%%/.test(markdown)
  );
}

function cleanMermaidForCompatibility(markdown: string): string {
  // 彻底清洗并剥离 MarkWeave 专有位置注释与自定义 init，生成 100% 外部通用标准语法
  return markdown
    .replace(/%%\s*\{(?:typemark|markweave)_positions:.*?\}\s*%%\n?/g, "")
    .replace(/%%\{init:\s*\{.*?\}\s*\}\s*%%\n?/g, "");
}

function doDownloadFile(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function showExportModal(rawContent: string, defaultFilename: string) {
  document.querySelector(".ty-modal-overlay")?.remove();

  const overlay = document.createElement("div");
  overlay.className = "ty-modal-overlay";
  overlay.innerHTML = `
    <div class="ty-modal-card">
      <div class="ty-modal-header">
        <span class="ty-modal-icon">📦</span>
        <h3>导出 Markdown 格式选项</h3>
      </div>
      <p class="ty-modal-desc">
        系统检测到当前文档中包含通过 <strong>MarkWeave</strong> 自定义拖拽排版的 Mermaid 图表。请根据您的使用场景选择导出方式：
      </p>
      <div class="ty-export-options">
        <label class="ty-export-option-card selected" id="opt-card-markweave">
          <input type="radio" name="export-mode" value="markweave" checked />
          <div class="ty-export-option-content">
            <div class="ty-export-option-title">🎨 导出 MarkWeave 增强格式（保留排版操作）</div>
            <div class="ty-export-option-desc">完整保留您对图表组件拖拽的位置微调与排版元数据。未来在 MarkWeave 中打开可无损恢复您调整的布局，继续可视化编辑。</div>
          </div>
        </label>
        <label class="ty-export-option-card" id="opt-card-compat">
          <input type="radio" name="export-mode" value="compatible" />
          <div class="ty-export-option-content">
            <div class="ty-export-option-title">🌐 导出通用兼容格式 (Clean Mermaid)</div>
            <div class="ty-export-option-desc">自动清洗并剥离专有排版注释，转换为纯净的标准 Mermaid 语法。确保在 GitHub、Typora、Notion、Obsidian 等第三方平台 100% 正常渲染。</div>
          </div>
        </label>
      </div>
      <div class="ty-modal-footer">
        <button class="ty-btn" id="btn-cancel-export">取消</button>
        <button class="ty-btn ty-btn-primary" id="btn-confirm-export">确认导出</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const cardMarkweave = overlay.querySelector("#opt-card-markweave") as HTMLElement;
  const cardCompat = overlay.querySelector("#opt-card-compat") as HTMLElement;
  const radioMarkweave = overlay.querySelector('input[value="markweave"]') as HTMLInputElement;
  const radioCompat = overlay.querySelector('input[value="compatible"]') as HTMLInputElement;
  const btnCancel = overlay.querySelector("#btn-cancel-export") as HTMLButtonElement;
  const btnConfirm = overlay.querySelector("#btn-confirm-export") as HTMLButtonElement;

  cardMarkweave.addEventListener("click", () => {
    radioMarkweave.checked = true;
    cardMarkweave.classList.add("selected");
    cardCompat.classList.remove("selected");
  });

  cardCompat.addEventListener("click", () => {
    radioCompat.checked = true;
    cardCompat.classList.add("selected");
    cardMarkweave.classList.remove("selected");
  });

  const close = () => {
    overlay.remove();
  };

  btnCancel.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  btnConfirm.addEventListener("click", () => {
    const isCompat = radioCompat.checked;
    close();
    if (isCompat) {
      const cleanContent = cleanMermaidForCompatibility(rawContent);
      doDownloadFile(cleanContent, defaultFilename);
    } else {
      doDownloadFile(rawContent, defaultFilename);
    }
  });
}

function downloadMarkdown() {
  const currentDoc = documents.find((d) => d.id === activeDocId);
  const content = isSourceMode ? sourceEditor.value : editor.getMarkdown();
  const filename = currentDoc ? currentDoc.title : "document.md";

  const exportPolicy = localStorage.getItem("markweave_default_export_policy") || "ask";

  if (hasMarkWeaveMermaid(content)) {
    if (exportPolicy === "markweave") {
      doDownloadFile(content, filename);
    } else if (exportPolicy === "compatible") {
      const cleanContent = cleanMermaidForCompatibility(content);
      doDownloadFile(cleanContent, filename);
    } else {
      // 识别到 MarkWeave 形式 Mermaid，提示用户双重导出方式
      showExportModal(content, filename);
    }
  } else {
    // 纯文本无专有标记，直接导出
    doDownloadFile(content, filename);
  }
}

(window as any).__MARKWEAVE_EXPORT__ = {
  hasMarkWeaveMermaid,
  cleanMermaidForCompatibility,
  downloadMarkdown,
  showExportModal,
};

export interface MarkWeaveSettings {
  mermaidDefaultMode: "custom" | "standard";
  mermaidDefaultCurve: "step-round" | "step" | "basis" | "linear";
  mermaidTheme: MermaidThemePreference;
  gridSnap: boolean;
  exportScale: number;
  fontSize: string;
  lineHeight: string;
  fontFamily: string;
  exportPolicy: "ask" | "markweave" | "compatible";
  theme: ThemeSetting;
  language: Language;
  editorTheme: string;
  pdf: PdfOptions;
}

function loadPdfOptions(): PdfOptions {
  try {
    const raw = localStorage.getItem("markweave_pdf_options");
    if (!raw) return DEFAULT_PDF_OPTIONS;
    return normalizePdfOptions(JSON.parse(raw));
  } catch {
    return DEFAULT_PDF_OPTIONS;
  }
}

function loadSettings(): MarkWeaveSettings {
  return {
    mermaidDefaultMode: (localStorage.getItem("markweave_mermaid_default_mode") as any) || "custom",
    mermaidDefaultCurve: (localStorage.getItem("markweave_mermaid_default_curve") as any) || "step-round",
    mermaidTheme: normalizeMermaidTheme(localStorage.getItem("markweave_mermaid_theme")),
    gridSnap: localStorage.getItem("markweave_grid_snap") !== "false",
    exportScale: parseInt(localStorage.getItem("markweave_export_scale") || "2", 10) || 2,
    fontSize: localStorage.getItem("markweave_font_size") || "16px",
    lineHeight: localStorage.getItem("markweave_line_height") || "1.65",
    fontFamily: localStorage.getItem("markweave_font_family") || "default",
    exportPolicy: (localStorage.getItem("markweave_default_export_policy") as any) || "ask",
    theme: (localStorage.getItem("markweave_theme") as any) || "light",
    language: normalizeLanguage(localStorage.getItem("markweave_language")),
    editorTheme: normalizeThemeId(localStorage.getItem("markweave_editor_theme")),
    pdf: normalizePdfOptions(loadPdfOptions()),
  };
}

function saveSettings(settings: MarkWeaveSettings) {
  localStorage.setItem("markweave_mermaid_default_mode", settings.mermaidDefaultMode);
  localStorage.setItem("markweave_mermaid_default_curve", settings.mermaidDefaultCurve);
  localStorage.setItem("markweave_mermaid_theme", settings.mermaidTheme);
  localStorage.setItem("markweave_grid_snap", String(settings.gridSnap));
  localStorage.setItem("markweave_export_scale", String(settings.exportScale));
  localStorage.setItem("markweave_font_size", settings.fontSize);
  localStorage.setItem("markweave_line_height", settings.lineHeight);
  localStorage.setItem("markweave_font_family", settings.fontFamily);
  localStorage.setItem("markweave_default_export_policy", settings.exportPolicy);
  localStorage.setItem("markweave_theme", settings.theme);
  localStorage.setItem("markweave_language", settings.language);
  localStorage.setItem("markweave_editor_theme", settings.editorTheme);
  localStorage.setItem("markweave_pdf_options", JSON.stringify(settings.pdf));

  applySettings(settings);
}

let currentMermaidThemePreference: MermaidThemePreference = normalizeMermaidTheme(
  typeof localStorage !== "undefined" ? localStorage.getItem("markweave_mermaid_theme") : "auto"
);

function applySettings(settings: MarkWeaveSettings) {
  const root = document.documentElement;
  root.style.setProperty("--editor-font-size", settings.fontSize);
  root.style.setProperty("--editor-line-height", settings.lineHeight);

  if (settings.fontFamily === "serif") {
    root.style.setProperty("--editor-font-family", "Georgia, 'Songti SC', SimSun, serif");
  } else if (settings.fontFamily === "pingfang") {
    root.style.setProperty("--editor-font-family", "'PingFang SC', 'Microsoft YaHei', sans-serif");
  } else if (settings.fontFamily === "lxgw") {
    root.style.setProperty("--editor-font-family", "'LXGW WenKai', 'Kaiti SC', KaiTi, STKaiti, serif");
  } else {
    root.style.setProperty("--editor-font-family", "var(--font-family)");
  }

  // 主题应用
  const wasNight = document.body.classList.contains("theme-night");
  const prefersDark = Boolean(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const effectiveTheme = resolveTheme(settings.theme, prefersDark);
  const isNight = effectiveTheme === "night";

  document.body.classList.toggle("theme-night", isNight);

  if (wasNight !== isNight) {
    window.dispatchEvent(new CustomEvent("theme-change"));
  }

  applyBuiltInTheme(settings.editorTheme);

  const api = getDesktopAPI();
  if (api && typeof api.setLanguage === "function") {
    void api.setLanguage(settings.language);
  }

  const previousMermaidTheme = currentMermaidThemePreference;
  currentMermaidThemePreference = settings.mermaidTheme;
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("markweave_mermaid_theme", settings.mermaidTheme);
  }

  if (previousMermaidTheme !== settings.mermaidTheme) {
    window.dispatchEvent(
      new CustomEvent("markweave-mermaid-theme-change", { detail: settings.mermaidTheme })
    );
  }

  window.dispatchEvent(
    new CustomEvent("markweave-default-mode-change", { detail: { mode: settings.mermaidDefaultMode } })
  );
  window.dispatchEvent(
    new CustomEvent("markweave-settings-updated", { detail: settings })
  );
}

/**
 * 偏好设置面板 (Settings Modal)
 * 提供分类清晰的多 Tab 导航与丰富的图表、排版、主题、导出设置
 */
function openSettingsModal() {
  const currentSettings = loadSettings();

  const modalOverlay = document.createElement("div");
  modalOverlay.className = "ty-modal-overlay";
  modalOverlay.id = "settings-modal-overlay";

  modalOverlay.innerHTML = `
    <div class="ty-modal-card ty-settings-dialog">
      <div class="ty-modal-header">
        <div class="ty-modal-title" style="display: flex; align-items: center; gap: 8px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
          偏好设置 (Preferences)
        </div>
        <button class="ty-modal-close" id="btn-close-settings-x">&times;</button>
      </div>

      <div class="ty-settings-nav" id="settings-tabs-nav">
        <button class="ty-settings-tab-btn active" data-tab="charts">📊 图表设置</button>
        <button class="ty-settings-tab-btn" data-tab="editor">✍️ 编辑排版</button>
        <button class="ty-settings-tab-btn" data-tab="appearance">🎨 外观主题</button>
        <button class="ty-settings-tab-btn" data-tab="storage">📁 存储与导出</button>
        <button class="ty-settings-tab-btn" data-tab="about">ℹ️ 关于系统</button>
      </div>

      <div class="ty-modal-body" style="overflow-y: auto; max-height: 56vh; padding-right: 6px;">
        <!-- Tab 1: 图表设置 -->
        <div class="ty-settings-panel active" id="tab-panel-charts">
          <div class="ty-settings-section-title">Mermaid 图表默认预览模式</div>
          <div style="font-size: 12px; color: #777; margin-bottom: 10px; line-height: 1.45;">
            控制新加载或创建 Markdown 图表时的默认渲染引擎与交互体系：
          </div>

          <div class="ty-export-options">
            <label class="ty-export-option-card ${currentSettings.mermaidDefaultMode === "custom" ? "selected" : ""}" id="setting-card-custom">
              <input type="radio" name="mermaid-default-mode" value="custom" ${currentSettings.mermaidDefaultMode === "custom" ? "checked" : ""} />
              <div class="ty-export-option-content">
                <div class="ty-export-option-title">
                  ✨ 增强模式 (MarkWeave 样式) <span style="font-size: 11px; color: var(--primary-color); background: rgba(66, 133, 244, 0.1); padding: 1px 6px; border-radius: 4px; margin-left: 4px;">默认推荐</span>
                </div>
                <div class="ty-export-option-desc">
                  展示 MarkWeave 独创样式与全部功能，支持拖拽排版、正交拐角圆弧/直角折线、箭头反转、行内修改连线文字等完整功能。
                </div>
              </div>
            </label>

            <label class="ty-export-option-card ${currentSettings.mermaidDefaultMode === "standard" ? "selected" : ""}" id="setting-card-standard">
              <input type="radio" name="mermaid-default-mode" value="standard" ${currentSettings.mermaidDefaultMode === "standard" ? "checked" : ""} />
              <div class="ty-export-option-content">
                <div class="ty-export-option-title">
                  🌐 兼容模式 (主流标准样式)
                </div>
                <div class="ty-export-option-desc">
                  展示主流标准 Mermaid 样式，仅保留纵横向排布转换功能，保证与 GitHub、Typora 等平台预览完全一致。
                </div>
              </div>
            </label>
          </div>

          <div class="ty-settings-row" style="margin-top: 14px;">
            <div class="ty-settings-info">
              <span class="ty-settings-label">默认折线拐角风格</span>
              <span class="ty-settings-desc">新图表或未指定 curve 时默认连线形态</span>
            </div>
            <select class="ty-settings-select" id="setting-select-curve">
              <option value="step-round" ${currentSettings.mermaidDefaultCurve === "step-round" ? "selected" : ""}>正交圆角折线 (Rounded Step, 推荐)</option>
              <option value="step" ${currentSettings.mermaidDefaultCurve === "step" ? "selected" : ""}>正交直角折线 (Orthogonal Step)</option>
              <option value="basis" ${currentSettings.mermaidDefaultCurve === "basis" ? "selected" : ""}>平滑贝塞尔曲线 (Smooth Curve)</option>
              <option value="linear" ${currentSettings.mermaidDefaultCurve === "linear" ? "selected" : ""}>经典折线/直线 (Linear)</option>
            </select>
          </div>

          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">节点拖拽吸附网格</span>
              <span class="ty-settings-desc">拖拽节点时自动吸附对齐到 10px 网格，连线更规整</span>
            </div>
            <label class="ty-settings-toggle">
              <input type="checkbox" id="setting-toggle-grid" ${currentSettings.gridSnap ? "checked" : ""} />
              <span class="ty-toggle-slider"></span>
            </label>
          </div>

          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">预览图复制分辨率</span>
              <span class="ty-settings-desc">在预览模式下一键复制图片到剪贴板的分辨率倍数</span>
            </div>
            <select class="ty-settings-select" id="setting-select-scale">
              <option value="1" ${currentSettings.exportScale === 1 ? "selected" : ""}>标准清晰度 (1x / 72 DPI)</option>
              <option value="2" ${currentSettings.exportScale === 2 ? "selected" : ""}>Retina 视网膜高清 (2x / 144 DPI, 推荐)</option>
              <option value="3" ${currentSettings.exportScale === 3 ? "selected" : ""}>出版印刷超清 (3x / 216 DPI)</option>
            </select>
          </div>

          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">Mermaid 主题</span>
              <span class="ty-settings-desc">设置 Mermaid 图表渲染色彩模式</span>
            </div>
            <select class="ty-settings-select" id="setting-select-mermaid-theme">
              <option value="auto" ${currentSettings.mermaidTheme === "auto" ? "selected" : ""}>跟随界面主题（默认）</option>
              <option value="light" ${currentSettings.mermaidTheme === "light" ? "selected" : ""}>始终浅色（推荐夜间使用）</option>
              <option value="dark" ${currentSettings.mermaidTheme === "dark" ? "selected" : ""}>始终深色</option>
            </select>
          </div>
        </div>

        <!-- Tab 2: 编辑排版 -->
        <div class="ty-settings-panel" id="tab-panel-editor">
          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">正文字体大小</span>
              <span class="ty-settings-desc">主编辑区域段落与正文的渲染字号</span>
            </div>
            <select class="ty-settings-select" id="setting-select-font-size">
              <option value="14px" ${currentSettings.fontSize === "14px" ? "selected" : ""}>14px (精致紧凑)</option>
              <option value="15px" ${currentSettings.fontSize === "15px" ? "selected" : ""}>15px (小巧)</option>
              <option value="16px" ${currentSettings.fontSize === "16px" ? "selected" : ""}>16px (默认推荐)</option>
              <option value="18px" ${currentSettings.fontSize === "18px" ? "selected" : ""}>18px (舒适大号)</option>
              <option value="20px" ${currentSettings.fontSize === "20px" ? "selected" : ""}>20px (醒目演示)</option>
            </select>
          </div>

          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">正文行间距</span>
              <span class="ty-settings-desc">段落文字的垂直行高比例</span>
            </div>
            <select class="ty-settings-select" id="setting-select-line-height">
              <option value="1.5" ${currentSettings.lineHeight === "1.5" ? "selected" : ""}>1.5 (紧凑)</option>
              <option value="1.65" ${currentSettings.lineHeight === "1.65" ? "selected" : ""}>1.65 (标准 Typora)</option>
              <option value="1.8" ${currentSettings.lineHeight === "1.8" ? "selected" : ""}>1.8 (宽松舒适)</option>
              <option value="2.0" ${currentSettings.lineHeight === "2.0" ? "selected" : ""}>2.0 (双倍行距)</option>
            </select>
          </div>

          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">正文字体族</span>
              <span class="ty-settings-desc">渲染文章所用的主要字体方案</span>
            </div>
            <select class="ty-settings-select" id="setting-select-font-family">
              <option value="default" ${currentSettings.fontFamily === "default" ? "selected" : ""}>系统原生无衬线 (System Default)</option>
              <option value="pingfang" ${currentSettings.fontFamily === "pingfang" ? "selected" : ""}>苹方 / 微软雅黑 (Modern UI)</option>
              <option value="serif" ${currentSettings.fontFamily === "serif" ? "selected" : ""}>宋体 / 优雅衬线 (Elegant Serif)</option>
              <option value="lxgw" ${currentSettings.fontFamily === "lxgw" ? "selected" : ""}>霞鹜文楷风格 / 楷体 (Chinese KaiTi)</option>
            </select>
          </div>
        </div>

        <!-- Tab 3: 外观主题 -->
        <div class="ty-settings-panel" id="tab-panel-appearance">
          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">界面主题模式</span>
              <span class="ty-settings-desc">选择编辑器的色彩外观风格</span>
            </div>
            <select class="ty-settings-select" id="setting-select-theme">
              <option value="light" ${currentSettings.theme === "light" ? "selected" : ""}>Typora 浅色明亮</option>
              <option value="night" ${currentSettings.theme === "night" ? "selected" : ""}>夜间深色模式 (Night)</option>
              <option value="system" ${currentSettings.theme === "system" ? "selected" : ""}>跟随系统自动切换</option>
            </select>
          </div>

          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">排版主题</span>
              <span class="ty-settings-desc">选择正文字体与排版风格（移植自 Typora 内置主题）</span>
            </div>
            <select class="ty-settings-select" id="setting-select-editor-theme">
              ${BUILT_IN_THEMES.map(
                (theme) =>
                  `<option value="${theme.id}" ${
                    currentSettings.editorTheme === theme.id ? "selected" : ""
                  }>${theme.label}</option>`
              ).join("")}
            </select>
          </div>

          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">菜单栏语言 / Menu language</span>
              <span class="ty-settings-desc">设置桌面原生菜单栏语言（Web 端不受影响）</span>
            </div>
            <select class="ty-settings-select" id="setting-select-language">
              <option value="zh" ${currentSettings.language === "zh" ? "selected" : ""}>中文（默认）</option>
              <option value="en" ${currentSettings.language === "en" ? "selected" : ""}>English</option>
            </select>
          </div>
        </div>

        <!-- Tab 4: 存储与导出 -->
        <div class="ty-settings-panel" id="tab-panel-storage">
          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">导出 Markdown 默认行为</span>
              <span class="ty-settings-desc">导出含 MarkWeave 排版图表时的默认处理机制</span>
            </div>
            <select class="ty-settings-select" id="setting-select-export-policy">
              <option value="ask" ${currentSettings.exportPolicy === "ask" ? "selected" : ""}>检测到自定义排版时弹窗选择 (推荐)</option>
              <option value="markweave" ${currentSettings.exportPolicy === "markweave" ? "selected" : ""}>优先保留 MarkWeave 增强排版</option>
              <option value="compatible" ${currentSettings.exportPolicy === "compatible" ? "selected" : ""}>始终清洗为通用兼容 Mermaid</option>
            </select>
          </div>

          <div class="ty-settings-section-title" style="margin-top: 18px;">PDF 导出</div>
          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">纸张尺寸</span>
              <span class="ty-settings-desc">导出 PDF 时使用的页面大小</span>
            </div>
            <select class="ty-settings-select" id="setting-select-paper">
              ${(["A4", "A3", "Letter", "Legal", "Tabloid"] as const)
                .map(
                  (size) =>
                    `<option value="${size}" ${
                      currentSettings.pdf.paper === size ? "selected" : ""
                    }>${size}</option>`
                )
                .join("")}
            </select>
          </div>

          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">横向排版</span>
              <span class="ty-settings-desc">以横向纸张导出</span>
            </div>
            <label class="ty-settings-toggle">
              <input type="checkbox" id="setting-pdf-landscape" ${
                currentSettings.pdf.landscape ? "checked" : ""
              } />
              <span class="ty-toggle-slider"></span>
            </label>
          </div>

          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">打印背景色</span>
              <span class="ty-settings-desc">保留代码块、表头与高亮的底色</span>
            </div>
            <label class="ty-settings-toggle">
              <input type="checkbox" id="setting-pdf-background" ${
                currentSettings.pdf.printBackground ? "checked" : ""
              } />
              <span class="ty-toggle-slider"></span>
            </label>
          </div>
        </div>

        <!-- Tab 5: 关于系统 -->
        <div class="ty-settings-panel" id="tab-panel-about">
          <div style="text-align: center; padding: 18px 0 10px;">
            <h2 style="font-size: 22px; font-weight: 700; color: var(--text-color); margin-bottom: 4px;">MarkWeave</h2>
            <div style="font-size: 13px; color: var(--primary-color); font-weight: 500; margin-bottom: 16px;">v0.2.0 • 交互式 Markdown 绘图编辑器</div>
            <p style="font-size: 13px; color: #666; line-height: 1.6; max-width: 480px; margin: 0 auto 20px;">
              MarkWeave 是下一代所见即所得 Markdown 编辑器。首创 Mermaid 图表可视化拖拽节点、拐角平滑圆角、任意箭头换向、文字原地修改，并无缝兼容主流标准。
            </p>
            <div style="display: flex; justify-content: center; gap: 12px;">
              <a href="https://github.com/ZFHNB/MarkWeave.git" target="_blank" class="ty-btn" style="text-decoration: none; display: inline-flex; align-items: center; gap: 6px;">
                <span>🌐</span> GitHub 仓库
              </a>
            </div>
          </div>
        </div>
      </div>

      <div class="ty-modal-footer">
        <button class="ty-btn" id="btn-cancel-settings">取消</button>
        <button class="ty-btn ty-btn-primary" id="btn-save-settings">保存并应用</button>
      </div>
    </div>
  `;

  document.body.appendChild(modalOverlay);

  // Tab 切换交互
  const tabBtns = modalOverlay.querySelectorAll<HTMLButtonElement>(".ty-settings-tab-btn");
  const tabPanels = modalOverlay.querySelectorAll<HTMLElement>(".ty-settings-panel");
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetTab = btn.getAttribute("data-tab");
      tabBtns.forEach((b) => b.classList.toggle("active", b === btn));
      tabPanels.forEach((p) => p.classList.toggle("active", p.id === `tab-panel-${targetTab}`));
    });
  });

  const cardCustom = modalOverlay.querySelector("#setting-card-custom") as HTMLElement;
  const cardStandard = modalOverlay.querySelector("#setting-card-standard") as HTMLElement;
  const radioCustom = cardCustom?.querySelector("input") as HTMLInputElement;
  const radioStandard = cardStandard?.querySelector("input") as HTMLInputElement;

  cardCustom?.addEventListener("click", () => {
    if (radioCustom) radioCustom.checked = true;
    cardCustom.classList.add("selected");
    cardStandard?.classList.remove("selected");
  });

  cardStandard?.addEventListener("click", () => {
    if (radioStandard) radioStandard.checked = true;
    cardStandard.classList.add("selected");
    cardCustom?.classList.remove("selected");
  });

  const closeModal = () => modalOverlay.remove();

  modalOverlay.querySelector("#btn-close-settings-x")?.addEventListener("click", closeModal);
  modalOverlay.querySelector("#btn-cancel-settings")?.addEventListener("click", closeModal);
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  modalOverlay.querySelector("#btn-save-settings")?.addEventListener("click", () => {
    const selectedMode = radioStandard?.checked ? "standard" : "custom";
    const selectCurve = ((modalOverlay.querySelector("#setting-select-curve") as HTMLSelectElement)?.value as any) || "step-round";
    const toggleGrid = (modalOverlay.querySelector("#setting-toggle-grid") as HTMLInputElement)?.checked ?? true;
    const selectScale = parseInt((modalOverlay.querySelector("#setting-select-scale") as HTMLSelectElement)?.value || "2", 10) || 2;
    const selectFontSize = (modalOverlay.querySelector("#setting-select-font-size") as HTMLSelectElement)?.value || "16px";
    const selectLineHeight = (modalOverlay.querySelector("#setting-select-line-height") as HTMLSelectElement)?.value || "1.65";
    const selectFontFamily = (modalOverlay.querySelector("#setting-select-font-family") as HTMLSelectElement)?.value || "default";
    const selectExportPolicy = ((modalOverlay.querySelector("#setting-select-export-policy") as HTMLSelectElement)?.value as any) || "ask";
    const selectTheme = ((modalOverlay.querySelector("#setting-select-theme") as HTMLSelectElement)?.value as any) || "light";
    const selectLanguage = normalizeLanguage((modalOverlay.querySelector("#setting-select-language") as HTMLSelectElement)?.value);
    const selectMermaidTheme = normalizeMermaidTheme((modalOverlay.querySelector("#setting-select-mermaid-theme") as HTMLSelectElement)?.value);
    const selectEditorTheme = normalizeThemeId((modalOverlay.querySelector("#setting-select-editor-theme") as HTMLSelectElement)?.value);
    const selectPaper = ((modalOverlay.querySelector("#setting-select-paper") as HTMLSelectElement)?.value as PaperSize) || "A4";
    const pdfLandscape = (modalOverlay.querySelector("#setting-pdf-landscape") as HTMLInputElement)?.checked ?? false;
    const pdfBackground = (modalOverlay.querySelector("#setting-pdf-background") as HTMLInputElement)?.checked ?? true;

    const newSettings: MarkWeaveSettings = {
      mermaidDefaultMode: selectedMode,
      mermaidDefaultCurve: selectCurve,
      mermaidTheme: selectMermaidTheme,
      gridSnap: toggleGrid,
      exportScale: selectScale,
      fontSize: selectFontSize,
      lineHeight: selectLineHeight,
      fontFamily: selectFontFamily,
      exportPolicy: selectExportPolicy,
      theme: selectTheme,
      language: selectLanguage,
      editorTheme: selectEditorTheme,
      pdf: normalizePdfOptions({ ...loadPdfOptions(), paper: selectPaper, landscape: pdfLandscape, printBackground: pdfBackground }),
    };

    saveSettings(newSettings);
    closeModal();
  });
}

(window as any).__MARKWEAVE_SETTINGS__ = {
  openSettingsModal,
  loadSettings,
  saveSettings,
  applySettings,
  getDefaultMode: () => localStorage.getItem("markweave_mermaid_default_mode") || "custom",
  setDefaultMode: (mode: "custom" | "standard") => {
    const s = loadSettings();
    s.mermaidDefaultMode = mode;
    saveSettings(s);
  },
};

const btnOpenSettings = document.getElementById("btn-open-settings");
btnOpenSettings?.addEventListener("click", openSettingsModal);

btnSaveMd.addEventListener("click", downloadMarkdown);

// 主题切换 (明亮 / 暗色)
function toggleTheme() {
  const currentSettings = loadSettings();
  const prefersDark = Boolean(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const currentResolved = resolveTheme(currentSettings.theme, prefersDark);
  const nextTheme: "light" | "night" = currentResolved === "night" ? "light" : "night";
  currentSettings.theme = nextTheme;
  saveSettings(currentSettings);
}

btnToggleTheme.addEventListener("click", toggleTheme);

// 监听 prefers-color-scheme 变化：当设置为 system 时重新应用设置并触发主题事件
if (window.matchMedia) {
  const colorSchemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const handleColorSchemeChange = () => {
    const currentSettings = loadSettings();
    if (currentSettings.theme === "system") {
      applySettings(currentSettings);
    }
  };
  if (colorSchemeQuery.addEventListener) {
    colorSchemeQuery.addEventListener("change", handleColorSchemeChange);
  } else if ((colorSchemeQuery as any).addListener) {
    (colorSchemeQuery as any).addListener(handleColorSchemeChange);
  }
}

// 点击正文左右两侧空白：编辑器失焦，当前块回到解析后的排版形态（与 Typora 一致）
document.addEventListener("mousedown", (e: MouseEvent) => {
  if (isSourceMode) return;
  const target = e.target as HTMLElement | null;
  if (!target) return;

  const scroller = target.closest(".ty-editor-scroller");
  const inProseMirror = target.closest(".ProseMirror");
  if (scroller && !inProseMirror) {
    // 点击的是正文区域内的空白（左右留白或块与块之间的空隙）
    editor.blur();
  }
});

// 空文档下点击页面空白区域聚焦首行
document.addEventListener("click", (e: MouseEvent) => {
  if (isSourceMode) return;

  const current = documents.find((d) => d.id === activeDocId);
  if (!current || current.content.trim() !== "") return;

  const target = e.target as HTMLElement | null;
  if (!target) return;

  const interactiveSelector =
    'button, input, textarea, select, a, [role="button"], [contenteditable="true"], .ty-file-item, .ty-outline-item, .ty-sidebar-tab, .ty-icon-btn, .ty-footer-btn, .ty-settings-tab-btn, .ty-modal-overlay, .md-fences-toolbar, .md-table-toolbar, .md-diagram-toolbar-wrap';

  if (target.closest(interactiveSelector)) return;

  editor.focusStart();
});

// 初始化加载并应用设置
applySettings(loadSettings());

// 外部修改轮询（仅桌面版有 statFile 时生效）
if (getDesktopAPI()?.statFile) {
  const active = documents.find((d) => d.id === activeDocId);
  if (active?.filePath) void refreshTrackedFile(active.id, active.filePath);
  setInterval(() => void pollExternalChanges(), POLL_INTERVAL_MS);
}

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
  const htmlContent = toHtml(editor.getDocument(), true);
  const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/\.md$/, "")}.html`;
  a.click();
  URL.revokeObjectURL(url);
});

// 导出 PDF：桌面版走 printToPDF（支持纸张/边距），Web 版回退到系统打印
btnExportPdf.addEventListener("click", () => {
  void exportPdf();
});

async function exportPdf(): Promise<void> {
  const api = getDesktopAPI();
  const currentDoc = documents.find((d) => d.id === activeDocId);
  const title = currentDoc ? currentDoc.title.replace(/\.md$/, "") : "document";

  if (!api?.printToPdf) {
    window.print();
    return;
  }

  const options = loadSettings().pdf;
  const suggestedName = currentDoc?.filePath
    ? joinPath(currentDoc.filePath.replace(/[\/][^\/]+$/, ""), `${title}.pdf`)
    : `${title}.pdf`;

  const result = await api.printToPdf({
    path: suggestedName,
    options: toElectronPdfOptions(options),
  });

  if (!result) {
    window.alert("PDF 导出失败");
  }
}

// Electron 桌面菜单与文件打开集成
const desktopAPI = getDesktopAPI();
if (desktopAPI) {
  desktopAPI.onMenuAction((action: string) => {
    switch (action) {
      case "new-file":
        handleNewFile();
        break;
      case "open-file":
        void handleOpenFile();
        break;
      case "save":
        void handleSave();
        break;
      case "save-as":
        void handleSaveAs();
        break;
      case "insert-table":
        handleOpenInsertTable();
        break;
      case "toggle-source":
        toggleSourceMode();
        break;
      case "toggle-sidebar":
        sidebar.classList.toggle("collapsed");
        break;
      case "toggle-theme":
        toggleTheme();
        break;
    }
  });

  desktopAPI.onOpenPath(async (filePath: string) => {
    if (!filePath) return;
    try {
      if (desktopAPI.readFile) {
        const file = await desktopAPI.readFile(filePath);
        if (file) {
          handleFileOpened(file);
        }
      }
    } catch (err) {
      console.error("Failed to open path from desktop API:", filePath, err);
    }
  });
}

