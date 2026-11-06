import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";

export const blockDragKey = new PluginKey("blockDrag");

/**
 * 块拖动排序（对标 Typora 的块级拖拽手柄）。
 *
 * 交互：
 * - 鼠标悬浮在任意顶层块上时，块左侧淡入一个六点手柄
 * - 指针可平滑地移向左侧手柄（中间有一段"感应区"），不会因离开文字区域而消失
 * - 按住手柄拖动，光标变为抓取手型，插入位置显示主色横线
 * - 松手后把整块移动到该位置
 *
 * 坐标策略：手柄与指示线都用 `position: fixed` + `getBoundingClientRect()`，
 * 直接使用视口坐标。这样滚动、缩放、侧栏开合都不会造成偏移。
 */

interface DragState {
  fromPos: number;
  size: number;
  startY: number;
  active: boolean;
  dropPos: number | null;
}

/** 顶层块在给定文档位置上的边界信息 */
interface BlockAt {
  pos: number;
  node: PMNode;
  end: number;
}

/** 手柄与块左边缘的距离 */
const HANDLE_OFFSET = 28;
/** 指针在块左侧多宽的范围内仍视为"指向该块"（用于过渡到手柄） */
const HANDLE_REACH = 70;
/** 拖动判定阈值（像素） */
const DRAG_THRESHOLD = 3;

function blockAt(doc: PMNode, pos: number): BlockAt | null {
  if (doc.childCount === 0) return null;
  const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  const index = Math.min($pos.index(0), doc.childCount - 1);
  let offset = 0;
  for (let i = 0; i < index; i++) offset += doc.child(i).nodeSize;
  const node = doc.child(index);
  return { pos: offset, node, end: offset + node.nodeSize };
}

/**
 * 根据视口纵坐标算出"插入到哪个间隙"。
 * 返回该间隙对应的文档位置（目标块之前的位置）。
 */
export function computeDropPos(view: EditorView, clientY: number): number | null {
  const doc = view.state.doc;
  let result: number | null = null;

  doc.forEach((node, offset) => {
    const dom = view.nodeDOM(offset);
    if (!(dom instanceof HTMLElement)) return;
    const rect = dom.getBoundingClientRect();
    if (rect.height === 0 && rect.width === 0) return;

    if (clientY < rect.top) return; // 还没到这个块
    if (clientY <= rect.top + rect.height / 2) {
      if (result === null) result = offset;
      return;
    }
    result = offset + node.nodeSize;
  });

  return result;
}

function clearIndicators(): void {
  document.querySelectorAll(".md-drop-indicator").forEach((el) => el.remove());
}

/** 在目标间隙绘制插入指示线（视口坐标，position: fixed） */
function showIndicator(view: EditorView, pos: number): void {
  clearIndicators();

  const doc = view.state.doc;
  const clamped = Math.max(0, Math.min(pos, doc.content.size));

  // 滚动容器的可见区域：指示线必须落在其中，否则会画到视口外
  const scroller = view.dom.closest(".ty-editor-scroller") as HTMLElement | null;
  const scrollerRect = scroller?.getBoundingClientRect();
  const viewportTop = scrollerRect ? scrollerRect.top : 0;
  const viewportBottom = scrollerRect ? scrollerRect.bottom : window.innerHeight;

  const beforeBottoms: number[] = [];
  const afterTops: number[] = [];
  let left = Number.POSITIVE_INFINITY;
  let right = 0;

  doc.forEach((node, offset) => {
    const dom = view.nodeDOM(offset);
    if (!(dom instanceof HTMLElement)) return;
    const rect = dom.getBoundingClientRect();
    if (rect.height === 0 && rect.width === 0) return;

    left = Math.min(left, rect.left);
    right = Math.max(right, rect.right);

    if (offset + node.nodeSize <= clamped) {
      beforeBottoms.push(rect.bottom);
    } else if (offset >= clamped && afterTops.length === 0) {
      afterTops.push(rect.top);
    }
  });

  const candidate = beforeBottoms.length
    ? beforeBottoms[beforeBottoms.length - 1]
    : afterTops.length
    ? afterTops[0]
    : null;
  if (candidate === null) return;
  if (!Number.isFinite(left) || right <= left) return;

  // 夹到滚动容器的可见范围内，保证指示线始终能看见
  const margin = 4;
  const top = Math.max(viewportTop + margin, Math.min(candidate, viewportBottom - margin));

  const line = document.createElement("div");
  line.className = "md-drop-indicator";
  line.style.top = `${Math.round(top)}px`;
  line.style.left = `${Math.round(left)}px`;
  line.style.width = `${Math.round(right - left)}px`;
  document.body.appendChild(line);
}

