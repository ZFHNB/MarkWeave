import { Node as PMNode } from "prosemirror-model";

export interface HeadingItem {
  id: string;
  level: number;
  text: string;
  pos: number;
}

export function extractHeadings(doc: PMNode): HeadingItem[] {
  const headings: HeadingItem[] = [];
  let index = 0;

  doc.descendants((node, pos) => {
    if (node.type.name === "heading") {
      const level = node.attrs.level || 1;
      const text = node.textContent.trim();
      if (text) {
        headings.push({
          id: `heading-${++index}`,
          level,
          text,
          pos,
        });
      }
    }
  });

  return headings;
}
