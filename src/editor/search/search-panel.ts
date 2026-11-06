import { type EditorView } from "prosemirror-view";
import { SearchSession, type SearchOptions } from "./search-plugin";

/**
 * Typora 风格的浮动查找/替换面板。
 */
export class SearchPanel {
  readonly dom: HTMLElement;
  private view: EditorView;
  private session: SearchSession;

  private findInput: HTMLInputElement;
  private replaceInput: HTMLInputElement;
  private counterEl: HTMLElement;
  private caseBtn: HTMLButtonElement;
  private wordBtn: HTMLButtonElement;
  private regexBtn: HTMLButtonElement;
  private replaceRow: HTMLElement;
  private replaceToggle: HTMLButtonElement;

  constructor(view: EditorView) {
    this.view = view;
    this.session = new SearchSession(view, () => this.updateCounter());

    this.dom = document.createElement("div");
    this.dom.className = "md-search-panel";
    this.dom.setAttribute("contenteditable", "false");
    this.dom.style.display = "none";

    // 第一行：查找
    const findRow = document.createElement("div");
    findRow.className = "md-search-row";

    this.findInput = document.createElement("input");
    this.findInput.type = "text";
    this.findInput.className = "md-search-input";
    this.findInput.placeholder = "查找";
    this.findInput.addEventListener("input", () => {
      this.session.setQuery(this.findInput.value);
      this.updateCounter();
    });
    this.findInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) this.session.previous();
        else this.session.next();
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.close();
      }
    });

    this.counterEl = document.createElement("span");
    this.counterEl.className = "md-search-counter";
    this.counterEl.textContent = "0/0";

    this.caseBtn = this.makeToggle("Aa", "区分大小写", "case");
    this.wordBtn = this.makeToggle("W", "全字匹配", "word");
    this.regexBtn = this.makeToggle(".*", "正则表达式", "regex");

    const prevBtn = this.makeButton("↑", "上一个 (Shift+Enter)", () => this.session.previous());
    const nextBtn = this.makeButton("↓", "下一个 (Enter)", () => this.session.next());
    this.replaceToggle = this.makeButton("⇄", "切换替换 (Ctrl+H)", () => this.toggleReplace());
    const closeBtn = this.makeButton("×", "关闭 (Esc)", () => this.close());

    findRow.appendChild(this.findInput);
    findRow.appendChild(this.counterEl);
    findRow.appendChild(this.caseBtn);
    findRow.appendChild(this.wordBtn);
    findRow.appendChild(this.regexBtn);
    findRow.appendChild(prevBtn);
    findRow.appendChild(nextBtn);
    findRow.appendChild(this.replaceToggle);
    findRow.appendChild(closeBtn);

    // 第二行：替换
    this.replaceRow = document.createElement("div");
    this.replaceRow.className = "md-search-row md-search-replace-row";

    this.replaceInput = document.createElement("input");
    this.replaceInput.type = "text";
    this.replaceInput.className = "md-search-input";
    this.replaceInput.placeholder = "替换为";
    this.replaceInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.session.replaceCurrent(this.replaceInput.value);
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.close();
      }
    });

    const replaceOneBtn = this.makeButton("替换", "替换当前匹配", () =>
      this.session.replaceCurrent(this.replaceInput.value)
    );
    const replaceAllBtn = this.makeButton("全部", "替换全部匹配", () =>
      this.session.replaceAll(this.replaceInput.value)
    );

    this.replaceRow.appendChild(this.replaceInput);
    this.replaceRow.appendChild(replaceOneBtn);
    this.replaceRow.appendChild(replaceAllBtn);
    this.replaceRow.style.display = "none";

    this.dom.appendChild(findRow);
    this.dom.appendChild(this.replaceRow);
    document.body.appendChild(this.dom);
  }

  private makeButton(label: string, title: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "md-search-btn";
    btn.textContent = label;
    btn.title = title;
    btn.setAttribute("contenteditable", "false");
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      onClick();
    });
    return btn;
  }

  private makeToggle(label: string, title: string, kind: "case" | "word" | "regex"): HTMLButtonElement {
    const btn = this.makeButton(label, title, () => {
      const options: SearchOptions = this.session.getOptions();
      if (kind === "case") options.caseSensitive = !options.caseSensitive;
      if (kind === "word") options.wholeWord = !options.wholeWord;
      if (kind === "regex") options.regex = !options.regex;
      btn.classList.toggle("active", kind === "case" ? options.caseSensitive : kind === "word" ? options.wholeWord : options.regex);
      this.session.setOptions(options);
    });
    btn.classList.add("md-search-toggle");
    return btn;
  }

  open(replaceMode = false): void {
    this.dom.style.display = "flex";
    this.replaceRow.style.display = replaceMode ? "flex" : "none";
    const selection = this.view.state.selection;
    if (!selection.empty) {
      const text = this.view.state.doc.textBetween(selection.from, selection.to, " ");
      if (text && text.length < 120) {
        this.findInput.value = text;
        this.session.setQuery(text);
      }
    }
    this.findInput.focus();
    this.findInput.select();
    this.updateCounter();
  }

  toggleReplace(): void {
    const visible = this.replaceRow.style.display !== "none";
    this.replaceRow.style.display = visible ? "none" : "flex";
    if (!visible) this.replaceInput.focus();
  }

  close(): void {
    this.dom.style.display = "none";
    this.session.close();
    this.view.focus();
  }

  isOpen(): boolean {
    return this.dom.style.display !== "none";
  }

  private updateCounter(): void {
    const info = this.session.getMatchInfo();
    this.counterEl.textContent = `${info.index}/${info.total}`;
    this.counterEl.classList.toggle("is-empty", info.total === 0);
  }

  destroy(): void {
    this.dom.remove();
  }
}
