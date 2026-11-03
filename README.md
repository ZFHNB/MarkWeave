# MarkWeave

<p align="center">
  <strong>现代所见即所得、支持可拖拽 Mermaid 图表可视化排版的 Markdown 编辑器</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-6.x-blue?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-8.x-purple?style=flat-square&logo=vite" alt="Vite" />
  <img src="https://img.shields.io/badge/ProseMirror-AST-orange?style=flat-square" alt="ProseMirror" />
  <img src="https://img.shields.io/badge/Electron-44-47848F?style=flat-square&logo=electron" alt="Electron" />
  <img src="https://img.shields.io/badge/Mermaid-12-green?style=flat-square" alt="Mermaid" />
  <img src="https://img.shields.io/badge/KaTeX-0.19-red?style=flat-square" alt="KaTeX" />
  <img src="https://img.shields.io/badge/Tests-513%20Passed-brightgreen?style=flat-square" alt="Tests" />
</p>

---

## 📖 项目简介

**MarkWeave** 是一款对标 Typora 核心体验的现代 Markdown 编辑器。它摆脱了传统「左侧编辑、右侧预览」的双栏割裂模式，采用 **ProseMirror AST 状态机** 与 **光标驱动的语法折叠机制**，带来沉浸式的所见即所得书写体验。

在此之上，MarkWeave 原生集成了 **Mermaid 图表可视化编辑引擎**：渲染后的图表可以直接拖拽节点、切换正交折线、行内编辑连线文字、反转箭头，并双向同步回纯文本 Markdown，保证外部工具完全兼容。

Markdown 始终是可逆的真源——所有排版元数据都以标准注释语法持久化，不引入私有格式。

---

## ✨ 核心特性

### 1. 🎨 Mermaid 可视化排版

- **自由拖拽微调**：画布上任意拖曳节点，位置以 `%% {markweave_positions: ...} %%` 注释持久化
- **网格吸附**：拖拽时自动对齐，保持拓扑工整
- **连线样式**：正交圆角 / 正交直角 / 平滑贝塞尔 / 经典折线，一键切换
- **行内编辑**：双击节点或连线文字原地修改，源码同步更新
- **明暗自适应**：跟随界面主题切换配色

### 2. ⚡ 即时渲染与语法折叠

- 光标离开时标记自动折叠，进入时展开——与 Typora 一致
- 支持 `**加粗**`、`*斜体*`、`~~删除~~`、`==高亮==`、`^上标^`、`~下标~`、`` `代码` ``、链接、行内公式
- 块级语法：标题、引用、列表、任务列表、表格、代码块、公式块、脚注、YAML front matter
- **块拖动排序**：悬浮块左侧出现手柄，拖动时显示插入位置指示线

### 3. 📐 数学公式

- 块级与行内 KaTeX 渲染，点击即可编辑 LaTeX
- 导出的 HTML 内联完整 KaTeX 字体，离线打开公式不乱码

### 4. 📑 工作区与文件管理

- 侧边栏大纲（可过滤）、文件列表、多标签页
- 打开文件夹作为工作区，新建 / 重命名 / 删除 / 在资源管理器中显示
- **拖入文件直接打开**
- 外部修改检测：文件被其他程序改动时提示重新载入
- **自动保存**：可关闭 / 每次修改后 / 按固定间隔
- **保存快照**：覆盖前留一份固定槽位备份（`note.bak.md`），保存再多次也不会产生多个版本
- 关闭前提醒未保存修改，可先保存再退出

### 5. 🔍 查找替换与编辑命令

- 支持正则、全词匹配、区分大小写
- 上下移动块、选择行/块、删除块、切换任务状态、调整标题层级

### 6. 🎨 外观与偏好

- **内置主题**：MarkWeave 经典 / GitHub / Newsprint / Pixyll / Whitey / Night
- **自定义主题**：放入用户目录的 CSS 自动出现在主题列表
- **四组独立字体设置**：正文西文 / 正文中文 / 代码西文 / 代码中文
- 代码字体支持 JetBrains Mono、Fira Code、Cascadia Code、Source Code Pro、IBM Plex Mono 等主流编程字体
- 界面深浅色、跟随系统

### 7. 📤 导出

| 格式 | 说明 |
|---|---|
| Markdown | 可清洗为通用兼容语法 |
| 独立 HTML | 内联主题、KaTeX、Mermaid SVG，离线可读 |
| PDF | 纸张、方向、页边距、深浅配色 |
| Pandoc 多格式 | Word / EPUB / LaTeX / RTF / PPTX 等 10 种 |

导出会读取文档 **YAML front matter**：

```yaml
---
title: 季度技术报告      # 导出标题，优先于文件名
author: [张三, 李四]
date: 2026-11-02
toc: true               # 生成目录
toc_depth: 2
papersize: Letter       # 覆盖默认纸张
---
```

