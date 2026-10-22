# #471 remaining glyph replacement — NOT VALIDATED

Based on ledger source checkpoint 6b5401d176658b4225f09d21c018a61cadfd90ea. Replaced the remaining rendered down-triangle/warning glyphs in data sources, split editor, capture disclosure, booking filter and Plan menus with decorative Lucide icons at 16 px / stroke 1.75. Native disclosure controls keep their behavior; Plan/capture chevrons point right when collapsed and down when open. Labels remain accessible. No financial write paths or tests changed.

Partial issue coverage: app-wide icon size/stroke inventory, other native-details indicators and class-swatch presentation remain outstanding. The existing labelled booking status control was retained. This does not claim the entire #471 accepted.

Integration: this branch includes the ledger checkpoint as a dependency. Apply only this glyph delta to later Plan/609/settings source to preserve their functionality. The Plan menu hunk may overlap #485 navigation links; retain both. The settings chevron work is independently in codex/impl-settings-469-486.

No tests, checks, typecheck, build, browser, screenshots, CI, PR, merge or deployment were performed. Later visual/accessibility acceptance and selector adaptations are explicitly deferred under the owner's implementation-only instruction.
