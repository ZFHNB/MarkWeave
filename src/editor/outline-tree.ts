import type { Node as PMNode } from "prosemirror-model";
import type { Selection } from "prosemirror-state";

export interface OutlineNode {
  id: string;
  level: number;
  text: string;
  pos: number;
  children: OutlineNode[];
}

export interface OutlineItem {
  id: string;
  level: number;
  text: string;
  pos: number;
}

/** 从文档提取标题（保持原有 HeadingItem 兼容） */
export function extractOutlineItems(doc: PMNode): OutlineItem[] {
  const items: OutlineItem[] = [];
  let index = 0;
  doc.descendants((node, pos) => {
    if (node.type.name === "heading" && (node.attrs.level || 0) >= 1) {
      const text = node.textContent.trim();
      if (text) {
        items.push({ id: `heading-${++index}`, level: node.attrs.level, text, pos });
      }
    }
  });
  return items;
}

/** 把扁平标题列表构建为层级树（用于可折叠大纲） */
export function buildOutlineTree(items: OutlineItem[]): OutlineNode[] {
  const roots: OutlineNode[] = [];
  const stack: OutlineNode[] = [];

  for (const item of items) {
    const node: OutlineNode = { ...item, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
      stack.pop();
    }
    if (stack.length === 0) {
      roots.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }
    stack.push(node);
  }

  return roots;
}

/** 过滤大纲：保留匹配项及其祖先，便于在折叠树中定位 */
export function filterOutline(items: OutlineItem[], query: string): OutlineItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;

  const matched = new Set<number>();
  items.forEach((item, index) => {
    if (item.text.toLowerCase().includes(q)) matched.add(index);
  });

  // 保留匹配项的祖先链（前面最近的更高级标题）
  for (const index of Array.from(matched)) {
    let level = items[index].level;
    for (let i = index - 1; i >= 0; i--) {
      if (items[i].level < level) {
        matched.add(i);
        level = items[i].level;
        if (level === 1) break;
      }
    }
  }

  return items.filter((_, index) => matched.has(index));
}

/** 根据光标位置找到当前标题（pos 最大的、pos <= cursor 的标题） */
export function findActiveHeading(items: OutlineItem[], cursorPos: number): OutlineItem | null {
  let active: OutlineItem | null = null;
  for (const item of items) {
    if (item.pos <= cursorPos) active = item;
    else break;
  }
  return active;
}

export function isCursorInSelection(selection: Selection, pos: number): boolean {
  return selection.from <= pos && selection.to >= pos;
}
