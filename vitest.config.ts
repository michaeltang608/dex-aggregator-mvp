// vitest.config.ts
import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    // 测试环境
    environment: "node",

    // 测试文件匹配模式
    include: ["**/*.t.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/build/**"],

    // 超时设置（用于网络请求等异步操作）
    testTimeout: 10000, // 10 seconds

    // TypeScript 配置
    globals: true, // 启用全局 API
    typecheck: {
      enabled: true, // 类型检查（可选）
    },

    // 覆盖率配置
    coverage: {
      provider: "v8", // 或 'istanbul'
      reporter: ["text", "json", "html"],
      exclude: ["**/node_modules/**", "**/test/**", "vitest.config.ts"],
    },

    // 路径别名（与你的 tsconfig.json 保持一致）
    alias: {
      "@": resolve(__dirname, "./src"),
      "@lib": resolve(__dirname, "./src/lib"),
    },
  },
});
