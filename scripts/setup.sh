#!/usr/bin/env sh
# Link this addons repo against a local Lumi v2 checkout so typecheck/lint work.
#
#   LUMI_PATH=/path/to/lumi-v2 ./scripts/setup.sh
#   ./scripts/setup.sh                      # defaults to ../lumi-v2
#
# Creates two gitignored symlinks:
#   .lumi        -> the Lumi v2 checkout (tsconfig paths resolve @lumi/* through it)
#   node_modules -> .lumi/node_modules (bare imports: discord.js, zod, ...)
set -eu

cd "$(dirname "$0")/.."

LUMI_PATH="${LUMI_PATH:-../lumi-v2}"

if [ ! -f "$LUMI_PATH/packages/module-kit/package.json" ]; then
  echo "error: no Lumi v2 checkout at '$LUMI_PATH'." >&2
  echo "Clone https://github.com/lumi-devs/Lumi (branch v2/develop) next to this repo," >&2
  echo "or point LUMI_PATH at an existing checkout." >&2
  exit 1
fi

if [ ! -d "$LUMI_PATH/node_modules" ]; then
  echo "error: '$LUMI_PATH' has no node_modules - run 'nix develop --command bun install' there first." >&2
  exit 1
fi

LUMI_ABS=$(cd "$LUMI_PATH" && pwd)

rm -f .lumi node_modules
ln -s "$LUMI_ABS" .lumi
ln -s .lumi/node_modules node_modules

echo "Linked against $LUMI_ABS"
echo "Now run: nix develop --command bun run typecheck"
