import { Node as PMNode } from "prosemirror-model";
import { EditorView, type NodeView } from "prosemirror-view";

export class TaskItemView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  node: PMNode;
  view: EditorView;
  getPos: () => number | undefined;

  private checkbox: HTMLInputElement;

  constructor(node: PMNode, view: EditorView, getPos: () => number | undefined) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;

    this.dom = document.createElement("li");
    this.dom.className = `md-task-item ${node.attrs.checked ? "task-done" : ""}`;

    this.checkbox = document.createElement("input");
    this.checkbox.type = "checkbox";
    this.checkbox.className = "md-task-checkbox";
    this.checkbox.checked = !!node.attrs.checked;

    this.checkbox.addEventListener("change", () => {
      const pos = this.getPos();
      if (typeof pos === "number") {
        this.view.dispatch(
          this.view.state.tr.setNodeMarkup(pos, undefined, {
            checked: this.checkbox.checked,
          })
        );
      }
    });

    const contentDiv = document.createElement("div");
    contentDiv.className = "md-task-content";

    this.contentDOM = contentDiv;
    this.dom.appendChild(this.checkbox);
    this.dom.appendChild(contentDiv);
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.checkbox.checked = !!node.attrs.checked;
    if (node.attrs.checked) {
      this.dom.classList.add("task-done");
    } else {
      this.dom.classList.remove("task-done");
    }
    return true;
  }

  stopEvent(e: Event): boolean {
    return e.target === this.checkbox;
  }

  ignoreMutation(): boolean {
    return false;
  }
}