### 8. ⌨️ 键盘与可访问性

- 完整的 `:focus-visible` 焦点环，深色主题单独配色
- 弹窗具备 `role="dialog"`、焦点陷阱、`Esc` 关闭与焦点归还
- 所有控件有可访问名称，屏幕阅读器可正常朗读
- 尊重系统「减少动态效果」设置
- 大文档优化：**1200 段文档输入延迟约 8ms**

---

## 🛠️ 技术栈

| 层 | 选型 |
|---|---|
| 编辑器内核 | ProseMirror（schema / state / view / tables） |
| Markdown | markdown-it + 自定义 Typora 扩展规则 |
| 代码高亮 | lowlight / highlight.js |
| 数学 | KaTeX |
| 图表 | Mermaid 12（按需加载） |
| 桌面壳 | Electron 44（contextIsolation + sandbox） |
| 构建 | Vite 8 + TypeScript 6 |
| 测试 | Vitest（513 项）+ Puppeteer E2E（89 项） |

---

## 🚀 快速上手

### 环境要求

- Node.js 20+
- npm 10+

### 安装与开发

```bash
git clone https://github.com/ZFHNB/MarkWeave.git
cd MarkWeave
npm install
npm run dev          # http://localhost:5174
```

### 常用命令

```bash
npm run build        # 构建（含类型检查）
npm test             # 单元测试
npm run test:e2e     # 端到端测试
npm run electron:start  # 构建并启动桌面版
```

### 打包

产物统一输出到 `released/v<版本号>/`：

```bash
npm run package          # 目录版 + 便携版
npm run package:dir      # 只产目录版（快，日常用）
npm run package:portable # 只产便携版（分发用）
```

版本号修改 `package.json` 的 `version` 字段即可。

---

## 🖥️ 桌面版说明

### 两种分发形式

| 形式 | 冷启动 | 适用场景 |
|---|---|---|
| **目录版** `MarkWeave-<版本>-win-x64/` | 约 1.5 秒 | 日常自用，直接运行 `MarkWeave.exe` |
| 便携单文件 `MarkWeave-<版本>-portable.exe` | 约 17 秒 | 拷贝给他人、U 盘携带 |

便携版每次启动需把约 475MB 解压到临时目录，因此慢很多；功能与目录版完全一致。

### 数据目录

便携版的数据存放在 exe 同级的 `MarkWeaveData/`，包含：

- 应用配置
- 自定义主题（`themes/*.css`）
- 保存快照（默认在文档同级的 `.markweave-history/`，固定槽位，不会越存越多）

### 桌面版独有能力

以下功能依赖 Electron 主进程，Web 版不可用：

- 保存 / 另存为 / 自动保存 / 保存快照
- 关闭前未保存提醒
- 外部文件修改检测
- 自定义主题目录
- PDF 导出、Pandoc 导出
- 拖入文件打开的完整路径支持

---

## 📂 目录结构

```
src/
├── editor/                 # 编辑器内核
│   ├── schema.ts           # ProseMirror schema
│   ├── serializer/         # Markdown 双向转换
│   ├── plugins/            # 语法折叠、块拖动、粘贴、自动配对等
│   ├── nodeviews/          # 代码块、公式、图表、图片、任务项
│   ├── table/              # 表格命令与工具条
│   └── source-mapping.ts   # 源码视图位置同步
├── workspace/              # 工作区、标签页、文件操作、自动保存
├── export/                 # HTML / Pandoc / front matter
├── platform/               # 主题、字体、PDF 选项、更新通道
├── ui/                     # 设置提示浮层
└── main.ts                 # 应用装配
electron/                   # 主进程、preload、原生菜单
tests/                      # 单元测试
scripts/                    # 打包与验证脚本
docs/                       # 路线图与 QA 清单
```

---

## ✅ 质量保障

```bash
npm run build    # 类型检查 + 构建
npm test         # 513 项单元测试
npm run test:e2e # 89 项端到端测试
```

性能基线（1200 段 / 2400 块）：

```
输入延迟中位数   8–11 ms
选区更新中位数   6–7 ms
冷启动（目录版） 约 1.5 秒
```

详细的人工检查项见 [`docs/QA_CHECKLIST.md`](docs/QA_CHECKLIST.md)。

---

## 🗺️ 开发状态

主要功能已实现：编辑内核、Mermaid 可视化、表格、图片、导出（HTML/PDF/Pandoc）、
偏好设置、自动保存与保存快照、可访问性。

自动更新接口已预留（`src/platform/update-channel.ts`），尚未接入更新服务。

---

## 📜 许可证

见 [LICENSE](LICENSE)。
