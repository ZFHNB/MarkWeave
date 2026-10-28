import { Schema, type NodeSpec, type MarkSpec } from "prosemirror-model";
import { tableNodes } from "prosemirror-tables";

const tableSpecs = tableNodes({
  tableGroup: "block",
  cellContent: "paragraph",
  cellAttributes: {
    alignment: {
      default: "left",
      getFromDOM(dom: HTMLElement) {
        return (dom.style.textAlign || dom.getAttribute("align") || "left").toLowerCase();
      },
      setDOMAttr(value, attrs) {
        if (value) attrs.style = `${attrs.style || ""}text-align:${value};`;
      },
    },
  },
});

const nodes: Record<string, NodeSpec> = {
  doc: {
    content: "block+",
  },

  paragraph: {
    content: "inline*",
    group: "block",
    parseDOM: [{ tag: "p" }],
    toDOM() {
      return ["p", { class: "md-p md-block" }, 0];
    },
  },

  ...tableSpecs,

  table: {
    ...tableSpecs.table,
    attrs: {
      ...(tableSpecs.table.attrs || {}),
      layout: { default: "equal" },
      rowLayout: { default: "wrap" },
    },
    parseDOM: [
      {
        tag: "table",
        getAttrs(dom) {
          const el = dom as HTMLElement;
          return {
            layout: el.getAttribute?.("data-md-table-layout") === "auto" ? "auto" : "equal",
            rowLayout: el.getAttribute?.("data-md-table-nowrap") === "true" ? "nowrap" : "wrap",
          };
        },
      },
    ],
    toDOM(node) {
      const attrs: Record<string, string> = {};
      if (node.attrs.layout === "auto") {
        attrs["data-md-table-layout"] = "auto";
      }
      if (node.attrs.rowLayout === "nowrap") {
        attrs["data-md-table-nowrap"] = "true";
      }
      return ["table", attrs, ["tbody", 0]];
    },
  },

  blockquote: {
    content: "block+",
    group: "block",
    defining: true,
    parseDOM: [{ tag: "blockquote" }],
    toDOM() {
      return ["blockquote", { class: "md-blockquote md-block" }, 0];
    },
  },

  horizontal_rule: {
    group: "block",
    parseDOM: [{ tag: "hr" }],
    toDOM() {
      return ["div", { class: "md-hr md-block" }, ["hr"]];
    },
  },

  heading: {
    attrs: { level: { default: 1 } },
    content: "inline*",
    group: "block",
    defining: true,
    parseDOM: [
      { tag: "h1", attrs: { level: 1 } },
      { tag: "h2", attrs: { level: 2 } },
      { tag: "h3", attrs: { level: 3 } },
      { tag: "h4", attrs: { level: 4 } },
      { tag: "h5", attrs: { level: 5 } },
      { tag: "h6", attrs: { level: 6 } },
    ],
    toDOM(node) {
      return [`h${node.attrs.level}`, { class: `md-heading md-h${node.attrs.level} md-block` }, 0];
    },
  },

  code_block: {
    content: "text*",
    marks: "",
    group: "block",
    code: true,
    defining: true,
    attrs: { params: { default: "" } },
    parseDOM: [
      {
        tag: "pre",
        preserveWhitespace: "full",
        getAttrs: (node) => {
          const el = node as HTMLElement;
          let params = el.getAttribute("data-params") || "";
          if (!params) {
            const codeEl = el.querySelector("code");
            if (codeEl) {
              const match = /language-([^\s]+)/.exec(codeEl.className || "");
              if (match) {
                params = match[1];
              }
            }
          }
          return { params };
        },
      },
    ],
    toDOM(node) {
      return [
        "pre",
        { class: "md-fences md-block", "data-params": node.attrs.params },
        ["code", 0],
      ];
    },
  },

  math_block: {
    attrs: { formula: { default: "" } },
    group: "block",
    defining: true,
    parseDOM: [
      {
        tag: "div[data-math-block]",
        getAttrs: (dom) => ({
          formula: (dom as HTMLElement).getAttribute("data-formula") || "",
        }),
      },
    ],
    toDOM(node) {
      return [
        "div",
        { class: "md-math-block md-block", "data-math-block": "true", "data-formula": node.attrs.formula },
      ];
    },
  },

  yaml_frontmatter: {
    attrs: { content: { default: "" } },
    group: "block",
    defining: true,
    parseDOM: [
      {
        tag: "div.md-yaml-frontmatter",
        getAttrs: (dom) => ({
          content: decodeURIComponent((dom as HTMLElement).getAttribute("data-yaml") || ""),
        }),
      },
    ],
    toDOM(node) {
      return [
        "div",
        {
          class: "md-yaml-frontmatter md-block",
          "data-yaml": encodeURIComponent(node.attrs.content || ""),
          "data-yaml-frontmatter": "true",
        },
      ];
    },
  },

  toc_block: {
    group: "block",
    defining: true,
    parseDOM: [{ tag: "div.md-toc-block" }],
    toDOM() {
      return ["div", { class: "md-toc-block md-block", "data-toc": "true" }];
    },
  },

  link_reference_definition: {
    attrs: {
      id: { default: "" },
      href: { default: "" },
      title: { default: null },
    },
    group: "block",
    defining: true,
    parseDOM: [
      {
        tag: "div.md-link-def",
        getAttrs: (dom) => {
          const el = dom as HTMLElement;
          return {
            id: el.getAttribute("data-ref-id") || "",
            href: el.getAttribute("data-ref-href") || "",
            title: el.getAttribute("data-ref-title"),
          };
        },
      },
    ],
    toDOM(node) {
      return [
        "div",
        {
          class: "md-link-def md-block",
          "data-ref-id": node.attrs.id || "",
          "data-ref-href": node.attrs.href || "",
          "data-ref-title": node.attrs.title || "",
        },
      ];
    },
  },

  footnote_definition: {
    attrs: { id: { default: "" }, content: { default: "" } },
    group: "block",
    defining: true,
    parseDOM: [
      {
        tag: "div.md-footnote-def",
        getAttrs: (dom) => {
          const el = dom as HTMLElement;
          return {
            id: el.getAttribute("data-footnote-id") || "",
            content: decodeURIComponent(el.getAttribute("data-content") || ""),
          };
        },
      },
    ],
    toDOM(node) {
      return [
        "div",
        {
          class: "md-footnote-def md-block",
          "data-footnote-id": node.attrs.id || "",
          "data-content": encodeURIComponent(node.attrs.content || ""),
        },
      ];
    },
  },

  ordered_list: {
    content: "list_item+",
    group: "block",
    attrs: { order: { default: 1 } },
    parseDOM: [
      {
        tag: "ol",
        getAttrs(dom) {
          const el = dom as HTMLElement;
          return {
            order: el.hasAttribute("start") ? parseInt(el.getAttribute("start")!, 10) : 1,
          };
        },
      },
    ],
    toDOM(node) {
      return node.attrs.order === 1 ? ["ol", { class: "md-ol-list md-block" }, 0] : ["ol", { start: node.attrs.order, class: "md-ol-list md-block" }, 0];
    },
  },

  bullet_list: {
    content: "list_item+",
    group: "block",
    parseDOM: [{ tag: "ul:not(.md-task-list)" }],
    toDOM() {
      return ["ul", { class: "md-ul-list md-block" }, 0];
    },
  },
  list_item: {
    content: "paragraph block*",
    defining: true,
    parseDOM: [{ tag: "li:not(.md-task-item)" }],
    toDOM() {
      return ["li", { class: "md-list-item" }, 0];
    },
  },

  task_list: {
    content: "task_item+",
    group: "block",
    parseDOM: [{ tag: "ul.md-task-list" }],
    toDOM() {
      return ["ul", { class: "md-task-list md-block" }, 0];
    },
  },

  task_item: {
    content: "paragraph block*",
    defining: true,
    attrs: { checked: { default: false } },
    parseDOM: [
      {
        tag: "li.md-task-item",
        getAttrs(dom) {
          const checkbox = (dom as HTMLElement).querySelector("input[type=checkbox]") as HTMLInputElement | null;
          return { checked: checkbox?.checked || false };
        },
      },
    ],
    toDOM(node) {
      return [
        "li",
        { class: `md-task-item ${node.attrs.checked ? "task-done" : ""}` },
        ["input", { type: "checkbox", class: "md-task-checkbox", ...(node.attrs.checked ? { checked: "checked" } : {}) }],
        ["div", { class: "md-task-content" }, 0],
      ];
    },
  },

  text: {
    group: "inline",
  },

  hard_break: {
    inline: true,
    group: "inline",
    selectable: false,
    parseDOM: [{ tag: "br" }],
    toDOM() {
      return ["br"];
    },
  },

  footnote_ref: {
    inline: true,
    group: "inline",
    attrs: { id: { default: "" } },
    atom: true,
    selectable: true,
    parseDOM: [
      {
        tag: "sup.md-footnote-ref",
        getAttrs: (dom) => ({
          id: (dom as HTMLElement).getAttribute("data-footnote-id") || "",
        }),
      },
    ],
    toDOM(node) {
      return ["sup", { class: "md-footnote-ref", "data-footnote-id": node.attrs.id }, 0];
    },
  },

  image: {
    inline: true,
    attrs: {
      src: {},
      alt: { default: null },
      title: { default: null },
    },
    group: "inline",
    draggable: true,
    parseDOM: [
      {
        tag: "img[src]",
        getAttrs(dom) {
          const el = dom as HTMLElement;
          return {
            src: el.getAttribute("src"),
            title: el.getAttribute("title"),
            alt: el.getAttribute("alt"),
          };
        },
      },
    ],
    toDOM(node) {
      const { src, alt, title } = node.attrs;
      return ["img", { src, alt, title, class: "md-image" }];
    },
  },
};

