interface MdLike {
  block: {
    ruler: {
      before(
        beforeName: string,
        ruleName: string,
        rule: (state: any, startLine: number, endLine: number, silent: boolean) => boolean,
        options?: { alt?: string[] }
      ): void;
    };
  };
  inline: {
    ruler: {
      before(beforeName: string, ruleName: string, rule: (state: any, silent: boolean) => boolean): void;
    };
  };
  renderer: {
    rules: Record<string, (tokens: any[], idx: number, options: any, env: any, self: any) => string>;
  };
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function frontMatterRule(state: any, startLine: number, endLine: number, silent: boolean): boolean {
  if (startLine !== 0) return false;
  const first = state.bMarks[startLine] + state.tShift[startLine];
  const firstEnd = state.eMarks[startLine];
  const firstLine = state.src.slice(first, firstEnd).trim();
  if (firstLine !== "---") return false;

  // 找到闭合的 ---
  let nextLine = startLine + 1;
  let closingLine = -1;
  for (; nextLine < endLine; nextLine++) {
    const s = state.bMarks[nextLine] + state.tShift[nextLine];
    const e = state.eMarks[nextLine];
    const line = state.src.slice(s, e).trim();
    if (line === "---" || line === "...") {
      closingLine = nextLine;
      break;
    }
  }
  if (closingLine === -1) return false;

  if (silent) return true;

  const contentStart = state.eMarks[startLine] + 1;
  const contentEnd = state.bMarks[closingLine];
  const content = state.src.slice(contentStart, contentEnd).replace(/\n$/, "");

  const token = state.push("yaml_frontmatter", "div", 0);
  token.meta = { content };
  token.block = true;
  token.map = [startLine, closingLine + 1];

  state.line = closingLine + 1;
  return true;
}

function tocRule(state: any, startLine: number, _endLine: number, silent: boolean): boolean {
  const start = state.bMarks[startLine] + state.tShift[startLine];
  const end = state.eMarks[startLine];
  const line = state.src.slice(start, end).trim();
  if (!/^\[toc\]$/i.test(line)) return false;
  if (silent) return true;

  const token = state.push("toc_block", "div", 0);
  token.block = true;
  token.map = [startLine, startLine + 1];
  state.line = startLine + 1;
  return true;
}

function footnoteDefinitionRule(state: any, startLine: number, endLine: number, silent: boolean): boolean {
  const start = state.bMarks[startLine] + state.tShift[startLine];
  const end = state.eMarks[startLine];
  const line = state.src.slice(start, end);
  const match = /^\[\^([^\]\s]+)\]:\s*(.*)$/.exec(line);
  if (!match) return false;
  if (silent) return true;

  const id = match[1];
  const firstContent = match[2];

  // 收集后续缩进续行
  const lines: string[] = [];
  let nextLine = startLine + 1;
  let lastLine = startLine;
  while (nextLine < endLine) {
    const s = state.bMarks[nextLine] + state.tShift[nextLine];
    const e = state.eMarks[nextLine];
    const raw = state.src.slice(state.bMarks[nextLine], e);
    if (raw.trim() === "") {
      lines.push("");
      nextLine++;
      continue;
    }
    if (!/^\s{2,}/.test(raw)) break;
    lines.push(state.src.slice(s, e));
    lastLine = nextLine;
    nextLine++;
  }

  const content = [firstContent, ...lines].join("\n").trimEnd();

  const token = state.push("footnote_definition", "div", 0);
  token.block = true;
  token.meta = { id, content };
  token.map = [startLine, lastLine + 1];
  state.line = lastLine + 1;
  return true;
}

function footnoteRefRule(state: any, silent: boolean): boolean {
  const start = state.pos;
  const src = state.src;
  if (src[start] !== "[" || src[start + 1] !== "^") return false;

  const close = src.indexOf("]", start + 2);
  if (close === -1) return false;
  const id = src.slice(start + 2, close);
  if (!id || /\s/.test(id)) return false;

  if (!silent) {
    const token = state.push("footnote_ref", "sup", 0);
    token.meta = { id };
    token.content = id;
  }
  state.pos = close + 1;
  return true;
}

export function applyTyporaBlockRules(md: MdLike): MdLike {
  md.block.ruler.before("hr", "typora_front_matter", frontMatterRule, {
    alt: ["paragraph", "reference", "blockquote", "list"],
  });
  md.block.ruler.before("paragraph", "typora_toc", tocRule);
  md.block.ruler.before("reference", "typora_footnote_definition", footnoteDefinitionRule, {
    alt: ["paragraph", "reference"],
  });
  md.inline.ruler.before("link", "typora_footnote_ref", footnoteRefRule);

  md.renderer.rules.yaml_frontmatter = (tokens, idx) => {
    const content = tokens[idx].meta?.content || "";
    const encoded = encodeURIComponent(content);
    return `<div class="md-yaml-frontmatter" data-yaml="${encoded}"></div>\n`;
  };

  md.renderer.rules.toc_block = () => `<div class="md-toc-block" data-toc="true"></div>\n`;

  md.renderer.rules.footnote_definition = (tokens, idx) => {
    const meta = tokens[idx].meta || {};
    const encoded = encodeURIComponent(meta.content || "");
    return `<div class="md-footnote-def" data-footnote-id="${escapeHtml(
      meta.id || ""
    )}" data-content="${encoded}"></div>\n`;
  };

  md.renderer.rules.footnote_ref = (tokens, idx) => {
    const id = tokens[idx].meta?.id || "";
    return `<sup class="md-footnote-ref" data-footnote-id="${escapeHtml(id)}">${escapeHtml(
      id
    )}</sup>`;
  };

  return md;
}
