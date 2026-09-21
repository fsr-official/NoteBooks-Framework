#!/usr/bin/env python3
"""Generate a repository-local files.json manifest for document-like content only."""

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

ROOT = Path(__file__).resolve().parent

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
    "tests",
    "docs",
    "scripts"
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

SKIP_FILE_SUFFIXES = {
    ".py",
    ".pyw",
    ".json",
    ".yaml",
    ".yml",
    ".toml",
    ".ini",
    ".cfg",
    ".lock",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".css",
    ".scss",
    ".sass",
    ".html",
    ".htm",
    ".xml",
    ".svg",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".ico",
    ".sh",
    ".bash",
    ".zsh",
    ".ps1",
}


def run_git(*arguments: str) -> str:
    """Run a Git command in the repository and return trimmed stdout."""
    result = subprocess.run(
        ["git", *arguments],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def repository_name() -> str:
    """Return the repository name from origin, falling back to the directory."""
    try:
        remote = run_git("config", "--get", "remote.origin.url")
    except (OSError, subprocess.CalledProcessError):
        return ROOT.name

    remote = remote.rstrip("/")
    remote_name = re.search(r"/([^/]+?)(?:\.git)?$", remote)
    if remote_name:
        return remote_name.group(1)

    ssh_name = re.search(r":([^/:]+?)(?:\.git)?$", remote)
    return ssh_name.group(1) if ssh_name else ROOT.name


def blob_sha(path: Path) -> str:
    """Return Git's blob SHA, matching the SHA exposed by GitHub."""
    return run_git("hash-object", "--", str(path))


def relative_path(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def is_allowed_file(path: Path) -> bool:
    suffix = path.suffix.lower()
    return suffix in ALLOWED_FILE_SUFFIXES and suffix not in SKIP_FILE_SUFFIXES


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


def file_entry(path: Path) -> dict[str, str]:
    mime, _ = mimetypes.guess_type(path.name)
    return {
        "type": "file",
        "name": manifest_name(path.name),
        "path": relative_path(path),
        "sha": blob_sha(path),
        "mime": mime or "application/octet-stream",
    }


def should_skip(path: Path, output_path: Path) -> bool:
    if path.name in SKIP_DIRECTORIES:
        return True
    if path.is_dir():
        return False
    if path.is_file() and not is_allowed_file(path):
        return True
    try:
        return path.resolve() == output_path
    except OSError:
        return False


def iter_children(path: Path, output_path: Path) -> Iterable[Path]:
    try:
        children = sorted(path.iterdir(), key=child_sort_key)
    except OSError as exc:
        raise RuntimeError(f"Unable to read directory: {path}") from exc

    for child in children:
        if should_skip(child, output_path):
            continue
        try:
            if child.is_symlink():
                continue
            if child.is_dir():
                yield child
            elif child.is_file() and is_allowed_file(child):
                yield child
        except OSError as exc:
            raise RuntimeError(f"Unable to inspect path: {child}") from exc


def build_tree(path: Path, output_path: Path) -> list[dict]:
    children: list[dict] = []
    for child in iter_children(path, output_path):
        if child.is_dir():
            children.append(
                {
                    "type": "folder",
                    "name": manifest_name(child.name),
                    "children": build_tree(child, output_path),
                }
            )
        else:
            children.append(file_entry(child))
    return children


def write_manifest(output_path: Path, payload: dict) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(
        prefix=f".{output_path.name}.",
        suffix=".tmp",
        dir=output_path.parent,
        text=True,
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
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
    global ROOT
    parser = argparse.ArgumentParser(
        description="Generate a repository-local files.json manifest"
    )
    parser.add_argument(
        "--root",
        default=str(ROOT),
        help="Repository root to scan (default: directory containing fmtree.py)",
    )
    parser.add_argument(
        "--out",
        "--output",
        dest="out",
        default=None,
        help="Output path for files.json (default: selected root/files.json)",
    )
    parser.add_argument(
        "--name",
        dest="display_name",
        default=None,
        help="Display name for the generated root folder",
    )
    parser.add_argument(
        "--flatten-root",
        action="store_true",
        help="Emit the root's children directly, useful for documentation workspaces",
    )
    args = parser.parse_args()

    ROOT = Path(args.root).expanduser().resolve()
    output_path = Path(args.out or (ROOT / "files.json")).expanduser().resolve()
    if output_path == ROOT:
        raise SystemExit("--out must identify a file, not the repository directory")

    name = repository_name()
    if not name:
        raise SystemExit("Could not determine a repository name")

    children = build_tree(ROOT, output_path)
    if args.flatten_root and len(children) == 1 and children[0].get("type") == "folder":
        payload = {
            **children[0],
            "name": args.display_name or children[0].get("name", name),
        }
    else:
        payload = {
            "type": "folder",
            "name": args.display_name or name,
            "children": children,
        }
    write_manifest(output_path, payload)
    print(f"files.json generated for {name} at {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
