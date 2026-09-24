import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/__tests__/setup.ts"],
    // Plasmo 的 tsconfig 引用了 .plasmo/index.d.ts（dev 时才生成），
    // Vitest 启动时读不到会报类型错误，跳过它。
    server: {
      fs: {
        strict: false
      }
    }
  }
})
