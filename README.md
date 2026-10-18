# MarkWeave

<p align="center">
  <strong>现代所见即所得、支持可拖拽 Mermaid 图表可视化排版的 Markdown 即时渲染编辑器</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-5.x-blue?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-6.x-purple?style=flat-square&logo=vite" alt="Vite" />
  <img src="https://img.shields.io/badge/ProseMirror-AST-orange?style=flat-square" alt="ProseMirror" />
  <img src="https://img.shields.io/badge/Mermaid-v11-green?style=flat-square" alt="Mermaid" />
  <img src="https://img.shields.io/badge/KaTeX-LaTeX-red?style=flat-square" alt="KaTeX" />
  <img src="https://img.shields.io/badge/Tests-48%20Passed-brightgreen?style=flat-square" alt="Tests" />
</p>

---

## 📖 项目简介 (Overview)

**MarkWeave** 是一款对标 Typora 核心体验的现代 Markdown 编辑器。它彻底摆脱了传统“左侧编辑、右侧预览”的双栏割裂模式，采用 **ProseMirror AST 状态机** 与 **光标驱动的语法折叠机制**，带来沉浸式“所见即所得”的书写体验。

更为突破的是，MarkWeave 原生集成了 **Mermaid 交互与可视化深度编辑引擎**：无需再反复修改代码猜测图形排布，渲染后的 Mermaid 图表可以直接自由拖拽微调节点、0ms 切换 90 度正交直角折线、行内编辑连线说明、反转箭头指向，并双向同步回纯文本 Markdown，保证外部工具 100% 兼容。

---

## ✨ 核心特性 (Key Features)

### 1. 🎨 深度 Mermaid 可视化排版与拖拽引擎
- **自由拖拽微调**：点击「🎨 图表编辑」，支持在画布上任意拖曳节点，位置元数据以标准注释持久化，重绘不丢失。
- **20px 工业工程格点吸附 (Snap to Grid)**：拖拽节点时实时对齐网格整数倍，并展示点阵背景，保证拓扑严谨工整。
- **0ms 实时线形重绘**：
  - `[ ⌐ 直角 ]`：严格 90 度 Manhattan 正交折线（`stepBefore`），避免倾斜杂乱；
  - `[ ⌒ 圆角 ]`：平滑三次贝塞尔曲线（`basis`）；
  - `[ ╱ 直线 ]`：端点直连（`linear`）。
- **多车道与端口防交叠分流**：
  - **Port Offset**：同源/同目标的密集连线按端点索引平铺分散，规避接口粘连；
  - **Lane Offset**：中间桥接主通道按拓扑索引分派车道，防止平行线重合。
- **改变箭头指向与微调气泡栏**：点击连线弹出控制气泡，一键切换正向（`-->`）、反向（`<--`）、双向（`<-->`）或无箭头（`---`），源码实时同步。
- **行内修改连线文字 (Inline Label Editor)**：点击连线上的文字标签，原地弹出编辑框改写说明文字，且通过 `data-id` 1:1 空间锚定，杜绝错绑漂移。
- **一键横纵向排布自适应 (TD ↕ ↔ LR)**：支持一键切换排布方向，并智能清理旧方向冲突坐标。

### 2. ⚡ 纯粹的即时渲染 (Live Preview & Syntax Folding)
- 光标移动至文字时展开原始 Markdown 标记符号（如 `**`、`*`、`~~`、`[]()` 等）；
- 光标移开后平滑折叠为排版渲染样式，完全消除视觉噪音；
- 彻底解决 `contenteditable` 原生聚焦黑框与边框溢出问题。

### 3. 📐 KaTeX 数学公式引擎
- 块级公式与行内公式秒级排版为高质量 SVG/MathML；
- 点击公式原地弹出 LaTeX 代码编辑器，实时预览并双向同步。

### 4. 📑 现代化工作区与侧边栏
- **多文档工作区**：支持同时管理多个文档，一键新建、切换与重命名；
- **智能多级大纲**：实时提取 H1~H6 标题树，支持平滑滚动定位与层级高亮；
- **全屏源码模式**：支持一键切换至纯文本源码编辑模式，底层文档状态无损映射；
- **本地导入导出**：支持导入本地 `.md` 文件及一键下载导出。

### 5. 🌓 主题自适应
- 深度适配 **经典亮白 (Typora Style)** 与 **沉浸暗黑 (Night Theme)**；
- 图表容器、网格背景、编辑气泡与数学公式自适应主题配色。

---

## 🛠️ 技术栈 (Tech Stack)

| 领域 | 核心技术 | 说明 |
| :--- | :--- | :--- |
| **基础框架** | TypeScript + Vite | 现代化构建流水线，秒级冷启动与 HMR |
| **富文本内核** | ProseMirror | Model / State / View / Transform / InputRules 纯 AST 驱动 |
| **图表可视化** | Mermaid.js + D3 / Dagre | 矢量图表渲染、空间几何拓扑重构与实时正交路由 |
| **数学公式** | KaTeX | 工业级高性能 LaTeX 解析与排版引擎 |
| **图标体系** | Lucide Icons | 统一轻量化矢量图形 |
| **质量保证** | Puppeteer Core (E2E) | 48 项无头 Chromium 端到端回归自动化测试 |

---

## 🚀 快速上手 (Quick Start)

### 1. 克隆仓库
```bash
git clone https://github.com/ZFHNB/MarkWeave.git
cd MarkWeave
```

### 2. 安装依赖
```bash
npm install
```

### 3. 启动本地开发服务
```bash
npm run dev
```
打开浏览器访问：`http://localhost:5173/` 即可体验。

### 4. 构建生产产物
```bash
npm run build
```

### 5. 执行端到端自动化测试
```bash
npm run test:e2e
```

---

## 📂 目录结构 (Directory Structure)

```text
MarkWeave/
├── public/                 # 静态资源与 Favicon
├── scripts/
│   └── test-e2e.mjs        # 48 项自动化端到端测试套件 (Puppeteer)
├── src/
│   ├── editor/             # 编辑器核心引擎
│   │   ├── diagram/        # Mermaid 拓扑计算、格点吸附与正交线形路由
│   │   ├── nodeviews/      # 代码块、数学公式、任务列表自定义 NodeView
│   │   ├── plugins/        # 语法折叠、输入快捷规则、按键映射插件
│   │   ├── serializer/     # Markdown 与 ProseMirror AST 双向序列化
│   │   ├── outline.ts      # 侧边栏大纲提取与跳卷
│   │   ├── schema.ts       # 文档模式定义
│   │   └── index.ts        # MarkWeaveEditor 入口类
│   ├── styles/
│   │   └── typora-theme.css # Typora 原版排版样式与 Night 主题自适应
│   └── main.ts             # 应用装配、工作区管理与多文件状态流
├── test-artifacts/         # E2E 自动化测试生成的界面与图表截图产物
├── index.html              # HTML 模板入口
├── package.json            # 依赖与脚本声明
└── tsconfig.json           # TypeScript 严格配置
```

---

## 📜 许可证 (License)

本项目采用 [MIT](LICENSE) 许可证开箱即用。
