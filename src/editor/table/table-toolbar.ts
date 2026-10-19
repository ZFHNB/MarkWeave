import { setColumnAlignment } from "./commands";
import { Plugin, type EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  addRowBefore,
  addRowAfter,
  addColumnBefore,
  addColumnAfter,
  deleteRow,
  deleteColumn,
  deleteTable,
  
  isInTable,
  selectionCell,
} from "prosemirror-tables";

class TableToolbarView {
  private view: EditorView;
  private dom: HTMLElement;
  private isVisible = false;

  constructor(view: EditorView) {
    this.view = view;
    this.dom = document.createElement("div");
    this.dom.className = "md-table-toolbar";
    this.dom.setAttribute("contenteditable", "false");
    this.dom.style.userSelect = "none";
    this.dom.style.display = "none";

    this.dom.innerHTML = `
      <div class="md-table-toolbar-group">
        <button type="button" class="md-table-toolbar-btn" data-action="row-before" title="在上方插入行" contenteditable="false">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
          +行
        </button>
        <button type="button" class="md-table-toolbar-btn" data-action="row-after" title="在下方插入行" contenteditable="false">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
          +行
        </button>
        <button type="button" class="md-table-toolbar-btn danger" data-action="row-delete" title="删除当前行" contenteditable="false">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
          -行
        </button>
      </div>
      <div class="md-table-toolbar-group">
        <button type="button" class="md-table-toolbar-btn" data-action="col-before" title="在左侧插入列" contenteditable="false">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          +列
        </button>
        <button type="button" class="md-table-toolbar-btn" data-action="col-after" title="在右侧插入列" contenteditable="false">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          +列
        </button>
        <button type="button" class="md-table-toolbar-btn danger" data-action="col-delete" title="删除当前列" contenteditable="false">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
          -列
        </button>
      </div>
      <div class="md-table-toolbar-group">
        <button type="button" class="md-table-toolbar-btn" data-action="align-left" title="左对齐" contenteditable="false">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/></svg>
        </button>
        <button type="button" class="md-table-toolbar-btn" data-action="align-center" title="居中对齐" contenteditable="false">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="10" x2="6" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="18" y1="18" x2="6" y2="18"/></svg>
        </button>
        <button type="button" class="md-table-toolbar-btn" data-action="align-right" title="右对齐" contenteditable="false">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="21" y1="10" x2="7" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="7" y2="18"/></svg>
        </button>
      </div>
      <div class="md-table-toolbar-group">
        <button type="button" class="md-table-toolbar-btn danger" data-action="table-delete" title="删除整张表格" contenteditable="false">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          删表
        </button>
      </div>
    `;

    this.bindButtons();

    document.body.appendChild(this.dom);

    window.addEventListener("scroll", this.onScrollOrResize, true);
    window.addEventListener("resize", this.onScrollOrResize, true);

    this.update(view);
  }

  private bindButtons() {
    const buttons = this.dom.querySelectorAll<HTMLButtonElement>("button[data-action]");
    buttons.forEach((btn) => {
      btn.setAttribute("contenteditable", "false");
      btn.style.userSelect = "none";

      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
      });

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const action = btn.getAttribute("data-action");
        if (!action) return;

        this.executeAction(action);
      });
    });
  }

  private executeAction(action: string) {
    const state = this.view.state;
    const dispatch = this.view.dispatch;

    switch (action) {
      case "row-before":
        addRowBefore(state, dispatch);
        break;
      case "row-after":
        addRowAfter(state, dispatch);
        break;
      case "row-delete":
        deleteRow(state, dispatch);
        break;
      case "col-before":
        addColumnBefore(state, dispatch);
        break;
      case "col-after":
        addColumnAfter(state, dispatch);
        break;
      case "col-delete":
        deleteColumn(state, dispatch);
        break;
      case "align-left":
        setColumnAlignment("left")(state, dispatch);
        break;
      case "align-center":
        setColumnAlignment("center")(state, dispatch);
        break;
      case "align-right":
        setColumnAlignment("right")(state, dispatch);
        break;
      case "table-delete":
        deleteTable(state, dispatch);
        break;
    }

    this.view.focus();
  }

  private onScrollOrResize = () => {
    if (this.isVisible) {
      this.positionToolbar();
    }
  };

  public update(view: EditorView, _prevState?: EditorState) {
    this.view = view;

    if (!isInTable(view.state)) {
      this.hide();
      return;
    }

    this.show();
    this.positionToolbar();
    this.updateActiveState();
  }

  private show() {
    this.dom.style.display = "flex";
    this.isVisible = true;
  }

  private hide() {
    this.dom.style.display = "none";
    this.isVisible = false;
  }

  private positionToolbar() {
    const $head = this.view.state.selection.$head;
    let tableDepth = -1;
    for (let d = $head.depth; d > 0; d--) {
      if ($head.node(d).type.spec.tableRole === "table") {
        tableDepth = d;
        break;
      }
    }

    let tableEl: HTMLElement | null = null;
    if (tableDepth > 0) {
      try {
        const nodeDom = this.view.nodeDOM($head.before(tableDepth));
        if (nodeDom instanceof HTMLElement) {
          tableEl =
            nodeDom.tagName.toLowerCase() === "table"
              ? nodeDom
              : nodeDom.querySelector("table") || nodeDom;
        }
      } catch {
        // nodeDOM may throw if not found
      }
    }

    if (!tableEl) {
      const sel = window.getSelection();
      const el =
        sel?.anchorNode instanceof HTMLElement
          ? sel.anchorNode
          : sel?.anchorNode?.parentElement;
      tableEl = el?.closest("table") ?? null;
    }

    if (!tableEl) {
      this.hide();
      return;
    }

    const tableRect = tableEl.getBoundingClientRect();
    const toolbarHeight = this.dom.offsetHeight || 34;
    const toolbarWidth = this.dom.offsetWidth || 380;

    let top = tableRect.top - toolbarHeight - 8;
    if (top < 42) {
      top = Math.max(42, Math.min(tableRect.bottom - toolbarHeight - 4, 42));
    }

    let left = tableRect.left;
    if (left + toolbarWidth > window.innerWidth - 16) {
      left = Math.max(16, window.innerWidth - toolbarWidth - 16);
    }

    this.dom.style.top = `${Math.round(top)}px`;
    this.dom.style.left = `${Math.round(left)}px`;
  }

  private updateActiveState() {
    try {
      const $cell = selectionCell(this.view.state);
      const alignment = $cell.nodeAfter?.attrs?.alignment || "left";
      this.dom
        .querySelectorAll<HTMLButtonElement>("[data-action^='align-']")
        .forEach((btn) => {
          const act = btn.getAttribute("data-action");
          btn.classList.toggle("active", act === `align-${alignment}`);
        });
    } catch {
      // not in cell
    }
  }

  public destroy() {
    window.removeEventListener("scroll", this.onScrollOrResize, true);
    window.removeEventListener("resize", this.onScrollOrResize, true);
    this.dom.remove();
  }
}

export function createTableToolbarPlugin(): Plugin {
  return new Plugin({
    view(editorView) {
      return new TableToolbarView(editorView);
    },
  });
}
