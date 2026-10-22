# #474 design lines source handoff — NOT VALIDATED

Base: `9e9a997a0a5cde3c7df430dda2293acc037bf2fb` (includes the #489 and #471 source work). This branch contains source edits only. No tests, typecheck, build, browser capture, Axe run, CI, PR, merge, or deploy were performed.

## Source edits

- The existing `DESIGN.md` line ladder, generated stroke/radius/bar tokens, 3–4 px progress and 10 px stacked bars, and first-chart-per-page session guard were present at the base. They were retained.
- `--shadow` is now one layer in light, dark, and print. `DESIGN.md`, the token generator, generated CSS, and `.impeccable/design.json` describe the same floating-surface value. Card shadows were already one layer.
- The Plan suggestion ghost action loses its dashed visible frame while its transparent border preserves geometry; on phones it has a 44 px minimum height. The Plan 3 px progress override and selected Plan/shared radii now use the existing canonical tokens.

## Integration and acceptance still open

- Cherry-pick the small source commit into the current Plan/Heute/report integration work; preserve each branch's newer page markup and CSS. In particular, inspect the Plan `.ghost` and `.pbar` rules against the latest Plan branch rather than replacing a whole stylesheet.
- Review remaining radius literals and stacked/progress bars on the integrated pages. The 1 px legend/chart marks and 2–3 px title-block/stamp exceptions are documented in `DESIGN.md`; visual review must distinguish data marks and hit targets from progress bars.
- Validate desktop 1440, Chromium 390, and WebKit iPhone in both themes with Axe, overflow and touch targets, then capture synthetic desktop-light/iPhone-dark evidence. Verify the existing plotter guard in real navigation and with reduced motion. Check source, calculations and undo boundaries, run the required repository gates, and write any PR description in English ending `Refs #474`.

No issue acceptance criterion or screenshot claim is made by this handoff.

## Independent source review — NOT VALIDATED

The [bounded review](DESIGN-LINES-474-SOURCE-REVIEW.md) compares #474 product
source `dd11b4e03bdd79ce3074b2e504dd326453080470` with its actual parent
`9e9a997a0a5cde3c7df430dda2293acc037bf2fb`. It found no concrete defect
in the eight-file #474 delta. The other cumulative branch commits remain outside
this review. This archive changes only documentation; desktop, phone, WebKit,
touch, focus interaction, Axe, tests, CI and live acceptance remain unvalidated.
