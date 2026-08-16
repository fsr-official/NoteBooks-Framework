#!/usr/bin/env bash

# Exit immediately if a command fails
set -e

# Name of the output zip file
OUTPUT_ZIP="project_backup.zip"

# Remove old zip if it already exists
rm -f "$OUTPUT_ZIP"

echo "Creating zip archive: $OUTPUT_ZIP..."

# Create zip file while excluding common unwanted files/folders
zip -r "$OUTPUT_ZIP" . -x \
  "node_modules/*" \
  ".git/*" \
  "dist/*" \
  "build/*" \
  ".next/*" \
  "coverage/*" \
  "*.log" \
  ".DS_Store" \
  "*.zip" \
  "*.tar.gz" \
  ".env.local"\
  ".venv"

echo "Done! Archive saved to $OUTPUT_ZIP"