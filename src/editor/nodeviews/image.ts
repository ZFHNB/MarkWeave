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
}

export class ImageView implements NodeView {
  dom: HTMLElement;
  node: PMNode;
  view: EditorView;
  getPos: () => number | undefined;

  private img: HTMLImageElement;
  private toolbar: HTMLElement;
  private zoom = 100;
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

    this.img = document.createElement("img");
    this.img.className = "md-image";
    this.img.src = this.resolveSrc(node.attrs.src || "");
    this.img.alt = node.attrs.alt || "";
    if (node.attrs.title) this.img.title = node.attrs.title;
    this.img.draggable = false;
    if (node.attrs.width) {
      this.img.setAttribute("width", String(node.attrs.width));
      this.zoom = 100;
    }
    this.img.addEventListener("error", () => {
      this.dom.classList.add("md-image-broken");
    });
    this.img.addEventListener("load", () => {
      this.dom.classList.remove("md-image-broken");
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

    addButton("−", "缩小", () => this.setZoom(this.zoom - 10));
    addButton("＋", "放大", () => this.setZoom(this.zoom + 10));
    addButton("100%", "恢复原始大小", () => this.setZoom(100));
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
        label: "复制图片路径",
        disabled: !src,
        onClick: () => {
          void navigator.clipboard?.writeText(src);
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
  private setZoom(percent: number): void {
    const clamped = Math.max(10, Math.min(400, percent));
    const located = this.locateSelf();
    if (!located) return;
    const { pos, node: live } = located;

    // 以「当前文档宽度」或「自然尺寸」为基准换算。
    // 注意 1x1 这类超小图片的自然尺寸不足以作为基准，此时用当前显示宽度。
    const currentWidth =
      (live.attrs.width as number | null) ||
      Math.round(this.img.getBoundingClientRect().width) ||
      this.img.naturalWidth ||
      0;

    // 100% 视作「原始大小」，清掉宽度属性，让文档恢复为纯 Markdown
    const nextWidth =
      clamped === 100 || currentWidth <= 0
        ? null
        : Math.max(16, Math.round((currentWidth * clamped) / 100));

    this.zoom = clamped;
    this.img.style.width = "";
    if (nextWidth) this.img.setAttribute("width", String(nextWidth));

    this.view.dispatch(
      this.view.state.tr.setNodeMarkup(pos, undefined, {
        ...live.attrs,
        width: nextWidth,
      })
    );
  }

  private setAlign(align: "left" | "center" | "right"): void {
    this.dom.dataset.align = align;
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

    // 文档里存了宽度（HTML 语法）时按它显示；否则回到自然大小
    const width = node.attrs.width as number | null;
    if (width) {
      this.img.setAttribute("width", String(width));
      this.img.style.width = "";
      this.zoom = Math.round((width / (this.img.naturalWidth || width)) * 100);
    } else {
      this.img.removeAttribute("width");
      this.img.style.width = "";
      this.zoom = 100;
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
