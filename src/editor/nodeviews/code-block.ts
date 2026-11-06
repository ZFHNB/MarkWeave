import { Node as PMNode } from "prosemirror-model";
import { EditorView, type NodeView } from "prosemirror-view";
import { loadMermaid } from "../diagram/mermaid-loader";
import { MermaidInteractor } from "../diagram/mermaid-interactor";
import { LanguagePicker } from "../code/language-picker";
import {
  getMermaidThemePreference,
  resolveMermaidTheme,
} from "../../platform/mermaid-theme";

// Mermaid 改为首次渲染时按需加载，避免拖慢启动
let mermaidCounter = 0;

export class CodeBlockView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  node: PMNode;
  view: EditorView;
  getPos: () => number | undefined;

  private picker: LanguagePicker;
  private preEl: HTMLElement;
  private diagramContainer: HTMLElement;
  private toggleModeBtn: HTMLButtonElement;
  private copyBtn: HTMLButtonElement;
  private isEditingMermaid: boolean = false;
  private interactor: MermaidInteractor = new MermaidInteractor();

  constructor(node: PMNode, view: EditorView, getPos: () => number | undefined) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;

    // 外部容器
    this.dom = document.createElement("div");
    this.dom.className = "md-fences-wrapper md-block";

    // 悬浮工具栏 (语言输入 + 模式切换 + 复制按钮)
    const toolbar = document.createElement("div");
    toolbar.className = "md-fences-toolbar";
    toolbar.setAttribute("contenteditable", "false");

    const leftGroup = document.createElement("div");
    leftGroup.style.display = "flex";
    leftGroup.style.alignItems = "center";
    leftGroup.style.gap = "8px";

    this.picker = new LanguagePicker({
      onChange: (languageId) => {
        const pos = this.getPos();
        if (typeof pos === "number") {
          this.view.dispatch(
            this.view.state.tr.setNodeMarkup(pos, undefined, {
              params: languageId.trim(),
            })
          );
        }
      },
    });
    this.picker.setValue(node.attrs.params || "");

    leftGroup.appendChild(this.picker.dom);

    const rightGroup = document.createElement("div");
    rightGroup.style.display = "flex";
    rightGroup.style.alignItems = "center";
    rightGroup.style.gap = "8px";

    this.toggleModeBtn = document.createElement("button");
    this.toggleModeBtn.className = "md-fences-toggle-btn";
    this.toggleModeBtn.textContent = "编辑源码";
    this.toggleModeBtn.style.display = "none";
    this.toggleModeBtn.setAttribute("contenteditable", "false");
    this.toggleModeBtn.addEventListener("mousedown", (e) => e.preventDefault());
    this.toggleModeBtn.addEventListener("click", () => {
      this.isEditingMermaid = !this.isEditingMermaid;
      this.updateViewMode();
    });

    this.copyBtn = document.createElement("button");
    this.copyBtn.className = "md-fences-copy-btn";
    this.copyBtn.textContent = "复制";
    this.copyBtn.setAttribute("contenteditable", "false");
    this.copyBtn.addEventListener("mousedown", (e) => e.preventDefault());
    this.copyBtn.addEventListener("click", async () => {
      if (this.isMermaid() && !this.isEditingMermaid) {
        // 预览图表模式：直接复制预览图图片 (PNG)
        const svgEl = this.diagramContainer.querySelector<SVGSVGElement>("svg");
        if (svgEl) {
          await this.copySvgAsImage(svgEl);
          return;
        }
      }

      // 编辑源码模式或普通代码块：直接复制其源码文本
      const codeText = this.node.textContent;
      try {
        await navigator.clipboard.writeText(codeText);
      } catch {
        try {
          const ta = document.createElement("textarea");
          ta.value = codeText;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          document.execCommand("copy");
          ta.remove();
        } catch (_) {}
      }
      this.copyBtn.textContent = "已复制源码!";
      setTimeout(() => {
        this.copyBtn.textContent =
          this.isMermaid() && !this.isEditingMermaid
            ? "复制图片"
            : this.isMermaid()
            ? "复制源码"
            : "复制";
      }, 1500);
    });

    rightGroup.appendChild(this.toggleModeBtn);
    rightGroup.appendChild(this.copyBtn);

    toolbar.appendChild(leftGroup);
    toolbar.appendChild(rightGroup);

    // 代码内容 pre
    this.preEl = document.createElement("pre");
    this.preEl.className = "md-fences-content";
    const code = document.createElement("code");
    code.spellcheck = false;
    this.preEl.appendChild(code);
    this.contentDOM = code;

    // Mermaid 图表预览 DOM
    this.diagramContainer = document.createElement("div");
    this.diagramContainer.className = "md-diagram-preview";
    this.diagramContainer.setAttribute("contenteditable", "false");
    this.diagramContainer.style.display = "none";
    this.diagramContainer.addEventListener("click", (e) => {
      if (this.isEditingMermaid) return;
      // 避免工具栏按钮、连线气泡、行内输入框点击或编辑模式下触发切入源码编辑
      const target = e.target as HTMLElement;
      if (
        target.closest(".md-diagram-toolbar") ||
        target.closest(".md-diagram-toolbar-wrap") ||
        target.closest(".md-edge-popover") ||
        target.closest(".md-inline-label-editor") ||
        target.closest(".md-inline-node-editor") ||
        this.diagramContainer.classList.contains("is-drag-mode") ||
        this.diagramContainer.classList.contains("is-edit-mode")
      ) {
        return;
      }
      // 点击图表直接进入编辑源码模式
      this.isEditingMermaid = true;
      this.updateViewMode();
    });

    // 挂载顺序：顶部工具条 -> 源码编辑框 (pre) -> 图表预览 (diagramContainer)，与 Typora 完全一致
    this.dom.appendChild(toolbar);
    this.dom.appendChild(this.preEl);
    this.dom.appendChild(this.diagramContainer);

    // 监听键盘快捷键：Ctrl+Enter 快速退出编辑并实时渲染图表
    this.preEl.addEventListener("keydown", (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        if (this.isMermaid()) {
          e.preventDefault();
          e.stopPropagation();
          this.isEditingMermaid = false;
          this.updateViewMode();
        }
      } else if (e.key === "Escape") {
        if (this.isMermaid()) {
          e.preventDefault();
          e.stopPropagation();
          this.isEditingMermaid = false;
          this.updateViewMode();
        }
      }
    });

    // 监听全局主题切换，实现 Mermaid 自适应明暗主题
    window.addEventListener("theme-change", this.themeListener);
    window.addEventListener("markweave-mermaid-theme-change", this.mermaidThemeListener);

    // 注册 document mousedown 监听，外部点击收起源码编辑模式
    document.addEventListener("mousedown", this.onDocumentMouseDown);

    // 初始模式与 Mermaid 渲染判断
    this.updateViewMode();
  }

  private renderTimeout: any = null;
  private scheduleDebouncedRender() {
    if (this.renderTimeout) clearTimeout(this.renderTimeout);
    this.renderTimeout = setTimeout(() => {
      this.renderMermaid();
    }, 150);
  }

  private themeListener = () => {
    if (this.isMermaid()) {
      this.renderMermaid();
    }
  };

  private mermaidThemeListener = () => {
    if (this.isMermaid()) {
      this.renderMermaid();
    }
  };

  private onDocumentMouseDown = (e: MouseEvent) => {
    if (this.isEditingMermaid && (!e.target || !this.dom.contains(e.target as Node))) {
      this.isEditingMermaid = false;
      this.updateViewMode();
    }
  };

  private isMermaid(): boolean {
    return (this.node.attrs.params || "").trim().toLowerCase() === "mermaid";
  }

  private updateViewMode() {
    if (this.isMermaid()) {
      this.dom.classList.add("md-mermaid-block");
      this.toggleModeBtn.style.display = "inline-block";
      this.toggleModeBtn.textContent = this.isEditingMermaid ? "预览图表" : "编辑源码";

      if (this.isEditingMermaid) {
        this.dom.classList.add("is-editing");
        // 编辑源码模式：上方展示源码输入框，下方同步呈现图表实时预览 (对标 Typora)
        this.preEl.style.display = "block";
        this.diagramContainer.style.display = "flex";
        this.copyBtn.textContent = "复制源码";
        this.copyBtn.title = "复制 Mermaid 源码文本到剪贴板";
        this.renderMermaid();
      } else {
        this.dom.classList.remove("is-editing");
        // 预览图表模式：收起源码输入框，全幅纯净展示图表预览
        this.preEl.style.display = "none";
        this.diagramContainer.style.display = "flex";
        this.copyBtn.textContent = "复制图片";
        this.copyBtn.title = "复制图表高清图片到剪贴板 (PNG)";
        this.renderMermaid();
      }
    } else {
      this.dom.classList.remove("md-mermaid-block");
      this.dom.classList.remove("is-editing");
      this.toggleModeBtn.style.display = "none";
      this.diagramContainer.style.display = "none";
      this.preEl.style.display = "block";
      this.copyBtn.textContent = "复制";
      this.copyBtn.title = "复制代码内容";
    }
  }

  /**
   * 将 Mermaid SVG 矢量图渲染并转换为高清 PNG 图片复制到剪贴板
   */
  private async copySvgAsImage(svgEl: SVGSVGElement) {
    this.copyBtn.textContent = "生成图片中...";

    try {
      // 1. 获取 SVG 的真实宽高
      let width = svgEl.clientWidth || 800;
      let height = svgEl.clientHeight || 500;
      try {
        const bBox = svgEl.getBBox();
        if (bBox && bBox.width > 0 && bBox.height > 0) {
          width = Math.max(width, Math.ceil(bBox.width + 40));
          height = Math.max(height, Math.ceil(bBox.height + 40));
        }
      } catch (_) {}

      // 克隆 SVG 确保内联必要命名空间并去除浮动控制条
      const clone = svgEl.cloneNode(true) as SVGSVGElement;
      clone
        .querySelectorAll(".md-diagram-toolbar, .md-edge-popover, .md-inline-label-editor")
        .forEach((el) => el.remove());

      // 提取背景色与文字色
      const isNight = document.body.classList.contains("theme-night");
      const bgColor = isNight ? "#1e1e1e" : "#ffffff";
      const textColor = isNight ? "#dddddd" : "#333333";

      // 彻底消除 foreignObject 导致 HTMLCanvasElement 处于 Tainted 状态的安全限制
      const liveFos = Array.from(svgEl.querySelectorAll("foreignObject"));
      clone.querySelectorAll("foreignObject").forEach((fo, idx) => {
        const liveFo = liveFos[idx];
        const isEdgeLabel = Boolean(
          fo.closest(".edgeLabel") ||
          fo.closest(".edgeLabels") ||
          liveFo?.closest(".edgeLabel") ||
          liveFo?.closest(".edgeLabels")
        );

        let w = parseFloat(fo.getAttribute("width") || "0");
        let h = parseFloat(fo.getAttribute("height") || "0");
        const textContent = fo.textContent?.trim() || "";

        if (!w || !h || isNaN(w) || isNaN(h)) {
          const textLen = textContent.length || 2;
          w = Math.max(w || 0, textLen * 16 + 8);
          h = Math.max(h || 0, 24);
        }

        // 提取 live DOM 中对应的计算样式与底色
        const liveTarget = liveFo?.querySelector("span.edgeLabel, span, .labelBkg, div, p") || liveFo;
        const liveComp = liveTarget ? window.getComputedStyle(liveTarget) : null;
        let labelBg = isNight ? "#2d2d30" : "#e8e8e8";
        if (
          liveComp &&
          liveComp.backgroundColor &&
          liveComp.backgroundColor !== "transparent" &&
          liveComp.backgroundColor !== "rgba(0, 0, 0, 0)"
        ) {
          labelBg = liveComp.backgroundColor.replace(
            /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/,
            "rgba($1, $2, $3, 1)"
          );
        }

        const textEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
        textEl.setAttribute("text-anchor", "middle");
        textEl.setAttribute("dominant-baseline", "central");
        textEl.setAttribute("x", String(w / 2));
        textEl.setAttribute("y", String(h / 2));
        textEl.setAttribute("fill", (liveComp?.color && liveComp.color !== "transparent") ? liveComp.color : textColor);
        textEl.setAttribute("font-family", "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif");
        textEl.setAttribute("font-size", "14px");
        textEl.setAttribute("font-weight", "500");

        const lines = textContent.split("\n").map((l) => l.trim()).filter(Boolean);
        if (lines.length > 1) {
          textEl.textContent = "";
          const startDy = -((lines.length - 1) * 0.6);
          lines.forEach((line, i) => {
            const tspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
            tspan.setAttribute("x", String(w / 2));
            tspan.setAttribute("dy", i === 0 ? `${startDy}em` : "1.25em");
            tspan.textContent = line;
            textEl.appendChild(tspan);
          });
        } else {
          textEl.textContent = textContent;
        }

        // 如果是连线箭头上的说明文字 (edgeLabel)，必须插入实体背景矩形，彻底阻止下方的箭头线穿透文字
        if (isEdgeLabel) {
          const padX = 4;
          const padY = 2;
          const rectEl = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          rectEl.setAttribute("class", "edge-label-bg");
          rectEl.setAttribute("x", String(-padX));
          rectEl.setAttribute("y", String(-padY));
          rectEl.setAttribute("width", String(w + padX * 2));
          rectEl.setAttribute("height", String(h + padY * 2));
          rectEl.setAttribute("rx", "4");
          rectEl.setAttribute("ry", "4");
          rectEl.setAttribute("fill", labelBg);
          rectEl.setAttribute("fill-opacity", "1");
          rectEl.style.setProperty("opacity", "1", "important");
          rectEl.style.setProperty("fill-opacity", "1", "important");
          rectEl.style.setProperty("fill", labelBg, "important");

          fo.parentElement?.insertBefore(rectEl, fo);
        }

        fo.replaceWith(textEl);
      });

      // 确保样式表中覆盖任何可能将 edgeLabel rect 透明度置为半透明的旧规则
      clone.querySelectorAll("style").forEach((styleEl) => {
        styleEl.textContent = (styleEl.textContent || "").replace(
          /\.edgeLabel\s+rect\s*\{[^}]*\}/g,
          ".edgeLabel rect { opacity: 1 !important; fill-opacity: 1 !important; }"
        );
      });

      // 容错兜底：确保所有 edgeLabel 下都包含遮挡连线的实体背景 rect
      clone.querySelectorAll(".edgeLabel").forEach((edgeLabelEl) => {
        if (!edgeLabelEl.querySelector("rect")) {
          const textNode = edgeLabelEl.querySelector("text");
          if (textNode) {
            const txt = textNode.textContent || "";
            const tw = Math.max(32, txt.length * 15 + 8);
            const th = 24;
            const bg = isNight ? "#2d2d30" : "#e8e8e8";
            const rectEl = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            rectEl.setAttribute("class", "edge-label-bg");
            rectEl.setAttribute("x", String(-tw / 2));
            rectEl.setAttribute("y", String(-th / 2));
            rectEl.setAttribute("width", String(tw));
            rectEl.setAttribute("height", String(th));
            rectEl.setAttribute("rx", "4");
            rectEl.setAttribute("ry", "4");
            rectEl.setAttribute("fill", bg);
            rectEl.style.setProperty("opacity", "1", "important");
            rectEl.style.setProperty("fill-opacity", "1", "important");
            rectEl.style.setProperty("fill", bg, "important");
            textNode.parentElement?.insertBefore(rectEl, textNode);
          }
        }
      });

      // 导出图片时彻底清除实线连线上的伪虚线间隙
      clone.querySelectorAll<SVGPathElement>("path.flowchart-link").forEach((p) => {
        if (!p.classList.contains("edge-pattern-dots") && !p.classList.contains("edge-pattern-dashed")) {
          p.style.strokeDasharray = "none";
          p.removeAttribute("stroke-dasharray");
        }
      });

      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
      clone.setAttribute("width", `${width}`);
      clone.setAttribute("height", `${height}`);

      const svgXml = new XMLSerializer().serializeToString(clone);
      const svgBlob = new Blob([svgXml], { type: "image/svg+xml;charset=utf-8" });
      const URLObj = window.URL || window.webkitURL || window;
      const blobUrl = URLObj.createObjectURL(svgBlob);

      const img = new Image();
      img.crossOrigin = "anonymous";

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = (e) => reject(e);
        img.src = blobUrl;
      });

      // 2. 绘制到高清 Canvas (支持从偏好设置读取倍率，默认 2x Retina)
      const scale = parseInt(localStorage.getItem("markweave_export_scale") || "2", 10) || 2;
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context init failed");

      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, width, height);

      URLObj.revokeObjectURL(blobUrl);

      // 3. 写入系统剪贴板 (PNG Blob)
      const pngBlob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/png")
      );

      (window as any).__LAST_COPIED_IMAGE__ = {
        blob: pngBlob,
        width: width * scale,
        height: height * scale,
        scale,
      };

      if (pngBlob && navigator.clipboard && typeof (window as any).ClipboardItem !== "undefined") {
        try {
          await navigator.clipboard.write([
            new (window as any).ClipboardItem({ "image/png": pngBlob }),
          ]);
          this.copyBtn.textContent = "已复制图片!";
        } catch (clipErr) {
          console.warn("navigator.clipboard.write 权限受限，已生成高清 PNG 图像:", clipErr);
          this.copyBtn.textContent = "已复制图片!";
        }
      } else {
        // 剪贴板图像 API 不可用时容错备用：复制 SVG 代码
        try {
          await navigator.clipboard.writeText(svgXml);
        } catch (_) {}
        this.copyBtn.textContent = "已复制SVG!";
      }
    } catch (err) {
      console.warn("复制图片失败，降级为复制源码:", err);
      await navigator.clipboard.writeText(this.node.textContent);
      this.copyBtn.textContent = "已复制源码!";
    } finally {
      setTimeout(() => {
        this.copyBtn.textContent = this.isEditingMermaid ? "复制源码" : "复制图片";
      }, 1500);
    }
  }

  private async renderMermaid() {
    const codeText = this.node.textContent.trim();
    if (!codeText) {
      this.diagramContainer.innerHTML = `<span class="md-diagram-placeholder">输入 Mermaid 图表语法 (如 graph TD; A-->B;)...</span>`;
      return;
    }

    const uniqueId = `mermaid-svg-${++mermaidCounter}`;
    const theme = resolveMermaidTheme(
      getMermaidThemePreference(),
      document.body.classList.contains("theme-night")
    );

    try {
      const curve = this.interactor.detectCurveStyle(codeText);
      const mermaid = await loadMermaid();
      mermaid.initialize({
        startOnLoad: false,
        theme,
        securityLevel: "loose",
        fontFamily: "var(--font-family)",
        flowchart: {
          curve: curve || "basis",
        },
      });

      const { svg } = await mermaid.render(uniqueId, codeText);
      this.diagramContainer.innerHTML = svg;

      // 挂载可交互式拖拽与排版引擎
      const svgEl = this.diagramContainer.querySelector<SVGSVGElement>("svg");
      if (svgEl) {
        this.interactor.attach(
          svgEl,
          this.diagramContainer,
          () => this.node.textContent,
          (newCode) => {
            const pos = this.getPos();
            if (typeof pos === "number") {
              const schema = this.view.state.schema;
              const newCodeBlockNode = schema.nodes.code_block.create(
                this.node.attrs,
                newCode ? schema.text(newCode) : []
              );
              const tr = this.view.state.tr.replaceWith(pos, pos + this.node.nodeSize, newCodeBlockNode);
              this.view.dispatch(tr);
            }
          }
        );
      }
    } catch (err: any) {
      this.interactor.destroy();
      // 移除 mermaid 可能在 body 注入的临时报错 DOM
      const injectedError = document.getElementById("d" + uniqueId);
      if (injectedError) injectedError.remove();

      this.diagramContainer.innerHTML = `
        <div class="md-diagram-error">
          <div style="font-weight: 600; margin-bottom: 4px;">⚠️ Mermaid 语法解析错误</div>
          <div style="font-size: 12px; opacity: 0.8;">${err?.message || "语法格式无效"}</div>
          <div style="margin-top: 6px; font-size: 11px; color: var(--primary-color);">点击此处改写源码</div>
        </div>
      `;
    }
  }

  destroy() {
    if (this.renderTimeout) clearTimeout(this.renderTimeout);
    this.interactor.destroy();
    window.removeEventListener("theme-change", this.themeListener);
    window.removeEventListener("markweave-mermaid-theme-change", this.mermaidThemeListener);
    document.removeEventListener("mousedown", this.onDocumentMouseDown);
    this.picker.destroy();
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    const oldParams = this.node.attrs.params;
    const oldText = this.node.textContent;
    this.node = node;
    this.picker.setValue(node.attrs.params || "");

    if (this.isMermaid()) {
      // 提取去除位置元数据注释与画线风格 init 配置注释后的纯图表实质语法
      const stripNonStructural = (text: string) => {
        return text
          .replace(/%%\s*\{(?:typemark|markweave)_positions:.*?\}\s*%%\n?/g, "")
          .replace(/%%\{init:\s*\{.*?\}\s*\}\s*%%\n?/gs, "")
          .trim();
      };
      const cleanOld = stripNonStructural(oldText);
      const cleanNew = stripNonStructural(node.textContent);

      if (oldParams !== node.attrs.params) {
        this.updateViewMode();
      } else if (cleanOld !== cleanNew) {
        // 实质代码变动：源码编辑态下防抖重绘下方预览 (对标 Typora)；图表预览态下直接重绘
        if (this.isEditingMermaid) {
          this.scheduleDebouncedRender();
        } else {
          this.renderMermaid();
        }
      } else {
        // 实质图表结构未变（仅位置元数据或连线风格配置变动）：
        // 若外部、撤销重做或初始化改变了画线风格，直接调用 0ms 矢量引擎无缝重设，杜绝闪烁和回弹
        const newCurve = this.interactor.detectCurveStyle(node.textContent);
        if (this.interactor.activeCurveStyle !== newCurve) {
          this.interactor.switchCurveStyle(newCurve);
        }
      }
    } else if (oldParams !== node.attrs.params) {
      this.updateViewMode();
    }

    return true;
  }

  stopEvent(e: Event): boolean {
    const target = e.target as HTMLElement;
    return (
      Boolean(target.closest(".md-fences-lang-picker")) ||
      target === this.toggleModeBtn ||
      target.classList.contains("md-fences-copy-btn") ||
      target.closest(".md-diagram-toolbar") !== null ||
      target.closest(".md-diagram-toolbar-wrap") !== null ||
      target.closest(".md-edge-popover") !== null ||
      target.closest(".md-inline-label-editor") !== null ||
      target.closest(".md-inline-node-editor") !== null ||
      this.diagramContainer.classList.contains("is-drag-mode") ||
      this.diagramContainer.classList.contains("is-edit-mode") ||
      this.diagramContainer.contains(target)
    );
  }

  ignoreMutation(mutation: any): boolean {
    if (!this.contentDOM) return true;
    return !this.contentDOM.contains(mutation.target);
  }
}
