# Repository and files.json model

## Registry model

The canonical repository registry is maintained in the NoteBooks-Documents repository's `GITHUB-REPOSITORIES.md` and compiled into `public/json/github-repos.json` during app builds for bootstrap/offline use. Signed registry update notifications activate new registry contents in Upstash Redis at runtime, so edits do not require an app restart.

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

The build script reads the canonical registry and generates `public/json/repo-registry.json` and per-stream manifest trees. Once runtime configuration is active, `/api/system/:stream` uses the shared registry and the latest accepted repository commit SHA instead of preferring those static trees.

## Manifest generation

The generation pipeline forms a repository manifest by reading a repo’s files.json or Pages manifest, normalizing raw paths, and folding the result into a stream-scoped tree. The root node is then emitted as a JSON artifact such as public/json/science-tree.json.

Content repositories invoke the NoteBooks-Documents reusable workflow on pushes. It regenerates and validates `files.json` with Git blob SHAs, then posts the resulting commit SHA. The app fetches the manifest at that exact commit, compares the per-file SHA map, and publishes only actual material changes. Tree responses use commit-pinned raw URLs; clients receive catalog versions through `/api/content-updates` and refresh the tree without reloading the application shell.

## Local developer workspace

The Developers workspace is intentionally different: it is rooted in the current repository’s local files.json. That keeps contributor docs, monitors, notes, and maintainer resources visible in the same shelf without creating a fake remote repo entry.
