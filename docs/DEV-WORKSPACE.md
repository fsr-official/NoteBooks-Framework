# Developer workspace

## Goal

The Developers workspace puts the framework itself in a navigable shelf so contributors can inspect architecture notes, implementation files, skill definitions, licensing notices, and project-level documentation without leaving the main stream layout.

## Scope

The workspace is rooted at the repository’s local files.json and is curated to surface the project’s internal structure:

- root README, LICENSE, and COPYRIGHT notices
- docs/ architecture references
- skill/ generator definitions
- source tree and server/client code
- build and validation scripts

## Why it is local-only

This is a local project workspace, not a remote subject repository. It should behave like a pinned workspace in the same way NCERT entries are pinned in the subject trees: stable, visible, and top-level.

The core idea is simple: the app should be navigable from the same shell whether the user is reading a subject stream or looking inside the project itself.
