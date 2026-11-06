import { Node as PMNode } from "prosemirror-model";
import { EditorView, type NodeView } from "prosemirror-view";

/**
 * [toc] 节点视图：根据文档中的标题实时生成目录。
 * 目录内容为纯展示层，不参与 Markdown 序列化（序列化仍是 `[toc]`）。
 */
export class TocView implements NodeView {
  dom: HTMLElement;
  node: PMNode;
  view: EditorView;
  getPos: () => number | undefined;

  private listEl: HTMLElement;
  private updateTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(node: PMNode, view: EditorView, getPos: () => number | undefined) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;

    this.dom = document.createElement("div");
    this.dom.className = "md-toc md-block";
    this.dom.setAttribute("contenteditable", "false");

    const title = document.createElement("div");
    title.className = "md-toc-title";
    title.textContent = "目录";

    this.listEl = document.createElement("div");
    this.listEl.className = "md-toc-content";

    this.dom.appendChild(title);
    this.dom.appendChild(this.listEl);

    this.render();
    this.scheduleUpdate();
  }

  private collectHeadings(): { level: number; text: string; pos: number }[] {
    const headings: { level: number; text: string; pos: number }[] = [];
    this.view.state.doc.descendants((node, pos) => {
      if (node.type.name === "heading") {
        headings.push({
          level: node.attrs.level || 1,
          text: node.textContent.trim(),
          pos,
        });
      }
      return true;
    });
    return headings;
  }

  private render(): void {
    const headings = this.collectHeadings().filter((h) => h.text.length > 0);
    this.listEl.innerHTML = "";
    if (headings.length === 0) {
      const empty = document.createElement("div");
      empty.className = "md-toc-empty";
      empty.textContent = "（暂无标题）";
      this.listEl.appendChild(empty);
      return;
    }

    const baseLevel = Math.min(...headings.map((h) => h.level));
    headings.forEach((heading) => {
      const item = document.createElement("a");
      item.className = `md-toc-item md-toc-h${heading.level}`;
      item.textContent = heading.text;
      item.style.paddingLeft = `${(heading.level - baseLevel) * 16}px`;
      item.href = "#";
      item.addEventListener("mousedown", (e) => e.preventDefault());
      item.addEventListener("click", (e) => {
        e.preventDefault();
        const dom = this.view.nodeDOM(heading.pos);
        if (dom instanceof HTMLElement) {
          dom.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
      this.listEl.appendChild(item);
    });
  }

  private scheduleUpdate(): void {
    if (this.updateTimer) clearTimeout(this.updateTimer);
    this.updateTimer = setTimeout(() => this.render(), 120);
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.scheduleUpdate();
    return true;
  }

  destroy(): void {
    if (this.updateTimer) clearTimeout(this.updateTimer);
  }
}
