# Wealth #499: signed composition and daily portfolio index

This evidence uses the repository's seeded synthetic sample account (reference date 17 September 2026).
It records signed account composition around one shared zero and the daily time-weighted portfolio index.
The daily line uses stored valuation dates; a stored quote can be carried forward until the next stored quote,
so the chart does not imply fresh daily market quotes. Dates represent valuation inputs, not a promise of a new quote each day.

Screenshots are fresh captures from this change; existing screenshot baselines were not overwritten:

- `networth-desktop-light.jpg` — desktop, light theme.
- `networth-webkit-iphone-dark.jpg` — iPhone WebKit, dark theme.
- `portfolio-desktop-light.jpg` — desktop, light theme.
- `portfolio-webkit-iphone-dark.jpg` — iPhone WebKit full page, dark theme.
- `portfolio-chart-webkit-iphone-dark.jpg` — iPhone WebKit viewport focused on the chart, with readable axes and both endpoint dates visible.

Focused verification:

- Domain, model, and API unit tests: 28 passed, including literal signed-zero geometry, one-sided values, empty values, exact daily window endpoints, subwindows, unchanged monthly index expectations, and tiny index-axis ranges.
- Web TypeScript typecheck passed.
- E2E production build passed.
- Wealth UI browser coverage passed in desktop Chromium, 390px mobile Chromium, and iPhone WebKit: 8 tests including setup in the combined net-worth composition and wealth chart run. It checks chart label spacing and non-overlap at 1M, 1J, and 3J, rendered SVG text size, keyboard chart exploration, mobile overflow, and light/dark Axe.
- A fresh iPhone WebKit evidence capture passed separately: 4 tests including setup.
- Targeted ESLint and Prettier checks passed.
- An independent read-only financial and chart review found no blocking defect in the daily flow window, gap behavior, date placement, or signed common-zero geometry. This is scoped to the Wealth #499 changes, not a whole-application audit.
- After merging `origin/main` at `501f2e8f`, the integrated `npm run check` passed: 433 test files and 3,940 tests. The actual runtime was Node v24.19.0 with `BUDGET_REQUIRE_AGE=1`; typechecks, lint (0 errors; one pre-existing unused-disable warning in `packages/ui/src/components/panel.tsx`), and Prettier passed. The required Node 22 exact-head verification remains with the lead/CI, which will also verify the combined delivery branch.

## Combined delivery verification

After integration with Q2 and main `8b9dbe55`, the lead's final serial full check passed under **Node 22.23.3**, required age enabled: **434 files / 3,951 tests, zero skips**. Typechecks, lint and formatting passed. The earlier standalone Node 24 result above records its actual runtime; it is not presented as a Node 22 run.

The fresh production build and current Playwright 1.64.1 / WebKit 2370 wealth flows passed. The seven phone images were refreshed against that integrated build. The portfolio viewport image was visually reviewed for readable axes and endpoint dates. The broader report batch's unchanged salary-history rerun and initial concurrent seed-hook timeout are documented in [Q2 evidence](../q2/README.md). Exact-head GitHub CI, deployment and live proof remain pending.

Final integration with payroll main `4841e7eb` passed the Node 22 full check: **434 files / 3,962 tests, zero skips**. The rebuilt app passed **7/7 current WebKit integration cases**, including the wealth screen/axis/theme/Axe flow and PDF chooser/drop confirmation/undo. The refreshed debt screenshot comes from this final integrated run. Exact-head CI and live proof remain required.
