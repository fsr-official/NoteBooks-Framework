# NoteBooks Diagram Assets and Renderer Plan

**Status:** Phase 1 through the current implementation slice are complete locally. The remaining items are production activation and optional true vectorization.

## Goal and design boundary

NoteBooks should make educational biology and chemistry visuals easy to reuse without turning the renderer into an unsafe image execution surface. Static assets remain ordinary files in the eager repository tree, and `raw.ts` remains the canonical source-delivery path. The renderer adds a small declarative figure convention, while the upload flow adds an explicit Biology or Chemistry normalization choice rather than silently changing every image.

The current implementation intentionally distinguishes **vector geometry** from an **SVG container holding a raster image**. A native SVG that passes the server sanitizer is reported as `mode: vector`. A PNG, JPEG, WebP, GIF, AVIF, or TIFF is decoded with Sharp, has near-white pixels made transparent, and is wrapped as a PNG inside SVG; it is reported as `mode: embedded-raster`. This is useful for consistent embedding and alpha compositing, but it is not Potrace-style vector tracing and must not be marketed as such.

## Implemented contract

| Area | Current behavior | Verification |
| --- | --- | --- |
| Starter assets | Four reusable SVGs are stored under `public/assets/diagrams/starter/`, with an attribution manifest. | Asset URLs return HTTP 200; licenses are recorded in `ATTRIBUTIONS.md`. |
| Upload selection | The upload review step offers Keep original, Biology conversion, or Chemistry conversion. | The choice is explicit and ordinary uploads remain unchanged. |
| Native SVG | The server adds accessibility metadata and rejects active or unsafe content. | Scripts, event attributes, `foreignObject`, unsafe XML declarations, and unsafe links are rejected. |
| Raster diagram | Sharp validates format and pixel limits, removes near-white background pixels, and emits an accessible SVG containing a PNG. | Unit tests verify `mode: embedded-raster`, the data URI, and transparent output pixels. |
| Storage and review | Admin GitHub commits and anonymous Blob review entries use the derivative filename; review metadata retains the original name, stored name, source format, mode, and domain. | Approval, preview, download, and re-upload paths use `storedName` when present. |
| Markdown | `bio`, `biology`, `chem-setup`, and `chemistry` fences produce responsive figures with alt text, captions, and optional source links. | URLs are constrained; missing sources produce an explanatory note. |
| Theme/security | Mermaid follows the selected NoteBooks theme mode and uses strict security. | Renderer tests assert strict mode and the service-worker cache is bumped to `webman-v31`. |

## Authoring convention

A note author can use a fence instead of hand-writing HTML:

````markdown
```bio
src: /assets/diagrams/starter/biological-cell.svg
alt: Labeled cross-section of a biological cell
caption: Major cell structures and their relative locations.
source: /assets/diagrams/starter/ATTRIBUTIONS.md
```

```chem-setup
src: /assets/diagrams/starter/fractional-distillation-lab-apparatus.svg
alt: Fractional distillation laboratory apparatus
caption: A packed column separates liquids with different boiling points.
```
````

The four supported keys are `src` (or `image`), `alt`, `caption`, and `source`. The output is a semantic figure with an image and, when provided, a caption/source link. The renderer does not inject arbitrary author HTML and does not add a second asynchronous asset-loading mechanism.

## Delivery sequence

### A. Production activation

First, deploy the current code with Sharp available in the production runtime and verify that the deployed function accepts an authenticated, TOTP-enrolled conversion request. Confirm that the Vercel runtime size and request timeout remain acceptable for the 25 MB input cap. Keep Blob storage optional locally, but require the configured Blob token for actual anonymous review storage. Run a staging conversion with a harmless test image, confirm the returned `mode` and derivative filename, then remove the test entry.

Second, validate the complete anonymous path: submit a raster diagram, inspect the waiting-list metadata, preview and download the stored SVG, approve it, and confirm that the published GitHub path uses the derivative `.svg` filename. Repeat with a native SVG containing a rejected script to verify that no Blob or repository write occurs.

### B. Security hardening

Keep the current TOTP middleware and Blob rate limit. Next, replace the global permissive CSP and inline event-handler model incrementally with nonce- or hash-based script policy, beginning with the upload overlay and Markdown preview. Add route-specific body limits so ordinary session and comment requests do not inherit the upload-sized JSON parser. Keep Mermaid strict; if a trusted note eventually needs HTML labels, create an explicit trusted-source path or sandbox rather than restoring permissive rendering globally.

### C. Renderer quality

Add frontmatter-driven note metadata as a separate presentation layer: title, short summary, key idea, difficulty, and estimated reading time. Render this metadata in a compact note header, then provide an outline/current-section rail for H2/H3 headings. Do not infer scientific meaning from arbitrary prose. Keep H1 for the note title, H2 for primary sections, H3 for subsections, and H4–H6 for progressively smaller local headings.

Next, add structured chemistry support only after selecting and licensing a maintained SMILES renderer. It should validate input, render a placeholder while the vendor loads, and fall back to source text with an explanatory status. Biology should continue to favor reviewed static diagrams for anatomy, cells, and organelles rather than AI-generated or unverified scientific artwork.

### D. True vectorization option

If true vectors become a requirement, implement them in a separate worker or CI service with a controlled Potrace/OpenCV toolchain. The worker should segment only appropriate high-contrast line art, preserve the original upload, produce a derivative with provenance, and return a confidence/result status. Photographs, microscopy images, shaded illustrations, and complex colored diagrams should remain raster-in-SVG or PNG unless a human reviews the trace. The UI must expose whether the result is a vector trace, an embedded raster, or an unmodified source.

## Acceptance criteria

The feature is ready for general use when the build and full tests pass, the production dependency audit is clean, the authenticated conversion route is rate-limited and TOTP-protected, all four starter assets retain correct attribution, the browser can render at least one `bio` and one `chem-setup` fence in both theme modes, and approval never publishes an unintended original extension after conversion. A true vectorization milestone is separate and is not satisfied by the current embedded-raster fallback.

## References

[1]: https://commons.wikimedia.org/wiki/File:Biological_cell.svg "Biological cell SVG source and license"
[2]: https://commons.wikimedia.org/wiki/File:Beakers.svg "Beakers SVG source and license"
[3]: https://commons.wikimedia.org/wiki/File:Simple_distillation_apparatus.svg "Simple distillation apparatus SVG source and license"
[4]: https://commons.wikimedia.org/wiki/File:Fractional_distillation_lab_apparatus.svg "Fractional distillation apparatus SVG source and license"
[5]: https://github.com/mermaid-js/mermaid "Mermaid project overview and security guidance"
[6]: https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/title "MDN SVG title element"
[7]: https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/desc "MDN SVG desc element"
