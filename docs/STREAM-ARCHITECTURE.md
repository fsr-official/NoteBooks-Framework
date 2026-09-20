# Stream architecture

## Stream model

Every workspace is keyed by a stream slug. The current stream set is science, commerce, humanities, and developers.

The browser shell is route-driven. A request to /science, /commerce, /humanities, or /developers loads the same stream workspace shell and then resolves the active stream artifact from the matching stream slug.

## Stream responsibilities

- Science: subject content repositories and study libraries
- Commerce: commerce subject repositories and optionally empty configured workspace roots
- Humanities: humanities repositories and related curriculum material
- Developers: repository-local project architecture, contributor docs, implementation notes, and source material for the framework itself

## Ordering and prioritization

The stream UI sorts folders before files and keeps pinned entries at the top. In the subject workspaces, entries matching NCERT-* are intentionally pinned at the top. This is a presentation rule, not a content rule.

The Developers workspace is treated as a first-class local stream, but it is anchored to the repo’s own files.json instead of the GitHub repository registry model used by the subject streams.
