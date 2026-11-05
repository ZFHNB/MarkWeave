/**
 * P0 验证：MarkWeave 编辑器内核的纯 Web 最小闭环。
 *
 * 目的：确认内核（ProseMirror + Markdown 序列化 + 各插件）能在浏览器里
 * 独立运行，不依赖 Electron 主进程。这决定了后续能否用 Qoder 做成
 * 可公网部署的笔记管理器。
 *
 * 这个入口故意不引用 src/main.ts —— 那是桌面壳的装配层，
 * 包含 42 处 getDesktopAPI() 调用。这里只装配内核本身。
 */
import "../src/styles/typora-theme.css";
import { MarkWeaveEditor } from "../src/editor";
import { computeStats } from "../src/editor/stats";

const STORAGE_KEY = "mw-p0-note";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <div class="p0-shell">
    <header class="p0-bar">
      <span class="p0-brand">MarkWeave · Web 内核验证</span>
      <span class="p0-status" id="status">就绪</span>
    </header>
    <main class="p0-main">
      <div id="mount"></div>
    </main>
    <footer class="p0-footer">
      <span id="stats">0 词 · 0 字符 · 0 行</span>
      <span class="p0-hint">内容自动存到浏览器 IndexedDB（此处用 localStorage 代替）</span>
    </footer>
  </div>
`;

const mountEl = document.getElementById("mount")!;
const statusEl = document.getElementById("status")!;
const statsEl = document.getElementById("stats")!;

const initial =
  localStorage.getItem(STORAGE_KEY) ??
  `# Web 内核验证

如果你能看到这段文字被正确渲染为标题和段落，说明 **ProseMirror 内核**
在浏览器里工作正常。

## 验证清单

- [x] 编辑器挂载
- [ ] 输入内容能实时序列化为 Markdown
- [ ] 刷新页面后内容仍在

\`\`\`typescript
const core = "prosemirror";
\`\`\`

| 能力 | 状态 |
| --- | --- |
| 表格 | 待验 |
`;

let saveTimer: ReturnType<typeof setTimeout> | null = null;

const editor = new MarkWeaveEditor({
  mountEl,
  initialMarkdown: initial,
  onDocChange: (markdown) => {
    // 最小持久化：用 localStorage 代替 IndexedDB，验证"内容可存取"即可
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, markdown);
        statusEl.textContent = `已保存 ${new Date().toLocaleTimeString()}`;
      } catch (err) {
        statusEl.textContent = `保存失败：${String(err)}`;
      }
    }, 400);
  },
  onWordCountChange: (stats) => {
    statsEl.textContent = `${stats.words} 词 · ${stats.chars} 字符 · ${stats.lines} 行`;
  },
});

// 把实例暴露出来，便于自动化验证
(window as any).__P0_EDITOR__ = editor;
(window as any).__P0_STATS__ = () => computeStats(editor.getMarkdown());
(window as any).__P0_MARKDOWN__ = () => editor.getMarkdown();

statusEl.textContent = "加载完成";
editor.focus();

console.info("[P0] MarkWeave 内核已在浏览器中挂载");
