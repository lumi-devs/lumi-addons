/* eslint-env node */
// Requires a linked Lumi checkout — run `bun run setup` first (see scripts/setup.sh).
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  extends: ["@sapphire"],
  parserOptions: {
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname,
  },
  ignorePatterns: [".lumi", "node_modules", "*.cjs"],
  rules: {
    // Addons must be self-contained: no reaching into a sibling addon.
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["../../*/**"],
            message:
              "Cross-addon import detected. An addon may only import from its own folder or Lumi core aliases (#core/*, #utilities/*, #lib/*).",
          },
        ],
      },
    ],
  },
};
