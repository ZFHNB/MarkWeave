/**
 * 源码模式下的查找/替换。
 *
 * 源码视图是一个 textarea，ProseMirror 的装饰高亮用不上，这里用
 * 原生 selection + 滚动定位实现同样的交互：Enter 下一个、Shift+Enter 上一个、
 * Esc 关闭、支持区分大小写与正则。复用编辑器搜索面板的样式类，观感一致。
 */
export interface SourceSearchMatch {
  from: number;
  to: number;
}

/** 纯逻辑：在文本里找出全部匹配区间（供单测） */
export function findSourceMatches(
  text: string,
  query: string,
  options: { caseSensitive?: boolean; regex?: boolean } = {}
): SourceSearchMatch[] {
  if (!query) return [];
  let pattern: RegExp;
  try {
    pattern = new RegExp(
      options.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      options.caseSensitive ? "g" : "gi"
    );
  } catch {
    return []; // 正则写错时不报错，按"无匹配"处理
  }

  const matches: SourceSearchMatch[] = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    if (m[0].length === 0) {
      pattern.lastIndex += 1;
      continue;
    }
    matches.push({ from: m.index, to: m.index + m[0].length });
  }
  return matches;
}

/** 从当前位置往后找下一个匹配；找不到返回第一个（循环） */
export function nextMatchIndex(
  matches: SourceSearchMatch[],
  cursor: number,
  direction: 1 | -1
): number {
  if (matches.length === 0) return -1;
  if (direction === 1) {
    const idx = matches.findIndex((m) => m.from > cursor);
    return idx === -1 ? 0 : idx;
  }
  for (let i = matches.length - 1; i >= 0; i--) {
    if (matches[i].from < cursor) return i;
  }
  return matches.length - 1;
}

export class SourceSearchPanel {
  readonly dom: HTMLElement;
  private textarea: HTMLTextAreaElement;
  private queryInput: HTMLInputElement;
  private replaceInput: HTMLInputElement;
  private counterEl: HTMLElement;
  private caseBtn: HTMLButtonElement;
  private regexBtn: HTMLButtonElement;
  private replaceRow: HTMLElement;

  private matches: SourceSearchMatch[] = [];
  private activeIndex = 0;
  private caseSensitive = false;
  private regex = false;
  private onChange: () => void;

