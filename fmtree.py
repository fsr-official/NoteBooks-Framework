name: Update files.json

on:
  push:
    branches: ["**"]

jobs:
  fmtree:
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Run fmtree.py
        run: python fmtree.py

      - name: Commit files.json if changed
        run: |
          git config user.name  "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add files.json
          git diff --cached --quiet && echo "No changes" || git commit -m "chore: update files.json [skip ci]"
          git push