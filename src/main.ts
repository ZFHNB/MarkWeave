import "./styles/typora-theme.css";
import type { Node as PMNode } from "prosemirror-model";
import { MarkWeaveEditor } from "./editor";
import { schema } from "./editor/schema";
import { SourceSearchPanel } from "./editor/search/source-search";
import {
  alertDialog,
  confirmDialog,
  escapeHtml,
  openDialog,
  openMenu,
  openMenuAt,
  promptDialog,
  takeMenuRowRect,
  toast,
  type MenuItem,
} from "./ui/components";
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
import { pickLocalImage } from "./editor/plugins/images";
import { resolveImageFilePath } from "./editor/nodeviews/image-actions";
import {
  applyOpenedFile,
  extractFileName,
  findOpenDocumentByPath,
  markDocumentSaved,
  suggestedSaveName,
  wouldLoseEdits,
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
  clearRecentFiles,
  loadLastFolder,
  loadRecentFiles,
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
import {
  absolutizeImagePaths,
  convertLineEnding,
  dirname,
  ensureFinalNewline,
  isValidFileName,
  joinPath,
  normalizeMarkdownFileName,
  type LineEnding,
} from "./workspace/file-ops";
import {
  computeSelectionStats,
  createTabState,
  openTab,
  closeTab,
  closeOtherTabs,
  closeAllTabs,
  closeTabsToRight,
  cycleTab,
  updateTabTitle,
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
import { toStandaloneHtml } from "./export/html-export";
import { PANDOC_FORMATS, getFormat } from "./export/pandoc";
import {
  DEFAULT_SYNTAX_OPTIONS,
  markdownToDoc,
  setMarkdownSyntaxOptions,
  type MarkdownSyntaxOptions,
} from "./editor/serializer/markdown";
import {
  INITIAL_UPDATE_STATE,
  createUnsupportedChannel,
  type UpdateChannel,
  type UpdateState,
  type UpdateStatus,
} from "./platform/update-channel";
import {
  buildExportMeta,
  frontMatterFromNode,
  resolveHtmlTitle,
  resolvePaperSize,
  type FrontMatter,
} from "./export/front-matter";
import {
  buildRejectedMessage,
  classifyDroppedFiles,
  dragContainsFiles,
  isPdfFile,
  type DroppedFileInfo,
} from "./workspace/file-drop";
import {
  DEFAULT_OUTPUT_LOCATION,
  LOCATION_MODE_LABELS,
  normalizeOutputLocation,
  resolveOutputLocation,
  type OutputLocationMode,
} from "./workspace/mineru-location";
import type { MineruMode, MineruSettings } from "./platform/mineru-credentials";
import {
  DEFAULT_EDITOR_BEHAVIOR,
  normalizeEditorBehavior,
  type EditorBehaviorSettings,
} from "./editor/behavior-settings";
import { renderMermaidForExport } from "./export/mermaid-render";
import {
  DEFAULT_AUTO_SAVE,
  DRAFT_MIRROR_DEBOUNCE_MS,
  autoSaveIntervalMs,
  isLegacyTimestampCopy,
  listSnapshots,
  normalizeAutoSaveSettings,
  planSnapshotWrite,
  resolveHistoryDir,
  snapshotFileName,
  shouldPromptOnClose,
  shouldSaveOnChange,
  type AutoSaveSettings,
} from "./workspace/autosave";
import {
  decideParseMode,
  needsUploadConsent,
} from "./platform/mineru-mode";
import { enhanceSettingsDescriptions } from "./ui/settings-tooltip";
import {
  computeBlockStartLines,
  findAnchorLine,
  lineForBlockIndex,
  lineStartOffsets,
  ratioFromScroll,
} from "./editor/source-mapping";
import {
  BODY_CJK_FONTS,
  BODY_LATIN_FONTS,
  MONO_CJK_FONTS,
  MONO_LATIN_FONTS,
  normalizeFontIdForGroup,
  genericFor,
  resolveFontFamilies,
} from "./platform/fonts";
import {
  applyBuiltInTheme,
  getAllThemes,
  normalizeThemeId,
  registerCustomThemes,
} from "./platform/themes";
import {
  DEFAULT_PDF_OPTIONS,
  PAPER_SIZES_MICRONS,
  normalizePdfOptions,
  toElectronPdfOptions,
  type PdfOptions,
  type PaperSize,
} from "./platform/pdf-options";

// 预设文档 1: 欢迎与特性演示
const docWelcome = `# 欢迎使用 MarkWeave

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
console.log("MarkWeave Engine Initialized!");
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
const docArchitecture = `# 系统架构设计规范 (MarkWeave Architecture)

## 1. 总体分层模型

MarkWeave 继承了 Typora 的设计思想，采用解耦的分层设计：

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
相比传统 Electron 打包，MarkWeave 运行时无任何重型运行时开销，启动毫秒级响应。
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
  createDocument("欢迎使用 MarkWeave.md", docWelcome),
  createDocument("系统架构设计规范.md", docArchitecture),
  createDocument("REA 逆向技术手记.md", docReaNotes),
];

const seededWorkspace: WorkspaceStateV1 = createWorkspace(
  seededDocuments,
  seededDocuments[0].id
);

let workspaceState: WorkspaceStateV1;
try {
  // 关闭「恢复上次会话」时跳过本地存档，直接从初始文档开始
  const behavior = loadEditorBehavior();
  workspaceState = behavior.restoreSession
    ? loadWorkspace(localStorage, seededWorkspace)
    : seededWorkspace;
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
  <aside class="ty-sidebar" id="sidebar" role="navigation" aria-label="侧边栏">
    <div class="ty-sidebar-tabs">
      <div class="ty-sidebar-tab active" data-tab="outline">大纲 (Outline)</div>
      <div class="ty-sidebar-tab" data-tab="files">文件 (Files)</div>
    </div>
    <div class="ty-sidebar-content" id="sidebar-content">
      <!-- 大纲目录容器 -->
      <div id="outline-container">
        <div class="ty-outline-toolbar">
          <input type="search" id="outline-filter" class="ty-outline-filter" placeholder="过滤标题…" aria-label="过滤大纲标题" />
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
          <input type="file" id="local-file-input" accept=".md,.markdown,.txt,.pdf" style="display: none;" aria-label="选择本地 Markdown 或 PDF 文件" />
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
  </aside>

  <!-- 主编辑区 -->
  <main class="ty-main-container">
    <!-- 顶部轻量工具栏 -->
    <header class="ty-header-bar">
      <div class="ty-header-left">
        <button class="ty-icon-btn ty-menu-trigger" id="btn-file-menu" title="文件菜单" aria-haspopup="menu" aria-expanded="false">
          文件
        </button>
        <button class="ty-icon-btn" id="btn-toggle-sidebar" title="切换侧边栏" aria-label="切换侧边栏">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
        </button>
        <span class="ty-doc-title" id="doc-title">欢迎使用 MarkWeave.md</span>
      </div>
      <div class="ty-header-right">
        <span class="ty-save-status" id="save-status" aria-live="polite"></span>
        <button class="ty-icon-btn ty-save-btn" id="btn-save-file" title="保存文件 (Ctrl+S)" aria-label="保存文件">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
        </button>
        <button class="ty-icon-btn" id="btn-toggle-source" title="切换源码模式 (Ctrl+/)" aria-label="切换源码模式">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
        </button>
        <button class="ty-icon-btn ty-theme-toggle" id="btn-toggle-theme" title="切换明亮/暗色主题" aria-label="切换明亮/暗色主题">
          <svg class="ty-theme-icon ty-theme-icon-moon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          <svg class="ty-theme-icon ty-theme-icon-sun" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
        </button>
        <button class="ty-icon-btn" id="btn-open-settings-quick" title="偏好设置 (Ctrl+,)" aria-label="偏好设置">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
      </div>
    </header>

    <!-- 文档标签页 -->
    <div class="ty-tab-strip" id="tab-strip" style="display: none;"></div>

    <!-- 滚动容器与 ProseMirror 挂载点 -->
    <div class="ty-editor-scroller">
      <div id="write" role="textbox" aria-multiline="true" aria-label="Markdown 编辑器"></div>
    </div>

    <!-- 源码模式全屏编辑器 -->
    <textarea id="source-editor" spellcheck="false" aria-label="Markdown 源码编辑器"></textarea>

    <!-- 底部状态栏 -->
    <footer class="ty-footer">
      <div class="ty-footer-left">
        <button class="ty-view-toggle" id="btn-view-toggle" title="切换视图 (Ctrl+/)">
          <span class="ty-view-toggle-icon" id="view-toggle-icon">&lt;/&gt;</span>
          <span class="ty-view-toggle-label" id="view-toggle-label">源码模式</span>
        </button>
        <span class="ty-footer-divider"></span>
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
const btnViewToggle = document.getElementById("btn-view-toggle") as HTMLButtonElement;
const viewToggleIcon = document.getElementById("view-toggle-icon") as HTMLElement;
const viewToggleLabel = document.getElementById("view-toggle-label") as HTMLElement;
const btnToggleTheme = document.getElementById("btn-toggle-theme")!;
const btnFocusMode = document.getElementById("btn-focus-mode")!;
const btnTypewriterMode = document.getElementById("btn-typewriter-mode")!;
const btnFileMenu = document.getElementById("btn-file-menu") as HTMLButtonElement;
const btnOpenSettingsQuick = document.getElementById("btn-open-settings-quick")!;
const btnSaveFile = document.getElementById("btn-save-file") as HTMLButtonElement;
const saveStatusEl = document.getElementById("save-status") as HTMLElement;
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
  isAutoPairEnabled: () => loadSettings().autoPair,
  isSmartPunctuationEnabled: () => loadSettings().smartPunctuation,
  getIndentSize: () => loadSettings().indentSize,
  // 图片来源解析：相对路径按当前文档所在目录展开（桌面版才能显示本地文件）
  getDocumentPath: () => documents.find((d) => d.id === activeDocId)?.filePath ?? null,
  isDesktop: () => Boolean(getDesktopAPI()),
  persistImage: (file) => persistImageForDocument(file),
  revealImageInFolder: (path) => revealPath(path),
  copyImageToClipboard: (src, absolute) => copyImageToClipboard(src, absolute),
  saveImageAs: (src, name) => saveImageWithDialog(src, name),
  getImageDefaultAlign: () => loadSettings().imageDefaultAlign,
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
        // 标签页上的「未保存」圆点依赖 tabState，必须一起刷新
        tabState = updateTabTitle(tabState, doc.id, doc.title, true);
        renderTabs();
        scheduleSave();
        scheduleAutoSaveOnChange();
        // 草稿镜像与自动保存开关无关：改了就要留一份，防止误操作丢稿
        scheduleDraftMirror(doc.id);
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

(window as any).__MARKWEAVE_EDITOR__ = editor;

// 自动化测试钩子：把当前文档绑定到指定路径（等价于"打开过该文件"）
(window as any).__MARKWEAVE_TEST_BIND__ = (filePath: string) => {
  const doc = documents.find((d) => d.id === activeDocId);
  if (!doc) return false;
  doc.filePath = filePath;
  doc.dirty = false;
  void refreshTrackedFile(doc.id, filePath);
  return true;
};

// 监听源码编辑器输入，实时同步修改并防抖保存
sourceEditor.addEventListener("input", () => {
  const doc = documents.find((d) => d.id === activeDocId);
  if (doc) {
    if (doc.content !== sourceEditor.value) {
      doc.content = sourceEditor.value;
      doc.dirty = true;
      doc.updatedAt = Date.now();
      syncTitle(doc.title);
      tabState = updateTabTitle(tabState, doc.id, doc.title, true);
      renderTabs();
      scheduleSave();
      scheduleAutoSaveOnChange();
      scheduleDraftMirror(doc.id);
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
    // 清空 DOM，否则隐藏的旧标签仍然留在文档里（可被查询、可能被误点）
    tabStrip.innerHTML = "";
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
      applyTabClose(closeTab(tabState, tab.docId));
    });

    el.appendChild(label);
    el.appendChild(close);
    el.addEventListener("click", () => switchDocument(tab.docId));
    el.addEventListener("auxclick", (e) => {
      if (e.button === 1) {
        e.preventDefault();
        applyTabClose(closeTab(tabState, tab.docId));
      }
    });
    // 右键：关闭 / 关闭其他 / 关闭右侧 / 关闭全部
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openTabContextMenu(tab.docId, e.clientX, e.clientY);
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
  // 直接带着文档标题重开，否则标签会显示成内部 UUID
  tabState = updateTabTitle(
    tabState,
    tabState.activeTabId ?? "",
    documents.find((d) => d.id === tabState.activeTabId)?.title ?? "",
    documents.find((d) => d.id === tabState.activeTabId)?.dirty ?? false
  );
  renderTabs();
  if (tabState.activeTabId) switchDocument(tabState.activeTabId);
}

/** 关闭当前标签（文档仍留在工作区，Ctrl+Shift+T 可重开） */
function closeActiveTab(): void {
  if (!tabState.activeTabId) return;
  tabState = closeTab(tabState, tabState.activeTabId);
  renderTabs();
  if (tabState.activeTabId) {
    switchDocument(tabState.activeTabId);
  } else {
    // 一个标签都不剩时回到第一篇文档，避免编辑器停在已关闭的文档上
    const fallback = documents.find((d) => d.id === activeDocId) ?? documents[0];
    if (fallback && fallback.id !== activeDocId) switchDocument(fallback.id);
  }
}

/**
 * 关闭标签后的公共收尾：同步编辑器、标签栏与文件列表。
 *
 * 标签全部关掉时不必强制切回某篇文档——用户可能就是想清空标签栏，
 * 编辑器继续保持当前内容即可（文档仍在工作区，随时能重开）。
 */
function applyTabClose(next: TabState): void {
  const previousActive = tabState.activeTabId;
  tabState = next;
  renderTabs();

  if (tabState.activeTabId) {
    if (tabState.activeTabId !== activeDocId) switchDocument(tabState.activeTabId);
  } else if (previousActive) {
    // 最后一个标签也被关掉了：编辑器不该继续显示已关闭文档的内容，
    // 换成一张空白临时文档（不落盘；用户在里面输入后，关窗时会按
    // 「未命名文档」的既有规则提醒保存）。
    openBlankDocument({ reuseActive: true });
  }

  // 文件列表上的「已在标签栏打开」圆点依赖 tabState，必须一并刷新
  renderFileList();
}

/**
 * 打开一张空白文档。
 *
 * - `reuseActive`：把当前这篇文档清空复用（用于「关掉最后一个标签」，
 *   避免工作区里留下一堆被关掉的残留条目）；
 * - 否则新建一篇（用于「新建文件」）。
 *
 * 两种情况都会在标签栏开一个标签，并把光标放到正文开头。
 */
function openBlankDocument(options: { reuseActive?: boolean } = {}): string {
  const active = documents.find((d) => d.id === activeDocId);

  // 只有在「这篇文档没有磁盘路径、也没有未保存内容」时才敢就地清空复用。
  // 否则清空等于销毁用户的稿子——应该新建一篇空白文档，把原来的留在工作区。
  const reusable =
    options.reuseActive &&
    active &&
    !active.filePath &&
    !active.dirty &&
    active.content.trim() === "";

  if (reusable) {
    active.title = uniqueTitle(
      documents.filter((d) => d.id !== active.id),
      "未命名文档.md"
    );
    active.updatedAt = Date.now();
    editor.setMarkdown("", { resetHistory: true });
    if (isSourceMode) sourceEditor.value = "";
    syncTitle(active.title);
    syncTabsFromDocuments();
    renderFileList();
    flushSave();
    editor.focusStart();
    return active.id;
  }

  const newTitle = uniqueTitle(documents, "未命名文档.md");
  const newDoc = createDocument(newTitle, "");
  documents.push(newDoc);
  renderFileList();
  switchDocument(newDoc.id);
  flushSave();
  editor.focusStart();
  return newDoc.id;
}

/** 关闭指定的其它标签（保留 keepId） */
function closeOtherTabsOf(keepId: string): void {
  if (tabState.tabs.length <= 1) return;
  applyTabClose(closeOtherTabs(tabState, keepId));
  if (keepId !== activeDocId) switchDocument(keepId);
}

/** 关闭全部标签 */
function closeAllTabsOf(): void {
  if (tabState.tabs.length === 0) return;
  applyTabClose(closeAllTabs(tabState));
  toast("已关闭全部标签，文档仍保留在工作区", "info");
}

/** 关闭 keepId 右侧的全部标签 */
function closeTabsRightOf(keepId: string): void {
  applyTabClose(closeTabsToRight(tabState, keepId));
}

/**
 * 工作区文档项的右键菜单。
 *
 * 这里必须区分两个概念：
 * - 工作区文档：`documents` 里的全部条目，侧边栏一律列出；
 * - 标签页：`tabState.tabs`，只有真正「打开过」的才在里面。
 * 启动时只有第一篇文档有标签，其余文档虽然列在侧边栏里，但并没有开标签。
 * 因此「关闭其他文档」在只有一个标签时确实无事可做，需要把原因说清楚，
 * 而不是给一个不知为何灰掉的菜单项。
 */
function openDocumentContextMenu(docId: string, x: number, y: number): void {
  const doc = documents.find((d) => d.id === docId);
  if (!doc) return;
  const tabCount = tabState.tabs.length;
  const isTabOpen = tabState.tabs.some((tab) => tab.docId === docId);

  openMenuAt(
    { left: x, right: x, top: y, bottom: y, width: 0, height: 0 },
    [
      { label: "打开", onClick: () => switchDocument(docId) },
      { kind: "separator" },
      {
        label: isTabOpen ? "关闭" : "关闭（未打开）",
        shortcut: "Ctrl+W",
        disabled: !isTabOpen,
        onClick: () => applyTabClose(closeTab(tabState, docId)),
      },
      {
        // 只有一个标签时确实没有"其他"可关，原因写在文案里
        label: tabCount <= 1 ? "关闭其他文档（当前仅 1 个标签）" : "关闭其他文档",
        disabled: tabCount <= 1,
        onClick: () => closeOtherTabsOf(docId),
      },
      {
        label: tabCount > 0 ? `关闭全部文档（${tabCount} 个标签）` : "关闭全部文档",
        disabled: tabCount === 0,
        onClick: () => closeAllTabsOf(),
      },
      { kind: "separator" },
      {
        label: "在文件夹中显示",
        disabled: !doc.filePath,
        onClick: () => {
          if (doc.filePath) void revealPath(doc.filePath);
        },
      },
    ]
  );
}

/** 工作区文件行的右键菜单（尚未打开的文件） */
function openWorkspaceFileContextMenu(file: FlatFile, x: number, y: number): void {
  // 该文件若已在标签栏打开，就能直接关它；否则只提供"打开"相关操作。
  // 用户从工作区列表右键时，意图是"处理这个文件"，不应该被要求先去标签栏。
  const targetDoc = findOpenDocumentByPath(documents, file.path);
  const targetTab = targetDoc
    ? tabState.tabs.find((tab) => tab.docId === targetDoc.id)
    : undefined;
  const tabCount = tabState.tabs.length;

  openMenuAt(
    { left: x, right: x, top: y, bottom: y, width: 0, height: 0 },
    [
      { label: "打开", onClick: () => void openWorkspaceFile(file.path) },
      { kind: "separator" },
      {
        label: targetTab ? "关闭" : "关闭（未打开）",
        shortcut: "Ctrl+W",
        disabled: !targetTab,
        onClick: () => {
          if (targetTab) applyTabClose(closeTab(tabState, targetTab.docId));
        },
      },
      {
        label:
          targetTab && tabCount > 1
            ? "关闭其他标签"
            : "关闭其他标签（当前仅 1 个标签）",
        disabled: !targetTab || tabCount <= 1,
        onClick: () => {
          if (targetTab) closeOtherTabsOf(targetTab.docId);
        },
      },
      {
        label: tabCount > 0 ? `关闭全部标签（${tabCount} 个）` : "关闭全部标签",
        disabled: tabCount === 0,
        onClick: () => closeAllTabsOf(),
      },
      { kind: "separator" },
      { label: "重命名…", onClick: () => void renameWorkspaceFile(file) },
      {
        label: "删除…",
        onClick: () => void deleteWorkspaceFile(file),
      },
      { kind: "separator" },
      {
        label: "在文件夹中显示",
        onClick: () => void revealPath(file.path),
      },
    ]
  );
}

/** 标签栏右键菜单 */
function openTabContextMenu(docId: string, x: number, y: number): void {
  const index = tabState.tabs.findIndex((tab) => tab.docId === docId);
  const hasRight = index >= 0 && index < tabState.tabs.length - 1;

  openMenuAt(
    { left: x, right: x, top: y, bottom: y, width: 0, height: 0 },
    [
      {
        label: "关闭",
        shortcut: "Ctrl+W",
        onClick: () => {
          tabState = closeTab(tabState, docId);
          applyTabClose(tabState);
        },
      },
      {
        label: "关闭其他标签",
        disabled: tabState.tabs.length <= 1,
        onClick: () => closeOtherTabsOf(docId),
      },
      {
        label: "关闭右侧标签",
        disabled: !hasRight,
        onClick: () => closeTabsRightOf(docId),
      },
      { kind: "separator" },
      {
        label: "关闭全部标签",
        onClick: () => closeAllTabsOf(),
      },
      { kind: "separator" },
      {
        label: "在文件夹中显示",
        disabled: !documents.find((d) => d.id === docId)?.filePath,
        onClick: () => {
          const doc = documents.find((d) => d.id === docId);
          if (doc?.filePath) void revealPath(doc.filePath);
        },
      },
    ]
  );
}

/** 在当前标签之间循环（Ctrl+Tab / Ctrl+Shift+Tab） */
function cycleActiveTab(direction: 1 | -1): void {
  if (tabState.tabs.length < 2) return;
  const next = cycleTab(tabState, direction);
  if (next === tabState) return;
  tabState = next;
  renderTabs();
  if (tabState.activeTabId) switchDocument(tabState.activeTabId);
}

document.addEventListener("keydown", (event) => {
  const mod = event.ctrlKey || event.metaKey;
  if (!mod) return;

  // Ctrl+Tab / Ctrl+Shift+Tab：切换标签
  if (event.key === "Tab") {
    event.preventDefault();
    cycleActiveTab(event.shiftKey ? -1 : 1);
    return;
  }

  // Ctrl+W：关闭当前标签（不退出应用）
  if (!event.shiftKey && event.key.toLowerCase() === "w") {
    event.preventDefault();
    closeActiveTab();
    return;
  }

  if (!event.shiftKey) return;
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
        event.stopPropagation();
        openWorkspaceFileContextMenu(file, event.clientX, event.clientY);
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
    divider.textContent = "工作区文档";
    fileListContainer.appendChild(divider);
  }

  documents.forEach((doc) => {
    // 点的含义与标签页一致：只有「有未保存修改」才画点。
    // 不能用它表示"已打开"——用户会误以为文件被改过。
    const itemEl = document.createElement("div");
    itemEl.className = `ty-file-item ${doc.id === activeDocId ? "active" : ""}${
      doc.dirty ? " is-dirty" : ""
    }`;
    itemEl.setAttribute("data-id", doc.id);

    const iconSpan = document.createElement("span");
    iconSpan.className = "ty-file-icon";
    iconSpan.textContent = "📄";

    const titleSpan = document.createElement("span");
    titleSpan.className = "ty-file-title";
    titleSpan.textContent = doc.title;
    titleSpan.title = doc.dirty ? "有未保存的修改（双击重命名）" : "双击重命名";

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

    deleteBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (documents.length <= 1) {
        toast("工作区至少需要保留一篇文档", "error");
        return;
      }
      const confirmed = await confirmDialog(`确定要删除文档「${doc.title}」吗？`, {
        title: "删除文档",
        confirmLabel: "删除",
        danger: true,
      });
      if (!confirmed) return;

      const isDeletingActive = doc.id === activeDocId;
      const deletedIndex = documents.findIndex((d) => d.id === doc.id);
      documents = documents.filter((d) => d.id !== doc.id);

      // 文档没了，对应的标签也必须一起移除：
      // 否则点击残留标签会走到 switchDocument 并抛「document not found」。
      tabState = closeTab(tabState, doc.id);

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

      renderTabs();
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
    // 右键：同样提供关闭单个 / 关闭其他 / 关闭全部
    itemEl.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openDocumentContextMenu(doc.id, event.clientX, event.clientY);
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
  // 文档可能已被删除（标签页 / 最近文件 / 快捷入口都可能残留旧 id）。
  // 这里静默忽略并把标签栏拉回真实状态，而不是抛异常打断后续操作。
  if (!documents.some((d) => d.id === newDocId)) {
    syncTabsFromDocuments();
    return;
  }

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
// 先建标签再渲染文件列表：列表里要标出哪些文档"已在标签栏打开"，
// 反过来会漏掉首屏那一个。
syncTabsFromDocuments();
renderFileList();

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
  openBlankDocument();
}

btnNewFile.addEventListener("click", handleNewFile);

async function handleFileOpened(file: DesktopFile): Promise<boolean> {
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

  // 重新打开一个已经打开、且有未保存修改的文件时，先用磁盘内容覆盖会静默丢稿。
  // 拖入、最近文件、快速打开、侧边栏点击都会走到这里，所以拦截放在统一入口。
  const existing = findOpenDocumentByPath(documents, file.path);
  if (wouldLoseEdits(existing, file)) {
    const confirmed = await confirmDialog(
      `「${existing!.title}」还有未保存的修改。\n\n` +
        "重新载入磁盘内容会覆盖这些修改（草稿镜像里仍留有备份）。是否继续？",
      { title: "重新载入文件", confirmLabel: "覆盖并载入" }
    );
    if (!confirmed) return false;
  }

  const result = applyOpenedFile(documents, file, activeDocId);
  documents = result.documents;
  activeDocId = result.activeDocId;

  const current = documents.find((d) => d.id === activeDocId)!;
  syncTitle(current.title);
  editor.setMarkdown(current.content, { resetHistory: true });
  // 重新打开同一路径时也要重新取基线快照，否则会沿用上一次会话的旧基线
  resetSessionBaseline(current.id);
  if (isSourceMode) {
    sourceEditor.value = current.content;
  }
  renderFileList();
  // 同步标签页：无论来自磁盘打开还是 PDF 解析结果，表现保持一致
  syncTabsFromDocuments();
  flushSave();

  if (current.filePath) {
    rememberRecentFile(current.filePath, current.title);
  }
  return true;
}

async function handleOpenFile() {
  const api = getDesktopAPI();
  if (api) {
    const file = await api.openFile();
    if (!file) return;

    // 通过菜单打开 PDF 时走解析流程，而不是当作文本载入
    if (isPdfFile(file.path)) {
      await parsePdfWithMineru(file.path);
      return;
    }

    await handleFileOpened(file);
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
    toast("「打开文件夹」仅桌面版可用", "info");
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
    const opened = await handleFileOpened(file);
    // 用户在「覆盖未保存修改」的询问里选了取消
    if (!opened) return;
    activeFilePath = path;
    renderFileList();
    rememberRecentFile(file.path, extractFileName(file.path));
  }
}

/* ================= 拖入文件打开 ================= */
/**
 * 拖拽打开文档。
 *
 * 桌面版能从 File 对象拿到磁盘路径，走与「打开文件」完全相同的流程
 * （含外部修改检测、最近文件记录）；Web 版退化为读取内容的内存文档。
 */

let dragDepth = 0;
let dropOverlay: HTMLElement | null = null;

function ensureDropOverlay(): HTMLElement {
  if (dropOverlay && document.body.contains(dropOverlay)) return dropOverlay;

  const el = document.createElement("div");
  el.className = "ty-drop-overlay";
  el.innerHTML = `
    <div class="ty-drop-hint">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      <div class="ty-drop-title">松开以打开文档</div>
      <div class="ty-drop-sub">支持 .md / .markdown / .txt，拖入 PDF 会自动解析</div>
    </div>
  `;
  document.body.appendChild(el);
  dropOverlay = el;
  return el;
}

function showDropOverlay() {
  ensureDropOverlay().classList.add("is-visible");
}

function hideDropOverlay() {
  dragDepth = 0;
  dropOverlay?.classList.remove("is-visible");
}

/** 拖动进入窗口：只在携带文件时响应 */
window.addEventListener("dragenter", (event) => {
  if (!dragContainsFiles(event.dataTransfer)) return;
  event.preventDefault();
  dragDepth += 1;
  showDropOverlay();
});

window.addEventListener("dragover", (event) => {
  if (!dragContainsFiles(event.dataTransfer)) return;
  event.preventDefault();
  // 必须设置 dropEffect，否则浏览器不会触发 drop
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
});

window.addEventListener("dragleave", (event) => {
  if (!dragContainsFiles(event.dataTransfer)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  // 子元素间移动也会触发 dragleave，用计数避免闪烁
  if (dragDepth === 0) hideDropOverlay();
});

window.addEventListener("drop", (event) => {
  if (!dragContainsFiles(event.dataTransfer)) return;
  // ProseMirror 的图片插件已经处理过这次拖入（插入图片并 preventDefault），
  // 这里再按"文档拖入"处理会把 .png 报成不支持的文件类型。
  if (event.defaultPrevented) {
    hideDropOverlay();
    return;
  }
  event.preventDefault();
  hideDropOverlay();

  const droppedList = Array.from(event.dataTransfer?.files ?? []);
  pendingDropFiles = droppedList;
  // Electron 32+ 已移除 File.path，必须经 preload 的 webUtils 取真实路径
  const dropApi = getDesktopAPI();
  const { accepted, rejected } = classifyDroppedFiles(droppedList, (file) =>
    dropApi?.getPathForFile?.(file) ?? null
  );
  if (rejected.length > 0) {
    showSaveStatus(buildRejectedMessage(rejected), "error");
  }
  if (accepted.length === 0) return;

  void openDroppedFiles(accepted);
});

/** 依次打开拖入的文档；只保留最后一个为活动标签 */
async function openDroppedFiles(files: DroppedFileInfo[]): Promise<void> {
  const api = getDesktopAPI();

  for (const info of files) {
    // PDF：交给 MinerU 解析，不当作普通文档打开
    if (info.isPdf) {
      if (info.path) {
        await parsePdfWithMineru(info.path);
      } else if (!api) {
        showSaveStatus("PDF 解析需要桌面版，浏览器里请用「文件 → 导入 PDF」", "error");
      } else {
        // 桌面版但拿不到路径：多半是从网页/压缩包里拖出来的虚拟文件
        showSaveStatus("无法读取该 PDF 的磁盘路径，请改用「文件 → 导入 PDF 并解析」", "error");
      }
      continue;
    }

    if (api?.readFile && info.path) {
      // 桌面版：走标准打开流程
      const file = await api.readFile(info.path);
      if (file) {
        const didOpen = await handleFileOpened(file);
        if (!didOpen) continue;
        activeFilePath = info.path;
        renderFileList();
        rememberRecentFile(file.path, extractFileName(file.path));

        // 登记外部修改检测基线
        const opened = documents.find((d) => d.filePath === file.path);
        if (opened) await refreshTrackedFile(opened.id, file.path);
      }
      continue;
    }

    // 浏览器版：读取内容后作为内存文档打开
    const dropped = (await fileContentsOf(info.name)) ?? null;
    if (dropped !== null) {
      await handleFileOpened({ path: info.path ?? info.name, content: dropped });
    }
  }
}

/**
 * 浏览器环境读取拖入文件的内容。
 * Electron 下不会走到这里（有 path 就走 IPC 了）。
 */
let pendingDropFiles: File[] = [];
async function fileContentsOf(name: string): Promise<string | null> {
  const file = pendingDropFiles.find((f) => f.name === name);
  if (!file) return null;
  try {
    return await file.text();
  } catch {
    return null;
  }
}

/* ================= MinerU：PDF 解析流程 ================= */

/** 当前正在解析的 PDF，避免重复触发 */
let mineruBusy = false;

/**
 * 解析 PDF 并落盘为 Markdown。
 *
 * 流程：预检凭证/运行时 → 解析 → 按设置写入 → 打开结果。
 * 默认不打断用户；只有开启「每次询问」时才弹保存对话框。
 */
async function parsePdfWithMineru(pdfPath: string): Promise<void> {
  if (mineruBusy) {
    showSaveStatus("已有 PDF 正在解析", "idle");
    return;
  }

  const api = getDesktopAPI();
  if (!api?.mineruParseCloud && !api?.mineruParseLocal) {
    showSaveStatus("PDF 解析仅在桌面版可用", "error");
    return;
  }

  const settings = loadSettings();
  const mineru = settings.mineru;

  mineruBusy = true;
  showSaveStatus("正在解析 PDF…", "saving");

  try {
    // ---- 预检：决定用哪种方式解析 ----
    // 关键：已经配置好的方式直接使用，不再每次都弹窗询问
    const [localInfo, loadedKey] = await Promise.all([
      api.mineruDetectLocal?.() ?? Promise.resolve(undefined),
      api.mineruLoadKey?.() ?? Promise.resolve(undefined),
    ]);

    const decision = decideParseMode(mineru.mode, {
      localReady: Boolean(localInfo?.available),
      cloudReady: Boolean(loadedKey?.present && loadedKey.apiKey),
      localDetail: localInfo?.detail,
    });

    if (decision.action !== "proceed" || !decision.mode) {
      showSaveStatus("PDF 解析未配置", "error");
      const goSettings = await confirmDialog(decision.message ?? "无法解析 PDF", {
        title: decision.action === "need-cloud-key" ? "未配置 API Key" : "解析环境未就绪",
        confirmLabel: "前往设置",
      });
      if (goSettings) openSettingsModal();
      return;
    }

    const mode = decision.mode;

    if (mode !== mineru.mode) {
      // 静默切换：用户配好的是另一种方式，直接用，不打扰
      toast(
        mode === "cloud"
          ? "本地环境未就绪，已改用云端解析"
          : "云端未配置，已改用本地解析",
        "info"
      );
    }

    // ---- 云端：隐私确认（每次首轮上传前问一次）----
    if (needsUploadConsent(mode, mineru.cloudUploadConfirmed)) {
      const ok = await confirmDialog(
        "云端解析会把该 PDF 上传至 MinerU 服务进行识别。\n\n" +
          `文件：${extractFileName(pdfPath)}\n\n` +
          "解析结果通过官方 API 返回；请确认文件不包含敏感信息。是否继续？",
        { title: "上传到云端", confirmLabel: "继续上传" }
      );
      if (!ok) {
        showSaveStatus("已取消", "idle");
        return;
      }
      const next = loadSettings();
      next.mineru.cloudUploadConfirmed = true;
      saveSettings(next);
    }

    // ---- 解析 ----
    const started = Date.now();
    const result =
      mode === "local"
        ? await api.mineruParseLocal?.({ pdfPath })
        : await api.mineruParseCloud?.({
            pdfPath,
            enableOcr: true,
            enableFormula: true,
            language: "zh" === navigator.language.slice(0, 2) ? "ch" : "en",
          });

    if (!result?.ok || !result.markdown) {
      await handleMineruFailure(result, mode);
      return;
    }

    const seconds = Math.round((Date.now() - started) / 1000);

    // ---- 落盘 ----
    const currentDoc = documents.find((d) => d.id === activeDocId);
    const location = resolveOutputLocation(mineru.location, {
      pdfPath,
      notePath: currentDoc?.filePath ?? null,
    });

    let targetPath: string | null = null;

    if (mineru.location.askEachTime) {
      // 用户要求每次询问：走另存为对话框
      const saved = await api.saveFile?.({
        content: result.markdown,
        suggestedName: location.fileName,
      });
      targetPath = saved?.path ?? null;
      if (!targetPath) {
        showSaveStatus("已取消", "idle");
        return;
      }
    } else {
      targetPath = `${location.directory}/${location.fileName}`;
      const written = await api.writeFile?.({ path: targetPath, content: result.markdown });
      if (!written) {
        // 目录可能不存在，退回另存为对话框而不是静默失败
        const saved = await api.saveFile?.({
          content: result.markdown,
          suggestedName: location.fileName,
        });
        targetPath = saved?.path ?? null;
      }
    }

    if (!targetPath) {
      showSaveStatus("保存解析结果失败", "error");
      return;
    }

    // ---- 打开结果 ----
    const file = await api.readFile?.(targetPath);
    if (file) {
      const didOpen = await handleFileOpened(file);
      if (didOpen) activeFilePath = targetPath;
      renderFileList();
      rememberRecentFile(file.path, extractFileName(file.path));
    }

    showSaveStatus(`已解析（${seconds}s）`, "saved");
    pendingMineruResult = { path: targetPath, seconds };
    // 解析结果已落盘，给用户一个「另存为」的出口
    toast("PDF 已解析为 Markdown，可继续编辑或另存", "success");
  } finally {
    mineruBusy = false;
  }
}

/**
 * 最近一次解析结果。
 * 保存位置默认不打断用户，这里保留一份记录，
 * 用户之后可以据此在资源管理器中定位或另存。
 */
let pendingMineruResult: { path: string; seconds: number } | null = null;

/** 打开最近一次解析结果所在的文件夹 */
async function revealLastMineruResult(): Promise<void> {
  const api = getDesktopAPI();
  if (!pendingMineruResult || !api?.revealInFolder) return;
  await api.revealInFolder(pendingMineruResult.path);
}

/** 统一把解析失败转成可读提示 */
async function handleMineruFailure(
  result: { error?: string; kind?: string; retryable?: boolean } | undefined,
  mode: "local" | "cloud"
): Promise<void> {
  const kind = result?.kind ?? "unknown";
  const message = result?.error ?? "解析失败";

  const hint: Record<string, string> = {
    auth: "API Key 无效或已过期。",
    quota: "超出配额，可尝试本地模式或稍后重试。",
    network: "网络连接失败，请检查网络后重试。",
    "not-configured": "尚未配置 API Key。",
    "local-not-ready": "本地 MinerU 环境未就绪。",
    parse: "该 PDF 无法解析。",
  };

  const suggestion = hint[kind] ?? "";
  const action =
    kind === "auth" || kind === "not-configured" || kind === "local-not-ready"
      ? "\n\n是否前往设置？"
      : "";

  showSaveStatus("PDF 解析失败", "error");

  if (action) {
    if (
      await confirmDialog(`${message}\n\n${suggestion}${action}`, {
        title: "解析失败",
        confirmLabel: "前往设置",
      })
    ) {
      openSettingsModal();
    }
    return;
  }

  const retryHint =
    mode === "cloud" && !result?.retryable
      ? "\n\n可尝试切换到本地模式。"
      : result?.retryable
      ? "\n\n可稍后重试。"
      : "";

  void alertDialog(
    `${message}${suggestion ? "\n\n" + suggestion : ""}${retryHint}`,
    "解析失败"
  );
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

    const reload = await confirmDialog(
      `「${doc.title}」已在外部被修改。是否重新载入磁盘内容？（选择取消则保留当前编辑）`,
      { title: "文件已被外部修改", confirmLabel: "重新载入" }
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
  const name = await promptDialog("新建文档名称", "未命名.md", { title: "新建文档" });
  if (name === null) return;
  const existing = workspaceFiles.map((f) => f.name);
  const result = await createMarkdownFile(workspaceRoot, name, existing);
  if (!result.ok || !result.path) {
    await alertDialog(`新建失败：${result.error ?? "未知错误"}`, "新建失败");
    return;
  }
  await refreshWorkspace();
  await openWorkspaceFile(result.path);
}

async function renameWorkspaceFile(file: FlatFile): Promise<void> {
  if (!workspaceRoot) return;
  const next = await promptDialog("重命名文件", file.name, { title: "重命名" });
  if (next === null) return;
  const trimmed = next.trim();
  if (!trimmed || trimmed === file.name) return;
  if (!isValidFileName(trimmed)) {
    await alertDialog("文件名包含非法字符（不能含有 \ / : * ? \" < > |）", "重命名失败");
    return;
  }

  const target = normalizeMarkdownFileName(trimmed);
  if (workspaceFiles.some((f) => f.path !== file.path && f.name === target)) {
    await alertDialog("同名文件已存在", "重命名失败");
    return;
  }

  const toPath = joinPath(workspaceRoot, target);
  const result = await renamePath(file.path, toPath);
  if (!result.ok) {
    await alertDialog(`重命名失败：${result.error ?? "未知错误"}`, "重命名失败");
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
  const confirmed = await confirmDialog(`确定要将「${file.relativePath}」移入回收站吗？`, {
    title: "删除文件",
    confirmLabel: "移入回收站",
    danger: true,
  });
  if (!confirmed) return;

  const result = await trashPath(file.path);
  if (!result.ok) {
    await alertDialog(`删除失败：${result.error ?? "未知错误"}`, "删除失败");
    return;
  }

  const doc = documents.find((d) => d.filePath === file.path);
  if (doc) {
    documents = documents.filter((d) => d.id !== doc.id);
    tabState = closeTab(tabState, doc.id);
    if (activeDocId === doc.id && documents.length > 0) {
      activeDocId = documents[0].id;
      syncTitle(documents[0].title);
      editor.setMarkdown(documents[0].content, { resetHistory: true });
    }
  }
  if (activeFilePath === file.path) activeFilePath = null;

  await refreshWorkspace();
  renderTabs();
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

/** 更新视图切换指示器：主视图显示"源码模式"，源码视图显示"退出源代码模式" */


/** 更新视图切换指示器：主视图显示"源码模式"，源码视图显示"退出源代码模式" */
function syncViewToggleIndicator() {
  if (!btnViewToggle) return;
  if (isSourceMode) {
    btnViewToggle.classList.add("is-source");
    viewToggleLabel.textContent = "退出源代码模式";
    viewToggleIcon.textContent = "</>";
    btnViewToggle.title = "退出源代码模式 (Ctrl+/)";
  } else {
    btnViewToggle.classList.remove("is-source");
    viewToggleLabel.textContent = "源码模式";
    viewToggleIcon.textContent = "</>";
    btnViewToggle.title = "切换到源码模式 (Ctrl+/)";
  }
}

/**
 * 源码视图与渲染视图共用的「行高测量」。
 *
 * textarea 会按宽度自动折行，长段落占的视觉行远多于逻辑行。
 * 用镜像 DOM 逐行量真实高度，量不出来时退回 行号 × lineHeight 的估算。
 */
/**
 * 源码字符偏移 → 该偏移在 textarea 里的像素顶部（含 padding）。
 *
 * 在镜像 DOM 里重排同一段文本，用 Range 读该字符所在行的矩形。
 * 关键是把 textarea 的宽度/字体/空白处理逐项复制过去，否则折行位置会变。
 */
function sourceTopForOffset(text: string, offset: number): number {
  const cs = getComputedStyle(sourceEditor);
  const lineHeight = parseFloat(cs.lineHeight) || 24;
  const paddingTop = parseFloat(cs.paddingTop) || 0;
  const clamped = Math.max(0, Math.min(offset, text.length));

  // 关键：镜像的可用宽度必须与 textarea 的「内容宽度」一致。
  // textarea 是 border-box，padding 由控件自己扣；div 若也用 border-box，
  // 就需要 width = clientWidth 且 padding = 0（已扣过一次），宽度才对得上。
  // 这里用 content-box + 显式内容宽度，避免重复扣除 padding。
  const mirror = document.createElement("div");
  const contentWidth = Math.max(
    1,
    sourceEditor.clientWidth - parseFloat(cs.paddingLeft || "0") - parseFloat(cs.paddingRight || "0")
  );
  mirror.style.cssText = [
    "position:absolute",
    "visibility:hidden",
    "top:0",
    "left:-99999px",
    `width:${contentWidth}px`,
    "padding:0",
    "border:0",
    "box-sizing:content-box",
    `font-family:${cs.fontFamily}`,
    `font-size:${cs.fontSize}`,
    `font-weight:${cs.fontWeight}`,
    `font-style:${cs.fontStyle}`,
    `line-height:${cs.lineHeight}`,
    `letter-spacing:${cs.letterSpacing}`,
    `word-spacing:${cs.wordSpacing}`,
    `text-transform:${cs.textTransform}`,
    `font-variant:${cs.fontVariant}`,
    `font-feature-settings:${cs.fontFeatureSettings}`,
    "white-space:pre-wrap",
    "overflow-wrap:break-word",
    "word-break:normal",
    "tab-size:4",
  ].join(";");
  document.body.appendChild(mirror);

  let top = Number.NaN;
  try {
    const node = mirror.firstChild;
    if (node) {
      const range = document.createRange();
      range.setStart(node, clamped);
      range.setEnd(node, Math.min(text.length, clamped + 1));
      const rects = range.getClientRects();
      if (rects.length > 0) {
        top = rects[0].top - mirror.getBoundingClientRect().top;
      }
    }
  } catch {
    top = Number.NaN;
  }
  mirror.remove();

  if (!Number.isFinite(top) || top < 0) {
    return paddingTop + (text.slice(0, clamped).split("\n").length - 1) * lineHeight;
  }
  return paddingTop + top;
}

/**
 * 切到源码视图：以「渲染视图可视区顶部的第一个块」为锚点。
 *
 * 不用光标位置——光标常停在视口外的某一行（例如搜索命中后又滚回去读），
 * 按光标同步会把用户带到看不见的地方。用户要的是"我还停在这段文字"。
 */
function enterSourceMode(): void {
  const anchor = editor.getTopVisibleBlock();
  const spans = editor.getBlockSpans();

  sourceEditor.value = editor.getMarkdown();
  sourceEditor.classList.add("visible");
  btnToggleSource.classList.add("active");

  // 1) 优先用「块 → 源码字符偏移」的精确映射（与序列化器同源，逐字一致）
  let sourceOffset: number | null = null;
  if (anchor && spans[anchor.index]) {
    sourceOffset = spans[anchor.index].start;
  }

  // 2) 块偏移与源码文本对不上时（外部粘贴、块重建等），按文字反查
  const metrics = editor.getScrollMetrics();
  const ratio = ratioFromScroll(metrics.top, metrics.scrollHeight, metrics.height);
  const nearLine = Math.round(ratio * sourceEditor.value.split("\n").length);
  if (sourceOffset === null && anchor?.text) {
    const found = findAnchorLine(anchor.text, sourceEditor.value, nearLine);
    if (found !== null) {
      sourceOffset = lineStartOffsets(sourceEditor.value)[found] ?? null;
    }
  }

  // 3) 最后兜底：按块序号估行
  if (sourceOffset === null) {
    const blocks = computeBlockStartLines(sourceEditor.value, editor.getBlockCount());
    const line = lineForBlockIndex(blocks, anchor?.index ?? editor.getCursorBlockIndex());
    sourceOffset = lineStartOffsets(sourceEditor.value)[line] ?? 0;
  }

  // 让浏览器自己算偏移位置的像素坐标：它对折行有权威数据，
  // 镜像测量在长行/表格上会偏。做法是先把光标移到锚点并聚焦，
  // 浏览器会将它滚进视野；随后读出锚点相对视口顶部的距离并校正。
  sourceEditor.focus();
  sourceEditor.setSelectionRange(sourceOffset, sourceOffset);
  sourceEditor.scrollTop = sourceTopForOffset(sourceEditor.value, sourceOffset);

  // 再用浏览器实际折行结果校正一次（差分，不依赖绝对测量）
  const settle = () => {
    sourceEditor.scrollTop = sourceTopForOffset(sourceEditor.value, sourceOffset);
  };
  requestAnimationFrame(settle);
  syncViewToggleIndicator();
}

/**
 * 切回渲染视图：以「源码可视区顶部的第一个视觉行」为锚点。
 */
function exitSourceMode(): void {
  const sourceText = sourceEditor.value;

  // 顶部锚点：用与正向完全相同的镜像测量，反查「可视区顶部那个字符」
  const anchorOffset = offsetAtSourceTop(sourceText, sourceEditor.scrollTop);

  editor.setMarkdown(sourceText);

  const doc = documents.find((d) => d.id === activeDocId);
  if (doc && doc.content !== sourceText) {
    doc.content = sourceText;
    doc.dirty = true;
    doc.updatedAt = Date.now();
    scheduleSave();
  }

  sourceEditor.classList.remove("visible");
  btnToggleSource.classList.remove("active");
  editor.focus();
  syncViewToggleIndicator();

  // setMarkdown 之后 ProseMirror 的 DOM 要重建，等两帧再定位
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const spans = editor.getBlockSpans();

      // 字符偏移落在哪个块，就是渲染视图该顶到哪个块
      let targetIndex = -1;
      for (let i = 0; i < spans.length; i++) {
        if (anchorOffset >= spans[i].start && anchorOffset < spans[i].end) {
          targetIndex = i;
          break;
        }
      }
      if (targetIndex < 0 && spans.length > 0) {
        targetIndex = anchorOffset >= spans[spans.length - 1].end ? spans.length - 1 : 0;
      }

      if (targetIndex >= 0) {
        // 只滚到该块顶部，不移动光标——用户在源码里未必把光标放在正在读的位置
        editor.scrollBlockToTop(targetIndex);
        return;
      }

      // 兜底：按内容比例滚动
      const ratio = sourceText.length > 0 ? anchorOffset / sourceText.length : 0;
      const m = editor.getScrollMetrics();
      const scroller = document.querySelector(".ty-editor-scroller") as HTMLElement | null;
      if (scroller) {
        scroller.scrollTop = ratio * Math.max(0, m.scrollHeight - m.height);
      }
    })
  );
}

/**
 * 源码可视区顶部的字符偏移。
 *
 * 与 sourceTopForOffset 互为逆运算，同样依赖「镜像宽度 = textarea 内容宽度」
 * 这个前提；宽度对不上时折行位置就不同，整块偏移都会错。
 */
function offsetAtSourceTop(text: string, scrollTop: number): number {
  const cs = getComputedStyle(sourceEditor);
  // textarea 的 scrollTop 0 点即内容第一行顶部，无需扣 padding
  const target = Math.max(0, scrollTop);

  const mirror = document.createElement("div");
  const contentWidth = Math.max(
    1,
    sourceEditor.clientWidth - parseFloat(cs.paddingLeft || "0") - parseFloat(cs.paddingRight || "0")
  );
  mirror.style.cssText = [
    "position:absolute",
    "visibility:hidden",
    "top:0",
    "left:-99999px",
    `width:${contentWidth}px`,
    "padding:0",
    "border:0",
    "box-sizing:content-box",
    `font-family:${cs.fontFamily}`,
    `font-size:${cs.fontSize}`,
    `font-weight:${cs.fontWeight}`,
    `font-style:${cs.fontStyle}`,
    `line-height:${cs.lineHeight}`,
    `letter-spacing:${cs.letterSpacing}`,
    `word-spacing:${cs.wordSpacing}`,
    `text-transform:${cs.textTransform}`,
    `font-variant:${cs.fontVariant}`,
    `font-feature-settings:${cs.fontFeatureSettings}`,
    "white-space:pre-wrap",
    "overflow-wrap:break-word",
    "word-break:normal",
    "tab-size:4",
  ].join(";");
  mirror.textContent = text;
  document.body.appendChild(mirror);

  let result = 0;
  try {
    const node = mirror.firstChild;
    if (node) {
      const base = mirror.getBoundingClientRect().top;
      // 二分：找第一个「行顶部 >= 视口顶部」的字符
      let lo = 0;
      let hi = text.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        const range = document.createRange();
        range.setStart(node, mid);
        range.setEnd(node, Math.min(mid + 1, text.length));
        const rects = range.getClientRects();
        const top = rects.length > 0 ? rects[0].top - base : 0;
        if (top < target) lo = mid + 1;
        else hi = mid;
      }
      result = Math.min(lo, text.length);
    }
  } catch {
    result = 0;
  }
  mirror.remove();
  return result;
}

function toggleSourceMode() {
  isSourceMode = !isSourceMode;
  if (isSourceMode) {
    enterSourceMode();
  } else {
    exitSourceMode();
  }
}

btnToggleSource.addEventListener("click", toggleSourceMode);
btnViewToggle?.addEventListener("click", toggleSourceMode);

// 初始化指示器
syncViewToggleIndicator();

function handleOpenInsertTable() {
  if (isSourceMode) {
    toggleSourceMode();
  }
  openTableInsertDialog((rows, cols) => {
    editor.insertTable(rows, cols);
  });
}

/** 源码模式的查找面板：按需创建，输入框与 textarea 一一对应 */
let sourceSearchPanel: SourceSearchPanel | null = null;

function ensureSourceSearch(): SourceSearchPanel {
  if (!sourceSearchPanel) {
    sourceSearchPanel = new SourceSearchPanel(sourceEditor);
  }
  return sourceSearchPanel;
}

/**
 * 把图片复制到系统剪贴板。
 *
 * Markdown 里的 src 可能是相对路径、data URL 或网络地址：
 * 前两种能拿到真实像素，网络地址交给浏览器读图。
 */
async function copyImageToClipboard(src: string, absolutePath: string | null): Promise<boolean> {
  const api = getDesktopAPI();
  try {
    if (/^data:/i.test(src)) {
      const r = await api?.copyImage?.({ dataUrl: src });
      return Boolean(r?.ok);
    }
    if (absolutePath) {
      const r = await api?.copyImage?.({ path: absolutePath });
      if (r?.ok) return true;
    }
    const dataUrl = await fetchImageAsDataUrl(src);
    if (dataUrl) {
      const r = await api?.copyImage?.({ dataUrl });
      return Boolean(r?.ok);
    }
  } catch (err) {
    console.warn("复制图片失败", err);
  }
  toast("无法复制这张图片", "error");
  return false;
}

/** 用浏览器把任意可加载的图片转成 data URL */
async function fetchImageAsDataUrl(src: string): Promise<string | null> {
  try {
    const response = await fetch(src);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** 图片「另存为」：交给主进程弹保存对话框 */
async function saveImageWithDialog(src: string, suggestedName: string): Promise<boolean> {
  const api = getDesktopAPI();
  if (!api?.saveImageAs) {
    toast("仅桌面版支持另存图片", "info");
    return false;
  }
  const doc = documents.find((d) => d.id === activeDocId);
  const absolute = resolveImageFilePath(src, doc?.filePath ?? null);

  const result = /^data:/i.test(src)
    ? await api.saveImageAs({ dataUrl: src, suggestedName })
    : await api.saveImageAs({ path: absolute ?? src, suggestedName });

  if (result?.canceled) return false;
  if (result?.ok) {
    toast("图片已保存：" + extractFileName(result.path ?? suggestedName), "success");
    return true;
  }
  toast("图片保存失败", "error");
  return false;
}

/** 图片附件的目录名（与笔记同级） */
const IMAGE_ATTACHMENT_DIR = "attachments";

/**
 * 把图片放到文档同级的 attachments/ 下，返回写进 Markdown 的相对路径。
 *
 * 只在「文档已保存到磁盘」且桌面版可用时生效；返回 null 时编辑器会退回
 * data URL 内联，行为与之前一致（至少图片不会丢）。
 */
async function persistImageForDocument(file: File): Promise<string | null> {
  const api = getDesktopAPI();
  if (!api?.saveImage) return null;

  const doc = documents.find((d) => d.id === activeDocId);
  if (!doc?.filePath) return null;

  const dataUrl = await readImageAsDataUrl(file);
  if (!dataUrl) return null;

  const directory = joinPath(dirname(doc.filePath), IMAGE_ATTACHMENT_DIR);
  const result = await api.saveImage({ directory, dataUrl, name: file.name || "image" });
  if (!result?.ok || !result.path) {
    console.warn("保存图片失败，退回内联：", result?.error);
    return null;
  }

  // Markdown 里只存相对路径，文档换机器也能用
  return `${IMAGE_ATTACHMENT_DIR}/${extractFileName(result.path)}`;
}

/** 插入代码块（菜单 Ctrl+Shift+K，与 Typora 一致） */
function handleInsertCodeBlock() {
  if (isSourceMode) toggleSourceMode();
  editor.insertCodeBlock();
}

/** 插入公式块（菜单 Ctrl+Shift+M，与 Typora 一致） */
function handleInsertMathBlock() {
  if (isSourceMode) toggleSourceMode();
  editor.insertMathBlock();
}

/**
 * 插入图片（菜单 Ctrl+Shift+I，与 Typora 一致）。
 *
 * 目前把图片读成 data URL 内联进 Markdown——和拖入 / 粘贴图片的行为一致，
 * 至少保证这条菜单不是空壳。复制到附件目录见 README 的后续计划。
 */
function handleInsertImage() {
  if (isSourceMode) toggleSourceMode();
  pickLocalImage((file) => {
    void (async () => {
      // 已保存的文档优先落到 attachments/，只有拿不到路径时才内联
      const persisted = await persistImageForDocument(file);
      if (persisted) {
        editor.insertImage(persisted, file.name.replace(/\.[^.]+$/, ""));
        return;
      }
      const dataUrl = await readImageAsDataUrl(file);
      if (!dataUrl) {
        toast("无法读取这张图片", "error");
        return;
      }
      editor.insertImage(dataUrl, file.name.replace(/\.[^.]+$/, ""));
    })();
  });
}

function readImageAsDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}


/** 按偏好处理行尾符与末尾换行后，再进行磁盘写入 */
function prepareContentForDisk(content: string): string {
  const settings = loadSettings();
  const withEnding = convertLineEnding(content, settings.lineEnding);
  return ensureFinalNewline(withEnding, settings.finalNewline);
}

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

    // 已有路径时统一走带历史副本与状态反馈的保存流程
    if (currentDoc.filePath) {
      await runManualSave();
      return;
    }

    showSaveStatus("保存中…", "saving");
    const rawContent = isSourceMode ? sourceEditor.value : editor.getMarkdown();
    const content = prepareContentForDisk(rawContent);
    const suggestedName = suggestedSaveName(documents, activeDocId);
    const result = await api.saveFile({ content, suggestedName });

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
      await refreshTrackedFile(currentDoc.id, result.path);
      showSaveStatus("已保存", "saved");
    } else {
      showSaveStatus("已取消", "idle");
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
    const content = prepareContentForDisk(
      isSourceMode ? sourceEditor.value : editor.getMarkdown()
    );
    const suggestedName = suggestedSaveName(documents, activeDocId);

    showSaveStatus("保存中…", "saving");
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
      await refreshTrackedFile(currentDoc.id, result.path);
      showSaveStatus("已保存", "saved");
    } else {
      // 用户取消了文件对话框
      showSaveStatus("已取消", "idle");
    }
  } else {
    downloadMarkdown();
  }
}

window.addEventListener("keydown", (e) => {
  // 偏好设置 (Ctrl+,)
  if ((e.ctrlKey || e.metaKey) && e.key === ",") {
    e.preventDefault();
    openSettingsModal();
    return;
  }
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
    if (isSourceMode) {
      ensureSourceSearch().open(false);
    } else {
      editor.toggleSearch(false);
    }
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "h") {
    e.preventDefault();
    if (isSourceMode) {
      ensureSourceSearch().open(true);
    } else {
      editor.openSearch(true);
    }
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
  const handle = openDialog({
    title: "导出 Markdown 格式选项",
    maxWidth: 560,
    body: `
      <p class="ty-modal-desc">
        当前文档包含 MarkWeave 自定义拖拽排版的 Mermaid 图表。请选择导出方式：
      </p>
      <div class="ty-export-options">
        <label class="ty-export-option-card selected" id="opt-card-markweave">
          <input type="radio" name="export-mode" value="markweave" checked />
          <div class="ty-export-option-content">
            <div class="ty-export-option-title">保留 MarkWeave 增强格式</div>
            <div class="ty-export-option-desc">
              完整保留你对图表组件拖拽的位置微调与排版元数据。
              再次用 MarkWeave 打开可无损恢复布局，继续可视化编辑。
            </div>
          </div>
        </label>
        <label class="ty-export-option-card" id="opt-card-compat">
          <input type="radio" name="export-mode" value="compatible" />
          <div class="ty-export-option-content">
            <div class="ty-export-option-title">导出通用兼容格式</div>
            <div class="ty-export-option-desc">
              剥离专有排版注释，转换为标准 Mermaid 语法。
              确保在 GitHub、Typora、Notion、Obsidian 等平台正常渲染。
            </div>
          </div>
        </label>
      </div>
    `,
    actions: [
      { label: "取消" },
      {
        label: "确认导出",
        variant: "primary",
        onClick: () => {
          const isCompat =
            handle.query<HTMLInputElement>('input[value="compatible"]')?.checked ?? false;
          const content = isCompat ? cleanMermaidForCompatibility(rawContent) : rawContent;
          doDownloadFile(content, defaultFilename);
        },
      },
    ],
  });

  const cardMarkweave = handle.query<HTMLElement>("#opt-card-markweave");
  const cardCompat = handle.query<HTMLElement>("#opt-card-compat");
  const radioMarkweave = handle.query<HTMLInputElement>('input[value="markweave"]');
  const radioCompat = handle.query<HTMLInputElement>('input[value="compatible"]');

  cardMarkweave?.addEventListener("click", () => {
    if (radioMarkweave) radioMarkweave.checked = true;
    cardMarkweave.classList.add("selected");
    cardCompat?.classList.remove("selected");
  });

  cardCompat?.addEventListener("click", () => {
    if (radioCompat) radioCompat.checked = true;
    cardCompat.classList.add("selected");
    cardMarkweave?.classList.remove("selected");
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
  /** 插入图片的默认对齐（center / left / right） */
  imageDefaultAlign: "center" | "left" | "right";
  mermaidDefaultMode: "custom" | "standard";
  mermaidDefaultCurve: "step-round" | "step" | "basis" | "linear";
  mermaidTheme: MermaidThemePreference;
  gridSnap: boolean;
  exportScale: number;
  fontSize: string;
  lineHeight: string;
  /** 正文字体：西文 / 中文 分开 */
  bodyLatinFont: string;
  bodyCJKFont: string;
  customBodyLatin: string;
  customBodyCJK: string;
  /** 代码字体：西文 / 中文 分开 */
  monoLatinFont: string;
  monoCJKFont: string;
  customMonoLatin: string;
  customMonoCJK: string;
  exportPolicy: "ask" | "markweave" | "compatible";
  theme: ThemeSetting;
  language: Language;
  editorTheme: string;
  pdf: PdfOptions;
  autoPair: boolean;
  smartPunctuation: boolean;
  indentSize: number;
  lineEnding: LineEnding;
  finalNewline: boolean;
  autoSave: AutoSaveSettings;
  behavior: EditorBehaviorSettings;
  markdownSyntax: MarkdownSyntaxOptions;
  mineru: MineruSettings;
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

const DEFAULT_MINERU_SETTINGS: MineruSettings & { cloudUploadConfirmed: boolean } = {
  mode: "local",
  cloud: { endpoint: "", hasApiKey: false, keySource: "none" },
  location: { ...DEFAULT_OUTPUT_LOCATION },
  cloudUploadConfirmed: false,
};

/** MinerU 设置的本地存档（密钥本身不在这里，走 safeStorage） */
function loadMineruSettings(): MineruSettings {
  try {
    const raw = localStorage.getItem("markweave_mineru");
    if (!raw) return { ...DEFAULT_MINERU_SETTINGS };

    const parsed = JSON.parse(raw) as any;
    return {
      mode: parsed.mode === "cloud" ? "cloud" : "local",
      cloud: {
        endpoint: typeof parsed.cloud?.endpoint === "string" ? parsed.cloud.endpoint : "",
        hasApiKey: parsed.cloud?.hasApiKey === true,
        keySource: "none",
      },
      location: normalizeOutputLocation(parsed.location),
      cloudUploadConfirmed: parsed.cloudUploadConfirmed === true,
    };
  } catch {
    return { ...DEFAULT_MINERU_SETTINGS };
  }
}

function loadMarkdownSyntax(): MarkdownSyntaxOptions {
  try {
    const raw = localStorage.getItem("markweave_markdown_syntax");
    if (!raw) return { ...DEFAULT_SYNTAX_OPTIONS };
    const parsed = JSON.parse(raw) as Partial<MarkdownSyntaxOptions>;
    return {
      softBreaksAsHardBreaks:
        typeof parsed.softBreaksAsHardBreaks === "boolean"
          ? parsed.softBreaksAsHardBreaks
          : DEFAULT_SYNTAX_OPTIONS.softBreaksAsHardBreaks,
      autoLink:
        typeof parsed.autoLink === "boolean"
          ? parsed.autoLink
          : DEFAULT_SYNTAX_OPTIONS.autoLink,
    };
  } catch {
    return { ...DEFAULT_SYNTAX_OPTIONS };
  }
}

function loadEditorBehavior(): EditorBehaviorSettings {
  try {
    const raw = localStorage.getItem("markweave_editor_behavior");
    if (!raw) return { ...DEFAULT_EDITOR_BEHAVIOR };
    return normalizeEditorBehavior(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_EDITOR_BEHAVIOR };
  }
}

function loadAutoSaveSettings(): AutoSaveSettings {
  try {
    const raw = localStorage.getItem("markweave_autosave");
    if (!raw) return { ...DEFAULT_AUTO_SAVE };
    return normalizeAutoSaveSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_AUTO_SAVE };
  }
}

/** 归一化图片默认对齐设置 */
function normalizeImageAlign(raw: string | null): "center" | "left" | "right" {
  return raw === "left" || raw === "right" ? raw : "center";
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
    bodyLatinFont: normalizeFontIdForGroup("bodyLatin", localStorage.getItem("markweave_body_latin_font")),
    bodyCJKFont: normalizeFontIdForGroup("bodyCJK", localStorage.getItem("markweave_body_cjk_font")),
    customBodyLatin: localStorage.getItem("markweave_custom_body_latin") || "",
    customBodyCJK: localStorage.getItem("markweave_custom_body_cjk") || "",
    monoLatinFont: normalizeFontIdForGroup("monoLatin", localStorage.getItem("markweave_mono_latin_font")),
    monoCJKFont: normalizeFontIdForGroup("monoCJK", localStorage.getItem("markweave_mono_cjk_font")),
    customMonoLatin: localStorage.getItem("markweave_custom_mono_latin") || "",
    customMonoCJK: localStorage.getItem("markweave_custom_mono_cjk") || "",
    exportPolicy: (localStorage.getItem("markweave_default_export_policy") as any) || "ask",
    theme: (localStorage.getItem("markweave_theme") as any) || "light",
    language: normalizeLanguage(localStorage.getItem("markweave_language")),
    editorTheme: normalizeThemeId(localStorage.getItem("markweave_editor_theme")),
    imageDefaultAlign: normalizeImageAlign(localStorage.getItem("markweave_image_align")),
    pdf: normalizePdfOptions(loadPdfOptions()),
    autoPair: localStorage.getItem("markweave_auto_pair") !== "false",
    smartPunctuation: localStorage.getItem("markweave_smart_punctuation") !== "false",
    indentSize: parseInt(localStorage.getItem("markweave_indent_size") || "2", 10) || 2,
    lineEnding: (localStorage.getItem("markweave_line_ending") as LineEnding) || "lf",
    finalNewline: localStorage.getItem("markweave_final_newline") !== "false",
    autoSave: loadAutoSaveSettings(),
    behavior: loadEditorBehavior(),
    markdownSyntax: loadMarkdownSyntax(),
    mineru: loadMineruSettings(),
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
  localStorage.setItem("markweave_body_latin_font", settings.bodyLatinFont);
  localStorage.setItem("markweave_body_cjk_font", settings.bodyCJKFont);
  localStorage.setItem("markweave_custom_body_latin", settings.customBodyLatin);
  localStorage.setItem("markweave_custom_body_cjk", settings.customBodyCJK);
  localStorage.setItem("markweave_mono_latin_font", settings.monoLatinFont);
  localStorage.setItem("markweave_mono_cjk_font", settings.monoCJKFont);
  localStorage.setItem("markweave_custom_mono_latin", settings.customMonoLatin);
  localStorage.setItem("markweave_custom_mono_cjk", settings.customMonoCJK);
  localStorage.setItem("markweave_default_export_policy", settings.exportPolicy);
  localStorage.setItem("markweave_theme", settings.theme);
  localStorage.setItem("markweave_language", settings.language);
  localStorage.setItem("markweave_editor_theme", settings.editorTheme);
  localStorage.setItem("markweave_image_align", settings.imageDefaultAlign);
  localStorage.setItem("markweave_pdf_options", JSON.stringify(settings.pdf));
  localStorage.setItem("markweave_auto_pair", String(settings.autoPair));
  localStorage.setItem("markweave_smart_punctuation", String(settings.smartPunctuation));
  localStorage.setItem("markweave_indent_size", String(settings.indentSize));
  localStorage.setItem("markweave_line_ending", settings.lineEnding);
  localStorage.setItem("markweave_final_newline", String(settings.finalNewline));
  localStorage.setItem("markweave_autosave", JSON.stringify(settings.autoSave));
  localStorage.setItem("markweave_editor_behavior", JSON.stringify(settings.behavior));
  localStorage.setItem("markweave_markdown_syntax", JSON.stringify(settings.markdownSyntax));
  localStorage.setItem(
    "markweave_mineru",
    JSON.stringify({
      mode: settings.mineru.mode,
      cloud: {
        endpoint: settings.mineru.cloud.endpoint,
        // 只记录是否已配置，密钥本体在 safeStorage
        hasApiKey: settings.mineru.cloud.hasApiKey,
      },
      location: settings.mineru.location,
      cloudUploadConfirmed: settings.mineru.cloudUploadConfirmed,
    })
  );

  applySettings(settings);
}

let currentMermaidThemePreference: MermaidThemePreference = normalizeMermaidTheme(
  typeof localStorage !== "undefined" ? localStorage.getItem("markweave_mermaid_theme") : "auto"
);

/** 把编辑器行为设置应用到 DOM：拼写检查、代码换行等 */
function applyEditorBehavior(behavior: EditorBehaviorSettings) {
  // 拼写检查：正文可编辑区
  const editable = mountEl;
  if (editable) {
    editable.setAttribute("spellcheck", behavior.spellcheck ? "true" : "false");
  }

  // 代码块自动换行
  document.body.classList.toggle("code-wrap", behavior.codeWrap);

  // 自动链接由输入规则插件在运行时读取，这里只需持久化
}

/** 把语法开关写入解析器；变更后需重新解析当前文档才生效 */
function applyMarkdownSyntax(syntax: MarkdownSyntaxOptions) {
  setMarkdownSyntaxOptions(syntax);
}

function applySettings(settings: MarkWeaveSettings) {
  const root = document.documentElement;
  root.style.setProperty("--editor-font-size", settings.fontSize);
  root.style.setProperty("--editor-line-height", settings.lineHeight);

  // 正文：西文候选在前、中文候选在后，最后只留一个 generic。
  // 浏览器按字形逐字回退，所以英文命中前面的西文字体，中文落到后面的中文字体。
  const bodyStack = [
    ...resolveFontFamilies("bodyLatin", settings.bodyLatinFont, settings.customBodyLatin),
    ...resolveFontFamilies("bodyCJK", settings.bodyCJKFont, settings.customBodyCJK),
    genericFor("bodyLatin"),
  ];
  root.style.setProperty("--editor-font-family", bodyStack.join(", "));

  const monoStack = [
    ...resolveFontFamilies("monoLatin", settings.monoLatinFont, settings.customMonoLatin),
    ...resolveFontFamilies("monoCJK", settings.monoCJKFont, settings.customMonoCJK),
    genericFor("monoLatin"),
  ];
  root.style.setProperty("--monospace", monoStack.join(", "));

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
  applyAutoSaveSettings(settings.autoSave);
  applyEditorBehavior(settings.behavior);
  applyMarkdownSyntax(settings.markdownSyntax);

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
    <div class="ty-modal-card ty-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-dialog-title">
      <div class="ty-modal-header ty-settings-header">
        <div class="ty-modal-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
          偏好设置
        </div>
        <button class="ty-modal-close" id="btn-close-settings-x" aria-label="关闭">&times;</button>
      </div>

      <div class="ty-settings-nav" id="settings-tabs-nav" role="tablist" aria-label="设置分类">
        <button class="ty-settings-tab-btn active" data-tab="charts">图表设置</button>
        <button class="ty-settings-tab-btn" data-tab="editor">字体排版</button>
        <button class="ty-settings-tab-btn" data-tab="appearance">外观主题</button>
        <button class="ty-settings-tab-btn" data-tab="storage">存储与导出</button>
        <button class="ty-settings-tab-btn" data-tab="about">关于系统</button>
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
                  增强模式 <span class="ty-badge-recommended">默认推荐</span>
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
                  兼容模式
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
            <select class="ty-settings-select" id="setting-select-curve" aria-label="默认折线拐角风格">
              <option value="step-round" ${currentSettings.mermaidDefaultCurve === "step-round" ? "selected" : ""}>正交圆角折线 (Rounded Step, 推荐)</option>
              <option value="step" ${currentSettings.mermaidDefaultCurve === "step" ? "selected" : ""}>正交直角折线 (Orthogonal Step)</option>
              <option value="basis" ${currentSettings.mermaidDefaultCurve === "basis" ? "selected" : ""}>平滑贝塞尔曲线 (Smooth Curve)</option>
              <option value="linear" ${currentSettings.mermaidDefaultCurve === "linear" ? "selected" : ""}>经典折线/直线 (Linear)</option>
            </select>
          </div>

          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">节点拖拽吸附网格</span>
              <span class="ty-settings-desc">拖拽节点时自动吸附对齐到 20px 网格，连线更规整</span>
            </div>
            <label class="ty-settings-toggle">
              <input type="checkbox" id="setting-toggle-grid" ${currentSettings.gridSnap ? "checked" : ""} aria-label="节点拖拽吸附网格" />
              <span class="ty-toggle-slider"></span>
            </label>
          </div>

          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">预览图复制分辨率</span>
              <span class="ty-settings-desc">在预览模式下一键复制图片到剪贴板的分辨率倍数</span>
            </div>
            <select class="ty-settings-select" id="setting-select-scale" aria-label="预览图复制分辨率">
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
            <select class="ty-settings-select" id="setting-select-mermaid-theme" aria-label="Mermaid 主题">
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
            <select class="ty-settings-select" id="setting-select-font-size" aria-label="正文字体大小">
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
            <select class="ty-settings-select" id="setting-select-line-height" aria-label="正文行间距">
              <option value="1.5" ${currentSettings.lineHeight === "1.5" ? "selected" : ""}>1.5 (紧凑)</option>
              <option value="1.65" ${currentSettings.lineHeight === "1.65" ? "selected" : ""}>1.65 (标准 Typora)</option>
              <option value="1.8" ${currentSettings.lineHeight === "1.8" ? "selected" : ""}>1.8 (宽松舒适)</option>
              <option value="2.0" ${currentSettings.lineHeight === "2.0" ? "selected" : ""}>2.0 (双倍行距)</option>
            </select>
          </div>

          <div class="ty-settings-section-title">正文字体</div>

          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">正文 · 西文</span>
              <span class="ty-settings-desc">英文字母与数字使用的字体</span>
            </div>
            <select class="ty-settings-select" id="setting-select-body-latin" aria-label="正文 · 西文">
              ${BODY_LATIN_FONTS.map(
                (font) =>
                  `<option value="${font.id}" ${
                    currentSettings.bodyLatinFont === font.id ? "selected" : ""
                  }>${font.label}</option>`
              ).join("")}
            </select>
          </div>

          <div class="ty-settings-row" id="row-custom-body-latin" style="display: ${
            currentSettings.bodyLatinFont === "custom" ? "flex" : "none"
          };">
            <div class="ty-settings-info">
              <span class="ty-settings-label">自定义西文字体</span>
              <span class="ty-settings-desc">填写本机已安装的字体名，可用逗号分隔多个候选</span>
            </div>
            <input class="ty-settings-input ty-settings-input-wide" type="text" id="setting-input-body-latin"
              placeholder="例如：EB Garamond, Garamond"
              value="${currentSettings.customBodyLatin.replace(/"/g, "&quot;")}" aria-label="自定义西文字体" />
          </div>

          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">正文 · 中文</span>
              <span class="ty-settings-desc">中文字符使用的字体，与西文独立</span>
            </div>
            <select class="ty-settings-select" id="setting-select-body-cjk" aria-label="正文 · 中文">
              ${BODY_CJK_FONTS.map(
                (font) =>
                  `<option value="${font.id}" ${
                    currentSettings.bodyCJKFont === font.id ? "selected" : ""
                  }>${font.label}</option>`
              ).join("")}
            </select>
          </div>

          <div class="ty-settings-row" id="row-custom-body-cjk" style="display: ${
            currentSettings.bodyCJKFont === "custom" ? "flex" : "none"
          };">
            <div class="ty-settings-info">
              <span class="ty-settings-label">自定义中文字体</span>
              <span class="ty-settings-desc">填写本机已安装的中文字体名</span>
            </div>
            <input class="ty-settings-input ty-settings-input-wide" type="text" id="setting-input-body-cjk"
              placeholder="例如：Source Han Sans SC"
              value="${currentSettings.customBodyCJK.replace(/"/g, "&quot;")}" aria-label="自定义中文字体" />
          </div>

          <div class="ty-settings-section-title" style="margin-top: 18px;">代码字体</div>

          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">代码 · 西文</span>
              <span class="ty-settings-desc">代码块中英文代码使用的等宽字体</span>
            </div>
            <select class="ty-settings-select" id="setting-select-mono-latin" aria-label="代码 · 西文">
              ${MONO_LATIN_FONTS.map(
                (font) =>
                  `<option value="${font.id}" ${
                    currentSettings.monoLatinFont === font.id ? "selected" : ""
                  }>${font.label}</option>`
              ).join("")}
            </select>
          </div>

          <div class="ty-settings-row" id="row-custom-mono-latin" style="display: ${
            currentSettings.monoLatinFont === "custom" ? "flex" : "none"
          };">
            <div class="ty-settings-info">
              <span class="ty-settings-label">自定义代码西文字体</span>
              <span class="ty-settings-desc">填写本机已安装的等宽字体名</span>
            </div>
            <input class="ty-settings-input ty-settings-input-wide" type="text" id="setting-input-mono-latin"
              placeholder="例如：JetBrains Mono"
              value="${currentSettings.customMonoLatin.replace(/"/g, "&quot;")}" aria-label="自定义代码西文字体" />
          </div>

          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">代码 · 中文</span>
              <span class="ty-settings-desc">代码块中注释等中文字符使用的字体</span>
            </div>
            <select class="ty-settings-select" id="setting-select-mono-cjk" aria-label="代码 · 中文">
              ${MONO_CJK_FONTS.map(
                (font) =>
                  `<option value="${font.id}" ${
                    currentSettings.monoCJKFont === font.id ? "selected" : ""
                  }>${font.label}</option>`
              ).join("")}
            </select>
          </div>

          <div class="ty-settings-row" id="row-custom-mono-cjk" style="display: ${
            currentSettings.monoCJKFont === "custom" ? "flex" : "none"
          };">
            <div class="ty-settings-info">
              <span class="ty-settings-label">自定义代码中文字体</span>
              <span class="ty-settings-desc">填写本机已安装的中文等宽字体名</span>
            </div>
            <input class="ty-settings-input ty-settings-input-wide" type="text" id="setting-input-mono-cjk"
              placeholder="例如：Sarasa Mono SC"
              value="${currentSettings.customMonoCJK.replace(/"/g, "&quot;")}" aria-label="自定义代码中文字体" />
          </div>

          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">自动配对括号与引号</span>
              <span class="ty-settings-desc">输入 ( [ { 与引号时自动补全右半部分</span>
            </div>
            <label class="ty-settings-toggle">
              <input type="checkbox" id="setting-toggle-autopair" ${currentSettings.autoPair ? "checked" : ""} aria-label="自动配对括号与引号" />
              <span class="ty-toggle-slider"></span>
            </label>
          </div>

          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">智能标点</span>
              <span class="ty-settings-desc">输入时把 -- 与 --- 转换为短横线/长横线</span>
            </div>
            <label class="ty-settings-toggle">
              <input type="checkbox" id="setting-toggle-smartpunct" ${currentSettings.smartPunctuation ? "checked" : ""} aria-label="智能标点" />
              <span class="ty-toggle-slider"></span>
            </label>
          </div>

          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">列表与引用缩进</span>
              <span class="ty-settings-desc">保存时使用的缩进空格数</span>
            </div>
            <select class="ty-settings-select" id="setting-select-indent" aria-label="列表与引用缩进">
              <option value="2" ${currentSettings.indentSize === 2 ? "selected" : ""}>2 空格（默认）</option>
              <option value="3" ${currentSettings.indentSize === 3 ? "selected" : ""}>3 空格</option>
              <option value="4" ${currentSettings.indentSize === 4 ? "selected" : ""}>4 空格</option>
            </select>
          </div>

          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">行尾符</span>
              <span class="ty-settings-desc">保存文件时使用的换行风格</span>
            </div>
            <select class="ty-settings-select" id="setting-select-line-ending" aria-label="行尾符">
              <option value="lf" ${currentSettings.lineEnding === "lf" ? "selected" : ""}>LF (Unix)</option>
              <option value="crlf" ${currentSettings.lineEnding === "crlf" ? "selected" : ""}>CRLF (Windows)</option>
            </select>
          </div>

          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">保存时保留末尾换行</span>
              <span class="ty-settings-desc">保证文件以换行结尾（推荐）</span>
            </div>
            <label class="ty-settings-toggle">
              <input type="checkbox" id="setting-toggle-finalnewline" ${currentSettings.finalNewline ? "checked" : ""} aria-label="保存时保留末尾换行" />
              <span class="ty-toggle-slider"></span>
            </label>
          </div>

          <div class="ty-settings-section-title" style="margin-top: 18px;">编辑行为</div>

          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">拼写检查</span>
              <span class="ty-settings-desc">正文中拼错的单词显示波浪下划线</span>
            </div>
            <label class="ty-settings-toggle">
              <input type="checkbox" id="setting-toggle-spellcheck" ${currentSettings.behavior.spellcheck ? "checked" : ""} aria-label="拼写检查" />
              <span class="ty-toggle-slider"></span>
            </label>
          </div>

          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">代码块自动换行</span>
              <span class="ty-settings-desc">长代码行折行显示，而不是横向滚动</span>
            </div>
            <label class="ty-settings-toggle">
              <input type="checkbox" id="setting-toggle-codewrap" ${currentSettings.behavior.codeWrap ? "checked" : ""} aria-label="代码块自动换行" />
              <span class="ty-toggle-slider"></span>
            </label>
          </div>

          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">恢复上次会话</span>
              <span class="ty-settings-desc">启动时打开上次的文档与光标位置</span>
            </div>
            <label class="ty-settings-toggle">
              <input type="checkbox" id="setting-toggle-restore" ${currentSettings.behavior.restoreSession ? "checked" : ""} aria-label="恢复上次会话" />
              <span class="ty-toggle-slider"></span>
            </label>
          </div>

          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">图片默认对齐</span>
              <span class="ty-settings-desc">插入图片时的默认对齐方式；单张图片可在右键菜单里单独调整</span>
            </div>
            <select class="ty-settings-select" id="setting-select-image-align" aria-label="图片默认对齐">
              <option value="center" ${currentSettings.imageDefaultAlign === "center" ? "selected" : ""}>居中（推荐）</option>
              <option value="left" ${currentSettings.imageDefaultAlign === "left" ? "selected" : ""}>左对齐</option>
              <option value="right" ${currentSettings.imageDefaultAlign === "right" ? "selected" : ""}>右对齐</option>
            </select>
          </div>

          <div class="ty-settings-section-title" style="margin-top: 18px;">Markdown 语法</div>

          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">单个换行视为换行</span>
              <span class="ty-settings-desc">开启后段落内换行直接断行；关闭时需空行才分段</span>
            </div>
            <label class="ty-settings-toggle">
              <input type="checkbox" id="setting-toggle-softbreak" ${currentSettings.markdownSyntax.softBreaksAsHardBreaks ? "checked" : ""} aria-label="单个换行视为换行" />
              <span class="ty-toggle-slider"></span>
            </label>
          </div>

          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">自动识别网址</span>
              <span class="ty-settings-desc">把裸网址自动转成可点击链接</span>
            </div>
            <label class="ty-settings-toggle">
              <input type="checkbox" id="setting-toggle-syntax-autolink" ${currentSettings.markdownSyntax.autoLink ? "checked" : ""} aria-label="自动识别网址" />
              <span class="ty-toggle-slider"></span>
            </label>
          </div>
        </div>

        <!-- Tab 3: 外观主题 -->
        <div class="ty-settings-panel" id="tab-panel-appearance">
          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">界面主题模式</span>
              <span class="ty-settings-desc">选择编辑器的色彩外观风格</span>
            </div>
            <select class="ty-settings-select" id="setting-select-theme" aria-label="界面主题模式">
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
            <select class="ty-settings-select" id="setting-select-editor-theme" aria-label="排版主题">
              ${getAllThemes()
                .map(
                  (theme) =>
                    `<option value="${theme.id}" ${
                      currentSettings.editorTheme === theme.id ? "selected" : ""
                    }>${theme.label}${theme.custom ? "（自定义）" : ""}</option>`
                )
                .join("")}
            </select>
          </div>

          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">菜单栏语言 / Menu language</span>
              <span class="ty-settings-desc">设置桌面原生菜单栏语言（Web 端不受影响）</span>
            </div>
            <select class="ty-settings-select" id="setting-select-language" aria-label="菜单栏语言 / Menu language">
              <option value="zh" ${currentSettings.language === "zh" ? "selected" : ""}>中文（默认）</option>
              <option value="en" ${currentSettings.language === "en" ? "selected" : ""}>English</option>
            </select>
          </div>

          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">自定义主题文件夹</span>
              <span class="ty-settings-desc">将 .css 主题文件放入该目录后，会出现在上方的“排版主题”列表中</span>
            </div>
            <button class="ty-settings-action" id="setting-btn-themes-folder" ${getDesktopAPI()?.openThemesFolder ? "" : "disabled"}>
              打开主题目录
            </button>
          </div>
        </div>

        <!-- Tab 4: 存储与导出 -->
        <div class="ty-settings-panel" id="tab-panel-storage">
          <div class="ty-settings-section-title">PDF 解析 (MinerU)</div>

          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">默认解析模式</span>
              <span class="ty-settings-desc">本地无需网络与费用；云端需要 API Key，速度更快</span>
            </div>
            <select class="ty-settings-select" id="setting-select-mineru-mode" aria-label="默认解析模式">
              <option value="local" ${currentSettings.mineru.mode === "local" ? "selected" : ""}>本地解析</option>
              <option value="cloud" ${currentSettings.mineru.mode === "cloud" ? "selected" : ""}>云端 API</option>
            </select>
          </div>

          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">本地环境状态</span>
              <span class="ty-settings-desc">首次使用需安装 MinerU 并下载模型</span>
            </div>
            <div class="ty-settings-inline">
              <span class="ty-mineru-status" id="mineru-local-status" aria-live="polite">检查中…</span>
              <button class="ty-settings-action" id="btn-mineru-detect">重新检测</button>
            </div>
          </div>

          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">云端 API Key</span>
              <span class="ty-settings-desc">密钥加密保存在本机，不会写入文档或配置</span>
            </div>
            <div class="ty-settings-inline">
              <span class="ty-mineru-status" id="mineru-key-status" aria-live="polite">未配置</span>
              <input class="ty-settings-input" type="password" id="setting-input-mineru-key"
                placeholder="粘贴 API Key" aria-label="MinerU 云端 API Key" autocomplete="off" />
              <button class="ty-settings-action" id="btn-mineru-save-key">保存</button>
              <button class="ty-settings-action" id="btn-mineru-test-key">测试连接</button>
              <button class="ty-settings-action" id="btn-mineru-clear-key">清除</button>
            </div>
          </div>

          <div class="ty-settings-section-title" style="margin-top: 18px;">解析结果存放位置</div>

          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">保存位置</span>
              <span class="ty-settings-desc">解析完成后自动保存，不打断当前操作</span>
            </div>
            <select class="ty-settings-select" id="setting-select-mineru-location" aria-label="解析结果保存位置">
              ${(["same-as-pdf", "fixed-folder", "same-as-note", "subfolder-of-note"] as OutputLocationMode[])
                .map(
                  (mode) =>
                    `<option value="${mode}" ${
                      currentSettings.mineru.location.mode === mode ? "selected" : ""
                    }>${LOCATION_MODE_LABELS[mode]}</option>`
                )
                .join("")}
            </select>
          </div>

          <div class="ty-settings-row" id="row-mineru-fixed" style="display: ${
            currentSettings.mineru.location.mode === "fixed-folder" ? "flex" : "none"
          };">
            <div class="ty-settings-info">
              <span class="ty-settings-label">固定文件夹</span>
              <span class="ty-settings-desc">所有解析结果都保存到这里</span>
            </div>
            <div class="ty-settings-inline">
              <input class="ty-settings-input ty-settings-input-wide" type="text" id="setting-input-mineru-folder"
                placeholder="D:/parsed" aria-label="固定文件夹"
                value="${currentSettings.mineru.location.fixedFolder.replace(/"/g, "&quot;")}" />
              <button class="ty-settings-action" id="btn-mineru-folder">选择…</button>
            </div>
          </div>

          <div class="ty-settings-row" id="row-mineru-subfolder" style="display: ${
            currentSettings.mineru.location.mode === "subfolder-of-note" ? "flex" : "none"
          };">
            <div class="ty-settings-info">
              <span class="ty-settings-label">子文件夹名称</span>
              <span class="ty-settings-desc">在笔记所在目录下创建的子目录</span>
            </div>
            <input class="ty-settings-input" type="text" id="setting-input-mineru-subfolder"
              aria-label="子文件夹名称"
              value="${currentSettings.mineru.location.subfolderName.replace(/"/g, "&quot;")}" />
          </div>

          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">每次解析后询问保存位置</span>
              <span class="ty-settings-desc">开启后每次解析完成都会弹出保存对话框</span>
            </div>
            <label class="ty-settings-toggle">
              <input type="checkbox" id="setting-toggle-mineru-ask" ${currentSettings.mineru.location.askEachTime ? "checked" : ""} aria-label="每次解析后询问保存位置" />
              <span class="ty-toggle-slider"></span>
            </label>
          </div>

          <div class="ty-settings-section-title" style="margin-top: 18px;">自动保存</div>
          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">自动保存模式</span>
              <span class="ty-settings-desc">默认关闭；开启后按下方方式自动写回原文件</span>
            </div>
            <select class="ty-settings-select" id="setting-select-autosave-mode" aria-label="自动保存模式">
              <option value="off" ${currentSettings.autoSave.mode === "off" ? "selected" : ""}>关闭（手动保存）</option>
              <option value="onChange" ${currentSettings.autoSave.mode === "onChange" ? "selected" : ""}>每次修改后自动保存</option>
              <option value="interval" ${currentSettings.autoSave.mode === "interval" ? "selected" : ""}>按固定间隔自动保存</option>
            </select>
          </div>

          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">自动保存间隔</span>
              <span class="ty-settings-desc">选择「按固定间隔」时生效，单位分钟</span>
            </div>
            <input class="ty-settings-input" type="number" id="setting-input-autosave-interval"
              min="1" max="120" step="1" value="${currentSettings.autoSave.intervalMinutes}" aria-label="自动保存间隔" />
          </div>

          <div class="ty-settings-section-title" style="margin-top: 18px;">保存与恢复</div>
          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">保留草稿与历史版本</span>
              <span class="ty-settings-desc">随时把当前编辑内容镜像到磁盘，崩溃或误操作后可恢复；与自动保存开关无关，默认开启</span>
            </div>
            <label class="ty-settings-toggle">
              <input type="checkbox" id="setting-toggle-history" ${currentSettings.autoSave.historyEnabled ? "checked" : ""} aria-label="保留草稿与历史版本" />
              <span class="ty-toggle-slider"></span>
            </label>
          </div>

          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">快照存放目录</span>
              <span class="ty-settings-desc">留空则存到文档同级的 .markweave-history 目录</span>
            </div>
            <div class="ty-settings-inline">
              <input class="ty-settings-input ty-settings-input-wide" type="text" id="setting-input-history-dir"
                placeholder="默认：文档同级 .markweave-history" value="${currentSettings.autoSave.historyDir}" aria-label="快照存放目录" />
              <button class="ty-settings-action" id="setting-btn-history-dir">选择…</button>
            </div>
          </div>

          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">快照总份数</span>
              <span class="ty-settings-desc">第 1 份是当前草稿，其余是可回退的历史版本；文件总数始终不超过这个值</span>
            </div>
            <input class="ty-settings-input" type="number" id="setting-input-history-max"
              min="1" max="20" step="1" value="${currentSettings.autoSave.maxHistory}" aria-label="快照总份数" />
          </div>

          <div class="ty-settings-section-title" style="margin-top: 18px;">导出</div>
          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">导出 Markdown 默认行为</span>
              <span class="ty-settings-desc">导出含 MarkWeave 排版图表时的默认处理机制</span>
            </div>
            <select class="ty-settings-select" id="setting-select-export-policy" aria-label="导出 Markdown 默认行为">
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
            <select class="ty-settings-select" id="setting-select-paper" aria-label="纸张尺寸">
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
              } aria-label="横向排版" />
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
              } aria-label="打印背景色" />
              <span class="ty-toggle-slider"></span>
            </label>
          </div>
        </div>

        <!-- Tab 5: 关于系统 -->
        <div class="ty-settings-panel" id="tab-panel-about">
          <div style="text-align: center; padding: 18px 0 10px;">
            <h2 style="font-size: 22px; font-weight: 700; color: var(--text-color); margin-bottom: 4px;">MarkWeave</h2>
            <div style="font-size: 13px; color: var(--primary-color); font-weight: 500; margin-bottom: 16px;">
              <span id="about-version">v—</span> • 交互式 Markdown 绘图编辑器
            </div>
            <p style="font-size: 13px; color: #666; line-height: 1.6; max-width: 480px; margin: 0 auto 20px;">
              MarkWeave 是下一代所见即所得 Markdown 编辑器。首创 Mermaid 图表可视化拖拽节点、拐角平滑圆角、任意箭头换向、文字原地修改，并无缝兼容主流标准。
            </p>
            <div style="display: flex; justify-content: center; gap: 12px;">
              <a href="https://github.com/ZFHNB/MarkWeave.git" target="_blank" class="ty-btn" style="text-decoration: none; display: inline-flex; align-items: center; gap: 6px;">
                <span>🌐</span> GitHub 仓库
              </a>
            </div>
          </div>

          <div class="ty-settings-section-title" style="margin-top: 20px;">更新</div>
          <div class="ty-settings-row">
            <div class="ty-settings-info">
              <span class="ty-settings-label">检查更新</span>
              <span class="ty-settings-desc">查询是否有新版本可用</span>
            </div>
            <div class="ty-settings-inline">
              <span class="ty-update-status" id="update-status" aria-live="polite"></span>
              <button class="ty-settings-action" id="btn-check-update">检查更新</button>
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

  // 说明文字收进问号标的二级提示，保持面板简洁
  const tooltipController = enhanceSettingsDescriptions(modalOverlay);

  // 记录打开前的焦点，关闭后归还，保证键盘用户不会丢失位置
  const previouslyFocused = document.activeElement as HTMLElement | null;

  // 有没有动过设置：Esc / 点遮罩这类"直接丢弃"的关闭方式要提醒一句，
  // 否则用户改了半天以为已经生效。
  let settingsDirty = false;
  const markSettingsDirty = () => {
    settingsDirty = true;
  };
  modalOverlay.addEventListener("input", markSettingsDirty, true);
  modalOverlay.addEventListener("change", markSettingsDirty, true);
  modalOverlay.addEventListener("click", (event) => {
    // 卡片式单选项（增强/兼容模式、导出格式）没有触发 input/change
    if ((event.target as HTMLElement | null)?.closest(".ty-export-option-card")) {
      markSettingsDirty();
    }
  });

  const closeModal = () => {
    tooltipController.destroy();
    modalOverlay.remove();
    document.removeEventListener("keydown", onDialogKeyDown, true);
    previouslyFocused?.focus?.();
  };

  /** 有未保存改动时先确认，避免静默丢弃 */
  const requestClose = async () => {
    if (!settingsDirty) {
      closeModal();
      return;
    }
    const discard = await confirmDialog("设置还没有保存，确定要放弃这些修改吗？", {
      title: "放弃修改",
      confirmLabel: "放弃",
      cancelLabel: "继续编辑",
      danger: true,
    });
    if (discard) closeModal();
  };

  /** Esc 关闭 + Tab 焦点循环，避免焦点跑出弹窗 */
  const onDialogKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      void requestClose();
      return;
    }
    if (event.key !== "Tab") return;

    const focusables = modalOverlay.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;

    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    }
  };

  document.addEventListener("keydown", onDialogKeyDown, true);

  // 打开后把焦点移到第一个可聚焦控件
  requestAnimationFrame(() => {
    const firstControl = modalOverlay.querySelector<HTMLElement>(
      'button, input, select, textarea'
    );
    firstControl?.focus();
  });

  modalOverlay.querySelector("#btn-close-settings-x")?.addEventListener("click", () => {
    void requestClose();
  });

  // 字体选择切换到「自定义」时显示输入框
  const bindCustomFontToggle = (selectId: string, rowId: string) => {
    const select = modalOverlay.querySelector<HTMLSelectElement>(selectId);
    const row = modalOverlay.querySelector<HTMLElement>(rowId);
    select?.addEventListener("change", () => {
      if (row) row.style.display = select.value === "custom" ? "flex" : "none";
    });
  };
  bindCustomFontToggle("#setting-select-body-latin", "#row-custom-body-latin");
  bindCustomFontToggle("#setting-select-body-cjk", "#row-custom-body-cjk");
  bindCustomFontToggle("#setting-select-mono-latin", "#row-custom-mono-latin");
  bindCustomFontToggle("#setting-select-mono-cjk", "#row-custom-mono-cjk");

  /* ---- MinerU 交互 ---- */

  const mineruLocalStatus = modalOverlay.querySelector<HTMLElement>("#mineru-local-status");
  const mineruKeyStatus = modalOverlay.querySelector<HTMLElement>("#mineru-key-status");

  const refreshLocalStatus = async () => {
    const api = getDesktopAPI();
    if (!api?.mineruDetectLocal) {
      if (mineruLocalStatus) mineruLocalStatus.textContent = "仅桌面版支持";
      return;
    }
    if (mineruLocalStatus) mineruLocalStatus.textContent = "检查中…";
    const info = await api.mineruDetectLocal();
    if (mineruLocalStatus) {
      mineruLocalStatus.textContent = info.available
        ? `就绪：${info.command}${info.version ? " " + info.version : ""}`
        : "未就绪（未检测到本地命令）";
      mineruLocalStatus.dataset.state = info.available ? "ok" : "warn";
      mineruLocalStatus.title = info.detail;
    }
  };

  const refreshKeyStatus = async () => {
    const api = getDesktopAPI();
    if (!api?.mineruLoadKey) {
      if (mineruKeyStatus) mineruKeyStatus.textContent = "仅桌面版支持";
      return;
    }
    const loaded = await api.mineruLoadKey();
    if (mineruKeyStatus) {
      if (!loaded.present) {
        mineruKeyStatus.textContent = "未配置";
        mineruKeyStatus.dataset.state = "warn";
      } else if (loaded.source === "env") {
        mineruKeyStatus.textContent = `环境变量 ${loaded.masked ?? ""}`;
        mineruKeyStatus.dataset.state = "ok";
      } else {
        mineruKeyStatus.textContent = `已保存 ${loaded.masked ?? ""}`;
        mineruKeyStatus.dataset.state = "ok";
      }
      if (loaded.error) {
        mineruKeyStatus.textContent = `读取失败（${loaded.error}）`;
        mineruKeyStatus.dataset.state = "error";
      }
    }
  };

  void refreshLocalStatus();
  void refreshKeyStatus();

  modalOverlay.querySelector("#btn-mineru-detect")?.addEventListener("click", () => {
    void refreshLocalStatus();
  });

  // 保存密钥：只进 safeStorage，不进 localStorage
  modalOverlay.querySelector("#btn-mineru-save-key")?.addEventListener("click", async () => {
    const api = getDesktopAPI();
    const input = modalOverlay.querySelector<HTMLInputElement>("#setting-input-mineru-key");
    const value = input?.value.trim();
    if (!api?.mineruSaveKey || !value) return;

    const saved = await api.mineruSaveKey(value);
    if (saved.ok) {
      if (input) input.value = "";
      await refreshKeyStatus();
    } else if (saved.error === "encryption-unavailable") {
      await alertDialog("当前系统不支持安全存储，无法保存 API Key。", "无法保存");
    } else {
      await alertDialog("保存失败，请查看日志。", "保存失败");
    }
  });

  // 测试连接：先用输入框里的新密钥，没有则用已保存的
  modalOverlay.querySelector("#btn-mineru-test-key")?.addEventListener("click", async () => {
    const api = getDesktopAPI();
    const btn = modalOverlay.querySelector<HTMLButtonElement>("#btn-mineru-test-key");
    const input = modalOverlay.querySelector<HTMLInputElement>("#setting-input-mineru-key");
    if (!api?.mineruTestConnection) {
      if (mineruKeyStatus) {
        mineruKeyStatus.textContent = "仅桌面版支持";
        mineruKeyStatus.dataset.state = "error";
      }
      return;
    }

    const candidate = input?.value.trim();

    if (btn) {
      btn.disabled = true;
      btn.textContent = "测试中…";
    }
    if (mineruKeyStatus) {
      mineruKeyStatus.textContent = "正在连接…";
      mineruKeyStatus.dataset.state = "";
    }

    try {
      const result = await api.mineruTestConnection(candidate || undefined);

      if (mineruKeyStatus) {
        const elapsed = result.elapsedMs ? ` · ${Math.round(result.elapsedMs)}ms` : "";
        mineruKeyStatus.textContent = result.ok
          ? `连接正常${elapsed}`
          : `${result.message}${elapsed}`;
        mineruKeyStatus.dataset.state = result.ok ? "ok" : "error";
        mineruKeyStatus.title = result.message;
      }

      // 测试成功且输入框里有密钥：提示是否一并保存
      if (result.ok && candidate && !candidate.includes("…")) {
        const loaded = await api.mineruLoadKey?.();
        if (!loaded?.present || loaded.source !== "env") {
          const saveIt = await confirmDialog("连接正常。是否保存这个 API Key？", {
            title: "验证通过",
            confirmLabel: "保存",
          });
          if (saveIt) {
            const saved = await api.mineruSaveKey?.(candidate);
            if (saved?.ok) {
              if (input) input.value = "";
              await refreshKeyStatus();
              if (mineruKeyStatus) {
                mineruKeyStatus.textContent = "已保存并验证";
                mineruKeyStatus.dataset.state = "ok";
              }
            }
          }
        }
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "测试连接";
      }
    }
  });

  // 清除密钥
  modalOverlay.querySelector("#btn-mineru-clear-key")?.addEventListener("click", async () => {
    const api = getDesktopAPI();
    if (!api?.mineruClearKey) return;
    if (
      !(await confirmDialog("确定要清除已保存的 API Key 吗？", {
        title: "清除 API Key",
        confirmLabel: "清除",
        danger: true,
      }))
    )
      return;
    await api.mineruClearKey();
    await refreshKeyStatus();
  });

  // 固定文件夹选择
  modalOverlay.querySelector("#btn-mineru-folder")?.addEventListener("click", async () => {
    const api = getDesktopAPI();
    if (!api?.chooseDirectory) return;
    const dir = await api.chooseDirectory();
    const input = modalOverlay.querySelector<HTMLInputElement>("#setting-input-mineru-folder");
    if (dir && input) input.value = dir;
  });

  // 保存位置下拉：切换时显示对应输入项
  modalOverlay.querySelector("#setting-select-mineru-location")?.addEventListener("change", (e) => {
    const value = (e.target as HTMLSelectElement).value;
    const fixed = modalOverlay.querySelector<HTMLElement>("#row-mineru-fixed");
    const sub = modalOverlay.querySelector<HTMLElement>("#row-mineru-subfolder");
    if (fixed) fixed.style.display = value === "fixed-folder" ? "flex" : "none";
    if (sub) sub.style.display = value === "subfolder-of-note" ? "flex" : "none";
  });

  // 选择历史副本目录
  modalOverlay.querySelector("#setting-btn-history-dir")?.addEventListener("click", async () => {
    const api = getDesktopAPI();
    if (!api?.chooseDirectory) return;
    const dir = await api.chooseDirectory();
    const input = modalOverlay.querySelector<HTMLInputElement>("#setting-input-history-dir");
    if (dir && input) input.value = dir;
  });

  // 关于页：填入真实版本号，并接上更新通道
  void (async () => {
    const api = getDesktopAPI();
    const info = await api?.getInfo?.();
    const version = info?.version ?? "0.1.1";
    const badge = modalOverlay.querySelector("#about-version");
    if (badge) badge.textContent = `v${version}`;

    const channel = getUpdateChannel(version);
    const statusEl = modalOverlay.querySelector<HTMLElement>("#update-status");
    const checkBtn = modalOverlay.querySelector<HTMLButtonElement>("#btn-check-update");

    const render = (state: UpdateState) => {
      if (!statusEl) return;
      const map: Record<UpdateStatus, string> = {
        idle: "",
        checking: "检查中…",
        available: `有新版本 v${state.info?.version ?? ""}`,
        "up-to-date": "已是最新版本",
        downloading: `下载中 ${state.progress}%`,
        ready: "可重启安装",
        error: state.error ?? "检查失败",
        unsupported: "当前构建未接入更新服务",
      };
      statusEl.textContent = map[state.status];
      statusEl.dataset.state = state.status;
    };

    if (!channel.isSupported() && checkBtn) {
      checkBtn.setAttribute("aria-disabled", "true");
    }

    checkBtn?.addEventListener("click", async () => {
      if (checkBtn.disabled) return;
      checkBtn.disabled = true;
      render({ ...INITIAL_UPDATE_STATE, status: "checking", current: version });
      const state = await channel.check();
      render(state);
      checkBtn.disabled = false;
    });
  })();

  // 打开自定义主题目录，并在用户回到窗口后刷新主题列表
  modalOverlay.querySelector("#setting-btn-themes-folder")?.addEventListener("click", async () => {
    const api = getDesktopAPI();
    if (!api?.openThemesFolder) return;
    await api.openThemesFolder();
    await refreshCustomThemes();
    const select = modalOverlay.querySelector<HTMLSelectElement>("#setting-select-editor-theme");
    if (select) {
      const selected = normalizeThemeId(select.value);
      select.innerHTML = getAllThemes()
        .map(
          (theme) =>
            `<option value="${theme.id}" ${selected === theme.id ? "selected" : ""}>${theme.label}${
              theme.custom ? "（自定义）" : ""
            }</option>`
        )
        .join("");
    }
  });
  modalOverlay.querySelector("#btn-cancel-settings")?.addEventListener("click", closeModal);
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) void requestClose();
  });

  modalOverlay.querySelector("#btn-save-settings")?.addEventListener("click", () => {
    const selectedMode = radioStandard?.checked ? "standard" : "custom";
    const selectCurve = ((modalOverlay.querySelector("#setting-select-curve") as HTMLSelectElement)?.value as any) || "step-round";
    const toggleGrid = (modalOverlay.querySelector("#setting-toggle-grid") as HTMLInputElement)?.checked ?? true;
    const selectScale = parseInt((modalOverlay.querySelector("#setting-select-scale") as HTMLSelectElement)?.value || "2", 10) || 2;
    const selectFontSize = (modalOverlay.querySelector("#setting-select-font-size") as HTMLSelectElement)?.value || "16px";
    const selectLineHeight = (modalOverlay.querySelector("#setting-select-line-height") as HTMLSelectElement)?.value || "1.65";
    const readVal = (selector: string) =>
      (modalOverlay.querySelector(selector) as HTMLInputElement | HTMLSelectElement | null)?.value || "";
    const bodyLatinFont = normalizeFontIdForGroup("bodyLatin", readVal("#setting-select-body-latin"));
    const bodyCJKFont = normalizeFontIdForGroup("bodyCJK", readVal("#setting-select-body-cjk"));
    const customBodyLatin = readVal("#setting-input-body-latin");
    const customBodyCJK = readVal("#setting-input-body-cjk");
    const monoLatinFont = normalizeFontIdForGroup("monoLatin", readVal("#setting-select-mono-latin"));
    const monoCJKFont = normalizeFontIdForGroup("monoCJK", readVal("#setting-select-mono-cjk"));
    const customMonoLatin = readVal("#setting-input-mono-latin");
    const customMonoCJK = readVal("#setting-input-mono-cjk");
    const selectExportPolicy = ((modalOverlay.querySelector("#setting-select-export-policy") as HTMLSelectElement)?.value as any) || "ask";
    const selectTheme = ((modalOverlay.querySelector("#setting-select-theme") as HTMLSelectElement)?.value as any) || "light";
    const selectLanguage = normalizeLanguage((modalOverlay.querySelector("#setting-select-language") as HTMLSelectElement)?.value);
    const selectMermaidTheme = normalizeMermaidTheme((modalOverlay.querySelector("#setting-select-mermaid-theme") as HTMLSelectElement)?.value);
    const selectEditorTheme = normalizeThemeId((modalOverlay.querySelector("#setting-select-editor-theme") as HTMLSelectElement)?.value);
    const imageDefaultAlign = normalizeImageAlign(
      (modalOverlay.querySelector("#setting-select-image-align") as HTMLSelectElement)?.value
    );
    const selectPaper = ((modalOverlay.querySelector("#setting-select-paper") as HTMLSelectElement)?.value as PaperSize) || "A4";
    const pdfLandscape = (modalOverlay.querySelector("#setting-pdf-landscape") as HTMLInputElement)?.checked ?? false;
    const pdfBackground = (modalOverlay.querySelector("#setting-pdf-background") as HTMLInputElement)?.checked ?? true;
    const autoPair = (modalOverlay.querySelector("#setting-toggle-autopair") as HTMLInputElement)?.checked ?? true;
    const smartPunctuation = (modalOverlay.querySelector("#setting-toggle-smartpunct") as HTMLInputElement)?.checked ?? true;
    const indentSize = parseInt((modalOverlay.querySelector("#setting-select-indent") as HTMLSelectElement)?.value || "2", 10) || 2;
    const lineEnding = ((modalOverlay.querySelector("#setting-select-line-ending") as HTMLSelectElement)?.value as LineEnding) || "lf";
    const finalNewline = (modalOverlay.querySelector("#setting-toggle-finalnewline") as HTMLInputElement)?.checked ?? true;
    const spellcheck = (modalOverlay.querySelector("#setting-toggle-spellcheck") as HTMLInputElement)?.checked ?? false;
    // 「自动链接」只保留 Markdown 语法页里那一个开关，这里沿用旧值避免配置丢失
    const autoLink = currentSettings.behavior.autoLink;
    const codeWrap = (modalOverlay.querySelector("#setting-toggle-codewrap") as HTMLInputElement)?.checked ?? false;
    const restoreSession = (modalOverlay.querySelector("#setting-toggle-restore") as HTMLInputElement)?.checked ?? true;
    const softBreaksAsHardBreaks = (modalOverlay.querySelector("#setting-toggle-softbreak") as HTMLInputElement)?.checked ?? false;
    const syntaxAutoLink = (modalOverlay.querySelector("#setting-toggle-syntax-autolink") as HTMLInputElement)?.checked ?? true;

    const mineruMode = ((modalOverlay.querySelector("#setting-select-mineru-mode") as HTMLSelectElement)?.value === "cloud"
      ? "cloud"
      : "local") as MineruMode;
    const mineruLocationMode = ((modalOverlay.querySelector("#setting-select-mineru-location") as HTMLSelectElement)?.value as OutputLocationMode) || "same-as-pdf";
    const mineruFixedFolder = (modalOverlay.querySelector("#setting-input-mineru-folder") as HTMLInputElement)?.value || "";
    const mineruSubfolder = (modalOverlay.querySelector("#setting-input-mineru-subfolder") as HTMLInputElement)?.value || "attachments";
    const mineruAsk = (modalOverlay.querySelector("#setting-toggle-mineru-ask") as HTMLInputElement)?.checked ?? false;
    const autoSaveMode = ((modalOverlay.querySelector("#setting-select-autosave-mode") as HTMLSelectElement)?.value as AutoSaveSettings["mode"]) || "off";
    const autoSaveInterval = parseInt((modalOverlay.querySelector("#setting-input-autosave-interval") as HTMLInputElement)?.value || "5", 10) || 5;
    const historyDir = (modalOverlay.querySelector("#setting-input-history-dir") as HTMLInputElement)?.value || "";
    const historyMax = parseInt((modalOverlay.querySelector("#setting-input-history-max") as HTMLInputElement)?.value || "3", 10) || 3;
    const historyEnabled = (modalOverlay.querySelector("#setting-toggle-history") as HTMLInputElement)?.checked ?? true;

    const newSettings: MarkWeaveSettings = {
      mermaidDefaultMode: selectedMode,
      mermaidDefaultCurve: selectCurve,
      mermaidTheme: selectMermaidTheme,
      gridSnap: toggleGrid,
      exportScale: selectScale,
      fontSize: selectFontSize,
      lineHeight: selectLineHeight,
      bodyLatinFont,
      bodyCJKFont,
      customBodyLatin,
      customBodyCJK,
      monoLatinFont,
      monoCJKFont,
      customMonoLatin,
      customMonoCJK,
      exportPolicy: selectExportPolicy,
      theme: selectTheme,
      language: selectLanguage,
      editorTheme: selectEditorTheme,
      imageDefaultAlign,
      pdf: normalizePdfOptions({ ...loadPdfOptions(), paper: selectPaper, landscape: pdfLandscape, printBackground: pdfBackground }),
      autoPair,
      smartPunctuation,
      indentSize,
      lineEnding,
      finalNewline,
      behavior: normalizeEditorBehavior({ spellcheck, autoLink, codeWrap, restoreSession }),
      markdownSyntax: { softBreaksAsHardBreaks, autoLink: syntaxAutoLink },
      mineru: {
        mode: mineruMode,
        // hasApiKey 由界面上的保存/清除按钮单独维护，这里沿用已有值
        cloud: { ...loadMineruSettings().cloud },
        location: normalizeOutputLocation({
          mode: mineruLocationMode,
          fixedFolder: mineruFixedFolder,
          subfolderName: mineruSubfolder,
          askEachTime: mineruAsk,
        }),
        cloudUploadConfirmed: loadMineruSettings().cloudUploadConfirmed,
      },
      autoSave: normalizeAutoSaveSettings({
        mode: autoSaveMode,
        intervalMinutes: autoSaveInterval,
        historyDir,
        maxHistory: historyMax,
        historyEnabled,
      }),
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

// 顶部「保存」按钮：优先写回原文件，未命名文档走「另存为」
// 点击可操作的状态提示：定位最近的解析结果
saveStatusEl?.addEventListener("click", () => {
  if (!saveStatusEl.classList.contains("is-actionable")) return;
  void revealLastMineruResult();
});

btnSaveFile?.addEventListener("click", () => {
  const doc = documents.find((d) => d.id === activeDocId);
  if (doc?.filePath) {
    void runManualSave();
  } else {
    void handleSaveAs();
  }
});

/** 手动保存：写盘 + 历史副本 + 状态反馈 */
async function runManualSave(): Promise<void> {
  const doc = documents.find((d) => d.id === activeDocId);
  if (!doc) return;

  if (!doc.filePath) {
    await handleSaveAs();
    return;
  }

  showSaveStatus("保存中…", "saving");
  try {
    await writeHistoryCopy(doc.id);
    const ok = await writeDocumentToDisk(doc.id);
    showSaveStatus(ok ? "已保存" : "保存失败", ok ? "saved" : "error");
  } catch (err) {
    console.error("保存失败", err);
    showSaveStatus("保存失败", "error");
  }
}

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

/* ================= 自动保存、历史副本与关闭提醒 ================= */
let autoSaveSettings: AutoSaveSettings = { ...DEFAULT_AUTO_SAVE };
let autoSaveTimer: ReturnType<typeof setInterval> | null = null;
let autoSaveOnChangeTimer: ReturnType<typeof setTimeout> | null = null;
let statusResetTimer: ReturnType<typeof setTimeout> | null = null;

/** 顶部保存状态反馈：保存中 / 已保存 / 已自动保存 */
function showSaveStatus(text: string, tone: "idle" | "saving" | "saved" | "error" = "idle") {
  if (!saveStatusEl) return;
  saveStatusEl.textContent = text;
  saveStatusEl.dataset.tone = tone;
  saveStatusEl.classList.add("is-visible");
  // 只有「解析完成」这类带后续动作的提示才可点击
  saveStatusEl.classList.toggle("is-actionable", Boolean(pendingMineruResult) && tone === "saved");

  if (statusResetTimer) clearTimeout(statusResetTimer);
  if (tone === "saved" || tone === "error") {
    statusResetTimer = setTimeout(() => {
      saveStatusEl.classList.remove("is-visible");
      statusResetTimer = null;
    }, 2200);
  }
}

function clearAutoSaveTimer() {
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer);
    autoSaveTimer = null;
  }
  if (autoSaveOnChangeTimer) {
    clearTimeout(autoSaveOnChangeTimer);
    autoSaveOnChangeTimer = null;
  }
}

/** 应用自动保存设置：重建定时器 */
function applyAutoSaveSettings(settings: AutoSaveSettings) {
  autoSaveSettings = settings;
  clearAutoSaveTimer();

  const interval = autoSaveIntervalMs(settings);
  if (interval !== null) {
    autoSaveTimer = setInterval(() => {
      void runAutoSave("interval");
    }, interval);
  }
}

/** 把当前文档内容写回磁盘（不弹保存对话框；无路径时跳过） */
async function writeDocumentToDisk(docId: string): Promise<boolean> {
  const api = getDesktopAPI();
  const doc = documents.find((d) => d.id === docId);
  if (!api || !doc?.filePath) return false;

  // 以编辑器当前内容为准，避免 doc.content 因程序化 setMarkdown 而滞后
  const isActive = doc.id === activeDocId;
  const raw = isActive
    ? isSourceMode
      ? sourceEditor.value
      : editor.getMarkdown()
    : doc.content;
  const content = prepareContentForDisk(raw);
  const result = await api.saveFile({ path: doc.filePath, content });
  if (!result?.path) return false;

  documents = markDocumentSaved(documents, doc.id, result.path);
  const updated = documents.find((d) => d.id === doc.id);
  if (updated) {
    updated.content = raw;
    syncTitle(updated.title);
  }
  renderFileList();
  flushSave();

  // 关键：立即把本次写入登记为"本地写入"，
  // 否则下一轮轮询会把自己的保存当成外部修改并弹窗。
  await refreshTrackedFile(doc.id, result.path);
  return true;
}

/**
 * 每份文档的快照状态（docId → 上次写入镜像的时间）。
 * 用来给草稿镜像做节流，避免每敲一个字就写盘。
 */
const draftMirrorAt = new Map<string, number>();

/** 草稿镜像的定时器，按 docId 分别合并连续输入 */
const draftMirrorTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * 本会话里已经归档过的文档。
 *
 * 自动保存（每次修改后 / 按间隔）会反复调用 writeHistoryCopy，
 * 若每次都轮转历史槽位，槽位 2、3 就会被"上一毫秒"挤满，
 * 真正需要回退的版本反而被冲掉。因此每个文档每次会话只归档一次：
 * 之后的自动保存只刷新槽位 1 的镜像。
 */
const archivedThisSession = new Set<string>();

/** 文档换了路径或重新打开时，重置镜像节流状态 */
function resetSessionBaseline(docId: string): void {
  draftMirrorAt.delete(docId);
  archivedThisSession.delete(docId);
  const timer = draftMirrorTimers.get(docId);
  if (timer) {
    clearTimeout(timer);
    draftMirrorTimers.delete(docId);
  }
}

/** 快照目录与单份快照的路径 */
function snapshotPaths(doc: { filePath: string }) {
  const dir = resolveHistoryDir(doc.filePath, autoSaveSettings);
  const pathFor = (slot: number): string => {
    const name = snapshotFileName(doc.filePath, slot).replace(/\\/g, "/").split("/").pop()!;
    return joinPath(dir, name);
  };
  return { dir, pathFor };
}

/**
 * 刷新「当前内容镜像」——槽位 1。
 *
 * 这份快照的唯一目的是**防止误操作丢稿**：编辑器里改过但还没落盘的内容，
 * 要能在崩溃、误关、手滑之后被找回。因此：
 * - 与自动保存开关**无关**，只要内容变了就写；
 * - 写的是编辑器此刻的内容，而不是磁盘上的旧内容。
 */
async function mirrorDraft(docId: string): Promise<void> {
  const api = getDesktopAPI();
  const doc = documents.find((d) => d.id === docId);
  if (!api?.writeHistory || !doc?.filePath || !autoSaveSettings.historyEnabled) return;

  const filePath: string = doc.filePath;
  const raw =
    doc.id === activeDocId
      ? isSourceMode
        ? sourceEditor.value
        : editor.getMarkdown()
      : doc.content;

  const { dir, pathFor } = snapshotPaths({ filePath });

  try {
    await api.writeHistory({ path: pathFor(1), content: prepareContentForDisk(raw) });
    draftMirrorAt.set(docId, Date.now());

    // 顺手清掉旧方案留下的时间戳副本
    if (api.listHistory && api.removeHistory) {
      const files = await api.listHistory(dir);
      const legacy = files.filter((name) => isLegacyTimestampCopy(name, filePath));
      if (legacy.length > 0) await api.removeHistory({ dir, names: legacy });
    }
  } catch (err) {
    console.warn("写入草稿镜像失败", err);
  }
}

/** 内容变化后按节流调度一次草稿镜像 */
function scheduleDraftMirror(docId: string): void {
  if (!autoSaveSettings.historyEnabled) return;

  const last = draftMirrorAt.get(docId) ?? 0;
  const elapsed = Date.now() - last;

  const existing = draftMirrorTimers.get(docId);
  if (existing) clearTimeout(existing);

  const delay = elapsed >= DRAFT_MIRROR_DEBOUNCE_MS ? 0 : DRAFT_MIRROR_DEBOUNCE_MS - elapsed;
  const timer = setTimeout(() => {
    draftMirrorTimers.delete(docId);
    void mirrorDraft(docId);
  }, delay);
  draftMirrorTimers.set(docId, timer);
}

/**
 * 写盘前的快照归档：把磁盘上的**旧内容**推进历史槽位，再刷新镜像。
 *
 * 与草稿镜像的区别：这里的槽位 2 存的是"即将被覆盖的那一版"，
 * 也就是用户真正需要回退到的上一个已保存状态。
 *
 * 失败不影响主保存流程。
 */
async function archiveSnapshot(docId: string): Promise<void> {
  const api = getDesktopAPI();
  const doc = documents.find((d) => d.id === docId);
  if (!api?.writeHistory || !doc?.filePath || !autoSaveSettings.historyEnabled) return;

  const filePath: string = doc.filePath;
  const maxSlots = Math.max(1, Math.floor(autoSaveSettings.maxHistory));
  const { dir, pathFor } = snapshotPaths({ filePath });

  try {
    const files = api.listHistory ? await api.listHistory(dir) : [];
    const snapshots = listSnapshots(files, filePath);
    const plan = planSnapshotWrite(snapshots, maxSlots, "commit");

    // 先搬移旧历史（已按从深到浅排序，不会互相覆盖）
    for (const move of plan.moves) {
      const from = snapshots.find((s) => s.slot === move.from);
      if (!from) continue;
      const src = await api.readFile?.(joinPath(dir, from.name));
      if (!src) continue;
      await api.writeHistory({ path: pathFor(move.to), content: src.content });
    }

    // 磁盘上被覆盖前的旧内容 → 历史槽位 2
    const previous = await api.readFile?.(filePath);
    for (const write of plan.writes) {
      if (write.source === "previous") {
        if (!previous) continue; // 文件还没落过盘，没有历史可存
        await api.writeHistory({ path: pathFor(write.slot), content: previous.content });
      }
      // 镜像（slot 1）交给 mirrorDraft，这里不重复写
    }

    if (api.removeHistory) {
      const doomed = [
        ...plan.expired,
        ...files.filter((name) => isLegacyTimestampCopy(name, filePath)),
      ];
      if (doomed.length > 0) await api.removeHistory({ dir, names: doomed });
    }
  } catch (err) {
    console.warn("归档保存快照失败", err);
  }
}

/** 写盘成功后：旧实现的名字保留，语义变为「归档 + 刷新镜像」 */
async function writeHistoryCopy(docId: string): Promise<void> {
  // 本次会话已经归档过：只刷新槽位 1（当前内容镜像），不再轮转历史槽位。
  // 否则自动保存每 800ms 一次就会把历史版本全部挤成"上一毫秒"。
  if (!archivedThisSession.has(docId)) {
    await archiveSnapshot(docId);
    archivedThisSession.add(docId);
  }
  await mirrorDraft(docId);
}

/* ================= 恢复历史版本 ================= */

interface SnapshotEntry {
  slot: number;
  name: string;
  path: string;
  content: string;
  /** 字符数，给用户一个大致规模印象 */
  chars: number;
}

/** 槽位语义：1 = 当前草稿，2+ = 历史版本 */
function slotLabel(slot: number): string {
  if (slot === 1) return "当前草稿（未保存的编辑）";
  if (slot === 2) return "上一次保存前";
  if (slot === 3) return "更早一版";
  return `历史版本 ${slot - 1}`;
}

/** 列出当前文档所有可恢复的快照 */
async function listSnapshotEntries(docId: string): Promise<SnapshotEntry[]> {
  const api = getDesktopAPI();
  const doc = documents.find((d) => d.id === docId);
  if (!api?.listHistory || !api.readFile || !doc?.filePath) return [];

  const dir = resolveHistoryDir(doc.filePath, autoSaveSettings);
  const files = await api.listHistory(dir);
  const snapshots = listSnapshots(files, doc.filePath);

  const entries: SnapshotEntry[] = [];
  for (const snap of snapshots) {
    const full = joinPath(dir, snap.name);
    const file = await api.readFile(full);
    if (!file) continue;
    entries.push({
      slot: snap.slot,
      name: snap.name,
      path: full,
      content: file.content,
      chars: file.content.length,
    });
  }
  return entries;
}

/**
 * 把某份快照的内容载入编辑器。
 *
 * 只改编辑器内容、标记为未保存，不写盘——用户确认后可以再 Ctrl+S，
 * 也可以继续改。这样「恢复」本身永远不会破坏当前文件。
 */
function applySnapshotContent(content: string): void {
  editor.setMarkdown(content, { resetHistory: true });
  if (isSourceMode) sourceEditor.value = content;

  const doc = documents.find((d) => d.id === activeDocId);
  if (doc) {
    doc.content = content;
    doc.dirty = true;
    doc.updatedAt = Date.now();
    syncTitle(doc.title);
  }
  flushSave();
}

/** 打开「恢复历史版本」对话框 */
async function openRestoreDialog(): Promise<void> {
  const doc = documents.find((d) => d.id === activeDocId);
  if (!doc?.filePath) {
    await alertDialog("当前文档还没有保存到磁盘，没有历史版本可恢复。", "无可恢复内容");
    return;
  }

  const entries = await listSnapshotEntries(doc.id);
  if (entries.length === 0) {
    await alertDialog(
      "还没有生成快照。\n\n快照会在你编辑文档时自动创建，" +
        "保存在文档同级的 .markweave-history 目录里。",
      "没有可恢复的版本"
    );
    return;
  }

  const current = editor.getMarkdown();

  const rows = entries
    .map((entry) => {
      const same = entry.content === current;
      const preview = entry.content
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120);
      return `
        <button class="ty-snapshot-row${entry.slot === 1 ? " is-draft" : ""}"
                data-slot="${entry.slot}">
          <div class="ty-snapshot-head">
            <span class="ty-snapshot-label">${escapeHtml(slotLabel(entry.slot))}</span>
            <span class="ty-snapshot-meta">${escapeHtml(entry.name)} · ${entry.chars} 字符${
        same ? " · 与当前相同" : ""
      }</span>
          </div>
          <div class="ty-snapshot-preview">${escapeHtml(preview) || "<em>（空）</em>"}</div>
        </button>`;
    })
    .join("");

  const handle = openDialog({
    title: "恢复历史版本",
    maxWidth: 620,
    body: `
      <p class="ty-modal-desc">
        选择要恢复的版本。内容会载入编辑器并标记为未保存，
        确认无误后再按 Ctrl+S 写回原文件。
      </p>
      <div class="ty-snapshot-list">${rows}</div>
    `,
    actions: [{ label: "取消" }],
  });

  handle.overlay.querySelectorAll<HTMLElement>(".ty-snapshot-row").forEach((row) => {
    row.addEventListener("click", async () => {
      const slot = Number(row.dataset.slot);
      const entry = entries.find((e) => e.slot === slot);
      if (!entry) return;

      if (entry.content === current) {
        toast("所选版本与当前内容相同", "info");
        return;
      }

      const ok = await confirmDialog(
        `用「${slotLabel(slot)}」覆盖编辑器里的当前内容？\n\n` +
          "当前未保存的修改会被替换（草稿镜像里仍有备份）。",
        { title: "确认恢复", confirmLabel: "恢复此版本" }
      );
      if (!ok) return;

      applySnapshotContent(entry.content);
      handle.close();
      toast(`已恢复到「${slotLabel(slot)}」，记得保存`, "success");
    });
  });
}

