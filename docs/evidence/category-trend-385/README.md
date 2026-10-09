# Category trend (#385)

Report 1.6 now compares selected categories over the existing report period. Category IDs
(`kategorien`), the period (`zeitraum`) and the optional previous-year series (`vorjahr`)
live in the URL. The largest category remains the default; clicking an overview row selects
that category, and the expandable checkbox list supports comparisons and categories with
zero or negative net spending.

One category keeps Ist bars and assigned Plan marks. Comparisons use the same scale.
Previous-year months use the existing `12 4 2 4` dash-dot grammar; absent months interrupt
the line and show `–`, while recorded zero remains zero. Accessible monthly links and chart
points open the exact calendar month. Heatmap cells in report 2.1 use the same drill-down.

The existing booking endpoint accepts the optional `basis=category-spending` read filter.
It reuses `reportTables(..., { withSources: true })`, including inferred refunds, split
contributions and existing Zukunft set-aside sources. Each listed booking keeps its cash
amount and displays its category contribution separately. The category net total covers
all matching pages and stops at the server's report date. Ordinary booking filters retain
their existing behavior. No endpoint, money formula, migration or dependency was added.

Minimal shared changes were necessary in the booking read model/filter plumbing and in
`ChartSvg`: an opt-in group role exposes chart links without nesting them inside an image.
Other charts retain their default image role. Previous-year markers do not intercept clicks
on coincident actual points. All amounts use `useAmountPrivacy` and existing formatters.

## Verification

- Synthetic TDD: the new domain/read-model tests failed before implementation; the
  Zukunft regression reproduced a zero/actual contribution discrepancy before correction.
- Typecheck passed for `@budget/domain`, `@budget/db`, `@budget/ui`, `@budget/server`
  and `@budget/web`.
- Targeted Vitest: 8 files, 75 tests passed (74.69 s). Final chart-only rerun:
  1 file, 1 test passed (11.11 s).
- ESLint and Prettier passed for changed source/test files.
- `npm run build:e2e` passed once. Incremental web/server rebuilds followed the
  accessibility and click-interception corrections. Existing Rollup annotation/mixed-import
  warnings remain outside this package.
- Browser coverage: all six affected functional cases passed on desktop (1440 px) and
  mobile (390 px): three new category-trend cases and the three existing report 1.6 cases.
  Desktop initially had eight passes and one click-interception failure; the corrected
  click and mask cases then passed in a five-test run including bootstrap (1.1 min).
  Mobile initially had eight passes and a test-only closed-profile-menu timeout; the
  corrected mask case passed in a four-test run including bootstrap (48.8 s).
- Light/dark Axe: no serious/critical findings. No horizontal page scroll; heatmap monthly
  links measured at least 44 px in both dimensions. URL selection/reload, diagram-point
  navigation, net category totals, missing previous-year values and masking passed.
- Reviewed light/dark desktop/mobile captures; all eight synthetic PNGs are retained here.
- CSS scale checker and `git diff --check` passed.
- Full `npm run check` and the full E2E suite were deliberately omitted under the package's
  memory constraint. CI remains the final gate.

No visual snapshot baseline was regenerated or is expected to change: report specs capture
review evidence, and shell snapshots cover the unchanged report catalog. The PNG files in
this directory are synthetic review captures, not baselines.

Owner steps: review the report interaction and images, await required CI, and perform normal
product acceptance after deployment. No keys, consent or migration steps are required.

Focused commands used `--maxWorkers=1` for Vitest and `--workers=1` for Playwright.
Playwright used `E2E_PORT=4900`, `E2E_START_TIMEOUT=300000`, projects `desktop`/`mobile`,
only `e2e/category-trend.spec.ts` and the report 1.6 cases in the changed
`e2e/report-tables.spec.ts`. Failed cases were rerun selectively after tracing their causes;
no forced clicks, weakened Axe checks or regenerated baselines were used.
