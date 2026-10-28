/**
 * 文件树与快速打开所需的纯逻辑（不依赖 DOM / Electron），便于单元测试。
 */

export interface FileTreeNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: FileTreeNode[];
  size?: number;
  mtime?: number;
}

export interface FlatFile {
  name: string;
  path: string;
  relativePath: string;
}

export type SortMode =
  | "name-asc"
  | "name-desc"
  | "mtime-asc"
  | "mtime-desc"
  | "natural-asc"
  | "natural-desc";

/** 把扁平的路径列表构建成可折叠的文件树 */
export function buildFileTree(files: FileTreeNode[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];
  const folders = new Map<string, FileTreeNode>();

  const sorted = [...files].sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name, "zh-Hans-CN", { numeric: true });
  });

  for (const entry of sorted) {
    const parts = entry.path.replace(/\\/g, "/").split("/").filter(Boolean);
    let current = root;
    let prefix = "";

    for (let i = 0; i < parts.length - 1; i++) {
      prefix = prefix ? `${prefix}/${parts[i]}` : parts[i];
      let folder = folders.get(prefix);
      if (!folder) {
        folder = { name: parts[i], path: prefix, type: "folder", children: [] };
        folders.set(prefix, folder);
        current.push(folder);
      }
      current = folder.children!;
    }

    current.push({ ...entry, name: parts[parts.length - 1] });
  }

  return root;
}

/** 自然排序比较（数字按数值） */
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });
}

export function sortFiles(files: FlatFile[], mode: SortMode): FlatFile[] {
  const sorted = [...files];
  sorted.sort((a, b) => {
    switch (mode) {
      case "name-asc":
        return a.name.localeCompare(b.name);
      case "name-desc":
        return b.name.localeCompare(a.name);
      case "natural-asc":
        return naturalCompare(a.name, b.name);
      case "natural-desc":
        return naturalCompare(b.name, a.name);
      default:
        return naturalCompare(a.name, b.name);
    }
  });
  return sorted;
}

/** 模糊匹配：按顺序包含字符即命中，返回评分（越小越靠前） */
export function fuzzyScore(query: string, target: string): number | null {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  let qi = 0;
  let score = 0;
  let lastIndex = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      // 连续匹配加分，起始/分隔符后匹配加分
      const isBoundary = ti === 0 || "/\\-_. ".includes(t[ti - 1]);
      if (lastIndex === ti - 1) score -= 2;
      if (isBoundary) score -= 3;
      score += ti - lastIndex;
      lastIndex = ti;
      qi++;
    }
  }
  if (qi < q.length) return null;
  // 越短的目标越优先
  return score + target.length * 0.1;
}

export interface QuickOpenOptions {
  limit?: number;
}

export function quickOpen(
  files: FlatFile[],
  query: string,
  options: QuickOpenOptions = {}
): FlatFile[] {
  const limit = options.limit ?? 50;
  if (!query.trim()) {
    return files.slice(0, limit);
  }

  const scored: { file: FlatFile; score: number }[] = [];
  for (const file of files) {
    const byName = fuzzyScore(query, file.name);
    const byPath = fuzzyScore(query, file.relativePath);
    const score = byName !== null ? byName : byPath !== null ? byPath + 8 : null;
    if (score !== null) scored.push({ file, score });
  }

  scored.sort((a, b) => a.score - b.score || naturalCompare(a.file.name, b.file.name));
  return scored.slice(0, limit).map((entry) => entry.file);
}

export interface RecentEntry {
  path: string;
  title: string;
  openedAt: number;
}

const MAX_RECENT = 20;

export function addRecent(list: RecentEntry[], entry: RecentEntry): RecentEntry[] {
  const filtered = list.filter((item) => item.path !== entry.path);
  return [entry, ...filtered].slice(0, MAX_RECENT);
}

export function clearRecent(): RecentEntry[] {
  return [];
}
