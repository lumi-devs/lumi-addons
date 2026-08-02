#!/usr/bin/env sh
# Link this addons repo against a local Lumi checkout so typecheck/lint work.
#
#   LUMI_PATH=/path/to/lumi ./scripts/setup.sh      # explicit
#   ./scripts/setup.sh                              # defaults to ../lumi
#
# Creates two gitignored symlinks:
#   .lumi        -> the Lumi checkout (tsconfig paths resolve #core/* etc. through it)
#   node_modules -> .lumi/node_modules (bare imports: discord.js, @sapphire/*, ...)
set -eu

cd "$(dirname "$0")/.."

LUMI_PATH="${LUMI_PATH:-../lumi}"

if [ ! -f "$LUMI_PATH/packages/core/package.json" ]; then
  echo "error: no Lumi checkout at '$LUMI_PATH'." >&2
  echo "Clone https://github.com/lumi-devs/lumi next to this repo," >&2
  echo "or point LUMI_PATH at an existing checkout." >&2
  exit 1
fi

if [ ! -d "$LUMI_PATH/node_modules" ]; then
  echo "error: '$LUMI_PATH' has no node_modules — run 'bun install' there first." >&2
  exit 1
fi

LUMI_ABS=$(cd "$LUMI_PATH" && pwd)

rm -f .lumi node_modules
ln -s "$LUMI_ABS" .lumi
ln -s .lumi/node_modules node_modules

echo "Linked against $LUMI_ABS"
echo "Now run: bun run typecheck"
