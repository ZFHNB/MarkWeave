import { Node as PMNode } from "prosemirror-model";
import { EditorView, type NodeView } from "prosemirror-view";
import { openMenuAt } from "../../ui/components";
import { imageFileName, resolveImageFilePath } from "./image-actions";

/**
 * 图片节点视图（对标 Typora）：
 * - 点击选中时显示悬浮工具条（缩放 / 对齐 / 删除）
 * - 缩放与对齐仅作用于当前会话的 DOM，不写入 Markdown
 * - 支持宽高属性的图片（HTML 语法插入时保留）
 */

const ZOOM_STEPS = [25, 33, 50, 67, 80, 100, 150, 200];

export interface ImageViewOptions {
  /**
   * 把 Markdown 里的 src 解析成浏览器可加载的 URL。
   * 只影响 DOM 的显示，节点属性保持不变（Markdown 里仍是相对路径）。
   */
  resolveSrc?: (src: string) => string;
  /** 当前文档的磁盘路径，用于解析相对图片 */
  getDocumentPath?: () => string | null;
  /** 在系统文件管理器中定位文件（主进程能力） */
  revealPath?: (path: string) => Promise<boolean> | void;
  /** 把图片写入剪贴板 */
  copyImage?: (src: string, absolutePath: string | null) => Promise<boolean>;
  /** 另存为：返回用户选择的目标路径 */
  saveImageAs?: (src: string, suggestedName: string) => Promise<boolean>;
  /** 删除图片节点 */
  deleteNode?: () => void;
  /** 插入图片的默认对齐（center / left / right） */
  getDefaultAlign?: () => "center" | "left" | "right";
}

export class ImageView implements NodeView {
  dom: HTMLElement;
  node: PMNode;
  view: EditorView;
  getPos: () => number | undefined;

  private img: HTMLImageElement;
  private toolbar: HTMLElement;
  private options: ImageViewOptions;

  constructor(
    node: PMNode,
    view: EditorView,
    getPos: () => number | undefined,
    options: ImageViewOptions = {}
  ) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.options = options;

    this.dom = document.createElement("span");
    this.dom.className = "md-image-wrap";
    // 对齐优先级：节点自身属性 > 偏好设置里的默认值 > 居中
    this.dom.dataset.align =
      node.attrs.align || (options.getDefaultAlign?.() ?? "center");

    this.img = document.createElement("img");
    this.img.className = "md-image";
    this.img.src = this.resolveSrc(node.attrs.src || "");
    this.img.alt = node.attrs.alt || "";
    if (node.attrs.title) this.img.title = node.attrs.title;
    this.img.draggable = false;
    if (node.attrs.width) {
      this.img.setAttribute("width", String(node.attrs.width));
    }
    this.img.addEventListener("error", () => {
      this.dom.classList.add("md-image-broken");
    });
    this.img.addEventListener("load", () => {
      this.dom.classList.remove("md-image-broken");
      this.updateZoomLabel();
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

    addButton("−", "缩小", () => this.setZoom(this.currentPercent() - 10));
    addButton("＋", "放大", () => this.setZoom(this.currentPercent() + 10));

    // 百分比数字随实际显示尺寸变化，而不是固定写死 "100%"
    const zoomLabel = document.createElement("button");
    zoomLabel.type = "button";
    zoomLabel.className = "md-image-btn md-image-zoom-label";
    zoomLabel.title = "恢复为与正文等宽";
    zoomLabel.textContent = "100%";
    zoomLabel.addEventListener("mousedown", (e) => e.preventDefault());
    zoomLabel.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.setZoom(100);
    });
    this.toolbar.appendChild(zoomLabel);

    addButton("⇤", "左对齐", () => this.setAlign("left"));
    addButton("⇔", "居中", () => this.setAlign("center"));
    addButton("⇥", "右对齐", () => this.setAlign("right"));
    addButton("删除", "删除图片", () => this.remove());

    this.dom.appendChild(this.img);
    this.dom.appendChild(this.toolbar);

    this.dom.addEventListener("click", () => this.showToolbar());

