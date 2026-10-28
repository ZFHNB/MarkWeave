import { quickOpen, sortFiles, type FlatFile, type SortMode } from "../workspace/file-tree";

/**
 * 快速打开（Ctrl+P）：模糊搜索工作区文件，回车打开。
 */
export class QuickOpen {
  readonly dom: HTMLElement;
  private input: HTMLInputElement;
  private listEl: HTMLElement;
  private files: FlatFile[] = [];
  private results: FlatFile[] = [];
  private activeIndex = 0;
  private onPick: (file: FlatFile) => void;

  constructor(onPick: (file: FlatFile) => void) {
    this.onPick = onPick;

    this.dom = document.createElement("div");
    this.dom.className = "md-quick-open-overlay";
    this.dom.setAttribute("contenteditable", "false");
    this.dom.style.display = "none";

    const card = document.createElement("div");
    card.className = "md-quick-open-card";

    this.input = document.createElement("input");
    this.input.type = "text";
    this.input.className = "md-quick-open-input";
    this.input.placeholder = "快速打开文件… (Ctrl+P)";
    this.input.addEventListener("input", () => {
      this.activeIndex = 0;
      this.refresh();
    });
    this.input.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        this.move(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        this.move(-1);
      } else if (event.key === "Enter") {
        event.preventDefault();
        this.pick();
      } else if (event.key === "Escape") {
        event.preventDefault();
        this.close();
      }
    });

    this.listEl = document.createElement("div");
    this.listEl.className = "md-quick-open-list";

    card.appendChild(this.input);
    card.appendChild(this.listEl);
    this.dom.appendChild(card);

    this.dom.addEventListener("mousedown", (event) => {
      if (event.target === this.dom) this.close();
    });
  }

  setFiles(files: FlatFile[], sortMode: SortMode = "natural-asc"): void {
    this.files = sortFiles(files, sortMode);
    if (this.isOpen()) this.refresh();
  }

  private refresh(): void {
    this.results = quickOpen(this.files, this.input.value, { limit: 60 });
    if (this.activeIndex >= this.results.length) this.activeIndex = 0;
    this.render();
  }

  private render(): void {
    this.listEl.innerHTML = "";
    if (this.results.length === 0) {
      const empty = document.createElement("div");
      empty.className = "md-quick-open-empty";
      empty.textContent = this.files.length === 0 ? "（未打开文件夹）" : "无匹配文件";
      this.listEl.appendChild(empty);
      return;
    }

    this.results.forEach((file, index) => {
      const row = document.createElement("div");
      row.className = `md-quick-open-item${index === this.activeIndex ? " is-active" : ""}`;
      row.setAttribute("data-file-path", file.path);

      const name = document.createElement("span");
      name.className = "md-quick-open-name";
      name.textContent = file.name;

      const pathEl = document.createElement("span");
      pathEl.className = "md-quick-open-path";
      const parts = file.relativePath.split("/");
      pathEl.textContent = parts.slice(0, -1).join("/");

      row.appendChild(name);
      row.appendChild(pathEl);
      row.addEventListener("mousedown", (event) => event.preventDefault());
      row.addEventListener("click", () => {
        this.activeIndex = index;
        this.pick();
      });

      this.listEl.appendChild(row);
    });
  }

  private move(delta: number): void {
    if (this.results.length === 0) return;
    this.activeIndex = (this.activeIndex + delta + this.results.length) % this.results.length;
    this.render();
    const active = this.listEl.children[this.activeIndex] as HTMLElement | undefined;
    active?.scrollIntoView({ block: "nearest" });
  }

  private pick(): void {
    const file = this.results[this.activeIndex];
    if (!file) return;
    this.close();
    this.onPick(file);
  }

  open(): void {
    this.dom.style.display = "flex";
    this.input.value = "";
    this.activeIndex = 0;
    this.refresh();
    this.input.focus();
  }

  close(): void {
    this.dom.style.display = "none";
  }

  isOpen(): boolean {
    return this.dom.style.display !== "none";
  }

  destroy(): void {
    this.dom.remove();
  }
}