/* ================= 文件菜单 ================= */

/** 打开「最近文件」对话框 */
function openRecentFilesDialog(): void {
  const recent = loadRecentFiles();
  const currentDoc = documents.find((d) => d.id === activeDocId);

  if (recent.length === 0) {
    void alertDialog("还没有打开过文件。", "最近文件");
    return;
  }

  const rows = recent
    .map(
      (entry) => `
      <button class="ty-recent-item" data-path="${escapeHtml(entry.path)}"
              title="${escapeHtml(entry.path)}">
        <span class="ty-recent-name">${escapeHtml(entry.title)}</span>
        <span class="ty-recent-path">${escapeHtml(entry.path)}</span>
      </button>`
    )
    .join("");

  const handle = openDialog({
    title: `最近打开的文件（${recent.length}）`,
    maxWidth: 620,
    body: `<div class="ty-recent-list">${rows}</div>`,
    actions: [
      {
        label: "清空列表",
        variant: "danger",
        close: false,
        onClick: async () => {
          const ok = await confirmDialog("确定要清空最近文件列表吗？\n\n（不会删除任何文件）", {
            title: "清空最近文件",
            confirmLabel: "清空",
            danger: true,
          });
          if (!ok) return;
          clearRecentFiles();
          handle.close();
          toast("已清空最近文件列表", "success");
        },
      },
      { label: "关闭" },
    ],
  });

  handle.overlay.querySelectorAll<HTMLElement>(".ty-recent-item").forEach((row) => {
    row.addEventListener("click", () => {
      const path = row.dataset.path;
      if (!path) return;
      handle.close();
      void openWorkspaceFile(path);
    });
  });

  void currentDoc;
}

