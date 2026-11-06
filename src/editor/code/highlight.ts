import { common, createLowlight } from "lowlight";
import type { Root, RootContent } from "hast";
import { normalizeLanguage } from "./languages";

export interface TokenRange {
  start: number;
  end: number;
  classes: string[]; // 例如 ["hljs-keyword"]
}

const lowlight = createLowlight(common);

const MAX_CACHE_SIZE = 200;
const cache = new Map<string, TokenRange[]>();

function getFromCache(key: string): TokenRange[] | undefined {
  if (!cache.has(key)) return undefined;
  const val = cache.get(key)!;
  cache.delete(key);
  cache.set(key, val);
  return val;
}

function setToCache(key: string, val: TokenRange[]): void {
  if (cache.has(key)) {
    cache.delete(key);
  } else if (cache.size >= MAX_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
    }
  }
  cache.set(key, val);
}

export function tokenizeCode(code: string, language: string): TokenRange[] {
  if (typeof code !== "string" || code.length === 0) {
    return [];
  }

  const langKey = typeof language === "string" ? language : "";
  const cacheKey = `${langKey}\0${code}`;

  const cached = getFromCache(cacheKey);
  if (cached) {
    return cached;
  }

  const normalized = normalizeLanguage(langKey);
  if (
    !normalized ||
    normalized === "plaintext" ||
    normalized === "mermaid" ||
    !lowlight.registered(normalized)
  ) {
    setToCache(cacheKey, []);
    return [];
  }

  try {
    const tree = lowlight.highlight(normalized, code);
    const ranges: TokenRange[] = [];
    let offset = 0;

    function walk(node: Root | RootContent): void {
      if (!node) return;
      if (node.type === "text") {
        offset += node.value.length;
        return;
      }
      if (node.type === "element") {
        const start = offset;
        const rawClass = node.properties?.className as unknown;
        let classes: string[] = [];
        if (Array.isArray(rawClass)) {
          classes = rawClass.map(String).filter(Boolean);
        } else if (typeof rawClass === "string") {
          classes = rawClass.split(/\s+/).filter(Boolean);
        }

        if (node.children) {
          for (const child of node.children) {
            walk(child);
          }
        }
        const end = offset;
        if (start < end && classes.length > 0) {
          ranges.push({ start, end, classes });
        }
        return;
      }
      if (node.type === "root" && node.children) {
        for (const child of node.children) {
          walk(child);
        }
      }
    }

    walk(tree);
    ranges.sort((a, b) => a.start - b.start || a.end - b.end);

    setToCache(cacheKey, ranges);
    return ranges;
  } catch {
    setToCache(cacheKey, []);
    return [];
  }
}
