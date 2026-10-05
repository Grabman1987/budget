# Shared chart inspection — owner feedback 2026-10-04

The existing `ChartSvg` owns pointer selection, nearest-point crosshairs, the value box,
keyboard navigation and outside-tap dismissal. `ChartValues`/`ChartValue` reuse it for HTML
bars and heatmaps. Values use the existing amount-privacy formatter; absent observations
stay unavailable. SVG coordinates are transformed through the actual screen matrix, so
responsive sizing and horizontal scrolling do not change which point is selected. The existing
React portal keeps the value box outside clipped scroll containers; its measured height and
width are constrained to the viewport and it appears above the mobile navigation.

Focus a chart and use Left/Right; Escape dismisses the values. A touch tap selects a point;
a tap outside dismisses it. The date/month/period is the last row. Each visible data series
has its legend swatch, name and exact-cent money value, or a percentage for percent axes.
Sankey nodes and links show money and the share of the source pool. HTML bars and sectors
select their own hit targets; heatmaps have one shared keyboard entry rather than one per cell.

Report arrows follow the catalog, including group boundaries; the first/last endpoint is
unavailable. Alt+Shift+Left/Right navigates while preserving the selected period/month/trend.
Inputs and dialogs retain their keys. No removed React implementation was found in history;
this follows the existing `ALL[i - 1]`/`ALL[i + 1]` prototype implementation.

Report 4.3 exposes the already calculated daily valuations and cumulative signed netflows.
It excludes opening-day flows consistently with the existing window calculation, checks
integer-cent bounds, and keeps the monthly gain rows. It adds no valuation formula,
provider request, write, migration or dependency. Estimated values retain approximation marks;
the report valuation banners are removed, including the selected-month banner in 3.6.

## Wired chart inventory

| Page/report | Chart forms |
| --- | --- |
| Heute | Balance actual/forecast; monthly pace with plan, previous month, forecast and limit; net-worth mini line; pinned-envelope bars; finance-check counts |
| Konten overview/detail | Native/EUR balance line; every account mini line with opening reference; credit-line utilisation |
| Vermögen › Nettovermögen | Daily net worth, own/market change bars, account composition bars |
| Vermögen › Portfolio | Allocation actual/target/band bars |
| Vermögen › Freiheit | Projection and goal line |
| Vermögen › Schulden | Actual debt and both repayment model lines |
| 1.1 Monats-One-Pager | Pace; 50/30/20 layers; net-worth mini line; top-category bars |
| 1.2 Gehaltsreport | Gross/net monthly lines |
| 1.3 Einnahmen | Stacked income-source months |
| 1.4 Geldfluss | Every visible Sankey node/link |
| 1.5 Jahresansicht / 1.8 Gesamttabelle | Shared monthly/category heatmap cells |
| 1.6 Kategorieübersicht | Category mini lines and detail actual/plan bars |
| 1.7 Sparquote und Geldalter | Monthly/rolling/gross savings rates and target; money age and target |
| 1.9 Projekte | Signed monthly result bars; project/month heatmap |
| 2.1 Ausgabenanalyse | Class layers, category bars, changes and category/month heatmap |
| 2.2 Budgettreue | Actual/plan bullet bars; monthly 50/30/20 layers |
| 2.3 Verträge und Abos | Monthly fixed-cost history |
| 2.4 Persönliche Inflation | Own/reference index; own/reference year-on-year percentages |
| 2.5 Empfänger-Analyse | Ranked spending/refund bars |
| 2.6 Bank- und Zinskosten | Annual cost layers; credit utilisation; shared debt projections |
| 3.1 Liquiditätsprognose | Daily balance, buffer and scenario/band values |
| 3.2 Cashflow-Verlauf | Need/want layers, income line, net/capital signed bars |
| 3.3 Vermögensverläufe | Every stored account-type asset/debt layer and net worth |
| 3.4 Jahresvorschau Zahlungen | Running/periodic layers, upper amount and average |
| 3.5 Sparziele-Fortschritt | Saved/target progress bars |
| 3.6 Vermögen & Schulden | Assets/debts monthly bars and net-worth line |
| 4.1 Depots im Vergleich | Depot indices and selected benchmark |
| 4.2 Allocation | Class/product and region/product sunbursts; actual/target history |
| 4.3 Einzahlungen und Wert | Daily value and cumulative netflows; monthly signed gains |
| 4.4 Rendite und Kennzahlen | Portfolio/benchmark and asset-class index lines; monthly return heatmap |
| 5.1 Jahresreport | Income/consumption layers, net-worth line, top-category bars |
| 5.2 Finanz-Check | Daily fulfilled-rule count and total |
| 5.3 Periodenvergleich | Category change bars |
| 5.4 Kontaktabrechnung | Dated running balance |
| Explorer | Shared rows grid/heatmap where present |
| Development showcases | Pace spike; line types, signed/grouped bars and class-layer examples |

Report 4.5 and purely tabular views have no chart to wire. Structural wealth layers retain
their stored weekly/monthly resolution; no synthetic intermediate account balances are created.

## Verification and owner steps

Component coverage checks exact values, swatches, dates, scaled pointer coordinates,
keyboard boundaries/Escape, touch/outside dismissal, privacy, catalog order, period-row
structure, removed banners, daily points and negative/refund geometry. API regressions
cover daily contribution values and a completely sold synthetic portfolio.

Browser coverage visits all report routes plus the main pages/showcases, inspects rendered
charts, verifies touch/keyboard and Sankey values, measures negative-bar contrast in both
themes, and checks the shared period row. Screenshots use only the seeded synthetic ledger.
Final chart browser run: 11 passed (including setup), desktop 1440/mobile 390; both themes
pass the scoped axe and negative-contrast checks. The existing contribution, period-range and
missing-quote regressions passed all 10 functional cases. A broader components/net-worth/report
run passed 54 cases with 9 existing Windows/device skips. Production and e2e builds passed.
The complete local check passed: 309 suites / 2,967 tests, with typecheck and lint green.
On the shared Windows machine it used one worker and longer local timeouts; no test was excluded:
`npm run check -- -- --maxWorkers=1 --testTimeout=30000 --hookTimeout=120000`.

Evidence (synthetic data only): [desktop light](evidence/chart-inspection-1004/desktop-light.png),
[desktop dark](evidence/chart-inspection-1004/desktop-dark.png),
[mobile light](evidence/chart-inspection-1004/mobile-light.png),
[mobile dark](evidence/chart-inspection-1004/mobile-dark.png).

No screenshot baseline is regenerated locally. Expected Linux baseline changes:

- `e2e/components.spec.ts-snapshots/bauteile-{light,dark}-{desktop,mobile}-linux.png`
- `e2e/networth.spec.ts-snapshots/vermoegen-netto-{light,dark}-{desktop,mobile}-linux.png`

The report-header catalog baseline is unchanged. Report-detail evidence changes because of
navigation, the period row, removed banners, daily curves and negative colours. Windows
screenshots do not establish a Linux pixel match. Review/update the eight affected Linux
baselines through [`update-snapshots.yml`](../.github/workflows/update-snapshots.yml), review the draft PR, and accept mouse/touch
behaviour on the owner's device. No keys, provider consents or data migration are needed.


The Windows sandbox denied creation of the worktree's `index.lock`, so local Git metadata
could not be updated. Commits are delivered through the GitHub Git Data API after an exact complete-tree comparison.
The owner must align the local branch with that published branch. These commands preserve working files:

```sh
git fetch origin
git reset --mixed origin/codex/report-charts-1004
git branch --set-upstream-to=origin/codex/report-charts-1004
```
