import { Schema, type NodeSpec, type MarkSpec } from "prosemirror-model";

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
    },
    inclusive: false,
    parseDOM: [
      {
        tag: "a[href]",
        getAttrs(dom) {
          const el = dom as HTMLElement;
          return { href: el.getAttribute("href"), title: el.getAttribute("title") };
        },
      },
    ],
    toDOM(node) {
      const { href, title } = node.attrs;
      return ["a", { href, title, class: "md-link", target: "_blank", rel: "noopener noreferrer" }, 0];
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
