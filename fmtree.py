import argparse
import fnmatch
import hashlib
import json
import os
from pathlib import Path

EXCLUDED_ROOT_FILES = {
    "*.json",
    "fmtree.py",
    "index.html",
    "favicon.png",
    "manifest.json",
    "service-worker.js",
    "offline.html",
    "offline.png",
    "admins.json",
    "obsidian-md.js",
    "obsidian-markdown-it.js",
    "fallback.html",
    "autopush.sh",
    "installer.html",
    "package.json",
    "package-lock.json",
    "tree.txt",
    "zip.sh",
    "repo-registry.json",
}

EXCLUDED_ROOT_DIRS = {
    "src",
    "community",
    "waiting-list",
    "node_modules",
    "GH Fix",
    "public",
    "tests",
}

def parse_registry(markdown_path):
    """Convert the repository table in GITHUB-REPOSITORIES.md to JSON."""
    if not markdown_path.exists():
        return []

    rows = [line.strip() for line in markdown_path.read_text(encoding="utf-8").splitlines()
            if line.strip().startswith("|")]
    if len(rows) < 2:
        return []

    entries = []
    for row in rows[2:]:
        cells = [cell.strip() for cell in row.strip("|").split("|")]
        if len(cells) < 2 or not cells[0] or not cells[1]:
            continue
        name, repo = cells[:2]
        branch = cells[2] if len(cells) > 2 and cells[2] else "main"
        root = cells[3] if len(cells) > 3 else ""
        enabled = cells[4].lower() != "false" if len(cells) > 4 and cells[4] else True
        try:
            priority = int(cells[5]) if len(cells) > 5 and cells[5] else 999999
        except ValueError:
            priority = 999999
        pages = cells[6].lower() == "true" if len(cells) > 6 else False
        entries.append({"name": name, "repo": repo, "branch": branch, "root": root,
                        "enabled": enabled, "priority": priority, "pages": pages})
    return entries


def file_sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def is_excluded_root_file(name):
    return any(fnmatch.fnmatch(name, pattern) for pattern in EXCLUDED_ROOT_FILES)


def build_tree(path, rel_path=""):
    tree = []
    for name in sorted(os.listdir(path)):
        if name.startswith('.'):
            continue  # skip hidden
        full_path = os.path.join(path, name)
        rel_file_path = os.path.join(rel_path, name).replace("\\", "/")

        if os.path.isdir(full_path):
            if rel_path == "" and name in EXCLUDED_ROOT_DIRS:
                continue  # skip root-level directory exclusions
            tree.append({
                "type": "folder",
                "name": name,
                "path": rel_file_path,
                "children": build_tree(full_path, rel_file_path)
            })
        else:
            if rel_path == "" and is_excluded_root_file(name):
                continue  # skip root-level file exclusions
            tree.append({
                "type": "file",
                "name": name,
                "path": rel_file_path,
                "sha": file_sha256(Path(full_path)),
            })
    return tree

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate the local files manifest and repo registry.")
    parser.add_argument("--root", default=".", help="Directory to scan (default: current directory)")
    parser.add_argument("--output", default="files.json", help="Manifest output path")
    parser.add_argument("--registry", default="repo-registry.json", help="Generated registry output path")
    args = parser.parse_args()

    root_dir = Path(args.root).resolve()
    tree = {
        "type": "folder",
        "name": root_dir.name,
        "path": "",
        "children": build_tree(root_dir)
    }
    Path(args.output).write_text(json.dumps(tree, indent=2) + "\n", encoding="utf-8")

    registry = parse_registry(root_dir / "GITHUB-REPOSITORIES.md")
    Path(args.registry).write_text(json.dumps(registry, indent=2) + "\n", encoding="utf-8")
    print(f"✓ {args.output} generated ({len(tree['children'])} root entries).")
    print(f"✓ {args.registry} synchronized from GITHUB-REPOSITORIES.md ({len(registry)} repositories).")
