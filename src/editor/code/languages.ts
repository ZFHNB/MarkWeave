export interface LanguageOption {
  id: string; // highlight.js / lowlight 语言 id，或 "plaintext" / "mermaid"
  label: string; // 展示名
  aliases?: string[]; // 常见别名
}

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { id: "plaintext", label: "纯文本", aliases: ["text", "txt", "plain"] },
  { id: "mermaid", label: "Mermaid", aliases: ["diagram"] },
  { id: "javascript", label: "JavaScript", aliases: ["js", "jsx", "mjs", "cjs"] },
  { id: "typescript", label: "TypeScript", aliases: ["ts", "tsx", "mts", "cts"] },
  { id: "xml", label: "HTML/XML", aliases: ["html", "xhtml", "svg", "xml"] },
  { id: "css", label: "CSS", aliases: ["style"] },
  { id: "scss", label: "SCSS", aliases: ["sass"] },
  { id: "json", label: "JSON" },
  { id: "yaml", label: "YAML", aliases: ["yml"] },
  { id: "markdown", label: "Markdown", aliases: ["md", "mkd", "mkdn"] },
  { id: "bash", label: "Bash", aliases: ["sh", "shell", "zsh"] },
  { id: "python", label: "Python", aliases: ["py", "python3", "py3"] },
  { id: "java", label: "Java", aliases: ["jsp"] },
  { id: "c", label: "C", aliases: ["h"] },
  { id: "cpp", label: "C++", aliases: ["c++", "cc", "cxx", "hpp", "h++"] },
  { id: "csharp", label: "C#", aliases: ["c#", "cs", "c-sharp", "dotnet"] },
  { id: "go", label: "Go", aliases: ["golang"] },
  { id: "rust", label: "Rust", aliases: ["rs"] },
  { id: "sql", label: "SQL" },
  { id: "php", label: "PHP" },
  { id: "ruby", label: "Ruby", aliases: ["rb"] },
  { id: "kotlin", label: "Kotlin", aliases: ["kt", "kts"] },
  { id: "swift", label: "Swift" },
  { id: "objectivec", label: "Objective-C", aliases: ["objc", "obj-c"] },
  { id: "r", label: "R" },
  { id: "lua", label: "Lua" },
  { id: "perl", label: "Perl", aliases: ["pl", "pm"] },
  { id: "dockerfile", label: "Dockerfile", aliases: ["docker"] },
  { id: "diff", label: "Diff", aliases: ["patch"] },
  { id: "ini", label: "INI", aliases: ["toml"] },
  { id: "makefile", label: "Makefile", aliases: ["make", "mk"] },
  { id: "graphql", label: "GraphQL", aliases: ["gql"] },
  { id: "less", label: "Less" },
  { id: "wasm", label: "WebAssembly" },
];

const ALIAS_MAP: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  py: "python",
  py3: "python",
  python3: "python",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  html: "xml",
  xhtml: "xml",
  svg: "xml",
  xml: "xml",
  md: "markdown",
  mkd: "markdown",
  mkdn: "markdown",
  "c++": "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  "h++": "cpp",
  "c#": "csharp",
  cs: "csharp",
  "c-sharp": "csharp",
  yml: "yaml",
  yaml: "yaml",
  rb: "ruby",
  rs: "rust",
  kt: "kotlin",
  kts: "kotlin",
  docker: "dockerfile",
  golang: "go",
  objc: "objectivec",
  "obj-c": "objectivec",
  text: "plaintext",
  txt: "plaintext",
  plain: "plaintext",
  make: "makefile",
  mk: "makefile",
  gql: "graphql",
  patch: "diff",
  sass: "scss",
};

for (const lang of LANGUAGE_OPTIONS) {
  ALIAS_MAP[lang.id.toLowerCase()] = lang.id;
  if (lang.aliases) {
    for (const alias of lang.aliases) {
      const lower = alias.toLowerCase();
      if (!ALIAS_MAP[lower]) {
        ALIAS_MAP[lower] = lang.id;
      }
    }
  }
}

export function normalizeLanguage(input: string): string {
  if (!input || typeof input !== "string") {
    return "";
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }
  const token = trimmed.split(/\s+/)[0].toLowerCase();
  return ALIAS_MAP[token] ?? token;
}

export function getLanguageLabel(id: string): string {
  if (!id || typeof id !== "string") {
    return "";
  }
  const trimmed = id.trim();
  if (!trimmed) {
    return id;
  }
  const norm = normalizeLanguage(trimmed);
  const found = LANGUAGE_OPTIONS.find(
    (l) =>
      l.id.toLowerCase() === norm.toLowerCase() ||
      l.id.toLowerCase() === trimmed.toLowerCase()
  );
  if (found) {
    return found.label;
  }
  return id;
}

export function searchLanguages(query: string): LanguageOption[] {
  if (!query || typeof query !== "string") {
    return [...LANGUAGE_OPTIONS];
  }
  const q = query.trim().toLowerCase();
  if (!q) {
    return [...LANGUAGE_OPTIONS];
  }
  return LANGUAGE_OPTIONS.filter((opt) => {
    if (opt.id.toLowerCase().includes(q)) return true;
    if (opt.label.toLowerCase().includes(q)) return true;
    if (opt.aliases?.some((alias) => alias.toLowerCase().includes(q))) return true;
    return false;
  });
}
