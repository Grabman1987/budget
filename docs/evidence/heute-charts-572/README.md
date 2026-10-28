# Heute monthly charts — #572

Implementation handoff, 2026-10-28. Base: verified live
`ea86c24fe21b524cd90d88c04389f988e7b1bc1d`; formatted source freeze:
`63e1cfc3f62254c02b9ab9f32cc4cd35e73ab642` on
`codex/heute-wealth-chart-572-20261028`.

The owner decision in [#475](https://github.com/Grabman1987/budget/issues/475#issuecomment-6209367096)
and [the page review](../../product/page-review-2026-10-16.md#heute--entscheidungen-16102026-owner)
defines eleven preceding month ends plus today. Keep the approved chart-before-task
order; the permission to scroll to tasks does not waive the separate desktop
1440×900 requirement for the three KPIs, monthly pace and wealth history.

## Bounded change

- Reuse `ChartSvg`, `chartPoints` and `linePath` for pointer/touch and arrow-key
  inspection of exact dates and cents. Dates use proportional spacing. Explicit
  missing values break paths, retain a visible gap marker and expose “Bewertung
  nicht verfügbar”; zero remains a known plotted value.
- Keep `netWorthAsOf(today)` and the current tile/endpoint identical. Only existing
  `availableSection` valuation exceptions become historical nulls, with their
  reason/date retained per point. Unknown errors still propagate. Missing previous
  month/year comparisons remain unavailable rather than becoming zero or current
  wealth. Cost estimates, carried-forward prices and FX selection are unchanged.
- The saved offline view uses its existing null-aware money formatter for the
  annual comparison, retaining a known zero and either sign. A repository-wide
  consumer scan also identified sample-test arithmetic, now guarded explicitly
  against missing values while preserving its literal financial expectations.
- Preserve pace → compact forecast → wealth DOM/mobile order. Desktop uses pace
  beside forecast/wealth. The existing lead disclosure now holds its explanation;
  the daily figure and trigger remain visible. All source links and detailed
  figures remain reachable. No shared report chart API change.
- No financial formula, writer, lock, audit, Undo, schema, dependency, secret,
  production setting or deployment change.

## Changed-test rationale

| File | Regression/acceptance reason |
| --- | --- |
| `apps/server/src/api/heute.test.ts` | A synthetic reserve account with historical missing FX must retain the exact current 193,000 cents, twelve literal dates, real historical zeroes and nullable missing comparisons. A current FX gap must still make current wealth unavailable. The existing price-estimate and wealth parity checks remain unchanged. |
| `apps/web/src/heute/charts.test.tsx` | Exercise the existing visible wealth section with exact 150.01 EUR endpoint, a real zero and a null between two line segments; pointer/keyboard inspection must agree, annual absence must be explicit, and privacy must hide amounts. |
| `e2e/issue-572-heute-charts.spec.ts` | Exercise both chart inspections, API/tile/endpoint parity, a synthetic historical gap, desktop KPI/chart bounds, both themes, Axe, overflow, chart target height and privacy in the configured desktop/390px/WebKit profiles. No existing timeout, financial expectation or assertion is relaxed. |
| `apps/web/src/pwa/offline-wealth-comparison.test.tsx` | Render the real saved Heute view with snapshot I/O supplied by a synthetic fixture: null is unavailable, zero stays zero, positive/negative 123 cents retain their sign, and current wealth remains 15,001 cents. |
| `packages/fixtures/src/heute.test.ts` | Narrow the now-nullable comparison/history before arithmetic. Fully quoted sample data must still be complete; the existing 85,744 / −1,014 / 63,606 / 71,456 EUR expectations are unchanged. |
| `apps/web/src/heute/valuation-attention-511.test.tsx` | Supply the existing fixed-width test adapter now that the retained visible wealth section measures its width. All original quote/cost quality, exact-amount, privacy and source-hint assertions remain unchanged. |

## Evidence and open gates

Tests-first commits were `d5020198` (unit/API) and `01d4cc54` (browser).
The root's [focused RED run 40664135196](https://github.com/Grabman1987/budget/actions/runs/40664135196)
reported 36 passing and four failing tests across the two unit/API files: historical
FX gaps removed current wealth, and null comparisons reached the strict money
formatter. No import/setup failure was reported.

That RED fixture initially used an inverted FX setup. The stored convention is
EUR per native unit; `c9758255` corrects its rate to 500,000 micro-EUR per USD
(USD 100 × EUR 0.50 = EUR 50) while retaining the literal expected current total
193,000 cents. The original RED demonstrates the missing-history/null-renderer
defects, not validation of that conversion expectation.

The independent review found the saved offline view's remaining strict formatter
consumer. Tests-only `ad1dd743` reproduced it in
[offline RED run 40665725021](https://github.com/Grabman1987/budget/actions/runs/40665725021):
the null case failed with the strict formatter's `RangeError`, while the zero and
two signed cases passed. `5a927943` changes that call to the existing `savedMoney`
helper; no separate formatting abstraction is introduced.

The chart acceptance case was moved verbatim from `e2e/heute.spec.ts` to
`e2e/issue-572-heute-charts.spec.ts` so the existing issue-file WebKit discovery
pattern includes it. Its original 60-second test setup, 15-second expect timeout
and saved phone-detail preference are retained. The old Heute spec returns to its
base content; Playwright configuration and all acceptance assertions are unchanged.

The first combined [cloud proof 40667528467](https://github.com/Grabman1987/budget/actions/runs/40667528467)
passed type, build, CSS and lint checks, including the new FX/current-value,
offline, chart and fully quoted sample cases. It remained red: two existing
source-hint tests lacked jsdom's `ResizeObserver`, the desktop chart bottom was
919.8125 pixels against the unchanged 900-pixel bound, and WebKit's pace inspection
jumped from day 6 to day 30 during focus scrolling. The mobile chart acceptance
case passed both themes, Axe, gaps and inspection.

`64778369` supplies the same fixed-width unit adapter already used by the chart
tests, reduces only Heute's desktop sheet top padding/title gap by 24 pixels using
existing tokens, and moves the browser pointer outside the chart before explicit
Escape/ArrowRight selection of its first point. An additional start-date assertion
precedes the unchanged today date/amount and pointer-parity assertions. No font,
chart height, value, 900-pixel bound, 44-pixel bound, timeout, retry or profile is
relaxed. The stale formatter patch was not applied after the semantic edits.

## Fresh focused proof and retained images

[Cloud run 40670044378](https://github.com/Grabman1987/budget/actions/runs/40670044378)
records original source `ab217cd002c70e4deb194c9bdf78df022b7693b8`
(temporary proof revision `6db9f9f3bf6d1cc5390c4ae074a87b2499a3ebd9`).
Its actual final workflow result was **red only for formatting**:

- All 101 unit/API/sample/offline cases passed across 12 files, including the
  unchanged literal 193,000-cent FX case and complete-sample financial oracles.
- Browser discovery included the new chart case on desktop, mobile 390px and
  WebKit iPhone. All three passed on their first attempt, with zero retries and
  no baseline updates. The browser total was 38 passed: 35 actual browser cases
  plus three setup cases; two unchanged older skips remained.
- Both theme passes of the new case reported zero Axe violations. Exact date,
  amount, keyboard/pointer parity, missing-month gap, privacy, 44px target and
  desktop three-KPI/chart bounds of at most 900px passed.
- CSS, lint, type, normal production build, discovery and browser result flags
  were zero. The formatter reported the nine source/test files that form the
  retained patch; its temporary write was restored before the proof continued.

Root independently read and cleared the entire fresh formatting-only patch before
application. SHA-256:
`5895B88800081FBF13445277BE9AEDC2B07CC08735AEED0E15366E1B844A16CD`.
After verifying that exact hash and `git apply --check`, `63e1cfc3` applied and
committed only its nine expected files. No money, dates, null handling, bounds,
timeout, retry or profile changed. The runtime evidence above belongs to the
original source revision; its reuse after this reviewed mechanical formatting and
evidence-only follow-up does not claim a second run on the formatted commit.

The following synthetic original PNGs were copied without editing from the same
run and source revision. Source and destination SHA-256 values matched:

| Retained file | Original artifact path under `test-results/` | SHA-256 |
| --- | --- | --- |
| [Desktop light](desktop-light.png) | `issue-572-heute-charts-mon-03710--honest-gaps-in-both-themes-desktop/heute-charts-light.png` | `B1152B481BDBD534C06EB0421CA0C447CA2D14F7E9B5A5866BF0A92B4E138901` |
| [WebKit iPhone dark](webkit-iphone-dark.png) | `issue-572-heute-charts-mon-03710--honest-gaps-in-both-themes-webkit-iphone/heute-charts-dark.png` | `1359017D68A4ECF9E1310B413F19417808E55B1CCB1597FBE3FB3CC4F16E288A` |

Root visually inspected both originals: the desktop KPIs and both charts were
legible and within the 900px viewport, with the missing month explicit. The WebKit
image records keyboard state in a full-page capture: its visible focused skip
link overlaps Herleitung, and fixed bottom navigation overlaps the forecast
header. This image does not establish an unobstructed full-page layout or a
physical-device Safari result.

Local work used only native Git/PowerShell/`rg` under the owner's RAM constraint.
`git diff --check` passed at the source freeze. No local Node install, test, build,
browser, formatter or lint was run. The retained files and evidence-only text add
no runtime change. Exact public PR-head required CI and the final independent
review/integration/release gates remain open. Nothing here claims a public CI
pass, integration, live delivery, physical iPhone acceptance or issue completion.
