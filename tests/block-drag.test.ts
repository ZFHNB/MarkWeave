// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { schema } from "../src/editor/schema";
import { markdownToDoc } from "../src/editor/serializer/markdown";
import { computeDropPos, createBlockDragPlugin } from "../src/editor/plugins/block-drag";

/**
 * 用几何桩驱动插件：为每个顶层块提供可控的视口矩形，
 * 避免在 jsdom 中依赖真实布局。
 */
function makeView(markdown: string, rects: { top: number; bottom: number; left?: number; right?: number }[]) {
  const doc = markdownToDoc(markdown, schema);
  let state = EditorState.create({ doc });

  const dom = document.createElement("div");
  dom.className = "ProseMirror";
  document.body.appendChild(dom);

  const nodeDoms: HTMLElement[] = [];
  doc.forEach(() => {
    const el = document.createElement("div");
    dom.appendChild(el);
    nodeDoms.push(el);
  });

  let index = 0;
  const view = {
    get state() {
      return state;
    },
    dispatch(tr: never) {
      state = state.apply(tr);
    },
    dom,
    nodeDOM(pos: number) {
      // 按顶层偏移顺序返回对应桩元素
      let offset = 0;
      for (let i = 0; i < doc.childCount; i++) {
        const node = doc.child(i);
        if (offset === pos) return nodeDoms[i];
        offset += node.nodeSize;
      }
      return null;
    },
    posAtCoords() {
      return null;
    },
    coordsAtPos() {
      return { top: 0, bottom: 0, left: 0, right: 0 };
    },
  } as unknown as EditorView;

  // 给每个桩元素挂上预设矩形
  nodeDoms.forEach((el, i) => {
    const r = rects[i] ?? { top: 0, bottom: 0, left: 0, right: 0 };
    el.getBoundingClientRect = () =>
      ({
        top: r.top,
        bottom: r.bottom,
        left: r.left ?? 100,
        right: r.right ?? 700,
        height: r.bottom - r.top,
        width: (r.right ?? 700) - (r.left ?? 100),
        x: r.left ?? 100,
        y: r.top,
        toJSON() {},
      }) as DOMRect;
  });
  index++;

  return { view, dom, nodeDoms, getState: () => state };
}

const THREE_BLOCKS = "第一段\n\n第二段\n\n第三段";

/** 从文档中取出各顶层块的真实起始偏移 */
function offsets(doc: { childCount: number; child: (i: number) => { nodeSize: number } }) {
  const out: number[] = [];
  let offset = 0;
  for (let i = 0; i < doc.childCount; i++) {
    out.push(offset);
    offset += doc.child(i).nodeSize;
  }
  return out;
}

describe("computeDropPos", () => {
  it("snaps to the gap before a block when over its top half", () => {
    const { view } = makeView(THREE_BLOCKS, [
      { top: 0, bottom: 40 },
      { top: 50, bottom: 90 },
      { top: 100, bottom: 140 },
    ]);
    const [first, second] = offsets(view.state.doc);
    // 第二块上半部分 → 插到第二块之前
    expect(computeDropPos(view, 60)).toBe(second);
    expect(second).toBeGreaterThan(first);
  });

  it("snaps to the gap after a block when over its bottom half", () => {
    const { view } = makeView(THREE_BLOCKS, [
      { top: 0, bottom: 40 },
      { top: 50, bottom: 90 },
      { top: 100, bottom: 140 },
    ]);
    const [, second] = offsets(view.state.doc);
    const secondNode = view.state.doc.child(1);
    // 第二块下半部分 → 插到第二块之后
    expect(computeDropPos(view, 85)).toBe(second + secondNode.nodeSize);
  });

  it("returns the end position below all blocks", () => {
    const { view } = makeView(THREE_BLOCKS, [
      { top: 0, bottom: 40 },
      { top: 50, bottom: 90 },
      { top: 100, bottom: 140 },
    ]);
    expect(computeDropPos(view, 400)).toBe(view.state.doc.content.size);
  });

  it("returns null when there are no measurable blocks", () => {
    const { view, nodeDoms } = makeView(THREE_BLOCKS, [
      { top: 0, bottom: 0 },
      { top: 0, bottom: 0 },
      { top: 0, bottom: 0 },
    ]);
    // 明确把所有块都视为"无几何信息"
    nodeDoms.forEach((el) => {
      el.getBoundingClientRect = () =>
        ({ top: 0, bottom: 0, left: 0, right: 0, height: 0, width: 0, x: 0, y: 0, toJSON() {} }) as DOMRect;
    });
    expect(computeDropPos(view, 10)).toBeNull();
  });
});

describe("block drag handle", () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    document.body.innerHTML = "";
  });

  it("mounts a handle on the document body", () => {
    const { view } = makeView(THREE_BLOCKS, [
      { top: 0, bottom: 20 },
      { top: 30, bottom: 50 },
      { top: 60, bottom: 80 },
    ]);
    const plugin = createBlockDragPlugin();
    const api = plugin.spec.view!(view);
    cleanup = () => api!.destroy?.();

    const handle = document.querySelector(".md-block-handle");
    expect(handle).toBeTruthy();
    expect(handle!.parentElement).toBe(document.body);
  });

  it("hides the handle when the pointer is far from any block", () => {
    const { view } = makeView(THREE_BLOCKS, [
      { top: 0, bottom: 20 },
      { top: 30, bottom: 50 },
      { top: 60, bottom: 80 },
    ]);
    const plugin = createBlockDragPlugin();
    const api = plugin.spec.view!(view);
    cleanup = () => api!.destroy?.();

    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 2000, clientY: 2000 }));
    const handle = document.querySelector(".md-block-handle")!;
    expect(handle.classList.contains("is-visible")).toBe(false);
  });
});
