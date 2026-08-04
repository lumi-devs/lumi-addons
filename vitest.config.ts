import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["*/**/*.test.ts"],
    exclude: ["**/node_modules/**", ".lumi/**", "lumi-core/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      include: ["*/lib/**/*.ts"],
      exclude: ["*/lib/**/*.test.ts"],
    },
  },
});
