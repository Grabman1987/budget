Refs #385

Report 1.6 now supports URL-backed category comparisons over its existing period control,
with an optional dash-dot previous-year-month series. Missing months stay blank. Monthly
values and report 2.1 heatmap cells open the matching category and calendar month in bookings.

The existing booking endpoint reuses the report sources for an optional category-spending
filter. Split and inferred refund contributions reconcile exactly; Zukunft set-aside stays
separate from consumption. The booking list shows category net totals and each contribution
alongside the original cash amount. No new endpoint, formula, migration or dependency.

Shared changes are limited to booking filter/read plumbing and an opt-in accessible chart
group role. Amount masking and 44 px monthly link targets are preserved.

Validation: targeted typecheck in five affected packages; ESLint/Prettier on changed files;
75 tests in eight affected Vitest files; E2E build; all six affected functional cases on
desktop and 390 px mobile, including focused reruns. Light/dark Axe found no serious/critical
issues; overflow, touch targets, masking, URL reload and exact drill-down sums passed.
Full local check/full E2E were omitted as instructed for this parallel-job package; CI is the
final gate. Detailed results: [verification evidence](docs/evidence/category-trend-385/README.md).

Review images: [desktop light](docs/evidence/category-trend-385/category-trend-light-desktop.png),
[desktop dark](docs/evidence/category-trend-385/category-trend-dark-desktop.png),
[390 px light](docs/evidence/category-trend-385/category-trend-light-mobile.png),
[390 px dark](docs/evidence/category-trend-385/category-trend-dark-mobile.png).
Affected visual baselines: none; no baseline regeneration.

Owner steps: review the report interaction/screenshots and await required CI before normal
product acceptance. No new credentials, consents or migration steps. This PR does not merge
or deploy the change.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