/** 在资源管理器中定位当前文件 */
async function revealCurrentFile(): Promise<void> {
  const doc = documents.find((d) => d.id === activeDocId);
  if (!doc?.filePath) {
    await alertDialog("当前文档还没有保存到磁盘。", "无法定位");
    return;
  }
  const ok = await revealPath(doc.filePath);
  if (!ok) toast("无法打开文件所在位置", "error");
}

/** 在侧边栏中显示当前文件 */
function showCurrentFileInSidebar(): void {
  const doc = documents.find((d) => d.id === activeDocId);
  const sidebarTab = document.querySelector<HTMLElement>('.ty-sidebar-tab[data-tab="files"]');
  sidebar.classList.remove("collapsed");
  sidebarTab?.click();

  if (doc?.filePath) {
    activeFilePath = doc.filePath;
    renderFileList();

    // 滚动到对应行
    requestAnimationFrame(() => {
      const row = fileListContainer.querySelector<HTMLElement>(
        `[data-workspace-path="${CSS.escape(doc.filePath!)}"]`
      );
      row?.scrollIntoView({ block: "nearest" });
    });
  }
}

/** 把当前文档移到另一个目录 */
async function moveCurrentFile(): Promise<void> {
  const api = getDesktopAPI();
  const doc = documents.find((d) => d.id === activeDocId);
  if (!doc?.filePath || !api?.chooseDirectory || !api.renamePath) {
    await alertDialog("当前文档还没有保存到磁盘，无法移动。", "无法移动");
    return;
  }

  const targetDir = await api.chooseDirectory();
  if (!targetDir) return;

  const name = extractFileName(doc.filePath);
  const toPath = joinPath(targetDir, name);

  if (toPath.replace(/\\/g, "/") === doc.filePath.replace(/\\/g, "/")) {
    toast("已在该目录下", "info");
    return;
  }

  const result = await api.renamePath({ from: doc.filePath, to: toPath });
  if (!result?.path) {
    await alertDialog(
      `移动失败：${result?.error ?? "未知错误"}\n\n目标目录已存在同名文件时也会失败。`,
      "移动失败"
    );
    return;
  }

  documents = markDocumentSaved(documents, doc.id, result.path);
  const updated = documents.find((d) => d.id === doc.id);
  if (updated) {
    updated.title = extractFileName(result.path);
    if (doc.id === activeDocId) syncTitle(updated.title);
    await refreshTrackedFile(doc.id, result.path);
  }
  if (activeFilePath === doc.filePath) activeFilePath = result.path;
  resetSessionBaseline(doc.id);

  renderFileList();
  flushSave();
  toast("已移动到新位置", "success");
}

