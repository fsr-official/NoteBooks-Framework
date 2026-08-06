import os
import json

EXCLUDED_ROOT_FILES = {
    "files.json",
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
    "zip.sh"
}

EXCLUDED_ROOT_DIRS = {
    "src",
    "community",
    "waiting-list",
    "node_modules",
    "GH Fix"
}

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
                "children": build_tree(full_path, rel_file_path)
            })
        else:
            if rel_path == "" and name in EXCLUDED_ROOT_FILES:
                continue  # skip root-level file exclusions
            tree.append({
                "type": "file",
                "name": name,
                "path": rel_file_path
            })
    return tree

if __name__ == "__main__":
    root_dir = "."  # start from current directory
    tree = {
        "type": "folder",
        "name": os.path.basename(os.path.abspath(root_dir)),
        "children": build_tree(root_dir)
    }
    with open("files.json", "w", encoding="utf-8") as f:
        json.dump(tree, f, indent=2)
    print("✓ files.json generated.")
