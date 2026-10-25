# Strict Q2 accessibility evidence — #465

The new `e2e/a11y-strict-q2.spec.ts` scans populated pages using the synthetic
sample ledger and its fixed 17 September 2026 clock. It asserts the entire Axe
`violations` array, without impact, rule, tag or page exclusions: minor, moderate,
serious, critical and unclassified findings all fail. Existing tests are unchanged.

| Page | Desktop 1440, light / dark | Chromium 390, light / dark |
| --- | --- | --- |
| `/reports/sparquote` | 0 / 0 violations | 0 / 0 violations |
| `/reports/cashflow` | 0 / 0 violations | 0 / 0 violations |
| `/reports/vermoegen-schulden` | 0 / 0 violations | 0 / 0 violations |
| `/reports/vergleich` | 0 / 0 violations | 0 / 0 violations |
| `/reports/projekte` | 0 / 0 violations | 0 / 0 violations |
| `/reports/gesamtuebersicht` | 0 / 0 violations | 0 / 0 violations |
| `/konten/pruefen` | 0 / 0 violations | 0 / 0 violations |

All phone cases also passed the no-horizontal-page-scroll and minimum 44 × 44 px
visible control/focus-target checks. The inbox checks require one overspent summary
with the full category count, integer-cent deficit and secondary Plan triage link.
Each new case attaches Axe JSON and a full-page capture to the Playwright report.

The first browser run found 4 px comparison-bar inspection targets on phones in
both themes. The page's mobile grid rule still targeted the inner drawing instead
of the interactive wrapper. Moving it to that wrapper and using `--touch` restores
a full-width 44 px target; the drawing retains `--bar-progress`, signs and the
shared zero axis. No `packages/ui` or shell changes were needed. The same strict
tests then passed without changing assertions or tolerances.

Reviewed against `DESIGN.md`, `.impeccable/design.json`, the comparison prototype
and desktop reference through the local Impeccable adapter; no pinned detector
launcher was found in the checked-in tools or installed skill directories.
Current synthetic captures, visually reviewed after the fix:

- [Desktop 1440, light](strict-compare-desktop-light.png)
- [Chromium 390, dark](strict-compare-mobile-dark.png)

## Verification

- `npm ci`: passed once using `npm.cmd` (PowerShell blocks `npm.ps1`).
- `npm run build` and `npm run build:e2e`: passed after the CSS fix, exit code 0.
- `npx playwright test e2e/a11y-strict-q2.spec.ts e2e/compare-report.spec.ts
  --project=desktop --project=mobile`: **33 passed**, including 28 new strict
  cases, both existing comparison cases and 3 setup tests; exit code 0.
- Final `npm run check` under PowerShell with `VITEST_MAX_WORKERS=1`: **440 files,
  4,039 tests passed, no skips**, exit code 0. Typecheck, ESLint and formatting
  passed; the existing unused eslint-disable warning in `panel.tsx` remains.

The initial parallel check completed all 440 files: 4,032 tests passed, 7 failed,
no skips. Failures were in unchanged `capture-form.test.tsx`,
`accounts-settings.test.tsx`, `global-search.test.tsx`, `header-q5.test.tsx`,
`claude-hooks.test.mjs` and `export.test.ts` (two export timeouts). All 135 tests
in those six files passed unchanged with one worker. A subsequent `cmd.exe` full
rerun was stopped after import-worker/CLI sandbox errors: an identical isolated
Node probe reproduces `os.userInfo()` / `uv_os_get_passwd` failure under `cmd.exe`
and succeeds under PowerShell. PowerShell also allowed the browser run above.

WebKit remains the explicitly permitted coverage gap. The queue-pilot instruction
reserves `playwright.config.ts` for draft PR #541; its `webkit-iphone` matcher does
not include this new spec. Configuration and snapshot baselines are unchanged.
No product questions remain. CI remains the merge gate.

## WebKit

The strict Q2 Axe check is registered for the `webkit-iphone` project (iPhone 13, real
WebKit) via its `testMatch` list in `playwright.config.ts`; nothing else in the
configuration, the spec, the Axe rules or any tolerance changed. Synthetic sample data only.

- Command: `npx playwright test e2e/a11y-strict-q2.spec.ts --project=webkit-iphone --workers=1`
- Date: 2026-10-17 (Windows 11 local run), Playwright 1.64.1
- Result: **17 passed / 17** = 14 strict cases (7 pages x light/dark) plus 3 setup tests;
  zero Axe violations at every impact level and no touch target under 44 x 44 px.
- With the default parallel workers, the first local run had 14 passed and 3 failed. The failures were
  browser-infrastructure errors (`browserContext.newPage: Target page, context or browser
  has been closed` inside `AxeBuilder.analyze`, and one 150 s test timeout), not
  accessibility findings. The same three cases passed on the serial rerun, so no app change
  was needed.