/** 删除当前文件（移入回收站） */
async function deleteCurrentFile(): Promise<void> {
  const doc = documents.find((d) => d.id === activeDocId);
  if (!doc?.filePath) {
    await alertDialog("当前文档还没有保存到磁盘。", "无法删除");
    return;
  }

  const ok = await confirmDialog(
    `确定要把「${doc.title}」移入回收站吗？\n\n${doc.filePath}`,
    { title: "删除文件", confirmLabel: "移入回收站", danger: true }
  );
  if (!ok) return;

  const result = await trashPath(doc.filePath);
  if (!result.ok) {
    await alertDialog(`删除失败：${result.error ?? "未知错误"}`, "删除失败");
    return;
  }

  // 从工作区移除这份文档；只剩一篇时保留空白文档
  if (documents.length > 1) {
    documents = documents.filter((d) => d.id !== doc.id);
    tabState = closeTab(tabState, doc.id);
    const next = documents[0];
    activeDocId = next.id;
    syncTitle(next.title);
    editor.setMarkdown(next.content, { resetHistory: true });
    renderTabs();
  } else {
    doc.dirty = false;
    doc.filePath = undefined;
    doc.title = "未命名文档.md";
    doc.content = "";
    syncTitle(doc.title);
    editor.setMarkdown("", { resetHistory: true });
  }

  activeFilePath = null;
  renderFileList();
  flushSave();
  toast("已移入回收站", "success");
}