    // 右键菜单：模仿 Typora 的图片操作
    this.dom.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.openContextMenu(event.clientX, event.clientY);
    });
  }

  /**
   * 在文档里定位本节点。
   *
   * getPos() 在节点被重建后可能指向别处，这里按「img 节点 + 相同 src」
   * 回查，找不到再退回 getPos。返回值一定是文档里真实的 image 节点位置。
   */
  private locateSelf(): { pos: number; node: PMNode } | null {
    const src = this.node.attrs.src;
    const hinted = this.getPos();
    if (typeof hinted === "number") {
      const at = this.view.state.doc.nodeAt(hinted);
      if (at && at.type === this.node.type && at.attrs.src === src) {
        return { pos: hinted, node: at };
      }
    }
    let found: { pos: number; node: PMNode } | null = null;
    this.view.state.doc.descendants((node, pos) => {
      if (found) return false;
      if (node.type === this.node.type && node.attrs.src === src) {
        found = { pos, node };
        return false;
      }
      return true;
    });
    return found;
  }

  /**
   * 切换图片语法。
   *
   * 两者的区别就是「有没有宽度属性」：
   * - Markdown：`![alt](src)`
   * - HTML：`<img src alt width>`
   * 转成 HTML 时若原本没有宽度，先按当前显示尺寸固定下来。
   */
  private setSyntax(kind: "markdown" | "html"): void {
    const located = this.locateSelf();
    if (!located) return;
    const { pos, node: live } = located;

    // 以文档里的实时属性为准；this.node 只在 update() 时刷新，
    // 连续操作（先缩放再切语法）时可能已经过期。
    const width = live.attrs.width as number | null;
    if (kind === "markdown") {
      if (!width) return; // 已是 Markdown 语法
      this.view.dispatch(
        this.view.state.tr.setNodeMarkup(pos, undefined, { ...live.attrs, width: null })
      );
      return;
    }

    // 转 HTML：没有宽度时取当前渲染宽度
    const current =
      width || this.img.getBoundingClientRect().width || this.img.naturalWidth || null;
    this.view.dispatch(
      this.view.state.tr.setNodeMarkup(pos, undefined, {
        ...live.attrs,
        width: current ? Math.round(current) : null,
      })
    );
  }

  /** 图片右键菜单 */
  private openContextMenu(x: number, y: number): void {
    const src: string = this.node.attrs.src || "";
    const documentPath = this.options.getDocumentPath?.() ?? null;
    const absolute = resolveImageFilePath(src, documentPath);

    // 可复制路径的优先级：绝对磁盘路径 > 原始相对路径 / 网络地址。
    // data URL 不提供（粘贴的图片没有路径可复制）。
    const isDataUrl = /^data:/i.test(src);
    const copyablePath = isDataUrl ? null : (absolute || src);

    const items = [
      {
        label: "打开图片位置",
        disabled: !absolute,
        onClick: () => {
          if (absolute) void this.options.revealPath?.(absolute);
        },
      },
      {
        label: "复制图片",
        onClick: () => {
          void this.options.copyImage?.(src, absolute);
        },
      },
      {
        // 只复制"有用的路径"：绝对是磁盘文件路径，或原始 Markdown 里的
        // 相对路径 / 网络地址。data URL 是几万字符的 base64，复制出去没用。
        label: "复制图片路径",
        disabled: !copyablePath,
        onClick: () => {
          if (copyablePath) void navigator.clipboard?.writeText(copyablePath);
        },
      },
      { kind: "separator" as const },
      {
        label: "缩放图片",
        submenu: [
          { label: "25%", onClick: () => this.setZoom(25) },
          { label: "33%", onClick: () => this.setZoom(33) },
          { label: "50%", onClick: () => this.setZoom(50) },
          { label: "67%", onClick: () => this.setZoom(67) },
          { label: "80%", onClick: () => this.setZoom(80) },
          { label: "100%（原始大小）", onClick: () => this.setZoom(100) },
          { label: "150%", onClick: () => this.setZoom(150) },
          { label: "200%", onClick: () => this.setZoom(200) },
        ],
      },
      {
        label: "转换图片语法",
        submenu: [
          {
            label: "Markdown 语法",
            checked: !this.node.attrs.width,
            onClick: () => this.setSyntax("markdown"),
          },
          {
            label: "HTML 语法",
            checked: Boolean(this.node.attrs.width),
            onClick: () => this.setSyntax("html"),
          },
        ],
      },
      { kind: "separator" as const },
      {
        label: "将图像另存为…",
        onClick: () => {
          void this.options.saveImageAs?.(src, imageFileName(src));
        },
      },
      {
        label: "删除图片",
        onClick: () => {
          const pos = this.getPos();
          if (typeof pos === "number") {
            this.view.dispatch(
              this.view.state.tr.delete(pos, pos + this.node.nodeSize)
            );
          }
          this.options.deleteNode?.();
        },
      },
    ];

    openMenuAt({ left: x, right: x, top: y, bottom: y, width: 0, height: 0 }, items);
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

  /**
   * 缩放图片并写回文档。
   *
   * 之前只改 DOM 的 style.width，刷新或切换文档就丢了。现在把宽度写进
   * 节点属性：有宽度时序列化成 `<img width="...">`（Typora 同款），
   * 没有宽度时仍是标准 Markdown 语法。
   */
  /**
   * 缩放图片并写回文档。
   *
   * 基准是「正文可用宽度」而不是图片自身的当前宽度：
   * - 100% = 撑满正文宽度（与 Typora 的"放大到与文字区域等宽"一致）
   * - 百分比按正文宽度换算成像素，因此反复点放大不会越缩越小
   * 按钮显示的数字始终反映当前相对正文宽度的比例。
   */
  private setZoom(percent: number): void {
    const located = this.locateSelf();
    if (!located) return;
    const { pos, node: live } = located;

    const availWidth = this.measureAvailableWidth();
    // 上限 100% = 与正文区域等宽（用户要的"放大到与文字显示区域等宽"）；
    // 再大就会溢出正文列，没有意义。
    const clamped = Math.max(5, Math.min(100, percent));
    const nextWidth =
      availWidth <= 0 ? null : Math.max(16, Math.round((availWidth * clamped) / 100));

    this.img.removeAttribute("width");
    this.img.style.width = "";
    if (nextWidth) this.img.setAttribute("width", String(nextWidth));

    this.view.dispatch(
      this.view.state.tr.setNodeMarkup(pos, undefined, {
        ...live.attrs,
        width: nextWidth,
      })
    );
    this.updateZoomLabel();
  }

  /** 正文可用宽度（图片最大可显示到的宽度） */
  private measureAvailableWidth(): number {
    const editorRoot =
      (this.img.closest("#write") as HTMLElement | null) ||
      (this.view.dom.closest("#write") as HTMLElement | null);
    if (editorRoot) {
      const style = getComputedStyle(editorRoot);
      const inner =
        editorRoot.clientWidth -
        parseFloat(style.paddingLeft || "0") -
        parseFloat(style.paddingRight || "0");
      if (inner > 0) return inner;
    }
    return this.view.dom.clientWidth || 0;
  }

  /**
   * 当前缩放比例（相对正文宽度）。
   *
   * 没有 width 属性（标准 Markdown 语法）时视为"原始大小"，显示 100%；
   * 只有显式设过宽度才按实际显示宽度换算。
   */
  private currentPercent(): number {
    if (!this.node.attrs.width) return 100;
    const avail = this.measureAvailableWidth();
    const shown = this.img.getBoundingClientRect().width;
    if (avail <= 0 || shown <= 0) return 100;
    return Math.min(100, Math.round((shown / avail) * 100));
  }

  /** 更新工具条上的百分比数字 */
  private updateZoomLabel(): void {
    const label = this.toolbar.querySelector<HTMLElement>(".md-image-zoom-label");
    if (label) label.textContent = `${this.currentPercent()}%`;
  }


  /**
   * 设置对齐并写回文档。
   *
   * 之前只改 DOM 的 data-align，切换文档或刷新就丢。现在写进节点属性，
   * 以 HTML 语法持久化（Markdown 语法本身无法表达对齐）。
   * 对齐只影响整行排布，不改变图片尺寸。
   */
  private setAlign(align: "left" | "center" | "right"): void {
    const located = this.locateSelf();
    if (!located) return;
    const { pos, node: live } = located;

    const nextAlign = align === "center" ? null : align;
    this.dom.dataset.align = align;
    this.view.dispatch(
      this.view.state.tr.setNodeMarkup(pos, undefined, {
        ...live.attrs,
        align: nextAlign,
      })
    );
  }

  private remove(): void {
    const pos = this.getPos();
    if (typeof pos !== "number") return;
    this.view.dispatch(this.view.state.tr.delete(pos, pos + this.node.nodeSize));
  }

  /** 相对路径 → 可加载 URL；本来就是绝对/网络地址时原样返回 */
  private resolveSrc(src: string): string {
    if (!src) return src;
    return this.options.resolveSrc ? this.options.resolveSrc(src) : src;
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    const nextSrc = this.resolveSrc(node.attrs.src || "");
    if (nextSrc !== this.img.getAttribute("src")) {
      this.img.src = nextSrc;
    }
    this.img.alt = node.attrs.alt || "";
    this.img.title = node.attrs.title || "";

    // 对齐同样以节点属性为准，缺失时回落到默认值
    this.dom.dataset.align =
      node.attrs.align || (this.options.getDefaultAlign?.() ?? "center");

    // 文档里存了宽度（HTML 语法）时按它显示；否则回到自然大小
    const width = node.attrs.width as number | null;
    if (width) {
      this.img.setAttribute("width", String(width));
      this.img.style.width = "";
    } else {
      this.img.removeAttribute("width");
      this.img.style.width = "";
    }
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
