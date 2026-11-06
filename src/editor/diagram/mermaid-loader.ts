/**
 * Mermaid 的按需加载入口。
 *
 * mermaid 会连带引入 cytoscape、elk 等体积较大的依赖（合计约 2MB），
 * 静态 import 会让首屏必须等它们下载并解析完才能显示。
 * 这里改为首次真正渲染图表时才加载，文档里没有图表就不会付出这份成本。
 */

type MermaidModule = typeof import("mermaid").default;

let mermaidPromise: Promise<MermaidModule> | null = null;

export function loadMermaid(): Promise<MermaidModule> {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((mod) => mod.default);
  }
  return mermaidPromise;
}

/** 供测试重置加载状态 */
export function resetMermaidLoader(): void {
  mermaidPromise = null;
}
