# Heute monthly charts — #572

Implementation handoff, 2026-10-28. Base: verified live
`ea86c24fe21b524cd90d88c04389f988e7b1bc1d`; source/test freeze:
`5a927943b8eadd653d408d96d8d4f04e9f1349e4` on
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
| `e2e/heute.spec.ts` | Exercise both chart inspections, API/tile/endpoint parity, a synthetic historical gap, desktop KPI/chart bounds, both themes, Axe, overflow, chart target height and privacy in the configured desktop/390px/WebKit profiles. No existing timeout, financial expectation or assertion is relaxed. |
| `apps/web/src/pwa/offline-wealth-comparison.test.tsx` | Render the real saved Heute view with snapshot I/O supplied by a synthetic fixture: null is unavailable, zero stays zero, positive/negative 123 cents retain their sign, and current wealth remains 15,001 cents. |
| `packages/fixtures/src/heute.test.ts` | Narrow the now-nullable comparison/history before arithmetic. Fully quoted sample data must still be complete; the existing 85,744 / −1,014 / 63,606 / 71,456 EUR expectations are unchanged. |

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

Local work used only native Git/PowerShell/`rg` under the owner's RAM constraint.
`git diff --check` passed at the source freeze. No local Node install, test, build,
browser, formatter or lint was run. Cloud green checks, formatting, measured
desktop geometry, desktop/390px/WebKit light/dark screenshots/Axe and capable
independent full-diff review are still required. Emulation is not physical iPhone
evidence. Nothing here claims CI, integration, live delivery or issue completion.
