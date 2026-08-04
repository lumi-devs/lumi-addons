#!/usr/bin/env sh
# Link this addons repo against a local Lumi checkout so typecheck/lint work.
#
#   LUMI_PATH=/path/to/lumi ./scripts/setup.sh      # explicit
#   ./scripts/setup.sh                              # defaults to ../lumi
#
# Creates two gitignored symlinks:
#   .lumi        -> the Lumi checkout (tsconfig paths resolve "lumi"/"lumi/*" through it)
#   node_modules -> .lumi/node_modules (bare imports: discord.js, @sapphire/*, ...)
#
# Addon code imports the public SDK via the bare "lumi" / "lumi/*" specifiers
# (see packages/core/src/lib/addon-sdk in the Lumi checkout), which real
# installs resolve through a node_modules/lumi symlink that Lumi's Downloader
# creates automatically. That's why package.json no longer needs an "imports"
# map: there's nothing left to resolve except "lumi" itself. Since
# node_modules here is just a symlink into the Lumi checkout's own
# node_modules, we drop a matching "lumi" self-link in there too, so Bun can
# resolve it when running/typechecking addon files standalone from this repo.
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

# Self-link so bare "lumi" imports resolve at runtime, mirroring the symlink
# Lumi's Downloader creates for installed addons in production.
ln -sfn "$LUMI_ABS" node_modules/lumi

echo "Linked against $LUMI_ABS"
echo "Now run: bun run typecheck"
