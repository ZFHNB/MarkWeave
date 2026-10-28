import { Node as PMNode } from "prosemirror-model";
import { EditorView, type NodeView } from "prosemirror-view";

/**
 * 图片节点视图（对标 Typora）：
 * - 点击选中时显示悬浮工具条（缩放 / 对齐 / 删除）
 * - 缩放与对齐仅作用于当前会话的 DOM，不写入 Markdown
 * - 支持宽高属性的图片（HTML 语法插入时保留）
 */

const ZOOM_STEPS = [25, 33, 50, 67, 80, 100, 150, 200];

export class ImageView implements NodeView {
  dom: HTMLElement;
  node: PMNode;
  view: EditorView;
  getPos: () => number | undefined;

  private img: HTMLImageElement;
  private toolbar: HTMLElement;
  private zoom = 100;

  constructor(node: PMNode, view: EditorView, getPos: () => number | undefined) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;

    this.dom = document.createElement("span");
    this.dom.className = "md-image-wrap";

    this.img = document.createElement("img");
    this.img.className = "md-image";
    this.img.src = node.attrs.src || "";
    this.img.alt = node.attrs.alt || "";
    if (node.attrs.title) this.img.title = node.attrs.title;
    this.img.draggable = false;
    this.img.addEventListener("error", () => {
      this.dom.classList.add("md-image-broken");
    });

    this.toolbar = document.createElement("span");
    this.toolbar.className = "md-image-toolbar";
    this.toolbar.setAttribute("contenteditable", "false");
    this.toolbar.style.display = "none";

    const addButton = (label: string, title: string, onClick: () => void) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.title = title;
      btn.className = "md-image-btn";
      btn.addEventListener("mousedown", (e) => e.preventDefault());
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      });
      this.toolbar.appendChild(btn);
    };

    addButton("−", "缩小", () => this.setZoom(this.zoom - 10));
    addButton("＋", "放大", () => this.setZoom(this.zoom + 10));
    addButton("100%", "恢复原始大小", () => this.setZoom(100));
    addButton("⇤", "左对齐", () => this.setAlign("left"));
    addButton("⇔", "居中", () => this.setAlign("center"));
    addButton("⇥", "右对齐", () => this.setAlign("right"));
    addButton("删除", "删除图片", () => this.remove());

    this.dom.appendChild(this.img);
    this.dom.appendChild(this.toolbar);

    this.dom.addEventListener("click", () => this.showToolbar());
  }

  private showToolbar(): void {
    this.toolbar.style.display = "inline-flex";
    const hide = (event: MouseEvent) => {
      if (this.dom.contains(event.target as Node)) return;
      this.toolbar.style.display = "none";
      document.removeEventListener("mousedown", hide);
    };
    setTimeout(() => document.addEventListener("mousedown", hide), 0);
  }

  private setZoom(percent: number): void {
    this.zoom = Math.max(10, Math.min(400, percent));
    this.img.style.width = `${this.zoom}%`;
  }

  private setAlign(align: "left" | "center" | "right"): void {
    this.dom.dataset.align = align;
  }

  private remove(): void {
    const pos = this.getPos();
    if (typeof pos !== "number") return;
    this.view.dispatch(this.view.state.tr.delete(pos, pos + this.node.nodeSize));
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    if (node.attrs.src !== this.img.getAttribute("src")) this.img.src = node.attrs.src || "";
    this.img.alt = node.attrs.alt || "";
    this.img.title = node.attrs.title || "";
    return true;
  }

  selectNode(): void {
    this.dom.classList.add("is-selected");
    this.showToolbar();
  }

  deselectNode(): void {
    this.dom.classList.remove("is-selected");
    this.toolbar.style.display = "none";
  }

  stopEvent(event: Event): boolean {
    return this.toolbar.contains(event.target as Node);
  }

  ignoreMutation(): boolean {
    return true;
  }
}

export const IMAGE_ZOOM_STEPS = ZOOM_STEPS;
