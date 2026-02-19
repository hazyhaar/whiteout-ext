import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["__tests__/e2e/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@whiteout/core": resolve(__dirname, "../core/src"),
    },
  },
});
