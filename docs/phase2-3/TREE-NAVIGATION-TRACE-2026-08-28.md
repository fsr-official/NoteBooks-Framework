# Main Shell Tree Navigation Trace

**Date:** 2026-08-28  
**Scope:** Main explorer and active stream workspace navigation

## Result

The repository tree is now the primary left-side navigation rail. The workspace remains the reading and file-list surface on the right for desktop screens. On narrow screens the layout changes to a vertical sequence with the workspace first and the tree below it, preserving access without forcing a horizontal squeeze.

The workspace toolbar is now title-only. Refresh, upload, account, community, and other action controls were removed from that bar, along with the mobile overflow action menu. The existing tree search, expand/collapse controls, breadcrumb path navigation, file context menu, and sidebar account controls remain available through their appropriate surfaces.

The current-location marker now belongs to the tree header. There is one `treeCurrentLocation` element, and the runtime updates it as the single current-location owner. The old `workspaceLocationMarker` path was removed from the client runtime, preventing two competing location indicators from drifting apart.

## Layout contract

| Viewport | Tree placement | Tree width | Workspace placement |
|---|---|---:|---|
| Desktop | Left grid area | `clamp(320px, 29vw, 460px)`; stream workspaces use `clamp(340px, 30vw, 480px)` | Right grid area, fills remaining width |
| Narrow | Below workspace | Full available width, bounded by viewport height | Above tree, full available width |

The tree hierarchy uses a small child offset and compact border guide rather than deep indentation. Labels may wrap at word boundaries so long filenames remain visible instead of being silently clipped. The tree retains `aria-level`, `aria-expanded`, `aria-current`, roving keyboard navigation, and explicit expand/collapse buttons.

## Additional bug found during implementation

Removing the toolbar account button exposed an auth UI ownership bug. `updateModernAuthUI()` previously returned before calling `updateShellSidebar()` when the toolbar login element was absent. The sidebar could therefore remain stale even though the toolbar control had been removed intentionally. The guard now protects only the optional toolbar element and always updates the sidebar account state.

The active `streams.html` shell had its own duplicated toolbar and tree markup, so changing `index.html` alone was insufficient. Both active shells are now aligned. The dormant legacy community and volunteer shells were not promoted to active route owners.

## Visual verification

A local Chromium desktop capture at 1440×900 confirmed the tree rail at approximately 432 pixels wide on the left, the workspace at approximately 958 pixels wide on the right, zero toolbar action buttons, and the current marker inside `.tree-rail-header`. The desktop screenshot is retained as validation evidence outside the source tree.

## Validation

The current local validation passed after the redesign:

| Check | Result |
|---|---|
| Browser JavaScript syntax checks | Passed |
| TypeScript typecheck | Passed |
| Full Vitest suite | **114 passed**, 2 database tests skipped because they are environment-gated |
| Production build | Passed |
| Release compatibility gate | Passed |
| Chromium browser smoke | Passed for mobile navigation and desktop left-tree geometry |
| Dependency audit | 0 production vulnerabilities |
| Diff whitespace check | Passed |

No lazy tree loading was introduced. Science, Commerce, and Humanities retain their eager tree/artifact architecture.

## Follow-up: direct files and vertical tree space

A live request to `/files/README.md` returned the root HTML shell with HTTP 200 instead of Markdown. The local Express route was correct, but `vercel.json` had no dynamic `/files/:path*` rewrite, so Vercel fell through to the root shell. The first API-alias approach was rejected by live Vercel behavior: `/api/workspace-file/README.md` itself returned a platform 404 even though the local Express route worked. The final fix rewrites `/files/:path*` to the already deployed `/api/raw?path=:path*` endpoint, which performs the same published-path validation and successfully serves README content. The local route and API alias now return `text/markdown` and never return the HTML shell.

The tree rail previously stopped at `calc(100vh - 86px)` and the active marker used an 11px muted style. The follow-up makes the tree use the available viewport height, gives narrow screens a larger bounded tree area, and uses a 12px bold marker with a two-pixel accent border, accent background, contrasting foreground, and visible shadow. The marker remains a single runtime-owned element in the tree header.
