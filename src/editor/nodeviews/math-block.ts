import { Node as PMNode } from "prosemirror-model";
import { EditorView, type NodeView } from "prosemirror-view";
import katex from "katex";
import "katex/dist/katex.min.css";

export class MathBlockView implements NodeView {
  dom: HTMLElement;
  node: PMNode;
  view: EditorView;
  getPos: () => number | undefined;

  private previewEl: HTMLElement;
  private editorEl: HTMLElement;
  private textarea: HTMLTextAreaElement;
  private isEditing: boolean = false;

  constructor(node: PMNode, view: EditorView, getPos: () => number | undefined) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;

    this.dom = document.createElement("div");
    this.dom.className = "md-math-block-container md-block";

    // 预览区域
    this.previewEl = document.createElement("div");
    this.previewEl.className = "md-math-preview";
    this.previewEl.addEventListener("click", () => this.startEditing());

    // 编辑区域 (双击或点击展开)
    this.editorEl = document.createElement("div");
    this.editorEl.className = "md-math-editor";
    this.editorEl.style.display = "none";

    const label = document.createElement("div");
    label.className = "md-math-label";
    label.textContent = "TeX 数学公式编辑器 (输入公式，按 Esc 或点击外部保存)";

    this.textarea = document.createElement("textarea");
    this.textarea.className = "md-math-input";
    this.textarea.value = node.attrs.formula || "f(x) = \\int_{-\\infty}^\\infty \\hat f(\\xi)\\,e^{2 \\pi i \\xi x} \\,d\\xi";
    this.textarea.rows = 3;

    this.textarea.addEventListener("input", () => {
      this.renderKaTeX(this.textarea.value);
    });

    this.textarea.addEventListener("blur", () => {
      this.stopEditing();
    });

    this.textarea.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.stopEditing();
      }
    });

    this.editorEl.appendChild(label);
    this.editorEl.appendChild(this.textarea);

    this.dom.appendChild(this.previewEl);
    this.dom.appendChild(this.editorEl);

    const initialFormula = node.attrs.formula || this.textarea.value;
    this.renderKaTeX(initialFormula);
  }

  private startEditing() {
    this.isEditing = true;
    this.editorEl.style.display = "block";
    this.textarea.focus();
    this.textarea.select();
  }

  private stopEditing() {
    this.isEditing = false;
    this.editorEl.style.display = "none";
    const pos = this.getPos();
    if (typeof pos === "number") {
      this.view.dispatch(
        this.view.state.tr.setNodeMarkup(pos, undefined, {
          formula: this.textarea.value,
        })
      );
    }
  }

  private renderKaTeX(formula: string) {
    if (!formula.trim()) {
      this.previewEl.innerHTML = `<span class="md-math-placeholder">点击输入数学公式 (LaTeX)...</span>`;
      return;
    }

    try {
      this.previewEl.innerHTML = katex.renderToString(formula, {
        displayMode: true,
        throwOnError: false,
      });
    } catch (err: any) {
      this.previewEl.innerHTML = `<div class="md-math-error">公式解析错误: ${err.message}</div>`;
    }
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    if (!this.isEditing) {
      this.textarea.value = node.attrs.formula || "";
      this.renderKaTeX(this.textarea.value);
    }
    return true;
  }

  stopEvent(e: Event): boolean {
    return this.dom.contains(e.target as Node);
  }

  ignoreMutation(): boolean {
    return true;
  }
}
