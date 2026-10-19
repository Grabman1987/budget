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
  The next run passed all seven cases, but screenshot review and new strict
  print-mode Axe checks identified unresolved palette/contrast failures after
  dark screen → print. Independent actual-app probes found light root tokens
  with some stale dark surfaces/semantic colors. Neither pre-print Axe analysis
  nor the fixed sample Date is necessary to trigger the defect; both controls
  reproduced it. Reloading in print makes the palette correct, but is diagnostic
  evidence only and is not an acceptance workaround.

  The first new readiness oracle also had an independent instrumentation defect:
  global `document.querySelector('h1')` selects the hidden mobile-shell heading,
  which has no printed rectangle. The actual `.titleblock .report-heading h1`
  is visible and can resolve correctly while that hidden title remains pale.
  The new test now checks the actual visible report heading, body and paper;
  it no longer assumes an arbitrary first table cell uses ordinary ink, because
  missing/percentage/semantic cells legitimately have different roles. The full
  strict print-mode Axe check and all column/value/overflow/geometry assertions
  remain unchanged. This oracle correction is not a product fix: corrected
  actual-app probes still report real contrast failures, including ordinary
  dimension-chain values over stale dark card backgrounds. The exact affected
  container rules were independently diagnosed from matching source/CSSOM rules:
  `.tr-card` and `.titleblock` had no active print-specific background declaration,
  retained the dark painted surface despite `--surface: #fff`, and produced real
  contrast failures. The new print rule explicitly reapplies `background:
  var(--surface)` to exactly those normal containers. Its genuine canonical
  WebKit run at `04aa97c4` passed the three normal setup cases and portrait case,
  but all three table cases still failed strict print Axe: surfaces were now
  white, while 480 failing ordinary foreground entries retained pale `#eef6fc`.
  Independent source/CSSOM review confirmed those ordinary values have no own
  foreground declaration and inherit from body; muted/percentage/delta roles
  were not the failing foreground entries. The same two normal containers now
  explicitly reapply `color: var(--ink)` as well. No descendant, muted, delta,
  heat or semantic selector is reset. Actual canonical rerun is pending; these
  declarations alone do not establish a fix.

  An unproven explicit-shell-color workaround was removed; semantic colors remain
  unchanged. No arbitrary sleep, contrast waiver, reload, fixture alteration or
  browser configuration change substitutes for final strict checks/image review.
  Final browser/PDF artifacts, full suite and production build remain pending.
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
