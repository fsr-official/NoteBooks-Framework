---
title: Desmos Upgrade Skill
summary: Standards, syntax, and migration guidance to upgrade Desmos fences to the new JSON-expression format used by the renderer.
---

# Desmos Upgrade Skill

Purpose
- Define the standard fence syntax and conventions for `desmos` (2D) and `desmos3d` (3D) fences used in NoteBooks-Framework.
- Provide migration guidance and examples so existing notes can be upgraded consistently to the new expression-array JSON format.
- Provide validation and testing instructions (parser and headless tests).

Who should use this
- Content maintainers converting existing MD files containing ```desmos or ```desmos3d fences.
- Automated pipelines that batch-migrate older notes into the new schema.

Principles
- Each fence line represents a single Desmos expression object.
- Authors may provide either a JSON object per-line (preferred for machine-generation) or a LaTeX expression followed by trailing metadata in `{ ... }` (preferred for human readability).
- Every expression must be an object with a unique `id` (auto-assigned if omitted), and commonly-used fields: `latex`, `type`, `color`, `lineStyle`, `lineWidth`, `hidden`, `secret`, `readonly`, `sliderBounds`, `parametricDomain`, `label`.
- The fence parser only needs to bundle per-line expression objects into an expression array and pass the entire object to the Desmos initializer. No complex AST transforms are necessary.

Fence syntax (examples)

1) JSON-per-line (machine-friendly)

```desmos
{ "id": "p1", "latex": "y = x^2", "color": "#2f72dc", "lineWidth": 2 }
{ "latex": "y = \\sin(x)", "sliderBounds": [0,10,1] }
```

Notes:
- When embedding LaTeX in a JSON string, backslashes must be escaped (\\). Example: `"\\sin(x)"`.
- If `id` is missing, the renderer will auto-assign `expr-<n>` or `expr3d-<n>` depending on fence language.

2) LaTeX + trailing metadata (human-friendly)

```desmos
y = x^2 { color=#c74440 lineWidth=3 }
param = 2 { sliderBounds=[0,10,1] id=param1 }
```

Metadata rules:
- Tokens are key=value pairs. Values may be:
  - simple strings (no spaces) e.g. `color=#c74440`
  - numbers e.g. `lineWidth=3`
  - booleans `hidden`, `secret` (flags) or `hidden=true`
  - JSON arrays/objects using `[...]` or `{...}` for `sliderBounds` and `parametricDomain` (the parser handles nested braces)
- If a metadata value is JSON-like (starts with `[` or `{`), authors should use valid JSON syntax: e.g. `parametricDomain={"min":"0","max":"2\\pi"}`.

Supported expression fields
- `id` (string) — unique identifier
- `latex` (string) — LaTeX expression (for `text` expressions use `text` + `type: 'text'`)
- `type` (string) — `'expression' | 'table' | 'text'` (optional; default 'expression')
- `color` (hex string) — e.g. `#c74440`
- `lineStyle` (string) — `'SOLID'|'DASHED'|'DOTTED'`
- `lineWidth` (number)
- `hidden` (boolean) — hide from graph
- `secret` (boolean) — hide from expressions list
- `readonly` (boolean) — disallow editing in UI
- `sliderBounds` (array or object) — slider bounds, e.g. `[0,10,1]` or `{min:0,max:10,step:1}`
- `parametricDomain` (object) — `{ min: '0', max: '2\\pi' }`
- `label` (string) — optional text label

Migration guidance

Goal: convert older free-form `desmos` fences into the canonical per-line expression form so the new renderer can assign ids and pass expression objects directly to `calc.setExpression()`.

Safe, minimal approach (ad-hoc, non-destructive)
1. Backup repository / branch.
2. Run the provided parser validator to see how each fence will be interpreted:

```bash
node scripts/validate-desmos-parser.js
```

3. Choose conversion strategy:
- If fences are already LaTeX-only lines, convert them to LaTeX+metadata format only when metadata needed (human-readable). Example:

Before:
```desmos
y = x^2
y = \\sin(x)
```

After (minimal):
```desmos
y = x^2 { }
y = \\sin(x) { }
```

- For programmatic standardization (preferred for large batches), convert to JSON-per-line including auto-id and any parsed metadata. Example transformation pseudo-command (Node):

```js
// transform-fence.js — sketch
const { parseFence } = require('../scripts/validate-desmos-parser.js');
const fs = require('fs');
let md = fs.readFileSync('note.md','utf8');
md = md.replace(/```desmos([\s\S]*?)```/g, (_, body) => {
  const exprs = parseFence(body, { prefix: 'expr-' });
  return '```desmos\n' + exprs.map(e => JSON.stringify(e)).join('\n') + '\n```';
});
fs.writeFileSync('note.migrated.md', md);
```

Validation and testing
- Use `scripts/validate-desmos-parser.js` to preview parse results.
- Start dev server and open the note in the app: `cd NoteBooks-Framework && npm run dev` and visit `http://localhost:4000`.
- (Optional) Run the headless integration test (requires Playwright):

```bash
npx playwright install
node scripts/test-desmos-headless.js
```

Best practices and notes
- Prefer LaTeX + trailing metadata for human-editable notes; prefer JSON-per-line for generated content.
- Always escape LaTeX backslashes when embedding LaTeX inside JSON strings.
- Keep expressions short; break large formulas into multiple expressions if needed.
- For 3D fences, prefer `desmos3d` fence and include `parametricDomain` when plotting parametric surfaces.
- If the Desmos API key does NOT have 3D enabled, `initDesmos3D` will render a notice instead of throwing.

Examples (before → after)

Before (legacy):
```desmos
y = x^2
z = \\sin(x) \\cos(y)
```

After (recommended, 2D then 3D):
```desmos
{ "latex": "y = x^2", "color": "#2f72dc" }
{ "latex": "y = \\\\sin(x)", "sliderBounds": [0,10,1] }
```

```desmos3d
{ "latex": "z = x^2 + y^2", "color": "#0066cc" }
z = \\sin(x) \\cos(y) { parametricDomain={"min":"0","max":"2\\\\pi"} }
```

Support and rollout
- Start by migrating a small set of representative notes and test them in the local dev server.
- Update any content-generation tools to emit the JSON-per-line format.
- Communicate the new authoring guidance in the project's contributor docs and add a short README example near `public/js/obsidian-markdown-it.js`.

Appendix: quick regex helpers
- Find desmos fences:
  - `/```desmos[\s\S]*?```/g`
- Replace simple LaTeX-only fences with JSON objects (node script recommended for safety).

Contact
- If you want, I can add an automatic migration script (safe, preview-only mode) that writes `.migrated.md` files and a small README snippet showing examples. Tell me whether you prefer JSON-per-line or LaTeX+metadata as the canonical output for converted notes.