  constructor(textarea: HTMLTextAreaElement, onChange: () => void = () => {}) {
    this.textarea = textarea;
    this.onChange = onChange;

    this.dom = document.createElement("div");
    this.dom.className = "md-search-panel md-source-search";
    this.dom.style.display = "none";

    const findRow = document.createElement("div");
    findRow.className = "md-search-row";

    this.queryInput = document.createElement("input");
    this.queryInput.type = "text";
    this.queryInput.className = "md-search-input";
    this.queryInput.placeholder = "在源码中查找";
    this.queryInput.addEventListener("input", () => {
      this.refresh(true);
      this.onChange();
    });
    this.queryInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.step(e.shiftKey ? -1 : 1);
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.close();
      }
    });

    this.counterEl = document.createElement("span");
    this.counterEl.className = "md-search-counter";
    this.counterEl.textContent = "0/0";

    this.caseBtn = this.makeToggle("Aa", "区分大小写", () => {
      this.caseSensitive = !this.caseSensitive;
      this.caseBtn.classList.toggle("active", this.caseSensitive);
      this.refresh(true);
    });
    this.regexBtn = this.makeToggle(".*", "正则表达式", () => {
      this.regex = !this.regex;
      this.regexBtn.classList.toggle("active", this.regex);
      this.refresh(true);
    });

    const prevBtn = this.makeButton("↑", "上一个 (Shift+Enter)", () => this.step(-1));
    const nextBtn = this.makeButton("↓", "下一个 (Enter)", () => this.step(1));
    const closeBtn = this.makeButton("×", "关闭 (Esc)", () => this.close());

    findRow.append(
      this.queryInput,
      this.counterEl,
      this.caseBtn,
      this.regexBtn,
      prevBtn,
      nextBtn,
      closeBtn
    );

    this.replaceRow = document.createElement("div");
    this.replaceRow.className = "md-search-row md-search-replace-row";
    this.replaceRow.style.display = "none";

    this.replaceInput = document.createElement("input");
    this.replaceInput.type = "text";
    this.replaceInput.className = "md-search-input";
    this.replaceInput.placeholder = "替换为";
    this.replaceInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.replaceCurrent();
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.close();
      }
    });

    const replaceOne = this.makeButton("替换", "替换当前匹配", () => this.replaceCurrent());
    const replaceAll = this.makeButton("全部", "替换全部匹配", () => this.replaceAll());
    this.replaceRow.append(this.replaceInput, replaceOne, replaceAll);

    this.dom.append(findRow, this.replaceRow);
    document.body.appendChild(this.dom);
  }

  private makeButton(label: string, title: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "md-search-btn";
    btn.textContent = label;
    btn.title = title;
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      onClick();
    });
    return btn;
  }

  private makeToggle(label: string, title: string, onClick: () => void): HTMLButtonElement {
    const btn = this.makeButton(label, title, onClick);
    btn.classList.add("md-search-toggle");
    return btn;
  }

  open(replaceMode = false): void {
    this.dom.style.display = "flex";
    this.replaceRow.style.display = replaceMode ? "flex" : "none";
    const selected = this.textarea.value.slice(
      this.textarea.selectionStart,
      this.textarea.selectionEnd
    );
    if (selected && selected.length < 120 && !selected.includes("\n")) {
      this.queryInput.value = selected;
    }
    this.queryInput.focus();
    this.queryInput.select();
    this.refresh(true);
  }

  close(): void {
    this.dom.style.display = "none";
    this.textarea.focus();
  }

  isOpen(): boolean {
    return this.dom.style.display !== "none";
  }

  private refresh(resetIndex: boolean): void {
    this.matches = findSourceMatches(this.textarea.value, this.queryInput.value, {
      caseSensitive: this.caseSensitive,
      regex: this.regex,
    });
    if (resetIndex || this.activeIndex >= this.matches.length) this.activeIndex = 0;
    if (this.matches.length > 0) this.focusMatch(this.activeIndex);
    this.updateCounter();
  }

  private focusMatch(index: number): void {
    const match = this.matches[index];
    if (!match) return;
    this.textarea.focus();
    this.textarea.setSelectionRange(match.from, match.to);
    // 把匹配行滚到可视区中部
    const line = this.textarea.value.slice(0, match.from).split("\n").length;
    const lineHeight = parseFloat(getComputedStyle(this.textarea).lineHeight) || 24;
    this.textarea.scrollTop = Math.max(0, (line - 5) * lineHeight);
    this.queryInput.focus();
  }

  private step(direction: 1 | -1): void {
    if (this.matches.length === 0) return;
    this.activeIndex =
      (this.activeIndex + direction + this.matches.length) % this.matches.length;
    this.focusMatch(this.activeIndex);
    this.updateCounter();
  }

  private replaceCurrent(): void {
    const match = this.matches[this.activeIndex];
    if (!match) return;
    const value = this.textarea.value;
    const replacement = this.replaceInput.value;
    this.textarea.value = value.slice(0, match.from) + replacement + value.slice(match.to);
    // 通知外部：内容变了，需要同步回文档
    this.textarea.dispatchEvent(new Event("input", { bubbles: true }));
    this.refresh(true);
    this.onChange();
  }

  private replaceAll(): void {
    if (this.matches.length === 0) return;
    const value = this.textarea.value;
    const replacement = this.replaceInput.value;
    let next = "";
    let cursor = 0;
    for (const match of this.matches) {
      next += value.slice(cursor, match.from) + replacement;
      cursor = match.to;
    }
    next += value.slice(cursor);
    this.textarea.value = next;
    this.textarea.dispatchEvent(new Event("input", { bubbles: true }));
    this.refresh(true);
    this.onChange();
  }

  private updateCounter(): void {
    const total = this.matches.length;
    this.counterEl.textContent = `${total === 0 ? 0 : this.activeIndex + 1}/${total}`;
    this.counterEl.classList.toggle("is-empty", total === 0);
  }

  destroy(): void {
    this.dom.remove();
  }
}
