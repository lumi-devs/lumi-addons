#!/usr/bin/env sh
# Link add-on(s) from this repository into Lumi v2's data/addons directory
# Usage:
#   sh scripts/link.sh [addon-name]
#   sh scripts/link.sh --all
set -eu

cd "$(dirname "$0")/.."

LUMI_PATH="${LUMI_PATH:-../lumi-v2}"
if [ ! -d "$LUMI_PATH" ] && [ -d "../Lumi" ]; then
  LUMI_PATH="../Lumi"
fi

if [ ! -f "$LUMI_PATH/package.json" ]; then
  echo "error: Lumi v2 directory not found at '$LUMI_PATH'." >&2
  echo "Set LUMI_PATH=/path/to/lumi-v2 or clone Lumi alongside lumi-addons." >&2
  exit 1
fi

DEST_DIR="$LUMI_PATH/data/addons"
mkdir -p "$DEST_DIR"

TARGET="${1:---all}"

link_one() {
  NAME="$1"
  if [ ! -f "$NAME/manifest.json" ]; then
    echo "Skipping non-addon '$NAME'"
    return
  fi
  ABS_SOURCE="$(pwd)/$NAME"
  rm -rf "$DEST_DIR/$NAME"
  ln -s "$ABS_SOURCE" "$DEST_DIR/$NAME"
  echo "Linked $NAME -> $DEST_DIR/$NAME"
}

if [ "$TARGET" = "--all" ]; then
  for dir in */; do
    d="${dir%/}"
    case "$d" in
      node_modules|scripts|.git|.github|.lumi) continue ;;
      *) link_one "$d" ;;
    esac
  done
  echo "All add-ons linked into $DEST_DIR."
else
  link_one "$TARGET"
fi
