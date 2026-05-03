import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src")
    },
    // jsdom 环境下 window 存在，让 @tiptap/html 等条件式 export 选 browser 入口
    conditions: ["browser"]
  },
  test: {
    environment: "jsdom",
    include: ["src/**/__tests__/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/__tests__/**",
        "src/**/*.d.ts",
        "src/**/index.ts",
        "src/i18n/locales/**",
        "src/background/**",
        "src/content/**",
        "src/popup/**"
      ]
    }
  }
});
