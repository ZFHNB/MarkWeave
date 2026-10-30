import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";

export const blockDragKey = new PluginKey("blockDrag");

/**
 * 块拖动排序（对标 Typora 的块级拖拽手柄）。
 *
 * 交互：
 * - 鼠标悬浮在任意顶层块上时，块左侧淡入一个六点手柄
 * - 按住手柄拖动，光标变为抓取手型，被拖动的块半透明跟随
 * - 拖动时在候选插入位置画一条主色横线，提示"松手后会插到这里"
 * - 松手后把整块移动到该位置
 *
 * 实现要点：
 * - 只对顶层块（doc 的直接子节点）生效，避免列表/表格内部出现嵌套手柄
 * - 插入位置以"顶层块边界"为粒度，绝不切开块内部
 * - 拖动全程不改文档，仅在松手时发一次事务，可直接撤销
 */

interface DragState {
  fromPos: number;
  toPos: number;
  size: number;
  startY: number;
  active: boolean;
  dropPos: number | null;
  dom: HTMLElement;
}

/** 顶层块在给定文档位置上的边界信息 */
interface BlockAt {
  pos: number;
  node: PMNode;
  end: number;
}

function blockAt(doc: PMNode, pos: number): BlockAt | null {
  if (doc.childCount === 0) return null;
  const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  // 顶层位置直接对应某个子节点边界，$pos.index(0) 仍可用
  const index = Math.min($pos.index(0), doc.childCount - 1);
  let offset = 0;
  for (let i = 0; i < index; i++) offset += doc.child(i).nodeSize;
  const node = doc.child(index);
  return { pos: offset, node, end: offset + node.nodeSize };
}

/**
 * 根据鼠标纵坐标计算"插入到哪个间隙"。
 * 返回值是该间隙对应的文档位置（即目标块之前的位置）。
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
      // 落在块的上半部分：插到该块之前
      if (result === null) result = offset;
      return;
    }
    // 落在下半部分或更下方：插到该块之后
    result = offset + node.nodeSize;
  });

  return result;
}

function clearIndicators(): void {
  document.querySelectorAll(".md-drop-indicator").forEach((el) => el.remove());
}

/**
 * 在目标间隙绘制插入指示线。
 * 用相邻块的真实几何边界定位，而不是 coordsAtPos
 * （空段落/块边界处 coordsAtPos 返回的矩形可能退化为 0 宽）。
 */
function showIndicator(view: EditorView, pos: number): void {
  clearIndicators();

  const doc = view.state.doc;
  const clamped = Math.max(0, Math.min(pos, doc.content.size));

  // 找出该间隙前后相邻的顶层块
  let beforeRect: DOMRect | null = null;
  let afterRect: DOMRect | null = null;

  doc.forEach((node, offset) => {
    const dom = view.nodeDOM(offset);
    if (!(dom instanceof HTMLElement)) return;
    const rect = dom.getBoundingClientRect();
    if (offset + node.nodeSize <= clamped) beforeRect = rect;
    else if (offset >= clamped && !afterRect) afterRect = rect;
  });

  const top = beforeRect
    ? (beforeRect as DOMRect).bottom
    : afterRect
    ? (afterRect as DOMRect).top
    : null;
  if (top === null) return;

  const scroller = view.dom.closest(".ty-editor-scroller") as HTMLElement | null;
  const host = view.dom.parentElement ?? view.dom;
  const hostRect = host.getBoundingClientRect();
  const scrollTop = scroller?.scrollTop ?? 0;

  const line = document.createElement("div");
  line.className = "md-drop-indicator";
  line.style.top = `${top - hostRect.top + scrollTop}px`;
  line.style.left = "0";
  line.style.width = "100%";
  host.appendChild(line);
}

