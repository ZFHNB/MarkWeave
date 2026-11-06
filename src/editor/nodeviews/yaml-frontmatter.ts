import { Node as PMNode } from "prosemirror-model";
import { EditorView, type NodeView } from "prosemirror-view";

/**
 * YAML Front Matter 折叠卡片：默认收起，点击展开编辑原始 YAML。
 * 序列化仍还原为 `--- ... ---`，保证纯文本可逆。
 */
export class YamlFrontmatterView implements NodeView {
  dom: HTMLElement;
  node: PMNode;
  view: EditorView;
  getPos: () => number | undefined;

  private textarea: HTMLTextAreaElement;
  private collapsed = true;

  constructor(node: PMNode, view: EditorView, getPos: () => number | undefined) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;

    this.dom = document.createElement("div");
    this.dom.className = "md-yaml-card md-block";
    this.dom.setAttribute("contenteditable", "false");

    const header = document.createElement("div");
    header.className = "md-yaml-header";

    const icon = document.createElement("span");
    icon.className = "md-yaml-icon";
    icon.textContent = "ⓘ";

    const label = document.createElement("span");
    label.className = "md-yaml-label";
    label.textContent = "Front Matter";

    const preview = document.createElement("span");
    preview.className = "md-yaml-preview";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "md-yaml-toggle";
    toggle.setAttribute("contenteditable", "false");
    toggle.textContent = "展开";
    toggle.addEventListener("mousedown", (e) => e.preventDefault());
    toggle.addEventListener("click", (e) => {
      e.preventDefault();
      this.collapsed = !this.collapsed;
      toggle.textContent = this.collapsed ? "展开" : "收起";
      this.textarea.style.display = this.collapsed ? "none" : "block";
    });

    header.appendChild(icon);
    header.appendChild(label);
    header.appendChild(preview);
    header.appendChild(toggle);

    this.textarea = document.createElement("textarea");
    this.textarea.className = "md-yaml-input";
    this.textarea.value = node.attrs.content || "";
    this.textarea.style.display = "none";
    this.textarea.spellcheck = false;
    this.textarea.addEventListener("mousedown", (e) => e.stopPropagation());
    this.textarea.addEventListener("input", () => {
      this.previewEl.textContent = this.summarize(this.textarea.value);
    });
    this.textarea.addEventListener("blur", () => this.commit());
    this.textarea.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.textarea.blur();
      }
    });

    this.previewEl = preview;
    this.previewEl.textContent = this.summarize(node.attrs.content || "");

    this.dom.appendChild(header);
    this.dom.appendChild(this.textarea);
  }

  private previewEl: HTMLElement;

  private summarize(content: string): string {
    const lines = content.split("\n").filter((line) => line.trim());
    if (lines.length === 0) return "（空）";
    return lines.slice(0, 2).join(" · ") + (lines.length > 2 ? " …" : "");
  }

  private commit(): void {
    const pos = this.getPos();
    if (typeof pos !== "number") return;
    const value = this.textarea.value;
    if (value === (this.node.attrs.content || "")) return;
    this.view.dispatch(
      this.view.state.tr.setNodeMarkup(pos, undefined, { content: value })
    );
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    if (document.activeElement !== this.textarea) {
      this.textarea.value = node.attrs.content || "";
      this.previewEl.textContent = this.summarize(node.attrs.content || "");
    }
    return true;
  }

  stopEvent(): boolean {
    return true;
  }
}
