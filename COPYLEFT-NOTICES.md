# NoteBooks Framework copyleft notices

NoteBooks Framework is released under the **GNU General Public License, version 3 or any later version (GPL-3.0-or-later)**. The complete license text is in [`LICENSE`](LICENSE). This notice index records the provenance boundary used by the source files; it does not replace the license text or the independent notices of third-party dependencies and vendor assets.

## Frontend and rendering files

The files listed in this section are the verified Ada-derived frontend/rendering boundary for the current repository. Their notices credit **Pratyush Chanda’s Ada project first**, followed by the NoteBooks modifications. The Ada-derived boundary currently covers `index.html`, `public/js/obsidian-markdown-it.js`, `public/js/markdown.js`, `public/js/md-init.js`, `public/js/markdown-editor.js`, and `public/js/markdown-vendors.js`.

```text
// ============= COPYLEFT NOTICE (FRONTEND) ===============
// This file is based on Ada (https://github.com/Pratyush-Chanda/Ada)
// Copyright (C) 2025  Pratyush Chanda [Ada]
//
// Modifications and integration into NoteBooks-Framework:
// Copyright (C) 2024-2026  Federation of Socialist Republics,
// United Boys Socialist Republic
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
// SPDX-License-Identifier: GPL-3.0-or-later
// ===========================================================
```

For `index.html`, the same notice is represented as an HTML comment. For JavaScript files, it is represented with line comments. The notice does not attribute the separately bundled Vercel Analytics or Speed Insights packages to Ada; those packages retain their own upstream licenses.

## Backend and core NoteBooks logic

The server, API, persistence, authentication, deployment, and core NoteBooks logic use the original NoteBooks notice. They do **not** receive an Ada attribution merely because they support the frontend or share a repository.

```text
// ============= COPYLEFT NOTICE (BACKEND) ===============
// NoteBooks-Framework — core service logic
// Copyright (C) 2024  Federation of Socialist Republics,
// United Boys Socialist Republic
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
// SPDX-License-Identifier: GPL-3.0-or-later
// =========================================================
```

The backend boundary includes `src/`, `api/`, deployment workflows, and server-side configuration. Current NoteBooks-only browser modules such as `public/js/app.js`, `public/js/theme.js`, `public/js/auth.js`, and `public/client/main.js` are not silently labelled Ada-derived by this document; they remain covered by the project GPL notice and their own documented authorship history.

## Third-party materials

Third-party libraries and downloaded/vendor assets remain subject to their own licenses. The starter biology and chemistry diagrams are documented separately in [`public/assets/diagrams/starter/ATTRIBUTIONS.md`](public/assets/diagrams/starter/ATTRIBUTIONS.md). The installed Vercel packages are MIT-licensed for `@vercel/analytics` and Apache-2.0-licensed for `@vercel/speed-insights` according to their package metadata; those upstream notices are not replaced by this project notice.

## Practical compliance rule

When a future change copies or substantially derives a new file from Ada, add it to the frontend boundary and preserve the layered Ada-then-NoteBooks notice. When a file is independently authored as NoteBooks core logic, use the backend notice instead. If provenance is uncertain, record the uncertainty in a review rather than making an unsupported attribution claim.
