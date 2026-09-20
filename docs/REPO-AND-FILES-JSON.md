# Repository and files.json model

## Registry model

The repository registry is declared in GITHUB-REPOSITORIES.md and compiled into public/json/github-repos.json. The registry is the source of stream repository selection and priority ordering.

Each entry includes:

- name
- stream
- repo
- branch
- root
- enabled
- priority
- pages
- empty
- LFS

The build script reads this registry and generates public/json/repo-registry.json and per-stream manifest trees.

## Manifest generation

The generation pipeline forms a repository manifest by reading a repo’s files.json or Pages manifest, normalizing raw paths, and folding the result into a stream-scoped tree. The root node is then emitted as a JSON artifact such as public/json/science-tree.json.

The system API at /api/system/:stream reads these generated artifacts first and falls back to a runtime build only when needed. This preserves the default static and offline experience while keeping the runtime fresh.

## Local developer workspace

The Developers workspace is intentionally different: it is rooted in the current repository’s local files.json. That keeps contributor docs, monitors, notes, and maintainer resources visible in the same shelf without creating a fake remote repo entry.