/** 保存全部打开的文档 */
async function saveAllDocuments(): Promise<void> {
  const dirty = documents.filter((d) => d.dirty && d.filePath);
  if (dirty.length === 0) {
    toast("没有需要保存的修改", "info");
    return;
  }

  let saved = 0;
  for (const doc of dirty) {
    await writeHistoryCopy(doc.id);
    if (await writeDocumentToDisk(doc.id)) saved += 1;
  }
  toast(saved > 0 ? `已保存 ${saved} 个文件` : "保存失败", saved > 0 ? "success" : "error");
}

/** 打开文档属性对话框 */
async function openDocumentProperties(): Promise<void> {
  const doc = documents.find((d) => d.id === activeDocId);
  if (!doc) return;

  const content = isSourceMode ? sourceEditor.value : editor.getMarkdown();
  const stats = computeSelectionStats(content, false);
  const api = getDesktopAPI();
  const info = await api?.getInfo?.();

  const rows: [string, string][] = [
    ["标题", doc.title],
    ["路径", doc.filePath ?? "（尚未保存）"],
    ["字符数", String(stats.chars)],
    ["词数", String(stats.words)],
    ["行数", String(content.split("\n").length)],
    ["状态", doc.dirty ? "有未保存的修改" : "已保存"],
  ];

  if (doc.filePath) {
    const stat = await getFileStat(doc.filePath);
    if (stat) {
      rows.push(["磁盘大小", `${(stat.size / 1024).toFixed(1)} KB`]);
      rows.push(["最后修改", new Date(stat.mtime).toLocaleString("zh-CN")]);
    }
  }
  if (info) rows.push(["应用版本", `v${info.version}`]);

  openDialog({
    title: "文档属性",
    maxWidth: 560,
    body: `
      <dl class="ty-props-list">
        ${rows
          .map(
            ([k, v]) =>
              `<dt>${escapeHtml(k)}</dt><dd title="${escapeHtml(v)}">${escapeHtml(v)}</dd>`
          )
          .join("")}
      </dl>
    `,
    actions: [{ label: "关闭", variant: "primary" }],
  });
}

