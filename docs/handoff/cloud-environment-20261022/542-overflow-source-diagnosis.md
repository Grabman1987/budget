# #542 account-register overflow: source diagnosis

## Finding

The strongest source-level explanation is the old, horizontally unbounded “Tiefpunkt …” SVG label in the account balance chart. At the failing #541 source revision, it was rendered at `x(low) + 10` with the default start anchor and no clamp; when the chart low point was near the right edge, the label could draw past the SVG viewport. The SVG deliberately used `overflow: visible`, so that drawing could extend the document width. This matches the report’s 34–45 px horizontal excess and its chart-label hypothesis.

This is a strong match, not a proven identification of the exact element from the failed browser state. The existing failure screenshot/trace is not present in the local worktrees. The run’s Playwright report artifacts are still listed by GitHub (three bundles, roughly 150–203 MB); downloading them was outside this bounded diagnosis. `gh run view --log` returned HTTP 403 for the log file, so there is no accessible trace proving which SVG node extended the page. The trigger’s focus on “Kontostand prüfen” alone does not establish the chart tooltip as culprit.

## Source comparison

- Issue #542 names CI run `39005388677`, shard 1, route `/konten/acc-giro`, desktop 1440, and `scrollWidth` 1474–1485 after keyboard focus on “Kontostand prüfen”. The issue has no comments.
- That run used PR #541 head `0a04b3c5410136d1a3f0bf82d23d1f364063821c`; the PR is merged. The old chart source was read from that exact GitHub revision. In `apps/web/src/ledger/balance-chart.tsx`, the low-point label was positioned with `x={x(low) + 10}` and no `textAnchor`; the SVG had `overflow: visible` in `apps/web/src/ledger/ledger.css`.
- Current focused source is worktree `/workspace/impl-ledger-594-597`, clean branch `codex/impl-594-597-ledger`, HEAD `6b5401d176658b4225f09d21c018a61cadfd90ea`.
- The later merged #580 chart change (`22b70a6db2e2d5b6282e2dece1284e2c28f7ece1`, PR #667) changed that label to a centered x clamped between `left + 70` and `width - right - 70`. Current `balance-chart.tsx` retains that clamp. Current CSS still sets `.kchart-box .chart { overflow: visible; }`.
- The keyboard-focus tooltip is separately bounded to a 220 px rectangle and its x position is clamped within the plot margins. Its text is not clipped to the rectangle, but the saved evidence does not show that this text caused the reported overflow.

## Recommendation and limits

No source patch is recommended from this evidence: the most plausible escaping label is already horizontally clamped in the current source. The #580 change’s recorded source rationale is chart presentation/low-point placement, not an explicit #542 fix, and its general no-overflow acceptance does not prove the exact #542 keyboard state. Keep #542 as an unresolved evidence item until that exact state is reproduced or the original trace is available.

If the same state still overflows, inspect the rendered bounds of the SVG low-point label and `.kchart-tooltip` separately before changing CSS. Apply a local clamp to the proven text node or tooltip text; do not hide overflow on the whole chart, which could clip useful labels. The issue’s requested acceptance remains: on the desktop 1440 route and keyboard state, document scroll width is at most the viewport width, with no visible register change. No test, browser, build, check, or source mutation was performed for this diagnosis.
