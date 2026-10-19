# Shared table-report printing — #556

Scope: one shared print class/stylesheet attached by `TableReportFrame`, based
on `e14932de`. The #552 report-frame prerequisite is live. No financial data,
report calculations, persisted preferences or per-report layouts are changed.

The named `report-table` page uses A4 landscape and 10 mm margins. It applies
only to a sheet containing `.report-table-print`; the existing One-Pager and
Jahresreport keep their unnamed A4 portrait page rules. Report title and data
basis remain, while navigation and screen-only controls are hidden.

Printed tables leave their horizontal scrolling regions, repeat native table
headers, reset sticky first columns and wrap cells within the available width.
The print rules use existing typography/colour tokens. They do not shrink text
to arbitrary sizes or zoom the report. All columns and source values remain.

The existing `month-report.css` hides collapsed section contents only in screen
media and hides section toggles in print. This behavior is reused as-is. Printing
does not change the DOM collapse flags or the user's remembered selection.

## Verification and open gates

- Node 22.23.3; project dependencies installed with `npm ci`.
- Existing frame/section/name regressions: **3 files, 25 tests passed**.
- CSS scale and `git diff --check` passed. Other checks, review and full-suite
  results are recorded separately once actually completed.
- New canonical browser coverage checks Jahresansicht, Kategorieübersicht and
  Sparquote in both themes: Axe, phone overflow/touch targets, a deliberately
  collapsed section restored in print, hidden navigation, unchanged table headers,
  every table cell within its table and all columns within the paper width.
- Desktop Chromium additionally writes actual PDFs and checks their MediaBox
  dimensions for A4 landscape. WebKit runs the same print-media/DOM checks;
  it does not support Playwright PDF generation. A separate regression checks
  that the One-Pager/Jahresreport remain outside the shared page and retain
  portrait PDF dimensions on desktop Chromium.
- An initial genuine WebKit/iPhone run passed the portrait-route case and
  reached the three table cases' print-media assertions, then failed on the
  new test's computed `page` instrumentation. An isolated WebKit 27.2 probe
  parsed the named rule and reported `CSS.supports('page', 'report-table')`
  true, yet returned an empty computed value. That does not establish a paper
  layout defect. The new test now checks actual headers, visibility and bounds;
  no product rule was changed in response to that instrumentation failure.
  The corrected run then found actual Jahresansicht overflow: a 943 px table
  had 985 px scroll width. The screen numeric-cell `white-space: nowrap` and
  padding selectors were more specific than the print reset. The print cell
  selector now overrides those screen rules only within the shared print class.
  A targeted follow-up measured the remaining overflowing year-comparison cells:
  their nested `.dl` screen inline-flex/nowrap marker still occupied up to 90 px
  inside a 47 px cell (for example `+1.149 € · +3 %`). Its print-only reset now
  allows the complete delta and percentage to wrap too. Numbers and column counts
  remain complete, with existing type sizes. Strict geometry and tolerances are
  unchanged, with offending-cell diagnostics added to failures.
  The next run passed all seven cases, but screenshot review found inherited
  dark-theme text remaining pale on white print paper. A new print-mode Axe
  regression reproduced 1.09:1 contrast, even though the root ink token and body
  color already had the light values. The shared print shell now explicitly
  uses the existing `--ink` token so inherited titles and table values use the
  print palette too; explicit semantic delta colors remain intact.
  The final browser run and screenshots/PDF artifacts remain pending.
  WebKit's print emulation cannot establish physical PDF orientation; only
  actual Chromium PDFs prove the specified A4 landscape/portrait dimensions.
  No substitute engine or relaxed geometric tolerance proves readiness.
- Existing tests, print sheets, configuration, manifests, lockfiles and
  screenshot baselines are unchanged. No merge, deployment or completion is
  claimed; #556 remains open until all acceptance and live checks pass.

```bash
npm run build:e2e
npx playwright test e2e/issue-556-table-print.spec.ts --project=desktop --project=mobile --project=webkit-iphone --workers=1
```
