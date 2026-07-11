// 責務: vitest設定（全パッケージ横断でテストを検出する）
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "tools/*/src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    // sliceの世界シム（大規模化された部隊・多正面戦争）は既定の5秒では収まらないため延長
    testTimeout: 30000,
  },
});
