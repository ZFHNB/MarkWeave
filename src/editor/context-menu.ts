import type { EditorView } from "prosemirror-view";
import type { MarkWeaveEditor } from "./index";
import {
  toHtml,
  toMarkdown,
  toPlainText,
  toTex,
  copyText,
} from "./commands/clipboard-formats";
import {
  clearFormatting,
  decreaseHeadingLevel,
  deleteBlock,
  increaseHeadingLevel,
  jumpToBottom,
  jumpToTop,
  selectBlock,
  selectLine,
  toggleTaskStatus,
} from "./commands/editing";

/**
 * Typora 风格的右键菜单：根据光标位置上下文组织菜单项。
 */
interface MenuItem {
  id: string;
  label: string;
  shortcut?: string;
  run?: () => void;
  separator?: boolean;
  submenu?: MenuItem[];
  disabled?: boolean;
}

export class ContextMenu {
  private editor: MarkWeaveEditor;
  private view: EditorView;
  private dom: HTMLElement;

  constructor(editor: MarkWeaveEditor, view: EditorView) {
    this.editor = editor;
    this.view = view;
    this.dom = document.createElement("div");
    this.dom.className = "md-context-menu";
    this.dom.setAttribute("contenteditable", "false");
    this.dom.style.display = "none";
    document.body.appendChild(this.dom);

    view.dom.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      this.showAt(event.clientX, event.clientY);
    });

    document.addEventListener("mousedown", (event) => {
      if (!this.dom.contains(event.target as Node)) this.hide();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.hide();
    });
  }

  private run(command: any): void {
    command(this.view.state, this.view.dispatch);
    this.view.focus();
  }

  private buildItems(): MenuItem[] {
    const state = this.view.state;
    const $from = state.selection.$from;
    const inTable = $from.depth > 0 && !!$from.node($from.depth).type.spec.tableRole;
    const inHeading = $from.parent.type.name === "heading";
    const inCode = $from.parent.type.spec.code === true;
    const inTask = $from.parent.type.name === "task_item" || $from.node($from.depth - 1)?.type.name === "task_list";

    const items: MenuItem[] = [
      {
        id: "copy-as",
        label: "复制为",
        submenu: [
          {
            id: "copy-markdown",
            label: "Markdown",
            shortcut: "Ctrl+Shift+C",
            run: () => void copyText(toMarkdown(state.doc)),
          },
          {
            id: "copy-html",
            label: "HTML 代码",
            run: () => void copyText(toHtml(state.doc)),
          },
          {
            id: "copy-html-styled",
            label: "HTML（含主题样式）",
            run: () => void copyText(toHtml(state.doc, true)),
          },
          {
            id: "copy-plain",
            label: "纯文本",
            run: () => void copyText(toPlainText(state.doc)),
          },
          {
            id: "copy-tex",
            label: "TeX 公式",
            run: () => void copyText(toTex(state.doc)),
          },
        ],
      },
      { id: "sep-1", label: "", separator: true },
      {
        id: "heading-up",
        label: "提升标题级别",
        shortcut: "Ctrl+Alt+1",
        disabled: !inHeading,
        run: () => this.run(increaseHeadingLevel),
      },
      {
        id: "heading-down",
        label: "降低标题级别",
        shortcut: "Ctrl+Alt+2",
        disabled: !inHeading,
        run: () => this.run(decreaseHeadingLevel),
      },
      {
        id: "task-toggle",
        label: "切换任务状态",
        shortcut: "Ctrl+Shift+X",
        disabled: !inTask,
        run: () => this.run(toggleTaskStatus),
      },
      {
        id: "clear-format",
        label: "清除格式",
        shortcut: "Ctrl+Shift+\\",
        run: () => this.run(clearFormatting),
      },
      { id: "sep-2", label: "", separator: true },
      {
        id: "select-block",
        label: "选择当前段落",
        shortcut: "Ctrl+Shift+B",
        run: () => this.run(selectBlock),
      },
      {
        id: "select-line",
        label: "选择当前行",
        shortcut: "Ctrl+Shift+L",
        run: () => this.run(selectLine),
      },
      {
        id: "delete-block",
        label: "删除当前段落",
        shortcut: "Ctrl+Shift+K",
        run: () => this.run(deleteBlock),
      },
      { id: "sep-3", label: "", separator: true },
      {
        id: "jump-top",
        label: "跳转到顶部",
        shortcut: "Ctrl+Home",
        run: () => this.run(jumpToTop),
      },
      {
        id: "jump-bottom",
        label: "跳转到底部",
        shortcut: "Ctrl+End",
        run: () => this.run(jumpToBottom),
      },
      {
        id: "find",
        label: "查找 / 替换",
        shortcut: "Ctrl+F",
        run: () => this.editor.openSearch(false),
      },
    ];

    if (inTable) {
      items.splice(2, 0, {
        id: "table",
        label: "表格",
        submenu: [
          { id: "row-after", label: "下方插入行", shortcut: "Ctrl+Enter", run: () => this.runTable("row-after") },
          { id: "row-delete", label: "删除当前行", shortcut: "Ctrl+Shift+Backspace", run: () => this.runTable("row-delete") },
          { id: "col-after", label: "右侧插入列", run: () => this.runTable("col-after") },
          { id: "col-delete", label: "删除当前列", run: () => this.runTable("col-delete") },
        ],
      });
    }

    if (inCode) {
      items.splice(2, 0, {
        id: "code",
        label: "代码",
        submenu: [
          {
            id: "copy-code",
            label: "复制代码内容",
            run: () => void copyText($from.parent.textContent),
          },
        ],
      });
    }

    return items;
  }

  private runTable(action: string): void {
    const toolbar = document.querySelector(".md-table-toolbar");
    const button = toolbar?.querySelector(`[data-action="${action}"]`) as HTMLElement | null;
    button?.click();
  }

  private showAt(x: number, y: number): void {
    const items = this.buildItems();
    this.dom.innerHTML = "";

    const renderItems = (list: MenuItem[], container: HTMLElement) => {
      list.forEach((item) => {
        if (item.separator) {
          const sep = document.createElement("div");
          sep.className = "md-context-separator";
          container.appendChild(sep);
          return;
        }

        const row = document.createElement("div");
        row.className = `md-context-item${item.disabled ? " is-disabled" : ""}${item.submenu ? " has-submenu" : ""}`;
        row.setAttribute("data-action", item.id);

        const label = document.createElement("span");
        label.className = "md-context-label";
        label.textContent = item.label;

        const shortcut = document.createElement("span");
        shortcut.className = "md-context-shortcut";
        shortcut.textContent = item.submenu ? "›" : item.shortcut || "";

        row.appendChild(label);
        row.appendChild(shortcut);

        if (item.submenu && !item.disabled) {
          const sub = document.createElement("div");
          sub.className = "md-context-submenu";
          renderItems(item.submenu, sub);
          row.appendChild(sub);
        }

        if (!item.disabled && item.run) {
          row.addEventListener("mousedown", (event) => event.preventDefault());
          row.addEventListener("click", (event) => {
            if (item.submenu) {
              event.stopPropagation();
              return;
            }
            item.run!();
            this.hide();
          });
        }

        container.appendChild(row);
      });
    };

    const inner = document.createElement("div");
    inner.className = "md-context-inner";
    renderItems(items, inner);
    this.dom.appendChild(inner);

    this.dom.style.display = "block";
    const rect = this.dom.getBoundingClientRect();
    const left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8));
    this.dom.style.left = `${Math.round(left)}px`;
    this.dom.style.top = `${Math.round(top)}px`;
  }

  hide(): void {
    this.dom.style.display = "none";
  }

  destroy(): void {
    this.dom.remove();
  }
}