/** 导入 PDF 并解析（文件菜单入口） */
async function importPdfFromMenu(): Promise<void> {
  const api = getDesktopAPI();
  if (!api?.openFile) {
    await alertDialog("PDF 导入需要桌面版。", "仅桌面版可用");
    return;
  }

  const file = await api.openFile();
  if (!file) return;

  if (!isPdfFile(file.path)) {
    // 用户选了非 PDF：按普通文档打开，不报错
    await handleFileOpened(file);
    return;
  }
  await parsePdfWithMineru(file.path);
}

/** 构建文件菜单的条目 */
function buildFileMenuItems(): MenuItem[] {
  const doc = documents.find((d) => d.id === activeDocId);
  const hasPath = Boolean(doc?.filePath);
  const recent = loadRecentFiles();
  const isDesktopApp = Boolean(getDesktopAPI());

  const items: MenuItem[] = [
    { label: "新建文件", shortcut: "Ctrl+N", onClick: () => handleNewFile() },
    { label: "打开文件…", shortcut: "Ctrl+O", onClick: () => void handleOpenFile() },
    { label: "打开文件夹…", shortcut: "Ctrl+Shift+O", onClick: () => void handleOpenFolder() },
    { kind: "separator" },
    { label: "快速打开…", shortcut: "Ctrl+P", onClick: () => ensureQuickOpen().open() },
    { label: "打开最近文件", onClick: openRecentFilesDialog, disabled: recent.length === 0 },
    { label: "重新打开关闭的文件", shortcut: "Ctrl+Shift+T", onClick: reopenLastTab },
    { kind: "separator" },
    { label: "保存", shortcut: "Ctrl+S", onClick: () => void handleSave() },
    { label: "另存为…", shortcut: "Ctrl+Shift+S", onClick: () => void handleSaveAs() },
    { label: "保存全部文件", onClick: () => void saveAllDocuments() },
    { kind: "separator" },
    { label: "恢复历史版本…", onClick: () => void openRestoreDialog(), disabled: !hasPath },
    { kind: "separator" },
    {
      label: "导入 PDF 并解析…",
      onClick: () => void importPdfFromMenu(),
      disabled: !isDesktopApp,
    },
    {
      label: "导出",
      onClick: () => openExportSubmenu(takeMenuRowRect() ?? undefined),
    },
    { kind: "separator" },
    { label: "文档属性…", onClick: () => void openDocumentProperties() },
    {
      label: "打开文件所在位置",
      onClick: () => void revealCurrentFile(),
      disabled: !hasPath,
    },
    {
      label: "在侧边栏中显示",
      onClick: () => showCurrentFileInSidebar(),
    },
    { label: "移动到…", onClick: () => void moveCurrentFile(), disabled: !hasPath },
    {
      label: "删除…",
      onClick: () => void deleteCurrentFile(),
      disabled: !hasPath,
    },
    { kind: "separator" },
    { label: "偏好设置…", shortcut: "Ctrl+,", onClick: () => openSettingsModal() },
  ];

  return items;
}

