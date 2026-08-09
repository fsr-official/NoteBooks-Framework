import argparse
import concurrent.futures
import fnmatch
import hashlib
import json
import os
from pathlib import Path

EXCLUDED_ROOT_FILES = {
    "*.json",
    "dist",
    "api",
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

ALLOWED_EXTENSIONS = {'.md', '.txt', '.pdf'}

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
        for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def is_excluded_root_file(name):
    return any(fnmatch.fnmatch(name, pattern) for pattern in EXCLUDED_ROOT_FILES)


def is_allowed_file(name):
    return Path(name).suffix.lower() in ALLOWED_EXTENSIONS


def build_tree(path, rel_path="", executor=None):
    tree = []
    with os.scandir(path) as it:
        entries = [entry for entry in it if not entry.name.startswith('.')]

    for entry in sorted(entries, key=lambda e: e.name):
        full_path = entry.path
        rel_file_path = os.path.join(rel_path, entry.name).replace("\\", "/")

        if entry.is_dir(follow_symlinks=False):
            if rel_path == "" and entry.name in EXCLUDED_ROOT_DIRS:
                continue  # skip root-level directory exclusions
            tree.append({
                "type": "folder",
                "name": entry.name,
                "path": rel_file_path,
                "children": build_tree(full_path, rel_file_path, executor)
            })
        elif entry.is_file(follow_symlinks=False):
            if not is_allowed_file(entry.name):
                continue  # only include allowed file types
            node = {
                "type": "file",
                "name": entry.name,
                "path": rel_file_path,
                "sha": None,
            }
            if executor is not None:
                node["_sha_future"] = executor.submit(file_sha256, Path(full_path))
            else:
                node["sha"] = file_sha256(Path(full_path))
            tree.append(node)
    return tree


def resolve_file_hashes(tree):
    for node in tree:
        if node["type"] == "folder":
            resolve_file_hashes(node["children"])
        elif node["type"] == "file":
            future = node.pop("_sha_future", None)
            if future is not None:
                node["sha"] = future.result()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate the local files manifest and repo registry.")
    parser.add_argument("--root", default=".", help="Directory to scan (default: current directory)")
    parser.add_argument("--output", default="files.json", help="Manifest output path")
    parser.add_argument("--registry", default="repo-registry.json", help="Generated registry output path")
    args = parser.parse_args()

    root_dir = Path(args.root).resolve()
    with concurrent.futures.ThreadPoolExecutor(max_workers=os.cpu_count() or 4) as executor:
        tree = {
            "type": "folder",
            "name": root_dir.name,
            "path": "",
            "children": build_tree(root_dir, executor=executor)
        }
        resolve_file_hashes(tree["children"])

    Path(args.output).write_text(json.dumps(tree, indent=2) + "\n", encoding="utf-8")

    registry = parse_registry(root_dir / "GITHUB-REPOSITORIES.md")
    Path(args.registry).write_text(json.dumps(registry, indent=2) + "\n", encoding="utf-8")
    print(f"✓ {args.output} generated ({len(tree['children'])} root entries).")
    print(f"✓ {args.registry} synchronized from GITHUB-REPOSITORIES.md ({len(registry)} repositories).")