const marks: Record<string, MarkSpec> = {
  strong: {
    parseDOM: [
      { tag: "strong" },
      { tag: "b", getAttrs: (node) => (node as HTMLElement).style.fontWeight !== "normal" && null },
      { style: "font-weight=bold" },
    ],
    toDOM() {
      return ["strong", { class: "md-strong" }, 0];
    },
  },

  em: {
    parseDOM: [{ tag: "i" }, { tag: "em" }, { style: "font-style=italic" }],
    toDOM() {
      return ["em", { class: "md-em" }, 0];
    },
  },

  strike: {
    parseDOM: [{ tag: "s" }, { tag: "del" }, { style: "text-decoration=line-through" }],
    toDOM() {
      return ["s", { class: "md-strike" }, 0];
    },
  },

  highlight: {
    parseDOM: [{ tag: "mark" }, { tag: "mark.md-highlight" }],
    toDOM() {
      return ["mark", { class: "md-highlight" }, 0];
    },
  },

  superscript: {
    parseDOM: [{ tag: "sup:not(.md-footnote-ref)" }],
    toDOM() {
      return ["sup", { class: "md-superscript" }, 0];
    },
  },

  subscript: {
    parseDOM: [{ tag: "sub" }],
    toDOM() {
      return ["sub", { class: "md-subscript" }, 0];
    },
  },

  code: {
    parseDOM: [{ tag: "code" }],
    toDOM() {
      return ["code", { class: "md-inline-code" }, 0];
    },
  },

  link: {
    attrs: {
      href: {},
      title: { default: null },
      reference: { default: null },
      referenceCollapsed: { default: false },
      anchor: { default: null },
    },
    inclusive: false,
    parseDOM: [
      {
        tag: "a[href]",
        getAttrs(dom) {
          const el = dom as HTMLElement;
          return {
            href: el.getAttribute("href"),
            title: el.getAttribute("title"),
            reference: el.getAttribute("data-link-reference"),
            referenceCollapsed: el.getAttribute("data-link-reference-collapsed") === "true",
            anchor: el.getAttribute("data-anchor"),
          };
        },
      },
    ],
    toDOM(node) {
      const { href, title, reference, anchor } = node.attrs;
      const attrs: Record<string, string> = {
        href,
        class: "md-link",
        target: "_blank",
        rel: "noopener noreferrer",
      };
      if (title) attrs.title = title;
      if (reference) attrs["data-link-reference"] = reference;
      if (anchor) attrs["data-anchor"] = anchor;
      return ["a", attrs, 0];
    },
  },

  inline_math: {
    attrs: {
      formula: { default: "" },
    },
    excludes: "",
    parseDOM: [
      {
        tag: "span.md-inline-math",
        getAttrs: (dom) => ({
          formula: (dom as HTMLElement).getAttribute("data-formula") || "",
        }),
      },
    ],
    toDOM(node) {
      return ["span", { class: "md-inline-math", "data-formula": node.attrs.formula }, 0];
    },
  },
};

export const schema = new Schema({
  nodes,
  marks,
});
