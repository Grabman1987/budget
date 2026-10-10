# Portfolio package D — 2026-10-09

Scope: #297–#301 and #346, based on `b78e249f`, on
`codex/pkg-d-portfolio-1009`. Synthetic data only.

## Remaining gaps and delivery

- #297: Report 4.2 already named composition and R13 bases. The position list now
  names its securities market-value denominator without cash. Soll/Ist names the
  selected net allocation universe and signed cash reconciliation; R14/R15 name
  their gross numerator and net denominator, including negative/over-100% shares.
  The formulas and percentages are unchanged.
- #298: The existing separate unheld-instrument catalog now uses native, initially
  closed `details`, with a count. Its complete instrument list and existing detail
  and metadata editing routes remain available.
- #299: The quality warning links each unclassified instrument to the shared dated
  assignment form in class settings. Cash links to the existing account settings.
  Estimated and stale product counts are distinct; provisional warnings and the
  existing savings-optimisation restriction remain.
- #300: The shared checkbox chooser explains the portfolio-only setup state when
  no benchmark is selected. Selection and clearing use the unchanged persisted,
  audited write path; no default is introduced.
- #301: Current class metrics precede collapsed historical/unused classes. All
  class histories and chart series remain present. The existing dated valuation
  series supplies a `currentHolding` presentation flag, based on end-date units and
  class weights, rather than value or allocation membership. A held position that
  rounds to zero cents or is excluded from allocation therefore stays current.
  Dated attribution, the selected return window, Modified Dietz annualisation and
  separately labelled lifetime realised gains retain their methods and meaning.
- #346: Allocation's legend/source tables and the cost report's secondary summary
  follow the main content at full width. Numeric table columns, links and filters
  remain intact. The old 1440px source-grid overrides were removed. Reports 4.1,
  4.3 and 4.4 already have sequential outer report composition; depot comparisons
  and metric grids are retained because they compare figures, not secondary panels.

No migration, dependency, new financial method, booking or provider access.
The only shared read-model change is the Portfolio performance presentation flag.

## Verification

- `npm ci` completed: 506 packages; local cache only.
- Web, DB and server TypeScript checks passed (exit 0).
- Scoped ESLint passed (exit 0).
- Focused Vitest: 5 files / 30 tests passed (exit 0). The class grouping and dated
  holding flag were first reproduced as RED; the excluded, zero-cent holding and
  sold/reclassified class regressions pass. A zero-price fixture was rejected by
  the positive-price constraint and corrected to a positive one-micro quote that
  rounds to zero cents, preserving the assertion.
- `npm run build:e2e` ran once and passed. The later holding-marker review required
  focused web/server rebuilds; the final web copy rebuild also passed. Existing
  Rollup annotation, chunk-size and mixed-import warnings remain.
- Full `npm run check` and the full browser suite were intentionally omitted under
  the package's memory-limited owner override. CI is the final gate.

- Scoped Prettier and `git diff --check` passed (exit 0).
- Final affected browser matrix: desktop 7 passed and mobile 7 passed (each includes
  three setup cases), one worker, port 4885. Axe, page containment, 44px catalog and
  assignment targets, keyboard collapse, detail/edit routes, persisted selection
  and clearing, class-history grouping and full-width source order passed.
- Desktop evidence recapture: 6 passed (three setup cases plus three capture flows).
  Local light/dark functional captures were inspected; selected light captures are
  committed below. No screenshot baseline was changed.
- Final performance capture refresh: desktop/mobile 5 passed (three setup cases),
  after resetting focus and scroll before capture. One intervening startup was
  rejected because the previous test server was still releasing port 4885; a
  listener/process check confirmed it had exited, then the unchanged-port retry
  passed.

The initial desktop run passed catalog and quality-link flows; allocation was
still loading at the 5-second assertion deadline, and the benchmark flow exceeded
its 30-second test deadline during reload. Traces showed loading states. The
affected specs now wait for report responses and use bounded 120-second test
deadlines; no financial assertion was weakened.

## Visual scope and owner steps

| View | Desktop 1440px | Phone 390px |
| --- | --- | --- |
| Portfolio bases and quality links | [Desktop](portfolio-bases-light-desktop.png) | [Phone](portfolio-bases-light-mobile.png) |
| Allocation sources | [Desktop](allocation-full-width-desktop.png) | [Phone](allocation-full-width-mobile.png) |
| Performance class comparison | [Desktop](performance-comparison-light-desktop.png) | [Phone](performance-comparison-light-mobile.png) |
| Costs summary | [Desktop](costs-full-width-desktop.png) | [Phone](costs-full-width-mobile.png) |

No screenshot baselines were regenerated. The affected specs use evidence
captures, not committed Portfolio pixel baselines. Review Portfolio overview,
allocation legend/source tables, benchmark/class comparison and cost-summary
captures on desktop 1440px and phone 390px. CI/Linux visuals and physical iPhone
acceptance remain separate from local Chromium checks.

Review the copy, classification links and collapsed lists. No keys, consents,
migration or account/provider setup is required. Required CI, integration and
owner acceptance remain open; do not merge as part of this task.

## Git delivery blocker

Normal `git add` and `git commit` were attempted. Both failed with
`Unable to create .../.git/worktrees/budget-pkg-d/index.lock: Permission denied`.
The managed sandbox prevents writing this worktree's index. No alternate index,
ref manipulation or permission workaround was used. There are no new commits;
the existing index is unchanged and the working-tree changes are retained.
Push and PR creation require a committed task diff and were not performed.
[Prepared PR body](PR.md) is available locally, together with these captures.

From a normal repository terminal, commit the reviewed changes on the existing
branch, push it, and open the normal PR using the supplied task title and body.
The standard `git status` currently lists the retained modifications; it is not
clean, because discarding the requested work would lose the delivery.
