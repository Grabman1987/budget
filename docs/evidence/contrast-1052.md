# Contrast exposed by the drafting grid

Refs #1052. Synthetic data only. Baseline: `db99f615e741681ead727eb291747cfe83c0b792`, ON production/e2e bundle, Chromium 156.0.8078.4 on Windows with Node 24.15.0.

## Baseline method and findings

The audit covers the 16 areas in `e2e/issue-1052-contrast.spec.ts`, in light and dark, plus 76 existing interaction cases selected from the specs implicated by the earlier #1049 CI failure. These include expanded Plan groups, filters, assignment/cover panels, payment groups/history, report summaries and print. The existing run had 58 passes (including three setup cases) and 21 failures. Twenty failures reached exposed contrast violations; the light `desktop light group labels stay inside their controls at 1440 pixels` case failed its existing layout assertion. No assertion or timeout was changed.

Immediately before each full axe scan, a local diagnostic wrapper inserted these two rules into the existing same-origin stylesheet using `CSSStyleSheet.insertRule`:

```css
.app[data-budget-redesign='1'] .main::before { display: none !important; }
.app[data-budget-redesign='1'] .main { background-image: none !important; }
```

This preserves CSP; an initial `addStyleTag` attempt was blocked by CSP and is not counted as a contrast measurement. The wrapper returned the unmodified axe result, including violations, passes and incomplete nodes. No axe rule or node was excluded. The new regression test intentionally also rejects the disabled grid, so its baseline outcome is not a passing regression run.

[The complete measured inventory](contrast-1052-baseline.json) contains every failing area/theme/color/threshold combination and target, plus the audited routes and all incomplete results without the grid. It consolidates 143 recorded scans (including repeated diagnostics) into 28 failing combinations. The Prüfen overview was measured in a supplemental phone run of the unchanged main bundle after correcting the new diagnostic's readiness selector. No light-theme contrast violation was found in these scanned states. This is the audited state inventory, not a claim to have exercised every possible user-created state.

| Area/state | Theme | Foreground / background | Observed ratio | Required |
| --- | --- | --- | --- | --- |
| Plan expected payments and history; budget adherence report | Dark | `#8fb4d1` / `#1d476b` | 4.44 | 4.5 |
| Plan month inspector/status | Dark | `#ff8b7b` / `#2c4563` | 4.31 | 4.5 |
| Monthly and annual report paper | Dark | `#eef6fc` / `#ffffff` | 1.09 | 3 or 4.5 according to size |
| Explorer heat cells | Dark | `#eef6fc` / 16 blended red/green backgrounds listed in JSON | 3.11–4.45 | 4.5 |

## Product changes

- Render the existing four 8/40 px grid gradients as the normal `.main` background. Axe can then resolve opaque descendants instead of classifying the whole subtree as `pseudoContent`. Keep the grid in the page gaps and remove it for print.
- Give text-bearing page chrome a known backing, including the Konten view selector and Plan income reference. Report calculation headers use the existing surface role.
- Preserve blueprint roles while increasing dark `ink-3` and `red` luminance in the generated ON overrides. The source remains `DESIGN.md`; both legacy token files and their OFF hash assertions stay byte-identical.
- Back the mobile period-summary with the existing ground role: its transparent phone papers otherwise still expose the main gradient in both Chromium and WebKit.
- Apply the report paper's local ink to the paper itself. Inheritance previously retained the parent's dark-theme foreground despite redefining the local variable. Complete the paper's local primary/on-primary pair as well.
- Make shared heat cells honor the existing `heat-max` token, as the heatmap contrast contract already requires. Financial values, direction, normalization and neutral bands are unchanged.
- Draw the mobile booking-row separator as a 1 px border in its existing 1 px pseudo-element box. Its old opaque background independently triggered axe's pseudo-area heuristic for small glyphs, even with the main grid disabled. The full-main diagnostic had 136 `pseudoContent` results both with and without the grid; the border version removes all 136 without changing the row layout or excluding any rule. Existing overlap/short-text limitations remain visible in the report.

