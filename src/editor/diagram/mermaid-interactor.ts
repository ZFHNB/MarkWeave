/**
 * MermaidInteractor - 可交互式 Mermaid 图表排版与可视化编辑引擎
 * 核心功能：
 * 1. 自由拖拽与格点吸附 (Snap to Grid, 20px 网格对齐，保持图形规整)
 * 2. 连线画线风格自定义 (主流风格：⌒ 圆角平滑 / ⌐ 直角折线 / ╱ 直线)
 * 3. 改变箭头指向 (➔ 正向 / ⬅ 反向 / ⮂ 双向 / — 无向)
 * 4. 修改箭头横线上的文字 (点击 edgeLabel 原地行内编辑并双向同步源码)
 * 5. 一键横纵排布切换 (TD ↕ ↔ LR) 与画布平移缩放 (Pan & Zoom)
 * 6. 纯文本坐标元数据持久化 (%% {typemark_positions: ...} %%) 与一键还原原生排版
 */

interface Point {
  x: number;
  y: number;
}

interface PathSegment {
  cmd: string;
  args: number[];
}

interface NodeTopology {
  key: string;
  el: SVGGElement;
  initialTransform: string;
  baseX: number;
  baseY: number;
  currentX: number;
  currentY: number;
  dx: number;
  dy: number;
  bbox: { x: number; y: number; width: number; height: number };
}

interface EdgeTopology {
  id: string;
  el: SVGPathElement;
  sourceKey: string;
  targetKey: string;
  initialD: string;
  segments: PathSegment[];
  labelText?: string;
  labelEl?: SVGGElement;
}

const GRID_SIZE = 20;

export class MermaidInteractor {
  private svg!: SVGSVGElement;
  private container!: HTMLElement;
  private onSourceChange!: (newCode: string) => void;
  private getCurrentCode!: () => string;

  private nodesMap: Map<string, NodeTopology> = new Map();
  private edgesList: EdgeTopology[] = [];
  public isEditMode: boolean = false; // 原 isDragMode 更名为 isEditMode
  private activeCurveStyle: "basis" | "stepBefore" | "linear" | null = null;
  private isDraggingNode: boolean = false;
  private activeNodeKey: string | null = null;
  private dragStartPointer: Point = { x: 0, y: 0 };
  private nodeOriginBeforeDrag: Point = { x: 0, y: 0 };

  // 画布平移与缩放 (Pan & Zoom)
  private currentZoom: number = 1.0;
  private isPanning: boolean = false;
  private panStartPointer: Point = { x: 0, y: 0 };
  private viewBoxOrigin: { x: number; y: number; w: number; h: number } = { x: 0, y: 0, w: 0, h: 0 };
  private initialViewBox: { x: number; y: number; w: number; h: number } = { x: 0, y: 0, w: 0, h: 0 };

  // 浮动控制栏 DOM 与浮层
  private toolbarEl: HTMLElement | null = null;
  private editModeBtn!: HTMLButtonElement;
  private zoomDisplay!: HTMLSpanElement;
  private popoverEl: HTMLElement | null = null;
  private activeInlineInput: HTMLElement | null = null;

  private cleanupFns: Array<() => void> = [];

  constructor() {}

  /**
   * 挂载至已渲染的 Mermaid SVG
   */
  public attach(
    svg: SVGSVGElement,
    container: HTMLElement,
    getCurrentCode: () => string,
    onSourceChange: (newCode: string) => void
  ) {
    const prevEditMode = this.isEditMode;
    const prevZoom = this.currentZoom;

    this.cleanupListeners(); // 只清理事件与旧 DOM，保留用户的模式意图

    this.svg = svg;
    this.container = container;
    this.getCurrentCode = getCurrentCode;
    this.onSourceChange = onSourceChange;

    this.initViewBox();
    this.buildTopology();
    this.createToolbar();
    this.bindEvents();
    this.applySavedPositions();

    // 状态保持：如果先前开启了编辑模式或调整了缩放，持续保持！
    if (prevEditMode) {
      this.toggleEditMode(true);
    }
    if (prevZoom !== 1.0) {
      this.currentZoom = prevZoom;
      this.updateSvgViewBox();
    }
  }

