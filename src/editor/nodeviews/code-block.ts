import { Node as PMNode } from "prosemirror-model";
import { EditorView, type NodeView } from "prosemirror-view";
import mermaid from "mermaid";
import { MermaidInteractor } from "../diagram/mermaid-interactor";

// 初始化 Mermaid 全局配置
mermaid.initialize({
  startOnLoad: false,
  theme: "default",
  securityLevel: "loose",
  fontFamily: "var(--font-family)",
});

let mermaidCounter = 0;

export class CodeBlockView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  node: PMNode;
  view: EditorView;
  getPos: () => number | undefined;

  private langInput: HTMLInputElement;
  private preEl: HTMLElement;
  private diagramContainer: HTMLElement;
  private toggleModeBtn: HTMLButtonElement;
  private isEditingMermaid: boolean = false;
  private interactor: MermaidInteractor = new MermaidInteractor();

  constructor(node: PMNode, view: EditorView, getPos: () => number | undefined) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;

    // 外部容器
    this.dom = document.createElement("div");
    this.dom.className = "md-fences-wrapper md-block";

    // 悬浮工具栏 (语言输入 + 模式切换 + 复制按钮)
    const toolbar = document.createElement("div");
    toolbar.className = "md-fences-toolbar";

    const leftGroup = document.createElement("div");
    leftGroup.style.display = "flex";
    leftGroup.style.alignItems = "center";
    leftGroup.style.gap = "8px";

    this.langInput = document.createElement("input");
    this.langInput.className = "md-fences-lang-input";
    this.langInput.placeholder = "语言 (如 javascript, mermaid, python)";
    this.langInput.value = node.attrs.params || "";
    this.langInput.addEventListener("change", () => {
      const pos = this.getPos();
      if (typeof pos === "number") {
        this.view.dispatch(
          this.view.state.tr.setNodeMarkup(pos, undefined, {
            params: this.langInput.value.trim(),
          })
        );
      }
    });

    leftGroup.appendChild(this.langInput);

    const rightGroup = document.createElement("div");
    rightGroup.style.display = "flex";
    rightGroup.style.alignItems = "center";
    rightGroup.style.gap = "8px";

    this.toggleModeBtn = document.createElement("button");
    this.toggleModeBtn.className = "md-fences-toggle-btn";
    this.toggleModeBtn.textContent = "编辑源码";
    this.toggleModeBtn.style.display = "none";
    this.toggleModeBtn.addEventListener("click", () => {
      this.isEditingMermaid = !this.isEditingMermaid;
      this.updateViewMode();
    });

    const copyBtn = document.createElement("button");
    copyBtn.className = "md-fences-copy-btn";
    copyBtn.textContent = "复制";
    copyBtn.addEventListener("click", () => {
      const codeText = this.node.textContent;
      navigator.clipboard.writeText(codeText);
      copyBtn.textContent = "已复制!";
      setTimeout(() => {
        copyBtn.textContent = "复制";
      }, 1500);
    });

    rightGroup.appendChild(this.toggleModeBtn);
    rightGroup.appendChild(copyBtn);

    toolbar.appendChild(leftGroup);
    toolbar.appendChild(rightGroup);

    // 代码内容 pre
    this.preEl = document.createElement("pre");
    this.preEl.className = "md-fences-content";
    const code = document.createElement("code");
    code.spellcheck = false;
    this.preEl.appendChild(code);
    this.contentDOM = code;

    // Mermaid 图表预览 DOM
    this.diagramContainer = document.createElement("div");
    this.diagramContainer.className = "md-diagram-preview";
    this.diagramContainer.style.display = "none";
    this.diagramContainer.addEventListener("click", (e) => {
      // 避免工具栏按钮、连线气泡、行内输入框点击或编辑模式下触发切入源码编辑
      const target = e.target as HTMLElement;
      if (
        target.closest(".md-diagram-toolbar") ||
        target.closest(".md-edge-popover") ||
        target.closest(".md-inline-label-editor") ||
        this.diagramContainer.classList.contains("is-drag-mode") ||
        this.diagramContainer.classList.contains("is-edit-mode")
      ) {
        return;
      }
      // 点击图表直接进入编辑源码模式
      this.isEditingMermaid = true;
      this.updateViewMode();
    });

    this.dom.appendChild(toolbar);
    this.dom.appendChild(this.diagramContainer);
    this.dom.appendChild(this.preEl);

    // 监听键盘快捷键：Ctrl+Enter 快速退出编辑并实时渲染图表
    this.preEl.addEventListener("keydown", (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        if (this.isMermaid()) {
          e.preventDefault();
          e.stopPropagation();
          this.isEditingMermaid = false;
          this.updateViewMode();
        }
      }
    });

    // 监听全局主题切换，实现 Mermaid 自适应明暗主题
    window.addEventListener("theme-change", this.themeListener);

    // 初始模式与 Mermaid 渲染判断
    this.updateViewMode();
  }

  private themeListener = () => {
    if (this.isMermaid() && !this.isEditingMermaid) {
      this.renderMermaid();
    }
  };

  private isMermaid(): boolean {
    return (this.node.attrs.params || "").trim().toLowerCase() === "mermaid";
  }

  private updateViewMode() {
    if (this.isMermaid()) {
      this.dom.classList.add("md-mermaid-block");
      this.toggleModeBtn.style.display = "inline-block";
      this.toggleModeBtn.textContent = this.isEditingMermaid ? "预览图表" : "编辑源码";

      if (this.isEditingMermaid) {
        this.diagramContainer.style.display = "none";
        this.preEl.style.display = "block";
      } else {
        this.preEl.style.display = "none";
        this.diagramContainer.style.display = "flex";
        this.renderMermaid();
      }
    } else {
      this.dom.classList.remove("md-mermaid-block");
      this.toggleModeBtn.style.display = "none";
      this.diagramContainer.style.display = "none";
      this.preEl.style.display = "block";
    }
  }

  private async renderMermaid() {
    const codeText = this.node.textContent.trim();
    if (!codeText) {
      this.diagramContainer.innerHTML = `<span class="md-diagram-placeholder">输入 Mermaid 图表语法 (如 graph TD; A-->B;)...</span>`;
      return;
    }

    const uniqueId = `mermaid-svg-${++mermaidCounter}`;
    const isDark = document.body.classList.contains("theme-night");

    try {
      const curve = this.interactor.detectCurveStyle(codeText);
      mermaid.initialize({
        startOnLoad: false,
        theme: isDark ? "dark" : "default",
        securityLevel: "loose",
        fontFamily: "var(--font-family)",
        flowchart: {
          curve: curve || "basis",
        },
      });

      const { svg } = await mermaid.render(uniqueId, codeText);
      this.diagramContainer.innerHTML = svg;

      // 挂载可交互式拖拽与排版引擎
      const svgEl = this.diagramContainer.querySelector<SVGSVGElement>("svg");
      if (svgEl) {
        this.interactor.attach(
          svgEl,
          this.diagramContainer,
          () => this.node.textContent,
          (newCode) => {
            const pos = this.getPos();
            if (typeof pos === "number") {
              const schema = this.view.state.schema;
              const newCodeBlockNode = schema.nodes.code_block.create(
                this.node.attrs,
                newCode ? schema.text(newCode) : []
              );
              const tr = this.view.state.tr.replaceWith(pos, pos + this.node.nodeSize, newCodeBlockNode);
              this.view.dispatch(tr);
            }
          }
        );
      }
    } catch (err: any) {
      this.interactor.destroy();
      // 移除 mermaid 可能在 body 注入的临时报错 DOM
      const injectedError = document.getElementById("d" + uniqueId);
      if (injectedError) injectedError.remove();

      this.diagramContainer.innerHTML = `
        <div class="md-diagram-error">
          <div style="font-weight: 600; margin-bottom: 4px;">⚠️ Mermaid 语法解析错误</div>
          <div style="font-size: 12px; opacity: 0.8;">${err?.message || "语法格式无效"}</div>
          <div style="margin-top: 6px; font-size: 11px; color: var(--primary-color);">点击此处改写源码</div>
        </div>
      `;
    }
  }

  destroy() {
    this.interactor.destroy();
    window.removeEventListener("theme-change", this.themeListener);
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    const oldParams = this.node.attrs.params;
    const oldText = this.node.textContent;
    this.node = node;
    this.langInput.value = node.attrs.params || "";

    if (this.isMermaid()) {
      // 提取去除位置元数据注释后的纯图表语法
      const cleanOld = oldText.replace(/%%\s*\{typemark_positions:.*?\}\s*%%\n?/g, "").trim();
      const cleanNew = node.textContent.replace(/%%\s*\{typemark_positions:.*?\}\s*%%\n?/g, "").trim();

      // 只有当实质语法变化（如增删节点、文字改动或方向切换）时才重绘
      if (oldParams !== node.attrs.params || cleanOld !== cleanNew) {
        this.isEditingMermaid = false;
        this.updateViewMode();
      }
    } else if (oldParams !== node.attrs.params) {
      this.updateViewMode();
    }

    return true;
  }

  stopEvent(e: Event): boolean {
    const target = e.target as HTMLElement;
    return (
      target === this.langInput ||
      target === this.toggleModeBtn ||
      target.classList.contains("md-fences-copy-btn") ||
      target.closest(".md-diagram-toolbar") !== null ||
      target.closest(".md-edge-popover") !== null ||
      target.closest(".md-inline-label-editor") !== null ||
      this.diagramContainer.classList.contains("is-drag-mode") ||
      this.diagramContainer.classList.contains("is-edit-mode") ||
      this.diagramContainer.contains(target)
    );
  }

  ignoreMutation(mutation: any): boolean {
    if (!this.contentDOM) return true;
    return !this.contentDOM.contains(mutation.target);
  }
}
