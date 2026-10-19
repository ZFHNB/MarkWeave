import { getLanguageLabel, searchLanguages } from "./languages";

export interface LanguagePickerOptions {
  onChange: (languageId: string) => void;
}

export class LanguagePicker {
  readonly dom: HTMLElement;
  private options: LanguagePickerOptions;
  private currentValue: string = "";
  private isOpen: boolean = false;
  private activeIndex: number = -1;

  private triggerBtn: HTMLButtonElement;
  private labelEl: HTMLElement;
  private popover: HTMLElement;
  private searchInput: HTMLInputElement;
  private listEl: HTMLUListElement;

  constructor(options: LanguagePickerOptions) {
    this.options = options;

    this.dom = document.createElement("div");
    this.dom.className = "md-fences-lang-picker";

    this.triggerBtn = document.createElement("button");
    this.triggerBtn.type = "button";
    this.triggerBtn.className = "md-fences-lang-trigger";
    this.triggerBtn.setAttribute("aria-haspopup", "listbox");
    this.triggerBtn.setAttribute("aria-expanded", "false");

    this.labelEl = document.createElement("span");
    this.labelEl.className = "md-fences-lang-name";
    this.labelEl.textContent = "纯文本";

    const arrowEl = document.createElement("span");
    arrowEl.className = "md-fences-lang-arrow";
    arrowEl.textContent = "▾";

    this.triggerBtn.appendChild(this.labelEl);
    this.triggerBtn.appendChild(arrowEl);

    this.triggerBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
    });

    this.triggerBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.isOpen) {
        this.close();
      } else {
        this.open();
      }
    });

    this.popover = document.createElement("div");
    this.popover.className = "md-fences-lang-popover";
    this.popover.style.display = "none";

    const searchWrapper = document.createElement("div");
    searchWrapper.className = "md-fences-lang-search-wrapper";

    this.searchInput = document.createElement("input");
    this.searchInput.type = "search";
    this.searchInput.className = "md-fences-lang-search";
    this.searchInput.placeholder = "搜索语言...";

    this.searchInput.addEventListener("focus", () => {
      if (!this.isOpen) {
        this.open();
      }
    });

    this.searchInput.addEventListener("input", () => {
      this.setQuery(this.searchInput.value);
    });

    this.searchInput.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        this.moveHighlight(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        this.moveHighlight(-1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        this.selectHighlighted();
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.close();
      }
    });

    searchWrapper.appendChild(this.searchInput);

    this.listEl = document.createElement("ul");
    this.listEl.setAttribute("role", "listbox");
    this.listEl.className = "md-fences-lang-list";

    this.popover.appendChild(searchWrapper);
    this.popover.appendChild(this.listEl);

    this.dom.appendChild(this.triggerBtn);
    this.dom.appendChild(this.popover);
  }

  private onDocumentEvent = (e: MouseEvent) => {
    if (!this.dom.contains(e.target as Node)) {
      this.close();
    }
  };

  setValue(languageId: string): void {
    this.currentValue = languageId ?? "";
    const trimmed = this.currentValue.trim();
    let label = "";
    if (trimmed) {
      label = getLanguageLabel(trimmed) || trimmed;
    } else {
      label = "纯文本";
    }
    this.labelEl.textContent = label;
  }

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.popover.style.display = "block";
    this.triggerBtn.setAttribute("aria-expanded", "true");
    this.renderList(this.searchInput.value);
    document.addEventListener("click", this.onDocumentEvent);
    document.addEventListener("mousedown", this.onDocumentEvent);
    try {
      this.searchInput.focus();
    } catch (_) {}
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.popover.style.display = "none";
    this.triggerBtn.setAttribute("aria-expanded", "false");
    document.removeEventListener("click", this.onDocumentEvent);
    document.removeEventListener("mousedown", this.onDocumentEvent);
  }

  setQuery(query: string): void {
    this.searchInput.value = query;
    this.renderList(query);
  }

  private renderList(query: string): void {
    this.listEl.innerHTML = "";
    const trimmed = query.trim();
    const matches = searchLanguages(trimmed);

    if (matches.length > 0) {
      matches.forEach((lang, index) => {
        const li = document.createElement("li");
        li.setAttribute("role", "option");
        li.setAttribute("data-language-id", lang.id);
        li.className = "md-fences-lang-item";
        if (index === 0) {
          li.classList.add("is-selected");
          li.setAttribute("aria-selected", "true");
        } else {
          li.setAttribute("aria-selected", "false");
        }

        const labelSpan = document.createElement("span");
        labelSpan.className = "md-fences-lang-item-label";
        labelSpan.textContent = lang.label;

        const idSpan = document.createElement("span");
        idSpan.className = "md-fences-lang-item-id";
        idSpan.textContent = lang.id;

        li.appendChild(labelSpan);
        li.appendChild(idSpan);

        li.addEventListener("mousedown", (e) => e.preventDefault());
        li.addEventListener("click", (e) => {
          e.stopPropagation();
          this.selectLanguage(lang.id);
        });

        this.listEl.appendChild(li);
      });
      this.activeIndex = 0;
    } else if (trimmed.length > 0) {
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      li.setAttribute("data-custom-language", "true");
      li.setAttribute("data-language-id", trimmed);
      li.className = "md-fences-lang-item md-fences-lang-item-custom is-selected";
      li.setAttribute("aria-selected", "true");
      li.textContent = `使用自定义语言 “${trimmed}”`;

      li.addEventListener("mousedown", (e) => e.preventDefault());
      li.addEventListener("click", (e) => {
        e.stopPropagation();
        this.selectLanguage(trimmed);
      });

      this.listEl.appendChild(li);
      this.activeIndex = 0;
    } else {
      this.activeIndex = -1;
    }
  }

  private moveHighlight(delta: number): void {
    const items = Array.from(this.listEl.querySelectorAll<HTMLElement>("[role=option]"));
    if (items.length === 0) return;
    this.activeIndex = (this.activeIndex + delta + items.length) % items.length;
    items.forEach((item, idx) => {
      if (idx === this.activeIndex) {
        item.classList.add("is-selected");
        item.setAttribute("aria-selected", "true");
        item.scrollIntoView({ block: "nearest" });
      } else {
        item.classList.remove("is-selected");
        item.setAttribute("aria-selected", "false");
      }
    });
  }

  private selectHighlighted(): void {
    const items = Array.from(this.listEl.querySelectorAll<HTMLElement>("[role=option]"));
    if (this.activeIndex >= 0 && this.activeIndex < items.length) {
      items[this.activeIndex].click();
    }
  }

  private selectLanguage(languageId: string): void {
    this.setValue(languageId);
    this.close();
    this.options.onChange(languageId);
  }

  destroy(): void {
    this.close();
    this.dom.remove();
  }
}
