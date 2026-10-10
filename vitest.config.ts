import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@lumi\/lib\/(.*)\.js$/,
        replacement: new URL("./.lumi/packages/core/src/lib/$1.ts", import.meta.url).pathname,
      },
      {
        find: /^@lumi\/lib\/(.*)$/,
        replacement: new URL("./.lumi/packages/core/src/lib/$1", import.meta.url).pathname,
      },
    ],
  },
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
