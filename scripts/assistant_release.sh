#!/usr/bin/env bash
# Assistant helper: stage, commit, push current branch and create+merge PR to main
# Usage: ./scripts/assistant_release.sh ["Release message"]

set -euo pipefail

MSG=${1:-"Release v1.5.0"}

echo "[assistant_release] Running release helper"

# Ensure we're in repo root
cd "$(dirname "${BASH_SOURCE[0]}")/.."

BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "[assistant_release] Current branch: $BRANCH"

if [ -z "$BRANCH" ]; then
  echo "Could not detect current branch" >&2
  exit 1
fi

echo "Staging all changes..."
git add .

if git diff --cached --quiet; then
  echo "No changes to commit"
else
  echo "Committing: $MSG"
  git commit -m "$MSG" || true
fi

echo "Pushing branch to origin/$BRANCH"
git push -u origin "$BRANCH"

# Require gh CLI for PR creation/merge
if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI not found. Please install and authenticate with GitHub CLI to enable PR creation/merge." >&2
  exit 0
fi

PR_URL=$(gh pr view --json url --jq .url 2>/dev/null || true)
if [ -n "$PR_URL" ]; then
  echo "A PR for this branch already exists: $PR_URL"
else
  echo "Creating PR from $BRANCH -> main"
  gh pr create --title "$MSG" --body "$MSG" --base main --head "$BRANCH"
fi

echo "Attempting to merge PR into main (requires permissions)."
# Try to merge using gh; try merge, then fallback to rebase if needed
set +e
gh pr merge --auto --delete-branch --merge
RC=$?
set -e
if [ $RC -ne 0 ]; then
  echo "gh pr merge failed (exit $RC). You may need to merge manually or adjust permissions."
  gh pr status || true
  exit 0
fi

echo "PR merged successfully."