/**
 * 导出二级菜单。
 *
 * 一级菜单点击后会立即关闭，因此这里用点击时记录的行坐标定位，
 * 而不是事后去 DOM 里找那一行。
 */
function openExportSubmenu(anchorRect?: DOMRect): void {
  const items: MenuItem[] = [
    { kind: "heading", label: "Markdown 与网页" },
    { label: "Markdown (.md)", onClick: () => downloadMarkdown() },
    { label: "HTML", onClick: () => void exportHtml() },
    { kind: "separator" },
    { kind: "heading", label: "打印与文档" },
    { label: "PDF", shortcut: "Ctrl+Shift+P", onClick: () => void exportPdf() },
    {
      label: "Word / EPUB / LaTeX…",
      onClick: () => void openPandocExportDialog(),
    },
  ];

  openMenuAt(anchorRect ?? btnFileMenu.getBoundingClientRect(), items, undefined, "end");
}

/** 绑定文件菜单按钮 */
btnFileMenu?.addEventListener("click", () => {
  openMenu(btnFileMenu, buildFileMenuItems());
});

btnOpenSettingsQuick?.addEventListener("click", () => openSettingsModal());

/** 自动保存入口：按设置决定是否真正落盘 */
async function runAutoSave(reason: "change" | "interval" | "manual"): Promise<void> {
  if (reason === "change" && !shouldSaveOnChange(autoSaveSettings, true)) return;

  const doc = documents.find((d) => d.id === activeDocId);
  if (!doc?.dirty || !doc.filePath) return;

  showSaveStatus(reason === "interval" ? "自动保存中…" : "保存中…", "saving");
  // 自动保存直接覆盖原文件；只在本次会话第一次写入时留一份基线快照，
  // 避免每 800ms 轮转一次把快照挤成"上一毫秒"这种没用的状态。
  await writeHistoryCopy(doc.id);
  const ok = await writeDocumentToDisk(doc.id);
  showSaveStatus(
    ok ? (reason === "interval" ? "已自动保存" : "已保存") : "保存失败",
    ok ? "saved" : "error"
  );
}

