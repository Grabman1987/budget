# #471 remaining glyph replacement — NOT VALIDATED

Based on ledger source checkpoint 6b5401d176658b4225f09d21c018a61cadfd90ea. Replaced the remaining rendered down-triangle/warning glyphs in data sources, split editor, capture disclosure, booking filter and Plan menus with decorative Lucide icons at 16 px / stroke 1.75. Native disclosure controls keep their behavior; Plan/capture chevrons point right when collapsed and down when open. Labels remain accessible. No financial write paths or tests changed.

The continuation normalizes 114 explicit Lucide instances across 44 source files to 16/20/24 px and strokes 1.75/1.5. The shared .icon CSS now respects those sizes, and class swatches are 12 px instead of 10 px. The per-file edit manifest is source bookkeeping, not a test result. Dynamic custom icon geometries, other native-details indicators and distinct class-shape/abbreviation presentation remain outstanding. The existing labelled booking status control was retained. This does not claim the entire #471 accepted.

Integration: this branch includes the ledger checkpoint as a dependency. Apply only this glyph delta to later Plan/609/settings source to preserve their functionality. The Plan menu hunk may overlap #485 navigation links; retain both. The settings chevron work is independently in codex/impl-settings-469-486.

No tests, checks, typecheck, build, browser, screenshots, CI, PR, merge or deployment were performed. Later visual/accessibility acceptance and selector adaptations are explicitly deferred under the owner's implementation-only instruction.

The icon continuation is mechanical presentation work across later packages: retain only size/stroke/glyph changes when combining with newer functional source; never replace newer pages wholesale. Existing chart SVG paths and drawing stroke widths were deliberately left alone.

## Independent source review

The package source was independently inspected; see `SOURCE-REVIEW.md` for the exact revision and scope. No actionable source finding was reported in the reviewed icon delta. No runtime validation was performed. NOT VALIDATED / NOT LIVE.
