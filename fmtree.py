#!/usr/bin/env python3
"""Generate a repository-local files.json manifest.

The manifest format intentionally remains compatible with the existing
NoteBooks subject-tree consumer: folders contain ``type``, ``name``, and
``children``; files additionally contain ``path``, ``sha``, and ``mime``.
"""

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
}
SKIP_FILES = {".DS_Store", "files.json"}


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

    # SSH remotes use the form git@github.com:owner/repository.git.
    ssh_name = re.search(r":([^/:]+?)(?:\.git)?$", remote)
    return ssh_name.group(1) if ssh_name else ROOT.name


def blob_sha(path: Path) -> str:
    """Return Git's blob SHA, matching the SHA exposed by GitHub."""
    return run_git("hash-object", "--", str(path))


def relative_path(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def file_entry(path: Path) -> dict[str, str]:
    mime, _ = mimetypes.guess_type(path.name)
    return {
        "type": "file",
        "name": path.name,
        "path": relative_path(path),
        "sha": blob_sha(path),
        "mime": mime or "application/octet-stream",
    }


def should_skip(path: Path, output_path: Path) -> bool:
    if path.name in SKIP_DIRECTORIES or path.name in SKIP_FILES:
        return True
    try:
        return path.resolve() == output_path
    except OSError:
        return False


def iter_children(path: Path, output_path: Path) -> Iterable[Path]:
    try:
        children = sorted(path.iterdir(), key=lambda item: item.name.casefold())
    except OSError as exc:
        raise RuntimeError(f"Unable to read directory: {path}") from exc

    for child in children:
        if should_skip(child, output_path):
            continue
        try:
            if child.is_symlink():
                # Symlinks can escape the repository or introduce cycles.
                continue
            if child.is_dir():
                yield child
            elif child.is_file():
                yield child
        except OSError as exc:
            raise RuntimeError(f"Unable to inspect path: {child}") from exc


def build_tree(path: Path, output_path: Path, is_root: bool = False) -> list[dict]:
    children: list[dict] = []
    for child in iter_children(path, output_path):
        # Preserve the existing subject-repository policy: root-level website
        # implementation files are not content entries; README.md is retained.
        if is_root and child.is_file() and child.name.casefold() != "readme.md":
            continue

        if child.is_dir():
            children.append(
                {
                    "type": "folder",
                    "name": child.name,
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
    parser = argparse.ArgumentParser(
        description="Generate a repository-local files.json manifest"
    )
    parser.add_argument(
        "--out",
        default=str(ROOT / "files.json"),
        help="Output path for files.json (default: repository root/files.json)",
    )
    args = parser.parse_args()

    output_path = Path(args.out).expanduser().resolve()
    if output_path == ROOT:
        raise SystemExit("--out must identify a file, not the repository directory")

    name = repository_name()
    if not name:
        raise SystemExit("Could not determine a repository name")

    payload = {
        "type": "folder",
        "name": name,
        "children": build_tree(ROOT, output_path, is_root=True),
    }
    write_manifest(output_path, payload)
    print(f"files.json generated for {name} at {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