/** 内容变化后按设置调度自动保存 */
function scheduleAutoSaveOnChange() {
  if (autoSaveSettings.mode !== "onChange") return;
  if (autoSaveOnChangeTimer) clearTimeout(autoSaveOnChangeTimer);
  // 合并连续输入，避免每敲一个字就写盘
  autoSaveOnChangeTimer = setTimeout(() => {
    autoSaveOnChangeTimer = null;
    void runAutoSave("change");
  }, 800);
}

/**
 * 关闭窗口时若仍有未保存修改：
 * 先弹窗询问 → 需要保存则立刻写盘 → 再关闭。
 * 同步返回无法 await，因此在 Electron 里通过主进程的 close 事件协调。
 */
/**
 * 是否存在"真正需要保存"的内容。
 *
 * 只判断 dirty 是不够的：新建的空白文档也会被标记为 dirty，
 * 但用户什么都没写时不该弹窗打扰。
 * 因此额外要求内容非空白。
 */
/**
 * 是否存在"真正需要保存"的内容。
 *
 * 三条规则：
 * - 已落盘文件：dirty 就说明与磁盘不一致；
 * - 未命名文档：只有写了字才算未保存（空白临时文档不打扰用户）；
 * - 空白临时文档（关掉全部标签后自动生成的那张）：同样按"有字才算"处理，
 *   因此用户没输入时直接退出，输入过才提示保存。
 */
function hasUnsavedContent(): boolean {
  return documents.some((doc) => {
    if (!doc.dirty) return false;
    if (doc.filePath) return true;
    return doc.content.trim().length > 0;
  });
}

interface CloseChoice {
  action: "save" | "discard" | "cancel";
}

/** 关闭前提醒弹窗；返回用户选择 */
function promptUnsavedChanges(): Promise<CloseChoice> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "ty-modal-overlay";
    overlay.id = "close-confirm-overlay";
    overlay.innerHTML = `
      <div class="ty-modal-card" role="dialog" aria-modal="true" aria-labelledby="close-confirm-title">
        <div class="ty-modal-header">
          <div class="ty-modal-title" id="close-confirm-title">未保存的修改</div>
        </div>
        <p class="ty-modal-desc">当前文件已修改但尚未保存，是否保存后再退出？</p>
        <div class="ty-modal-footer">
          <button class="ty-btn" id="close-confirm-cancel">取消</button>
          <button class="ty-btn" id="close-confirm-discard">不保存</button>
          <button class="ty-btn ty-btn-primary" id="close-confirm-save">保存并退出</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const finish = (action: CloseChoice["action"]) => {
      overlay.remove();
      resolve({ action });
    };

    overlay.querySelector("#close-confirm-cancel")?.addEventListener("click", () => finish("cancel"));
    overlay.querySelector("#close-confirm-discard")?.addEventListener("click", () => finish("discard"));
    overlay.querySelector("#close-confirm-save")?.addEventListener("click", () => finish("save"));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) finish("cancel");
    });
  });
}

/** 关闭流程：必要时提醒、保存，再真正关闭 */
async function handleCloseRequest(): Promise<void> {
  const api = getDesktopAPI();
  let shouldClose = true;

  try {
    if (hasUnsavedContent() && shouldPromptOnClose(true, autoSaveSettings.mode)) {
      const choice = await promptUnsavedChanges();
      if (choice.action === "cancel") {
        shouldClose = false;
      } else if (choice.action === "save") {
        // 逐个保存所有脏文档，确保关窗不丢内容
        for (const doc of documents.filter((d) => d.dirty && (d.filePath || d.content.trim()))) {
          if (doc.filePath) {
            showSaveStatus("保存中…", "saving");
            await writeHistoryCopy(doc.id);
            await writeDocumentToDisk(doc.id);
          } else {
            // 未命名文档交给另存为对话框；用户取消则中止退出
            activeDocId = doc.id;
            await handleSaveAs();
            const after = documents.find((d) => d.id === doc.id);
            if (after?.dirty) {
              shouldClose = false;
              break;
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("关闭前保存失败", err);
    shouldClose = false;
  } finally {
    // 无论成功与否都要给主进程一个明确答复，
    // 否则用户再点关闭按钮将没有任何反应。
    if (shouldClose) {
      api?.confirmClose?.();
    }
  }
}

// 桌面版：主进程拦截关窗后交给渲染层处理
getDesktopAPI()?.onCloseRequested?.(() => {
  void handleCloseRequest();
});

// 自动化测试钩子：在页面内触发一次关闭流程（不真正退出进程）
(window as any).__MARKWEAVE_TEST_CLOSE__ = () => handleCloseRequest();

// 自动化测试钩子：弹出统一的确认框，用于验证样式一致性
(window as any).__MARKWEAVE_TEST_CONFIRM__ = () =>
  confirmDialog("这是一个用于验证样式的确认框。", {
    title: "统一对话框验证",
    confirmLabel: "确定",
  });

// 自动化测试钩子：列出当前文档可恢复的快照
(window as any).__MARKWEAVE_TEST_SNAPSHOTS__ = () => listSnapshotEntries(activeDocId);

// Web 版：使用浏览器原生离校提示
window.addEventListener("beforeunload", (event) => {
  if (!hasUnsavedContent()) return;
  // 与桌面端同一套规则：只有「每次修改后自动保存」才不会有未落盘内容
  if (autoSaveSettings.mode === "onChange") return;
  event.preventDefault();
  event.returnValue = "";
});

// 初始化加载并应用设置
applySettings(loadSettings());

/**
 * 载入自定义主题（桌面版读取 %userData%/themes/*.css）。
 * 失败时静默降级为内置主题，不影响启动。
 */
async function refreshCustomThemes(): Promise<void> {
  const api = getDesktopAPI();
  if (!api?.listCustomThemes) return;
  try {
    const themes = await api.listCustomThemes();
    if (!Array.isArray(themes)) return;
    registerCustomThemes(
      themes.map((theme) => ({
        id: theme.id,
        label: theme.label,
        dark: false,
        description: `自定义主题：${theme.label}`,
        css: theme.css,
      }))
    );
    const settings = loadSettings();
    // 之前选中的自定义主题现在可以真正生效
    applyBuiltInTheme(normalizeThemeId(settings.editorTheme));
  } catch (err) {
    console.warn("加载自定义主题失败", err);
  }
}

void refreshCustomThemes();

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

/**
 * 导出独立 HTML：内联排版主题、KaTeX 样式与预渲染的 Mermaid 图，
 * 生成的文件可离线直接打开。
 */
/**
 * 获取更新通道。
 *
 * 目前返回空实现（界面显示「未接入更新服务」）。
 * 未来接入时把这里换成真实实现即可，调用方无需改动。
 */
function getUpdateChannel(currentVersion: string): UpdateChannel {
  return createUnsupportedChannel(currentVersion);
}

/** 读取当前文档的 YAML front matter（没有则返回空对象） */
function currentFrontMatter(): FrontMatter {
  // 源码模式下的修改还没同步进 ProseMirror 文档，导出必须读 textarea
  if (isSourceMode) {
    return frontMatterFromNode(extractSourceFrontMatterText(sourceEditor.value));
  }
  const doc = editor.getDocument();
  let content: string | null = null;
  doc.forEach((node) => {
    if (content === null && node.type.name === "yaml_frontmatter") {
      content = node.attrs.content ?? "";
    }
  });
  return frontMatterFromNode(content);
}

/** 取出 Markdown 文本开头的 YAML front matter（去掉 --- 分隔行） */
function extractSourceFrontMatterText(markdown: string): string | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown);
  return match ? match[1] : null;
}

/**
 * 把文档里的图片 src 读成 data URL，供独立 HTML 导出内联。
 * 网络地址 / data URL 原样返回；读不到的返回 null（导出时保留原 src）。
 */
async function readLocalImageAsDataUrl(
  src: string,
  documentPath: string | null
): Promise<string | null> {
  if (!src) return null;
  if (/^(?:data:|https?:)/i.test(src)) return src;
  if (!documentPath) return null;

  const api = getDesktopAPI();
  if (!api?.readFile) return null;

  // 相对路径按文档目录展开；file:// 前缀去掉后直接读
  let absolute: string;
  if (/^file:\/\//i.test(src)) {
    absolute = decodeURI(src.replace(/^file:\/\//i, "")).replace(/^\/([a-zA-Z]:)/, "$1");
  } else if (/^[a-zA-Z]:[\\/]/.test(src)) {
    absolute = src;
  } else {
    absolute = joinPath(dirname(documentPath), src.replace(/^\.\//, ""));
  }

  try {
    const result = await api.readImage?.(absolute);
    return result?.dataUrl ?? null;
  } catch {
    return null;
  }
}

/**
 * 导出用的文档快照。
 * 源码模式下编辑器的 ProseMirror 文档是旧的（编辑只写进了 textarea），
 * 必须把 textarea 内容解析成文档再导出，否则导出的是上一次的内容。
 */
function documentForExport(): PMNode {
  if (isSourceMode) {
    return markdownToDoc(sourceEditor.value, schema);
  }
  return editor.getDocument();
}

async function exportHtml(): Promise<void> {
  const currentDoc = documents.find((d) => d.id === activeDocId);
  const rawTitle = currentDoc ? currentDoc.title : "MarkWeave 导出文档";
  const settings = loadSettings();
  const doc = documentForExport();

  // front matter 里的 title 优先于文件名
  const front = currentFrontMatter();
  const title = resolveHtmlTitle(front, rawTitle.replace(/\.md$/, ""));

  let mermaidSvgs: string[] = [];
  try {
    mermaidSvgs = await renderMermaidForExport(doc, {
      dark: document.body.classList.contains("theme-night"),
    });
  } catch (err) {
    console.warn("Mermaid 预渲染失败，导出将保留源代码块", err);
  }

  // KaTeX 字体体积较大，仅在导出时按需载入并内联
  let katexFontCss = "";
  try {
    const { buildKatexFontCss } = await import("./export/katex-fonts");
    katexFontCss = buildKatexFontCss();
  } catch (err) {
    console.warn("KaTeX 字体内联失败，公式将回退到系统字体", err);
  }

  const htmlContent = await toStandaloneHtml(doc, {
    title,
    themeId: settings.editorTheme,
    dark: document.body.classList.contains("theme-night"),
    mermaidSvgs,
    katexFontCss,
    // front matter 里 toc: true 时生成目录
    toc: front.toc === true,
    tocDepth: front.tocDepth ?? 3,
    resolveImage: (src) => readLocalImageAsDataUrl(src, currentDoc?.filePath ?? null),
  });

  const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

/** 打开格式选择对话框，并在选择后执行转换 */
async function openPandocExportDialog(): Promise<void> {
  const api = getDesktopAPI();

  if (!api?.convertWithPandoc) {
    await alertDialog("Pandoc 导出仅在桌面版可用。", "仅桌面版");
    return;
  }
  // 收窄后的引用，供闭包使用
  const pandocConvert = api.convertWithPandoc;

  // 先检测 pandoc 是否可用，避免用户选完格式才失败
  const detected = await api.detectPandoc?.();
  if (detected && !detected.available) {
    await alertDialog(
      `未检测到 pandoc。\n\n${detected.error ?? ""}\n\n` +
        "请先安装 pandoc（https://pandoc.org/installing.html），安装后重启本程序。",
      "未找到 pandoc"
    );
    return;
  }

  const currentDoc = documents.find((d) => d.id === activeDocId);
  const front = currentFrontMatter();
  const baseTitle = resolveHtmlTitle(
    front,
    (currentDoc?.title ?? "document").replace(/\.md$/i, "")
  );

  const formatCards = PANDOC_FORMATS.map(
    (f) => `
      <label class="ty-export-option-card ${f.id === "docx" ? "selected" : ""}"
             data-format="${f.id}">
        <input type="radio" name="pandoc-format" value="${f.id}" ${f.id === "docx" ? "checked" : ""} />
        <div class="ty-export-option-content">
          <div class="ty-export-option-title">${f.label}</div>
          <div class="ty-export-option-desc">${f.description}</div>
        </div>
      </label>`
  ).join("");

  const handle = openDialog({
    title: "导出为其他格式",
    maxWidth: 560,
    body: `
      <p class="ty-modal-desc">
        通过 pandoc 转换，适合输出到 Word、EPUB、LaTeX 等格式。
        ${detected?.version ? `<br /><span class="ty-pandoc-version">${detected.version}</span>` : ""}
      </p>
      <div class="ty-pandoc-formats">${formatCards}</div>
    `,
    actions: [
      { label: "取消" },
      {
        label: "导出",
        variant: "primary",
        onClick: () => {
          const selected =
            handle.query<HTMLInputElement>('input[name="pandoc-format"]:checked')?.value ??
            "docx";
          void runPandocExport(selected);
        },
      },
    ],
  });

  // 卡片选中态
  handle.overlay.querySelectorAll<HTMLElement>(".ty-export-option-card").forEach((card) => {
    card.addEventListener("click", () => {
      handle.overlay
        .querySelectorAll(".ty-export-option-card")
        .forEach((c) => c.classList.remove("selected"));
      card.classList.add("selected");
    });
  });

  /** 执行实际的 pandoc 转换 */
  async function runPandocExport(selected: string): Promise<void> {
    const format = getFormat(selected);

    showSaveStatus("导出中…", "saving");

    const markdown = isSourceMode ? sourceEditor.value : editor.getMarkdown();
    const result = await pandocConvert({
      // 相对路径图片在 Word/EPUB 里会被 pandoc 当成不存在的文件，
      // 导出前展开成绝对路径（临时文件在别的目录，相对路径必然失效）
      markdown: absolutizeImagePaths(markdown, currentDoc?.filePath ?? null),
      format: selected,
      suggestedName: `${baseTitle}.${format.extension}`,
      metadata: buildExportMeta(front, baseTitle).metadata,
    });

    if (result?.ok) {
      showSaveStatus("已导出", "saved");
      toast(`已导出为 ${format.label}`, "success");
    } else if (result?.canceled) {
      showSaveStatus("已取消", "idle");
    } else {
      showSaveStatus("导出失败", "error");
      await alertDialog(`导出失败：${result?.error ?? "未知错误"}`, "导出失败");
    }
  }
}

async function exportPdf(): Promise<void> {
  const api = getDesktopAPI();
  const currentDoc = documents.find((d) => d.id === activeDocId);
  // 源码模式下编辑器 DOM 里是旧内容，导出前先把 textarea 同步进 ProseMirror，
  // 否则 printToPDF 打印的是上一次渲染的结果。
  if (isSourceMode) {
    const doc0 = documents.find((d) => d.id === activeDocId);
    if (doc0) {
      doc0.content = sourceEditor.value;
      doc0.dirty = true;
      doc0.updatedAt = Date.now();
    }
    editor.setMarkdown(sourceEditor.value);
  }
  const front = currentFrontMatter();
  const title = resolveHtmlTitle(
    front,
    currentDoc ? currentDoc.title.replace(/\.md$/, "") : "document"
  );

  if (!api?.printToPdf) {
    window.print();
    return;
  }

  const settings = loadSettings();
  // front matter 的 papersize 覆盖设置里的默认纸张
  const frontPaper = resolvePaperSize(front, Object.keys(PAPER_SIZES_MICRONS));
  const options = frontPaper
    ? normalizePdfOptions({ ...settings.pdf, paper: frontPaper as PaperSize })
    : settings.pdf;

  // 默认位置：文档旁边；没有路径时交给主进程退回系统「文档」目录。
  // 用户仍会在保存对话框里确认最终位置（与 HTML / Markdown 导出一致）。
  const suggestedPath = currentDoc?.filePath
    ? joinPath(dirname(currentDoc.filePath), `${title}.pdf`)
    : undefined;

  showSaveStatus("导出中…", "saving");
  const result = await api.printToPdf({
    path: suggestedPath,
    suggestedName: `${title}.pdf`,
    options: toElectronPdfOptions(options),
  });

  if (result?.canceled) {
    showSaveStatus("已取消", "idle");
    return;
  }
  if (result?.path) {
    showSaveStatus("已导出", "saved");
    toast(`已导出 PDF：${extractFileName(result.path)}`, "success");
    return;
  }

  showSaveStatus("导出失败", "error");
  await alertDialog(
    `PDF 导出失败${result?.error ? `：${result.error}` : ""}`,
    "导出失败"
  );
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
      case "open-folder":
        void handleOpenFolder();
        break;
      case "quick-open":
        ensureQuickOpen().open();
        break;
      case "open-recent":
        openRecentFilesDialog();
        break;
      case "reopen-closed":
        reopenLastTab();
        break;
      case "save":
        void handleSave();
        break;
      case "save-as":
        void handleSaveAs();
        break;
      case "save-all":
        void saveAllDocuments();
        break;
      case "restore-snapshot":
        void openRestoreDialog();
        break;
      case "import-pdf":
        void importPdfFromMenu();
        break;
      case "export-markdown":
        downloadMarkdown();
        break;
      case "export-html":
        void exportHtml();
        break;
      case "export-pdf":
        void exportPdf();
        break;
      case "export-pandoc":
        void openPandocExportDialog();
        break;
      case "doc-properties":
        void openDocumentProperties();
        break;
      case "reveal-file":
        void revealCurrentFile();
        break;
      case "show-in-sidebar":
        showCurrentFileInSidebar();
        break;
      case "move-file":
        void moveCurrentFile();
        break;
      case "delete-file":
        void deleteCurrentFile();
        break;
      case "preferences":
        openSettingsModal();
        break;
      case "insert-table":
        handleOpenInsertTable();
        break;
      case "insert-code-fence":
        handleInsertCodeBlock();
        break;
      case "insert-math-block":
        handleInsertMathBlock();
        break;
      case "insert-image":
        handleInsertImage();
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
          await handleFileOpened(file);
        }
      }
    } catch (err) {
      console.error("Failed to open path from desktop API:", filePath, err);
    }
  });
}

