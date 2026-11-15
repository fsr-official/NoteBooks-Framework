#!/usr/bin/env python3
"""Generate files.json with Git blob SHAs for repository content files."""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import re
import subprocess
import tempfile
from pathlib import Path
from typing import Iterable

SKIP_DIRECTORIES = {
    ".git",
    ".venv",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    "node_modules",
    ".github",
    ".vscode",
    ".vercel",
    "api",
    "public",
    "src",
    "tests",
    "scripts",
}

ALLOWED_FILE_SUFFIXES = {
    ".md",
    ".markdown",
    ".txt",
    ".rtf",
    ".pdf",
    ".doc",
    ".docx",
    ".ppt",
    ".pptx",
    ".xls",
    ".xlsx",
    ".csv",
    ".odt",
    ".odp",
    ".ods",
    ".epub",
}

SECTION_ORDER = {
    "GLOSSARY": 0,
    "NOTES": 1,
    "CNOTES": 2,
}

SECTION_EMOJI = {
    "GLOSSARY": "📒",
    "NOTES": "📓",
    "CNOTES": "📔",
}


def run_git(root: Path, *arguments: str) -> str:
    result = subprocess.run(
        ["git", *arguments],
        cwd=root,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def repository_name(root: Path) -> str:
    try:
        remote = run_git(root, "config", "--get", "remote.origin.url")
    except (OSError, subprocess.CalledProcessError):
        return root.name

    match = re.search(r"(?:/|:)([^/:]+?)(?:\.git)?$", remote.rstrip("/"))
    return match.group(1) if match else root.name


def blob_sha(root: Path, path: Path) -> str:
    return run_git(root, "hash-object", "--", str(path))


def relative_path(root: Path, path: Path) -> str:
    return path.relative_to(root).as_posix()


def is_allowed_file(path: Path) -> bool:
    return path.suffix.lower() in ALLOWED_FILE_SUFFIXES


def manifest_name(name: str) -> str:
    suffix = Path(name).suffix
    stem = name[: -len(suffix)] if suffix else name
    upper_stem = stem.upper()
    for label, emoji in SECTION_EMOJI.items():
        if upper_stem == label or upper_stem.endswith(f"-{label}") or upper_stem.endswith(f"_{label}"):
            return f"{emoji} {name}"
    return name


def child_sort_key(path: Path) -> tuple[int, str]:
    suffix = path.suffix
    stem = path.name[: -len(suffix)] if suffix else path.name
    upper_stem = stem.upper()
    for label, index in SECTION_ORDER.items():
        if upper_stem == label or upper_stem.endswith(f"-{label}") or upper_stem.endswith(f"_{label}"):
            return (index, path.name.casefold())
    return (len(SECTION_ORDER), path.name.casefold())


def file_entry(root: Path, path: Path) -> dict[str, str]:
    mime, _ = mimetypes.guess_type(path.name)
    return {
        "type": "file",
        "name": manifest_name(path.name),
        "path": relative_path(root, path),
        "sha": blob_sha(root, path),
        "mime": mime or "application/octet-stream",
    }


def iter_children(root: Path, directory: Path, output_path: Path) -> Iterable[Path]:
    try:
        children = sorted(directory.iterdir(), key=child_sort_key)
    except OSError as exc:
        raise RuntimeError(f"Unable to read directory: {directory}") from exc

    for child in children:
        if child.name in SKIP_DIRECTORIES or child.is_symlink():
            continue
        if child.is_dir():
            yield child
        elif child.is_file() and is_allowed_file(child):
            try:
                if child.resolve() != output_path:
                    yield child
            except OSError as exc:
                raise RuntimeError(f"Unable to inspect path: {child}") from exc


def build_tree(root: Path, directory: Path, output_path: Path) -> list[dict[str, object]]:
    children: list[dict[str, object]] = []
    for child in iter_children(root, directory, output_path):
        if child.is_dir():
            children.append(
                {
                    "type": "folder",
                    "name": manifest_name(child.name),
                    "children": build_tree(root, child, output_path),
                }
            )
        else:
            children.append(file_entry(root, child))
    return children


def write_manifest(output_path: Path, payload: dict[str, object]) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{output_path.name}.",
        suffix=".tmp",
        dir=output_path.parent,
        text=True,
    )
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(payload, handle, indent=2, ensure_ascii=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_name, output_path)
    except Exception:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        raise


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate a repository-local files.json manifest")
    parser.add_argument(
        "--root",
        default=str(Path.cwd()),
        help="Repository root to scan (default: current working directory)",
    )
    parser.add_argument(
        "--out",
        "--output",
        dest="out",
        default=None,
        help="Output path (default: files.json in the selected root)",
    )
    parser.add_argument("--name", dest="display_name", default=None, help="Manifest root display name")
    parser.add_argument(
        "--flatten-root",
        action="store_true",
        help="Emit the root's children directly when it contains a single folder",
    )
    args = parser.parse_args()

    root = Path(args.root).expanduser().resolve()
    if not root.is_dir():
        raise SystemExit(f"Repository root is not a directory: {root}")
    output_path = Path(args.out or (root / "files.json")).expanduser().resolve()
    if output_path == root:
        raise SystemExit("--out must identify a file, not the repository directory")

    name = args.display_name or repository_name(root)
    if not name:
        raise SystemExit("Could not determine a repository name")

    children = build_tree(root, root, output_path)
    if args.flatten_root and len(children) == 1 and children[0].get("type") == "folder":
        payload = {
            **children[0],
            "name": args.display_name or children[0].get("name", name),
        }
    else:
        payload = {
            "type": "folder",
            "name": name,
            "children": children,
        }
    write_manifest(output_path, payload)
    print(f"files.json generated for {name} at {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