The OFF corner accent and its `--grid-line` token remain together. Removing that token while the OFF build still consumes it would break the rollback presentation.

For the booking separator, the paired 390 px viewport captures before/after the border substitution are byte-identical (SHA-256 `efbb42e32ba8fea8ada530e3222c1ea13017a1d80d291ebac8733c6a5156931e`). The glyph is inside its clipping ancestor; shrinking the account label was therefore rejected as an unrelated layout change.

## Coverage and limitations

The new browser regression runs the full axe rule set inside `.main`, rejects `pseudoContent`, and rejects gradient incompletes except the precisely identified existing native-select arrow (two 5 px gradients at 45/135 degrees). It requires actual resolved foreground/background contrast measurements for visible heading/value sentinels, rather than accepting an offscreen/hidden axe pass. It also checks that the grid still exists at the original spacing. Konten uses its visible balance and section heading as additional measurement sentinels because its phone h1 is intentionally screen-reader-only. The native-select check accepts the two equivalent CSSOM serializations of identical 5 px arrow sizes (WebKit collapses the list); it does not admit other gradients.

The no-grid inventory documents pre-existing axe limitations: SVG chart text (`imgNode`), mathematical symbols (`nonBmp`), very short labels (`shortTextContent`), overlap/clipping results, and the native-select arrow. These remain attached to the audit; a successful automated run does not constitute manual verification of those items.

Changed-test rationale:

- `packages/ui/src/contrast.test.ts`: adds independent alpha-composited AA checks for muted metadata on tint and warning text on its soft background, preserving every existing assertion.
- `packages/ui/src/redesign-tokens.test.ts`: extends the literal ON role maps for the two repaired foreground roles; the OFF hash and all existing thresholds remain unchanged.
- `e2e/issue-1052-contrast.spec.ts`: adds cross-area/theme coverage that detects the original false-negative condition, as well as actual contrast violations and loss of the visible grid. It uses the existing synthetic read-only sample fixture.

Final validation and independent review are recorded in the PR against its exact head. Browser phone profiles are emulation, not physical-device evidence.

## Phone scrolling measurement

Chromium phone profile, 390 × 844, synthetic Plan of 5,570 CSS px height, fourfold CDP CPU throttling. Alternate the original pseudo-element and ordinary-background renderers on the same page, scrolling down and back over 120 animation frames per run. Other page styling is held constant to isolate the renderer. No performance assertion or timeout was introduced.

| Run | Renderer | Median frame interval | p95 | Longest interval | Intervals over 50 ms |
| --- | --- | --- | --- | --- | --- |
| 1 | Pseudo-element | 16 ms | 30 ms | 1,304 ms | 3 |
| 2 | Background | 16 ms | 29 ms | 1,211 ms | 2 |
| 3 | Pseudo-element | 16 ms | 26 ms | 625 ms | 3 |
| 4 | Background | 16 ms | 25 ms | 960 ms | 2 |

The central frame intervals are comparable. Both variants have substantial outliers in this throttled Windows run; these four samples do not establish a speedup or physical-phone smoothness. The rendering change is justified by contrast observability, not a performance claim.

## Local verification

- ON e2e build passed (Node 24.15.0).
- Browser verification: final affected selection 54/54 passed across desktop, mobile Chromium and webkit-iphone (42 contrast cases, nine unchanged period-report cases, three setup cases). The preceding 120-case run had 101 passes and 19 classified failures; the final selection resolves all 19. Reuse is limited to unchanged areas: together the runs cover all 96 new contrast cases and 21 existing Plan/payment/report cases with passing results. This is not described as one clean 120-case run.
- Full packages/ui unit selection: 23 files, 189 tests passed, including OFF hash preservation and the added AA checks.
- Workspace typecheck, changed-file ESLint/Prettier, CSS scale and git diff --check passed. No assertion, timeout, financial oracle or axe rule changed.
- Screenshots inspected for dark paper, Explorer, settings and mobile annual report; existing specs' historical PNG outputs restored. Temporary diagnostic specs removed.