  /**
   * 初始化并记忆 SVG 原始 viewBox
   */
  private initViewBox() {
    const rawVb = this.svg.getAttribute("viewBox");
    if (rawVb) {
      const parts = rawVb.split(/[\s,]+/).map(Number);
      if (parts.length === 4 && !parts.some(isNaN)) {
        this.initialViewBox = { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
        this.viewBoxOrigin = { ...this.initialViewBox };
        return;
      }
    }
    const b = this.svg.getBBox();
    this.initialViewBox = { x: b.x, y: b.y, w: b.width || 600, h: b.height || 400 };
    this.viewBoxOrigin = { ...this.initialViewBox };
    this.svg.setAttribute(
      "viewBox",
      `${this.initialViewBox.x} ${this.initialViewBox.y} ${this.initialViewBox.w} ${this.initialViewBox.h}`
    );
  }

  /**
   * 解析节点与连线拓扑关系 (含 edgeLabel)
   */
  private buildTopology() {
    this.nodesMap.clear();
    this.edgesList = [];

    // 1. 扫描所有 .node 元素
    const nodeEls = this.svg.querySelectorAll<SVGGElement>(".node");
    nodeEls.forEach((el) => {
      const id = el.id || "";
      let key = "";
      const match = /-flowchart-([^-]+)-\d+$/.exec(id) || /-([^-]+)$/.exec(id);
      if (match) {
        key = match[1];
      } else {
        key = id || Math.random().toString(36).slice(2, 7);
      }

      const transform = el.getAttribute("transform") || "";
      const translateMatch = /translate\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/.exec(transform);
      const baseX = translateMatch ? parseFloat(translateMatch[1]) : 0;
      const baseY = translateMatch ? parseFloat(translateMatch[2]) : 0;

      let bbox = { x: -40, y: -20, width: 80, height: 40 };
      try {
        const b = el.getBBox();
        if (b && (b.width > 0 || b.height > 0)) {
          bbox = { x: b.x, y: b.y, width: b.width, height: b.height };
        }
      } catch (_) {}

      this.nodesMap.set(key, {
        key,
        el,
        initialTransform: transform,
        baseX,
        baseY,
        currentX: baseX,
        currentY: baseY,
        dx: 0,
        dy: 0,
        bbox,
      });
    });

    // 2. 扫描所有连线 path 与其精确对应的 edgeLabel (彻底修复标签错绑与漂移)
    const linkPaths = Array.from(
      this.svg.querySelectorAll<SVGPathElement>(".flowchart-link, .edgePaths path, path[id*='-L_']")
    );
    const allLabelGroups = Array.from(this.svg.querySelectorAll<SVGGElement>(".edgeLabels > g.edgeLabel"));

    linkPaths.forEach((pathEl) => {
      const id = pathEl.id || pathEl.parentElement?.id || "";
      const match = /L_([^_]+)_([^_]+)(?:_(\d+))?$/.exec(id);
      if (match) {
        const sourceKey = match[1];
        const targetKey = match[2];
        const edgeSubId = match[0];
        const initialD = pathEl.getAttribute("d") || "";
        const segments = this.parsePathD(initialD);

        // 关键修复：精确通过 data-id 匹配该线条的说明标签，彻底消除基于数组索引导致的错绑
        const correspondingLabel = allLabelGroups.find((g) => {
          const dataId = g.querySelector("[data-id]")?.getAttribute("data-id") || g.getAttribute("data-id") || "";
          return dataId === edgeSubId || dataId.startsWith(`L_${sourceKey}_${targetKey}`);
        });

        const labelText = correspondingLabel?.textContent?.trim() || "";

        this.edgesList.push({
          id,
          el: pathEl,
          sourceKey,
          targetKey,
          initialD,
          segments,
          labelText,
          labelEl: correspondingLabel,
        });
      }
    });
  }

  private parsePathD(d: string): PathSegment[] {
    const segments: PathSegment[] = [];
    const regex = /([MLHVCSQTAZ])([^MLHVCSQTAZ]*)/gi;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(d)) !== null) {
      const cmd = match[1];
      const numbers = match[2]
        .trim()
        .split(/[\s,]+/)
        .filter((s) => s.length > 0)
        .map(Number);
      segments.push({ cmd, args: numbers });
    }
    return segments;
  }

  /**
   * 创建并挂载顶部精致交互工具条
   */
  private createToolbar() {
    this.toolbarEl?.remove();

    const bar = document.createElement("div");
    bar.className = "md-diagram-toolbar";

    // 1. 方向切换按钮组 (TD, LR)
    const dirGroup = document.createElement("div");
    dirGroup.className = "md-diagram-btn-group";

    const currentDir = this.detectDirection();

    const btnTD = document.createElement("button");
    btnTD.className = `md-diagram-btn ${currentDir === "TD" ? "active" : ""}`;
    btnTD.innerHTML = `↕ 纵向`;
    btnTD.title = "切换为纵向排布 (TD)";
    btnTD.addEventListener("click", (e) => {
      e.stopPropagation();
      this.switchDirection("TD");
    });

    const btnLR = document.createElement("button");
    btnLR.className = `md-diagram-btn ${currentDir === "LR" ? "active" : ""}`;
    btnLR.innerHTML = `↔ 横向`;
    btnLR.title = "切换为横向排布 (LR，减少垂直占用)";
    btnLR.addEventListener("click", (e) => {
      e.stopPropagation();
      this.switchDirection("LR");
    });

    dirGroup.appendChild(btnTD);
    dirGroup.appendChild(btnLR);

    // 2. 线型风格切换按钮组 (圆角弧线 / 直角折线 / 直线)
    const curveGroup = document.createElement("div");
    curveGroup.className = "md-diagram-btn-group";

    const currentCurve = this.detectCurveStyle();

    const btnBasis = document.createElement("button");
    btnBasis.className = `md-diagram-btn ${currentCurve === "basis" ? "active" : ""}`;
    btnBasis.innerHTML = `⌒ 圆角`;
    btnBasis.title = "连线风格：拐弯处平滑圆角 (Basis/Cardinal)";
    btnBasis.addEventListener("click", (e) => {
      e.stopPropagation();
      this.switchCurveStyle("basis");
    });

    const btnStep = document.createElement("button");
    btnStep.className = `md-diagram-btn ${currentCurve === "stepBefore" ? "active" : ""}`;
    btnStep.innerHTML = `⌐ 直角`;
    btnStep.title = "连线风格：全直角折线 (Step，工整正交排布)";
    btnStep.addEventListener("click", (e) => {
      e.stopPropagation();
      this.switchCurveStyle("stepBefore");
    });

    const btnLinear = document.createElement("button");
    btnLinear.className = `md-diagram-btn ${currentCurve === "linear" ? "active" : ""}`;
    btnLinear.innerHTML = `╱ 直线`;
    btnLinear.title = "连线风格：端点直接直线直连 (Linear)";
    btnLinear.addEventListener("click", (e) => {
      e.stopPropagation();
      this.switchCurveStyle("linear");
    });

    curveGroup.appendChild(btnBasis);
    curveGroup.appendChild(btnStep);
    curveGroup.appendChild(btnLinear);

    // 3. 图表编辑切换按钮 (原“自由拖拽”)
    this.editModeBtn = document.createElement("button");
    this.editModeBtn.className = "md-diagram-btn md-diagram-drag-btn";
    this.editModeBtn.innerHTML = `🎨 图表编辑`;
    this.editModeBtn.title = "开启/退出可视化编辑模式（拖拽排版、修改连线文字、反转箭头、格点吸附）";
    this.editModeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleEditMode();
    });

    // 4. 还原原生排版按钮
    const resetBtn = document.createElement("button");
    resetBtn.className = "md-diagram-btn";
    resetBtn.innerHTML = `↺ 还原`;
    resetBtn.title = "清除自定义位置微调，还原原生算法排布";
    resetBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.resetLayout();
    });

    // 5. 缩放控制组
    const zoomGroup = document.createElement("div");
    zoomGroup.className = "md-diagram-btn-group";

    const zoomOutBtn = document.createElement("button");
    zoomOutBtn.className = "md-diagram-btn";
    zoomOutBtn.textContent = "-";
    zoomOutBtn.title = "缩小画布";
    zoomOutBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.zoom(0.85);
    });

    this.zoomDisplay = document.createElement("span");
    this.zoomDisplay.className = "md-diagram-zoom-label";
    this.zoomDisplay.textContent = "100%";
    this.zoomDisplay.title = "双击重置缩放";
    this.zoomDisplay.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      this.resetZoom();
    });

    const zoomInBtn = document.createElement("button");
    zoomInBtn.className = "md-diagram-btn";
    zoomInBtn.textContent = "+";
    zoomInBtn.title = "放大画布";
    zoomInBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.zoom(1.15);
    });

    zoomGroup.appendChild(zoomOutBtn);
    zoomGroup.appendChild(this.zoomDisplay);
    zoomGroup.appendChild(zoomInBtn);

    bar.appendChild(dirGroup);
    bar.appendChild(curveGroup);
    bar.appendChild(this.editModeBtn);
    bar.appendChild(resetBtn);
    bar.appendChild(zoomGroup);

    this.container.appendChild(bar);
    this.toolbarEl = bar;
  }

  /**
   * 侦测当前代码中的方向
   */
  private detectDirection(explicitCode?: string): "TD" | "LR" | "RL" | "BT" {
    const code = explicitCode || (typeof this.getCurrentCode === "function" ? this.getCurrentCode() : "");
    if (!code) return "TD";
    const match = /(?:graph|flowchart)\s+(TD|TB|LR|RL|BT)/i.exec(code);
    if (match) {
      const d = match[1].toUpperCase();
      return d === "TB" ? "TD" : (d as any);
    }
    return "TD";
  }

  /**
   * 侦测当前代码中的画线风格
   */
  public detectCurveStyle(explicitCode?: string): "basis" | "stepBefore" | "linear" {
    if (this.activeCurveStyle) return this.activeCurveStyle;
    const code = explicitCode || (typeof this.getCurrentCode === "function" ? this.getCurrentCode() : "");
    if (!code) return "basis";
    const match = /"curve":\s*"(basis|stepBefore|stepAfter|linear|cardinal)"/i.exec(code);
    if (match) {
      const c = match[1];
      if (c === "stepBefore" || c === "stepAfter") return "stepBefore";
      if (c === "linear") return "linear";
      return "basis";
    }
    return "basis"; // Mermaid 默认平滑
  }

  /**
   * 切换排布方向并写入代码 (自动清除旧方向下的绝对坐标，使新方向整齐排布)
   */
  public switchDirection(newDir: "TD" | "LR" | "RL" | "BT") {
    let code = this.getCurrentCode();

    // 关键优化：切换方向时清除旧方向下的自定义坐标，避免旧坐标与新排布方向产生冲突与连线畸变
    code = code.replace(/%%\s*\{typemark_positions:.*?\}\s*%%\n?/g, "").trim();

    const dirRegex = /^(\s*(?:flowchart|graph))\s+(TD|TB|LR|RL|BT)(.*)$/im;

    let updatedCode = "";
    if (dirRegex.test(code)) {
      updatedCode = code.replace(dirRegex, `$1 ${newDir}$3`);
    } else {
      const headerRegex = /^(\s*(?:flowchart|graph))(.*)$/im;
      if (headerRegex.test(code)) {
        updatedCode = code.replace(headerRegex, `$1 ${newDir}$2`);
      } else {
        updatedCode = `flowchart ${newDir}\n` + code;
      }
    }

    if (updatedCode !== this.getCurrentCode()) {
      this.onSourceChange(updatedCode);
    }
  }

  /**
   * 切换连线画线风格 (直角 / 圆角 / 直线) - 0ms 实时响应
   */
  public switchCurveStyle(curve: "basis" | "stepBefore" | "linear") {
    this.activeCurveStyle = curve;

    // 1. 立即更新浮动控制栏按钮状态
    const curveBtns = this.toolbarEl?.querySelectorAll(".md-diagram-btn-group:nth-child(2) .md-diagram-btn");
    curveBtns?.forEach((btn) => {
      const text = btn.textContent || "";
      if (
        (curve === "basis" && text.includes("圆角")) ||
        (curve === "stepBefore" && text.includes("直角")) ||
        (curve === "linear" && text.includes("直线"))
      ) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });

    // 2. 立即实时重绘当前图表为对应线形（解决点击后无法实时体现的问题）
    this.rerouteAllEdges(true);

    // 3. 将画线风格持久化到 Markdown 源码中
    let code = this.getCurrentCode();
    // 如果是 graph，规范化为 flowchart 以支持官方 curve
    code = code.replace(/^(\s*)graph\b/im, "$1flowchart");

    const initRegex = /%%\{init:\s*(\{.*?\})\}\s*%%/s;
    const match = initRegex.exec(code);

    let updatedCode = "";
    if (match) {
      try {
        const config = JSON.parse(match[1]);
        if (!config.flowchart) config.flowchart = {};
        config.flowchart.curve = curve;
        const newInit = `%%{init: ${JSON.stringify(config)}}%%`;
        updatedCode = code.replace(initRegex, newInit);
      } catch {
        const simpleInit = `%%{init: {"flowchart": {"curve": "${curve}"}}}%%`;
        updatedCode = code.replace(initRegex, simpleInit);
      }
    } else {
      const newInit = `%%{init: {"flowchart": {"curve": "${curve}"}}}%%\n`;
      // 插入到首行注释之后或代码开头
      if (code.startsWith("%% {typemark_positions")) {
        const firstLineEnd = code.indexOf("\n");
        updatedCode = code.slice(0, firstLineEnd + 1) + newInit + code.slice(firstLineEnd + 1);
      } else {
        updatedCode = newInit + code;
      }
    }

    if (updatedCode !== this.getCurrentCode()) {
      this.onSourceChange(updatedCode);
    }
  }

  /**
   * 开关可视化编辑模式
   */
  public toggleEditMode(forceState?: boolean) {
    this.isEditMode = typeof forceState === "boolean" ? forceState : !this.isEditMode;

    if (this.isEditMode) {
      this.container.classList.add("is-drag-mode");
      this.container.classList.add("is-edit-mode");
      this.editModeBtn.classList.add("active");
      this.editModeBtn.innerHTML = `🎨 退出编辑`;
      this.editModeBtn.title = "可视化编辑中（可连续拖动节点、点击文字改写、点击连线改方向）。点击退出并锁定";
    } else {
      this.container.classList.remove("is-drag-mode");
      this.container.classList.remove("is-edit-mode");
      this.editModeBtn.classList.remove("active");
      this.editModeBtn.innerHTML = `🎨 图表编辑`;
      this.editModeBtn.title = "开启可视化编辑模式（拖拽排版、修改连线文字、反转箭头、格点吸附）";
      this.closePopover();
      this.closeInlineInput();
    }
  }

  /**
   * 重置画布缩放与位置微调
   */
  public resetLayout() {
    this.activeCurveStyle = null;
    this.nodesMap.forEach((node) => {
      node.currentX = node.baseX;
      node.currentY = node.baseY;
      node.dx = 0;
      node.dy = 0;
      node.el.setAttribute("transform", node.initialTransform);
    });

    this.edgesList.forEach((edge) => {
      edge.el.setAttribute("d", edge.initialD);
      if (edge.labelEl) {
        const origTransform = edge.labelEl.getAttribute("data-orig-transform") || "";
        if (origTransform) {
          edge.labelEl.setAttribute("transform", origTransform);
        }
      }
    });

    const code = this.getCurrentCode();
    const cleanCode = code.replace(/%%\s*\{typemark_positions:.*?\}\s*%%\n?/g, "").trim();
    if (cleanCode !== code) {
      this.onSourceChange(cleanCode);
    }

    this.resetZoom();
  }

  public zoom(scaleFactor: number) {
    this.currentZoom = Math.min(Math.max(this.currentZoom * scaleFactor, 0.3), 3.0);
    this.updateSvgViewBox();
  }

  public resetZoom() {
    this.currentZoom = 1.0;
    this.viewBoxOrigin = { ...this.initialViewBox };
    this.updateSvgViewBox();
  }

  private updateSvgViewBox() {
    const newW = this.initialViewBox.w / this.currentZoom;
    const newH = this.initialViewBox.h / this.currentZoom;
    const deltaW = newW - this.viewBoxOrigin.w;
    const deltaH = newH - this.viewBoxOrigin.h;
    this.viewBoxOrigin.x -= deltaW / 2;
    this.viewBoxOrigin.y -= deltaH / 2;
    this.viewBoxOrigin.w = newW;
    this.viewBoxOrigin.h = newH;

    this.svg.setAttribute(
      "viewBox",
      `${this.viewBoxOrigin.x} ${this.viewBoxOrigin.y} ${this.viewBoxOrigin.w} ${this.viewBoxOrigin.h}`
    );
    this.zoomDisplay.textContent = `${Math.round(this.currentZoom * 100)}%`;
  }

  /**
   * 绑定 Pointer / Click / Wheel 事件
   */
  private bindEvents() {
    // 1. 节点拖拽事件绑定 (含格点吸附)
    this.nodesMap.forEach((node) => {
      const onPointerDown = (e: PointerEvent) => {
        if (!this.isEditMode) return;
        e.stopPropagation();
        e.preventDefault();
        this.closePopover();
        this.closeInlineInput();

        this.isDraggingNode = true;
        this.activeNodeKey = node.key;
        this.dragStartPointer = this.getSvgPoint(e);
        this.nodeOriginBeforeDrag = { x: node.currentX, y: node.currentY };
        node.el.classList.add("is-dragging");
        this.svg.setPointerCapture(e.pointerId);
      };

      node.el.addEventListener("pointerdown", onPointerDown);
      this.cleanupFns.push(() => node.el.removeEventListener("pointerdown", onPointerDown));
    });

    // 2. 连线点击事件 (改变箭头方向)
    this.edgesList.forEach((edge) => {
      const onEdgeClick = (e: MouseEvent) => {
        if (!this.isEditMode) return;
        e.stopPropagation();
        e.preventDefault();
        this.openEdgeDirectionPopover(edge, e);
      };

      edge.el.style.cursor = "pointer";
      edge.el.addEventListener("click", onEdgeClick);
      this.cleanupFns.push(() => edge.el.removeEventListener("click", onEdgeClick));

      // 3. 连线文字点击行内修改 (修改箭头横线上的文字)
      if (edge.labelEl) {
        const onLabelClick = (e: MouseEvent) => {
          if (!this.isEditMode) return;
          e.stopPropagation();
          e.preventDefault();
          this.openInlineLabelEditor(edge, e);
        };
        const targets = [edge.labelEl, ...Array.from(edge.labelEl.querySelectorAll("*"))];
        targets.forEach((target) => {
          (target as HTMLElement).style.cursor = "text";
          target.setAttribute("title", "点击修改此连线上的说明文字");
          target.addEventListener("click", onLabelClick as any);
          this.cleanupFns.push(() => target.removeEventListener("click", onLabelClick as any));
        });
      }
    });

    // 4. 全局指针移动与释放 (带 GRID_SIZE 格点吸附计算)
    const onPointerMove = (e: PointerEvent) => {
      if (this.isDraggingNode && this.activeNodeKey) {
        e.preventDefault();
        const currentPt = this.getSvgPoint(e);
        const deltaX = currentPt.x - this.dragStartPointer.x;
        const deltaY = currentPt.y - this.dragStartPointer.y;

        const node = this.nodesMap.get(this.activeNodeKey);
        if (node) {
          // 格点吸附 (Snap to Grid)
          const rawTargetX = this.nodeOriginBeforeDrag.x + deltaX;
          const rawTargetY = this.nodeOriginBeforeDrag.y + deltaY;
          node.currentX = Math.round(rawTargetX / GRID_SIZE) * GRID_SIZE;
          node.currentY = Math.round(rawTargetY / GRID_SIZE) * GRID_SIZE;
          node.dx = node.currentX - node.baseX;
          node.dy = node.currentY - node.baseY;

          node.el.setAttribute("transform", `translate(${node.currentX}, ${node.currentY})`);
          this.rerouteEdgesForNode(node);
        }
        return;
      }

      if (this.isPanning) {
        e.preventDefault();
        const dx = (e.clientX - this.panStartPointer.x) / this.currentZoom;
        const dy = (e.clientY - this.panStartPointer.y) / this.currentZoom;
        this.viewBoxOrigin.x -= dx;
        this.viewBoxOrigin.y -= dy;
        this.panStartPointer = { x: e.clientX, y: e.clientY };
        this.svg.setAttribute(
          "viewBox",
          `${this.viewBoxOrigin.x} ${this.viewBoxOrigin.y} ${this.viewBoxOrigin.w} ${this.viewBoxOrigin.h}`
        );
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (this.isDraggingNode) {
        this.isDraggingNode = false;
        if (this.activeNodeKey) {
          const node = this.nodesMap.get(this.activeNodeKey);
          node?.el.classList.remove("is-dragging");
          this.activeNodeKey = null;
        }
        if (this.svg.hasPointerCapture(e.pointerId)) {
          this.svg.releasePointerCapture(e.pointerId);
        }
        this.savePositionsToSource();
      }

      if (this.isPanning) {
        this.isPanning = false;
        this.svg.style.cursor = "";
      }
    };

    const onSvgPointerDown = (e: PointerEvent) => {
      const target = e.target as SVGElement;
      if (target === this.svg || target.tagName === "svg" || target.classList.contains("background")) {
        this.closePopover();
        this.closeInlineInput();
        this.isPanning = true;
        this.panStartPointer = { x: e.clientX, y: e.clientY };
        this.svg.style.cursor = "grabbing";
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey || this.isEditMode) {
        e.preventDefault();
        const zoomDelta = e.deltaY < 0 ? 1.08 : 0.92;
        this.zoom(zoomDelta);
      }
    };

    this.svg.addEventListener("pointerdown", onSvgPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    this.container.addEventListener("wheel", onWheel, { passive: false });

    this.cleanupFns.push(() => {
      this.svg.removeEventListener("pointerdown", onSvgPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      this.container.removeEventListener("wheel", onWheel);
    });
  }

  /**
   * 打开改变箭头方向浮动小菜单
   */
  private openEdgeDirectionPopover(edge: EdgeTopology, e: MouseEvent) {
    this.closePopover();
    this.closeInlineInput();

    const rect = this.container.getBoundingClientRect();
    const popover = document.createElement("div");
    popover.className = "md-edge-popover";
    let left = e.clientX ? e.clientX - rect.left : 0;
    let top = e.clientY ? e.clientY - rect.top - 36 : 0;
    if ((!e.clientX && !e.clientY) || left <= 0 || top <= 0) {
      const box = edge.el.getBoundingClientRect();
      left = box.left + box.width / 2 - rect.left;
      top = box.top + box.height / 2 - rect.top - 36;
    }
    popover.style.left = `${Math.max(10, left)}px`;
    popover.style.top = `${Math.max(10, top)}px`;

    const options: Array<{ label: string; icon: string; style: "forward" | "backward" | "bi" | "none" }> = [
      { label: "正向", icon: "➔", style: "forward" },
      { label: "反向", icon: "⬅", style: "backward" },
      { label: "双向", icon: "⮂", style: "bi" },
      { label: "无箭头", icon: "—", style: "none" },
    ];

    options.forEach((opt) => {
      const btn = document.createElement("button");
      btn.className = "md-edge-popover-btn";
      btn.innerHTML = `${opt.icon} ${opt.label}`;
      btn.addEventListener("click", (evt) => {
        evt.stopPropagation();
        this.changeArrowDirection(edge, opt.style);
        this.closePopover();
      });
      popover.appendChild(btn);
    });

    this.container.appendChild(popover);
    this.popoverEl = popover;
  }

  private closePopover() {
    if (this.popoverEl) {
      if (this.popoverEl.parentNode) {
        this.popoverEl.remove();
      }
      this.popoverEl = null;
    }
  }

  /**
   * 在源码中查找并替换特定两个节点间的连线定义
   */
  private replaceEdgeInSource(
    src: string,
    tgt: string,
    replacer: (prefix: string, srcNodeText: string, arrow: string, label: string, tgtNodeText: string) => string
  ): boolean {
    const code = this.getCurrentCode();
    // 匹配如 [xxx], (xxx), {xxx}, >xxx] 等节点形状及文本
    const shape = `(?:\\s*(?:\\[(?:[^\\]]|\\"[^\"]*\\")*\\]|\\((?:[^\\)]|\\\"[^\\\"]*\\\")*\\)|\\{(?:[^\\}]|\\\"[^\\\"]*\\\")*\\}|>(?:[^\\]]|\\\"[^\\\"]*\\\")*\\]))*`;
    const arrow = `(<-->|-->|<--|---|==>|===|-\\.-|--->)`;

    // 1. 正向匹配: src -> tgt
    const fwdPattern = new RegExp(
      `((?:^|[\\n;])\\s*)(\\b${src}\\b${shape}\\s*)${arrow}(?:\\s*\\|([^|\\n]*)\\|)?(\\s*\\b${tgt}\\b${shape})`,
      "m"
    );
    const fwdMatch = fwdPattern.exec(code);
    if (fwdMatch) {
      const prefix = fwdMatch[1];
      const srcNodeText = fwdMatch[2];
      const arrowSym = fwdMatch[3];
      const labelText = fwdMatch[4] || "";
      const tgtNodeText = fwdMatch[5];
      const newPart = replacer(prefix, srcNodeText, arrowSym, labelText, tgtNodeText);
      const updatedCode = code.replace(fwdPattern, newPart);
      if (updatedCode !== code) {
        this.onSourceChange(updatedCode);
        return true;
      }
    }

    // 2. 逆向匹配: tgt -> src
    const revPattern = new RegExp(
      `((?:^|[\\n;])\\s*)(\\b${tgt}\\b${shape}\\s*)${arrow}(?:\\s*\\|([^|\\n]*)\\|)?(\\s*\\b${src}\\b${shape})`,
      "m"
    );
    const revMatch = revPattern.exec(code);
    if (revMatch) {
      const prefix = revMatch[1];
      const tgtNodeText = revMatch[2];
      const arrowSym = revMatch[3];
      const labelText = revMatch[4] || "";
      const srcNodeText = revMatch[5];
      const newPart = replacer(prefix, tgtNodeText, arrowSym, labelText, srcNodeText);
      const updatedCode = code.replace(revPattern, newPart);
      if (updatedCode !== code) {
        this.onSourceChange(updatedCode);
        return true;
      }
    }

    return false;
  }

  /**
   * 改变箭头指向并在源码中更新
   */
  public changeArrowDirection(edge: EdgeTopology, style: "forward" | "backward" | "bi" | "none") {
    let arrowSym = "-->";
    if (style === "backward") arrowSym = "<--";
    else if (style === "bi") arrowSym = "<-->";
    else if (style === "none") arrowSym = "---";

    this.replaceEdgeInSource(edge.sourceKey, edge.targetKey, (prefix, firstNode, _oldArrow, label, secondNode) => {
      const labelPart = label ? `|${label}|` : "";
      return `${prefix}${firstNode}${arrowSym}${labelPart ? labelPart + " " : ""}${secondNode.trimStart()}`;
    });
  }

  /**
   * 打开连线文字原地行内编辑框 (修改箭头横线上的文字)
   */
  private openInlineLabelEditor(edge: EdgeTopology, e: MouseEvent) {
    this.closeInlineInput();
    this.closePopover();

    const rect = this.container.getBoundingClientRect();
    const wrapper = document.createElement("div");
    wrapper.className = "md-inline-label-editor";

    let left = e.clientX ? e.clientX - rect.left - 50 : 0;
    let top = e.clientY ? e.clientY - rect.top - 16 : 0;

    if ((!e.clientX && !e.clientY) || left <= 0 || top <= 0) {
      if (edge.labelEl) {
        const lBox = edge.labelEl.getBoundingClientRect();
        left = lBox.left - rect.left;
        top = lBox.top - rect.top;
      } else {
        const pBox = edge.el.getBoundingClientRect();
        left = pBox.left + pBox.width / 2 - rect.left - 50;
        top = pBox.top + pBox.height / 2 - rect.top - 16;
      }
    }

    wrapper.style.left = `${Math.max(10, left)}px`;
    wrapper.style.top = `${Math.max(10, top)}px`;

    const input = document.createElement("input");
    input.type = "text";
    input.className = "md-inline-label-input";
    input.value = edge.labelText || "";
    input.placeholder = "连线说明文字...";

    let isSaving = false;
    const save = () => {
      if (isSaving) return;
      isSaving = true;
      const newText = input.value.trim();
      this.closeInlineInput();
      this.updateEdgeLabelInSource(edge, newText);
    };

    input.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter") {
        evt.preventDefault();
        save();
      } else if (evt.key === "Escape") {
        this.closeInlineInput();
      }
    });

    input.addEventListener("blur", save);

    wrapper.appendChild(input);
    this.container.appendChild(wrapper);
    this.activeInlineInput = wrapper;
    setTimeout(() => {
      input.focus();
      input.select();
    }, 50);
  }

  private closeInlineInput() {
    if (this.activeInlineInput) {
      if (this.activeInlineInput.parentNode) {
        this.activeInlineInput.remove();
      }
      this.activeInlineInput = null;
    }
  }

  /**
   * 更新连线横线文字并同步回源码
   */
  public updateEdgeLabelInSource(edge: EdgeTopology, newText: string) {
    this.replaceEdgeInSource(edge.sourceKey, edge.targetKey, (prefix, firstNode, arrow, _oldLabel, secondNode) => {
      const labelPart = newText ? `|${newText}|` : "";
      return `${prefix}${firstNode}${arrow}${labelPart ? labelPart + " " : ""}${secondNode.trimStart()}`;
    });
  }

  private getSvgPoint(e: PointerEvent): Point {
    const pt = this.svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = this.svg.getScreenCTM();
    if (ctm) {
      const transformed = pt.matrixTransform(ctm.inverse());
      return { x: transformed.x, y: transformed.y };
    }
    return { x: e.clientX, y: e.clientY };
  }

  /**
   * 智能正交航线与交叠规避计算引擎
   * - 保证全直角折线（90度）几何纯净度，杜绝斜向折角
   * - 端口分流与车道偏移，防止同源线条粘连交叠
   * - 连线说明标签始终精确定位在线段几何中点
   */
  private calculateEdgeRoute(
    edge: EdgeTopology,
    edgeIndex: number
  ): { pathD: string; labelPos: Point } {
    const srcNode = this.nodesMap.get(edge.sourceKey);
    const tgtNode = this.nodesMap.get(edge.targetKey);
    if (!srcNode || !tgtNode) {
      return { pathD: edge.initialD, labelPos: { x: 0, y: 0 } };
    }

    const currentDir = this.detectDirection();
    const isVertical = currentDir === "TD" || currentDir === "BT";
    const curveStyle = this.detectCurveStyle();

    // 计算源节点与目标节点的实时边界框与中心
    const sBox = {
      left: srcNode.currentX + srcNode.bbox.x,
      top: srcNode.currentY + srcNode.bbox.y,
      right: srcNode.currentX + srcNode.bbox.x + srcNode.bbox.width,
      bottom: srcNode.currentY + srcNode.bbox.y + srcNode.bbox.height,
      cx: srcNode.currentX + srcNode.bbox.x + srcNode.bbox.width / 2,
      cy: srcNode.currentY + srcNode.bbox.y + srcNode.bbox.height / 2,
    };

    const tBox = {
      left: tgtNode.currentX + tgtNode.bbox.x,
      top: tgtNode.currentY + tgtNode.bbox.y,
      right: tgtNode.currentX + tgtNode.bbox.x + tgtNode.bbox.width,
      bottom: tgtNode.currentY + tgtNode.bbox.y + tgtNode.bbox.height,
      cx: tgtNode.currentX + tgtNode.bbox.x + tgtNode.bbox.width / 2,
      cy: tgtNode.currentY + tgtNode.bbox.y + tgtNode.bbox.height / 2,
    };

    // 统计同源/同目标的端口偏移，防止线条在端点粘连交叠 (Issue 4)
    const sameSrcEdges = this.edgesList.filter((e) => e.sourceKey === edge.sourceKey);
    const sameTgtEdges = this.edgesList.filter((e) => e.targetKey === edge.targetKey);
    const srcIdx = sameSrcEdges.indexOf(edge);
    const tgtIdx = sameTgtEdges.indexOf(edge);

    const portSpacing = 16;
    const srcPortOffset = (srcIdx - (sameSrcEdges.length - 1) / 2) * portSpacing;
    const tgtPortOffset = (tgtIdx - (sameTgtEdges.length - 1) / 2) * portSpacing;

    // 避免中间主干交叠的多车道分流偏移 (Lane offset)
    const laneOffset = ((edgeIndex % 5) - 2) * 12;

    let start: Point;
    let end: Point;
    let exitDir: "down" | "up" | "right" | "left";

    const dx = tBox.cx - sBox.cx;
    const dy = tBox.cy - sBox.cy;

    if (isVertical || Math.abs(dy) >= Math.abs(dx) * 0.7) {
      if (dy >= 0) {
        start = { x: sBox.cx + srcPortOffset, y: sBox.bottom };
        end = { x: tBox.cx + tgtPortOffset, y: tBox.top };
        exitDir = "down";
      } else {
        start = { x: sBox.cx + srcPortOffset, y: sBox.top };
        end = { x: tBox.cx + tgtPortOffset, y: tBox.bottom };
        exitDir = "up";
      }
    } else {
      if (dx >= 0) {
        start = { x: sBox.right, y: sBox.cy + srcPortOffset };
        end = { x: tBox.left, y: tBox.cy + tgtPortOffset };
        exitDir = "right";
      } else {
        start = { x: sBox.left, y: sBox.cy + srcPortOffset };
        end = { x: tBox.right, y: tBox.cy + tgtPortOffset };
        exitDir = "left";
      }
    }

    let pathD = "";
    let labelPos: Point = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };

    if (curveStyle === "linear") {
      // 1. 直线风格 (Linear)
      pathD = `M${Math.round(start.x)},${Math.round(start.y)}L${Math.round(end.x)},${Math.round(end.y)}`;
      labelPos = { x: Math.round((start.x + end.x) / 2), y: Math.round((start.y + end.y) / 2) };
    } else if (curveStyle === "stepBefore") {
      // 2. 全直角折线风格 (Orthogonal Manhattan Routing) - 严谨保持 90 度工整折角
      if (exitDir === "down" || exitDir === "up") {
        const yMid = Math.round((start.y + end.y) / 2 + laneOffset);
        const sx = Math.round(start.x);
        const sy = Math.round(start.y);
        const ex = Math.round(end.x);
        const ey = Math.round(end.y);
        pathD = `M${sx},${sy}L${sx},${yMid}L${ex},${yMid}L${ex},${ey}`;
        labelPos = { x: Math.round((sx + ex) / 2), y: yMid };
      } else {
        const xMid = Math.round((start.x + end.x) / 2 + laneOffset);
        const sx = Math.round(start.x);
        const sy = Math.round(start.y);
        const ex = Math.round(end.x);
        const ey = Math.round(end.y);
        pathD = `M${sx},${sy}L${xMid},${sy}L${xMid},${ey}L${ex},${ey}`;
        labelPos = { x: xMid, y: Math.round((sy + ey) / 2) };
      }
    } else {
      // 3. 圆角弧线风格 (Smooth Bezier)
      const sx = Math.round(start.x);
      const sy = Math.round(start.y);
      const ex = Math.round(end.x);
      const ey = Math.round(end.y);
      if (exitDir === "down" || exitDir === "up") {
        const yMid = Math.round((sy + ey) / 2 + laneOffset);
        pathD = `M${sx},${sy}C${sx},${yMid} ${ex},${yMid} ${ex},${ey}`;
        labelPos = { x: Math.round((sx + ex) / 2), y: yMid };
      } else {
        const xMid = Math.round((sx + ex) / 2 + laneOffset);
        pathD = `M${sx},${sy}C${xMid},${sy} ${xMid},${ey} ${ex},${ey}`;
        labelPos = { x: xMid, y: Math.round((sy + ey) / 2) };
      }
    }

    return { pathD, labelPos };
  }

  private rerouteEdgesForNode(_node: NodeTopology) {
    this.rerouteAllEdges(false);
  }

  public rerouteAllEdges(forceRecalculate: boolean = false) {
    this.edgesList.forEach((edge, idx) => {
      const srcNode = this.nodesMap.get(edge.sourceKey);
      const tgtNode = this.nodesMap.get(edge.targetKey);
      if (!srcNode || !tgtNode) return;

      const hasMoved =
        Math.abs(srcNode.dx) > 1 ||
        Math.abs(srcNode.dy) > 1 ||
        Math.abs(tgtNode.dx) > 1 ||
        Math.abs(tgtNode.dy) > 1;

      if (!hasMoved && !forceRecalculate && !this.activeCurveStyle) {
        edge.el.setAttribute("d", edge.initialD);
        return;
      }

      const { pathD, labelPos } = this.calculateEdgeRoute(edge, idx);
      edge.el.setAttribute("d", pathD);

      if (edge.labelEl) {
        edge.labelEl.setAttribute("transform", `translate(${labelPos.x}, ${labelPos.y})`);
      }
    });
  }

  private savePositionsToSource() {
    const posRecord: Record<string, [number, number]> = {};
    let hasMoved = false;

    this.nodesMap.forEach((node) => {
      if (Math.abs(node.dx) > 1 || Math.abs(node.dy) > 1) {
        posRecord[node.key] = [Math.round(node.currentX), Math.round(node.currentY)];
        hasMoved = true;
      }
    });

    const code = this.getCurrentCode();
    const cleanCode = code.replace(/%%\s*\{typemark_positions:.*?\}\s*%%\n?/g, "").trim();

    if (!hasMoved) {
      if (cleanCode !== code) {
        this.onSourceChange(cleanCode);
      }
      return;
    }

    const annotation = `%% {typemark_positions: ${JSON.stringify(posRecord)}} %%`;
    const newCode = `${annotation}\n${cleanCode}`;
    if (newCode !== code) {
      this.onSourceChange(newCode);
    }
  }

  private applySavedPositions() {
    const code = this.getCurrentCode();
    const match = /%%\s*\{typemark_positions:\s*(\{.*?\})\}\s*%%/.exec(code);
    if (!match) return;

    try {
      const savedPositions = JSON.parse(match[1]) as Record<string, [number, number]>;
      Object.entries(savedPositions).forEach(([key, [x, y]]) => {
        const node = this.nodesMap.get(key);
        if (node) {
          node.currentX = x;
          node.currentY = y;
          node.dx = x - node.baseX;
          node.dy = y - node.baseY;
          node.el.setAttribute("transform", `translate(${x}, ${y})`);
        }
      });
      this.rerouteAllEdges(true);
    } catch (err) {
      console.warn("[MermaidInteractor] 解析位置元数据失败:", err);
    }
  }

  private cleanupListeners() {
    this.cleanupFns.forEach((fn) => fn());
    this.cleanupFns = [];
    this.toolbarEl?.remove();
    this.toolbarEl = null;
    this.closePopover();
    this.closeInlineInput();
    this.nodesMap.clear();
    this.edgesList = [];
    this.isDraggingNode = false;
    this.activeNodeKey = null;
  }

  public destroy() {
    this.cleanupListeners();
    this.isEditMode = false;
  }
}
