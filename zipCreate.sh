#!/usr/bin/env bash
#
# zipCreate.sh — zip only the "important" files in this repo: source,
# config, and docs. Skips vendored deps, build output, logs, and the
# archive/ snapshots.
#
# Usage:
#   ./zipCreate.sh [output.zip]
#
# EXCLUDE_DIRS and EXCLUDE_FILE_GLOBS below are the single source of truth
# for what's left out — no exclusion logic lives anywhere else in this
# script. Add/remove entries there, nothing else needs to change.

set -euo pipefail

OUTPUT_ZIP="${1:-project-src.zip}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# Directory names pruned wherever they appear in the tree (any depth).
EXCLUDE_DIRS=(
  node_modules
  dist
  archive
  .git
  logs
  tmp
  coverage
  .vercel
  archive
)

# Filename globs skipped wherever they appear (matched against basename).
EXCLUDE_FILE_GLOBS=(
  "*.log"
  "*.zip"
  "*.har"
  ".DS_Store"
)

# ---- build the `find -prune` expression from EXCLUDE_DIRS ----------------

prune_expr=()
for dir in "${EXCLUDE_DIRS[@]}"; do
  prune_expr+=(-o -type d -name "$dir")
done
prune_expr=("${prune_expr[@]:1}")   # drop the leading -o

# ---- collect the file list -------------------------------------------

file_list="$(mktemp)"
trap 'rm -f "$file_list"' EXIT

find . \( "${prune_expr[@]}" \) -prune -o -type f -print | while IFS= read -r f; do
  base="$(basename "$f")"
  skip=false
  for glob in "${EXCLUDE_FILE_GLOBS[@]}"; do
    # shellcheck disable=SC2254
    case "$base" in
      $glob) skip=true; break ;;
    esac
  done
  [ "$skip" = false ] && printf '%s\n' "$f"
done > "$file_list"

# ---- zip it -------------------------------------------------------------

rm -f "$OUTPUT_ZIP"
zip -q "$OUTPUT_ZIP" -@ < "$file_list"

count="$(wc -l < "$file_list" | tr -d ' ')"
echo "Created $OUTPUT_ZIP ($count files)"
echo "Excluded dirs:  ${EXCLUDE_DIRS[*]}"
echo "Excluded globs: ${EXCLUDE_FILE_GLOBS[*]}"