export function createBlockDragPlugin(): Plugin {
  return new Plugin({
    key: blockDragKey,
    view(editorView: EditorView) {
      const handle = document.createElement("div");
      handle.className = "md-block-handle";
      handle.setAttribute("contenteditable", "false");
      handle.setAttribute("aria-hidden", "true");
      handle.innerHTML =
        "<span></span><span></span><span></span><span></span><span></span><span></span>";
      document.body.appendChild(handle);

      let hovered: BlockAt | null = null;
      let hoveredRect: DOMRect | null = null;
      let drag: DragState | null = null;

      const hideHandle = () => {
        handle.classList.remove("is-visible");
        hovered = null;
        hoveredRect = null;
        delete handle.dataset.blockPos;
      };

      /** 手柄纵向对齐块的中心，横向贴在块左缘外侧 */
      const positionHandle = (block: BlockAt, rect: DOMRect) => {
        hovered = block;
        hoveredRect = rect;

        // 手柄高度跟随块高（限定在合理区间），并严格以块中心为准
        const handleHeight = Math.min(Math.max(rect.height, 22), 30);
        const centerY = rect.top + rect.height / 2;
        const top = centerY - handleHeight / 2;

        handle.style.top = `${Math.round(top)}px`;
        handle.style.left = `${Math.round(rect.left - HANDLE_OFFSET)}px`;
        handle.style.height = `${Math.round(handleHeight)}px`;
        handle.classList.add("is-visible");
        handle.dataset.blockPos = String(block.pos);
      };

      /** 读取块当前的视口矩形（总是实时查询，避免用缓存） */
      const rectOf = (pos: number): DOMRect | null => {
        const dom = editorView.nodeDOM(pos);
        if (!(dom instanceof HTMLElement)) return null;
        const rect = dom.getBoundingClientRect();
        if (rect.height === 0 && rect.width === 0) return null;
        return rect;
      };

      /** 判断指针是否位于手柄（含少量外扩）矩形内 */
      const isOverHandle = (event: MouseEvent): boolean => {
        if (!handle.classList.contains("is-visible")) return false;
        const r = handle.getBoundingClientRect();
        const pad = 6;
        return (
          event.clientX >= r.left - pad &&
          event.clientX <= r.right + pad &&
          event.clientY >= r.top - pad &&
          event.clientY <= r.bottom + pad
        );
      };

      /** 指针位于某个块的左侧感应带内时，返回该块 */
      const blockFromReach = (clientX: number, clientY: number): { block: BlockAt; rect: DOMRect } | null => {
        const doc = editorView.state.doc;
        let found: { block: BlockAt; rect: DOMRect } | null = null;

        doc.forEach((node, offset) => {
          if (found) return;
          const rect = rectOf(offset);
          if (!rect) return;

          const verticallyInside = clientY >= rect.top - 4 && clientY <= rect.bottom + 4;
          const horizontallyNear = clientX >= rect.left - HANDLE_REACH && clientX <= rect.left;
          if (verticallyInside && horizontallyNear) {
            found = {
              block: { pos: offset, node, end: offset + node.nodeSize },
              rect,
            };
          }
        });

        return found;
      };

      /**
       * 对齐到下一帧再执行：滚动或窗口刚变化时，
       * 本次 mousemove 读到的矩形可能是布局完成前的旧值。
       */
      let realignFrame = 0;
      const scheduleAlign = (block: BlockAt) => {
        if (realignFrame) cancelAnimationFrame(realignFrame);
        realignFrame = requestAnimationFrame(() => {
          realignFrame = 0;
          if (drag || !hovered || hovered.pos !== block.pos) return;
          const rect = rectOf(block.pos);
          if (rect) positionHandle(block, rect);
        });
      };

      const onMouseMove = (event: MouseEvent) => {
        if (drag) return;

        // 1) 指针在手柄附近：保持当前块的手柄可见
        if (isOverHandle(event) && hovered && hoveredRect) {
          positionHandle(hovered, hoveredRect);
          return;
        }

        // 2) 指针在正文上：定位到该块
        const hit = editorView.posAtCoords({ left: event.clientX, top: event.clientY });
        if (hit) {
          const block = blockAt(editorView.state.doc, hit.pos);
          if (block) {
            const rect = rectOf(block.pos);
            if (rect) {
              positionHandle(block, rect);
              scheduleAlign(block);
              return;
            }
          }
        }

        // 3) 指针在块左侧空白处：用一个较宽的感应带维持手柄
        const near = blockFromReach(event.clientX, event.clientY);
        if (near) {
          positionHandle(near.block, near.rect);
          return;
        }

        hideHandle();
      };

      const onHandleMouseDown = (event: MouseEvent) => {
        const pos = Number(handle.dataset.blockPos);
        const block = Number.isFinite(pos) ? blockAt(editorView.state.doc, pos) : hovered;
        if (!block) return;
        event.preventDefault();
        event.stopPropagation();

        drag = {
          fromPos: block.pos,
          size: block.node.nodeSize,
          startY: event.clientY,
          active: false,
          dropPos: null,
        };

        document.body.classList.add("md-block-dragging");
        handle.classList.add("is-dragging");
      };

      const onDocumentMouseMove = (event: MouseEvent) => {
        if (!drag) return;
        if (!drag.active && Math.abs(event.clientY - drag.startY) < DRAG_THRESHOLD) return;
        drag.active = true;

        const pos = computeDropPos(editorView, event.clientY);
        const selfEnd = drag.fromPos + drag.size;
        if (pos === null || pos === drag.fromPos || pos === selfEnd) {
          drag.dropPos = null;
          clearIndicators();
          return;
        }
        drag.dropPos = pos;
        showIndicator(editorView, pos);
      };

      const finishDrag = (commit: boolean) => {
        if (!drag) return;
        const state = drag;
        drag = null;

        document.body.classList.remove("md-block-dragging");
        handle.classList.remove("is-dragging");
        clearIndicators();

        if (!commit || !state.active || state.dropPos === null) return;

        const { state: editorState, dispatch } = editorView;
        const doc = editorState.doc;
        const moving = doc.nodeAt(state.fromPos);
        if (!moving) return;

        const target = Math.max(0, Math.min(state.dropPos, doc.content.size));
        const insertAt =
          target > state.fromPos ? Math.max(state.fromPos, target - state.size) : target;

        const tr = editorState.tr;
        tr.delete(state.fromPos, state.fromPos + state.size);
        tr.insert(Math.max(0, Math.min(insertAt, tr.doc.content.size)), moving);
        dispatch(tr.scrollIntoView());
      };

      const onDocumentMouseUp = () => finishDrag(true);
      /** 按当前滚动位置重新对齐手柄（滚动结束后调用最可靠） */
      const realignHandle = () => {
        if (!hovered) return;
        const rect = rectOf(hovered.pos);
        if (rect) positionHandle(hovered, rect);
        else hideHandle();
      };

      const onScroll = () => {
        if (drag) {
          if (drag.dropPos !== null) showIndicator(editorView, drag.dropPos);
          return;
        }
        // 滚动过程中布局可能尚未稳定，等一帧后再对齐
        requestAnimationFrame(realignHandle);
      };

      const onWindowBlur = () => {
        if (!drag) hideHandle();
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mousemove", onDocumentMouseMove);
      document.addEventListener("mouseup", onDocumentMouseUp);
      handle.addEventListener("mousedown", onHandleMouseDown);
      window.addEventListener("scroll", onScroll, true);
      window.addEventListener("resize", onScroll);
      window.addEventListener("blur", onWindowBlur);

      return {
        destroy() {
          document.removeEventListener("mousemove", onMouseMove);
          document.removeEventListener("mousemove", onDocumentMouseMove);
          document.removeEventListener("mouseup", onDocumentMouseUp);
          handle.removeEventListener("mousedown", onHandleMouseDown);
          window.removeEventListener("scroll", onScroll, true);
          window.removeEventListener("resize", onScroll);
          window.removeEventListener("blur", onWindowBlur);
          if (realignFrame) cancelAnimationFrame(realignFrame);
          clearIndicators();
          handle.remove();
        },
      };
    },
  });
}
