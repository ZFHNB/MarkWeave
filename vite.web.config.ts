import { defineConfig } from "vite";

/**
 * Web 版（参赛形态）的构建配置。
 *
 * 与桌面版的默认配置分开，原因：
 * - base 用相对路径，产物可部署在任意子目录（Qoder Sites 很可能不是根路径）
 * - 根目录指向 web/，不装配 Electron 壳层
 *
 * 用法：
 *   npx vite build --config vite.web.config.ts
 *   npx vite preview --config vite.web.config.ts
 *   npx vite --config vite.web.config.ts     # 开发
 */
export default defineConfig({
  root: "./web",
  base: "./",
  build: {
    outDir: "../dist-web",
    emptyOutDir: true,
    // 桌面版同样存在的体积问题：Mermaid 相关依赖偏大，
    // 单块告警调到 1600KB 以免噪声掩盖真正的问题
    chunkSizeWarningLimit: 1600,
  },
});