export function createBlockDragPlugin(): Plugin {
  return new Plugin({
    key: blockDragKey,
    view(editorView: EditorView) {
      const handle = document.createElement("div");
      handle.className = "md-block-handle";
      handle.setAttribute("contenteditable", "false");
      handle.setAttribute("aria-hidden", "true");
      handle.innerHTML = "<span></span><span></span><span></span><span></span><span></span><span></span>";

      const host = editorView.dom.parentElement ?? editorView.dom;
      host.appendChild(handle);

      let hovered: BlockAt | null = null;
      let drag: DragState | null = null;

      const hideHandle = () => {
        handle.classList.remove("is-visible");
        hovered = null;
        delete handle.dataset.blockPos;
      };

      const positionHandle = (block: BlockAt) => {
        const dom = editorView.nodeDOM(block.pos);
        if (!(dom instanceof HTMLElement)) return;
        const rect = dom.getBoundingClientRect();
        const hostRect = host.getBoundingClientRect();
        handle.style.top = `${rect.top - hostRect.top}px`;
        handle.style.left = `${rect.left - hostRect.left - 26}px`;
        handle.style.height = `${Math.min(rect.height, 28)}px`;
        handle.classList.add("is-visible");
        // mousedown 时鼠标已离开编辑区，改用数据集读取当前块
        handle.dataset.blockPos = String(block.pos);
      };

      const onMouseMove = (event: MouseEvent) => {
        const target = event.target;
        // 指针位于手柄上时保持手柄可见，允许用户按下拖动
        if (!drag && target instanceof Node && handle.contains(target)) {
          if (hovered) positionHandle(hovered);
          return;
        }

        if (drag) {
          // 拖动中：更新候选插入位置
          const pos = computeDropPos(editorView, event.clientY);
          if (pos !== null) {
            // 排除落在被拖动块内部或紧邻自身的位置
            const selfStart = drag.fromPos;
            const selfEnd = drag.fromPos + drag.size;
            if (pos !== selfStart && pos !== selfEnd) {
              drag.dropPos = pos;
              showIndicator(editorView, pos);
            } else {
              drag.dropPos = null;
              clearIndicators();
            }
          }
          return;
        }

        const pos = editorView.posAtCoords({ left: event.clientX, top: event.clientY });
        if (!pos) {
          hideHandle();
          return;
        }
        const block = blockAt(editorView.state.doc, pos.pos);
        if (!block) {
          hideHandle();
          return;
        }
        hovered = block;
        positionHandle(block);
      };

      const onHandleMouseDown = (event: MouseEvent) => {
        const pos = Number(handle.dataset.blockPos);
        const block = Number.isFinite(pos) ? blockAt(editorView.state.doc, pos) : hovered;
        if (!block) return;
        event.preventDefault();
        event.stopPropagation();

        drag = {
          fromPos: block.pos,
          toPos: block.end,
          size: block.node.nodeSize,
          startY: event.clientY,
          active: false,
          dropPos: null,
          dom: handle,
        };

        document.body.classList.add("md-block-dragging");
        handle.classList.add("is-dragging");
      };

      const onDocumentMouseMove = (event: MouseEvent) => {
        if (!drag) return;
        // 拖动阈值，避免误触
        if (!drag.active && Math.abs(event.clientY - drag.startY) < 4) return;
        drag.active = true;

        const pos = computeDropPos(editorView, event.clientY);
        if (pos === null) {
          drag.dropPos = null;
          clearIndicators();
          return;
        }
        if (pos === drag.fromPos || pos === drag.fromPos + drag.size) {
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

        // 目标在被拖动块之后时，删除后位置会前移一个块高
        const target = Math.max(0, Math.min(state.dropPos, doc.content.size));
        const insertAt =
          target > state.fromPos
            ? Math.max(state.fromPos, target - state.size)
            : target;

        const tr = editorState.tr;
        tr.delete(state.fromPos, state.fromPos + state.size);
        tr.insert(Math.max(0, Math.min(insertAt, tr.doc.content.size)), moving);
        dispatch(tr.scrollIntoView());
      };

      const onDocumentMouseUp = () => finishDrag(true);

      const onScroll = () => {
        if (!drag) hideHandle();
      };

      // 用文档级监听，指针移到手柄上时不会被编辑器 mouseleave 打断
      document.addEventListener("mousemove", onMouseMove);
      handle.addEventListener("mousedown", onHandleMouseDown);
      handle.addEventListener("mouseenter", () => {
        if (hovered) positionHandle(hovered);
      });
      document.addEventListener("mousemove", onDocumentMouseMove);
      document.addEventListener("mouseup", onDocumentMouseUp);
      window.addEventListener("scroll", onScroll, true);

      return {
        destroy() {
          document.removeEventListener("mousemove", onMouseMove);
          handle.removeEventListener("mousedown", onHandleMouseDown);
          document.removeEventListener("mousemove", onDocumentMouseMove);
          document.removeEventListener("mouseup", onDocumentMouseUp);
          window.removeEventListener("scroll", onScroll, true);
          clearIndicators();
          handle.remove();
        },
      };
    },
  });
}
