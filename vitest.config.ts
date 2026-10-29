import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "jsdom",
    globals: false,
    // 允许测试断言打包后的 CSS 文本（`?inline` 导入）
    css: true,
  },
});
