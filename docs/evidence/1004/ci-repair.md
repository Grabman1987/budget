# PR #1014 CI repair

Refs #1004. Synthetic data only.

## Failure classification

All failed jobs from run `42477473978` were read with `gh run view --log-failed`.

- Desktop contract drift: buttons 36px, small actions/segment buttons 34px, fields 38px, with 36px square header icons. Some phone-project specs create separate fine-pointer desktop contexts; expectations follow the actual context. Touch checks retain their existing 44px/subpixel floor.
- Product regressions: shared CSS overrode the growing capture note, phone borderless fields, phone focus behavior and the specialized booking-kind switch. Scope those rules so the existing capture layout wins; preserve the compact Plan group row with a 34px desktop add action.
- Merge integration: retain main's newer mobile dock (44px navigation plus safe-area padding), header and FAB clearance; retain its CI-generated conflicted baselines.
- Reachable UI drift: wealth period selects are now segments. Preserve financial assertions and test the same period controls.
- Synchronization: wait for the exiting booking dialog, screen disclosure closure before printing, and dismissal of the saved-source toast before a full-page contrast scan.
- Infrastructure: Docker downloaded a partial Litestream archive; restore-test received HTTP 504. Requested failed-job rerun, without changing deployment/workflow files.

No financial expectations, timeouts, skips, screenshot tolerances or touch minimums were relaxed. Visual updates are permitted only through the scoped Linux snapshot workflow.

## Local evidence

Workspace typecheck, changed-file ESLint/Prettier and the CSS scale check passed.
The affected token and wealth overview Vitest files passed all nine tests with
`VITEST_MAX_WORKERS=1`.

The focused mobile capture run used one worker. Chromium reached the strict field visibility and light-theme Axe checks with the clipped date fixed; the run later exceeded unchanged 30-second budgets in capture/Axe and WebKit startup/navigation under concurrent machine load. This is partial evidence, not a passing browser run. Required exact-head CI remains the delivery gate.

Independent read-only review of the final CSS/helper/spec diff found no remaining findings.

## Test-file rationale

| File | Reason |
| --- | --- |
| `e2e/bank-inbox-bulk.spec.ts` | Replace legacy desktop-only 44px minimum height with literal #1004 control heights using actual ON/pointer/viewport; retain touch, widths, containment and financial assertions. |
| `e2e/bank-sync.spec.ts` | Replace legacy desktop-only 44px minimum height with literal #1004 control heights using actual ON/pointer/viewport; retain touch, widths, containment and financial assertions. |
| `e2e/capture-dialog-layout.spec.ts` | Replace legacy desktop-only 44px minimum height with literal #1004 control heights using actual ON/pointer/viewport; retain touch, widths, containment and financial assertions. |
| `e2e/capture.spec.ts` | Keep content-driven note sizing; select literal desktop action heights and wait for the exiting dialog before reopening. |
| `e2e/control-geometry.ts` | Centralize independent literal geometry expectations gated on the actual ON marker and fine-pointer >=1024px; no computed CSS sizes determine expected values. |
| `e2e/fab-focus-q5.spec.ts` | Replace legacy desktop-only 44px minimum height with literal #1004 control heights using actual ON/pointer/viewport; retain touch, widths, containment and financial assertions. |
| `e2e/freedom.spec.ts` | Expect the retained period segment group after replacing wealth period selects. |
| `e2e/header-q5.spec.ts` | Check literal pointer-specific heights and 36px compact header icons; retain 44px touch targets and all non-icon widths. |
| `e2e/heute-attention-mobile-shell.spec.ts` | Replace legacy desktop-only 44px minimum height with literal #1004 control heights using actual ON/pointer/viewport; retain touch, widths, containment and financial assertions. |
| `e2e/inbox-pagination.spec.ts` | Replace legacy desktop-only 44px minimum height with literal #1004 control heights using actual ON/pointer/viewport; retain touch, widths, containment and financial assertions. |
| `e2e/income-pause.spec.ts` | Replace legacy desktop-only 44px minimum height with literal #1004 control heights using actual ON/pointer/viewport; retain touch, widths, containment and financial assertions. |
| `e2e/investment-settings.spec.ts` | Replace legacy desktop-only 44px minimum height with literal #1004 control heights using actual ON/pointer/viewport; retain touch, widths, containment and financial assertions. |
| `e2e/issue-1004-fine-controls.spec.ts` | Preserve the merged main dock contract: 44px navigation plus the minimum or synthetic safe-area inset. |
| `e2e/issue-481-single-category-band.spec.ts` | Keep fine-pointer group rows within 36px; wide touch explicitly retains a 44px action inside its two row borders. |
| `e2e/issue-526-stage-table.spec.ts` | Replace legacy desktop-only 44px minimum height with literal #1004 control heights using actual ON/pointer/viewport; retain touch, widths, containment and financial assertions. |
| `e2e/issue-562-bank-suggestions.spec.ts` | Replace legacy desktop-only 44px minimum height with literal #1004 control heights using actual ON/pointer/viewport; retain touch, widths, containment and financial assertions. |
| `e2e/issue-566-task-sources.spec.ts` | Replace legacy desktop-only 44px minimum height with literal #1004 control heights using actual ON/pointer/viewport; retain touch, widths, containment and financial assertions. |
| `e2e/issue-568-569-forecast.spec.ts` | Replace legacy desktop-only 44px minimum height with literal #1004 control heights using actual ON/pointer/viewport; retain touch, widths, containment and financial assertions. |
| `e2e/issue-570-heute-titelblatt.spec.ts` | Check literal pointer-specific heights and 36px compact header icons; retain 44px touch targets and all non-icon widths. |
| `e2e/issue-577-account-overview.spec.ts` | Replace legacy desktop-only 44px minimum height with literal #1004 control heights using actual ON/pointer/viewport; retain touch, widths, containment and financial assertions. |
| `e2e/issue-578-account-review.spec.ts` | Replace legacy desktop-only 44px minimum height with literal #1004 control heights using actual ON/pointer/viewport; retain touch, widths, containment and financial assertions. |
| `e2e/issue-580-account-chart.spec.ts` | Replace legacy desktop-only 44px minimum height with literal #1004 control heights using actual ON/pointer/viewport; retain touch, widths, containment and financial assertions. |
| `e2e/issue-583-capture-two-column.spec.ts` | Retain the 104px growing note and all containment checks; distinguish desktop action and field heights from touch targets. |
| `e2e/issue-589-plan-filters.spec.ts` | Replace legacy desktop-only 44px minimum height with literal #1004 control heights using actual ON/pointer/viewport; retain touch, widths, containment and financial assertions. |
| `e2e/issue-592-593-plan-panel.spec.ts` | Replace legacy desktop-only 44px minimum height with literal #1004 control heights using actual ON/pointer/viewport; retain touch, widths, containment and financial assertions. |
| `e2e/issue-604-goal-lifecycle.spec.ts` | Replace legacy desktop-only 44px minimum height with literal #1004 control heights using actual ON/pointer/viewport; retain touch, widths, containment and financial assertions. |
| `e2e/issue-606-payment-history.spec.ts` | Replace legacy desktop-only 44px minimum height with literal #1004 control heights using actual ON/pointer/viewport; retain touch, widths, containment and financial assertions. |
| `e2e/issue-607-payment-lifecycle.spec.ts` | Replace legacy desktop-only 44px minimum height with literal #1004 control heights using actual ON/pointer/viewport; retain touch, widths, containment and financial assertions. |
| `e2e/issue-625-explorer-templates.spec.ts` | Check literal pointer-specific close-button heights, including geometry captured during real pointer events; preserve event delivery, containment and financial assertions. |
| `e2e/issue-626-explorer-chart-toggle.spec.ts` | Replace legacy desktop-only 44px minimum height with literal #1004 control heights using actual ON/pointer/viewport; retain touch, widths, containment and financial assertions. |
| `e2e/issue-724-account-bank-review.spec.ts` | Replace legacy desktop-only 44px minimum height with literal #1004 control heights using actual ON/pointer/viewport; retain touch, widths, containment and financial assertions. |
| `e2e/issue-726-statement-intake.spec.ts` | Replace legacy desktop-only 44px minimum height with literal #1004 control heights using actual ON/pointer/viewport; retain touch, widths, containment and financial assertions. |
| `e2e/issue-727-statement-settlement.spec.ts` | Replace legacy desktop-only 44px minimum height with literal #1004 control heights using actual ON/pointer/viewport; retain touch, widths, containment and financial assertions. |
| `e2e/issue-740-statement-receipt-links.spec.ts` | Replace legacy desktop-only 44px minimum height with literal #1004 control heights using actual ON/pointer/viewport; retain touch, widths, containment and financial assertions. |
| `e2e/issue-741-card-automation.spec.ts` | Replace legacy desktop-only 44px minimum height with literal #1004 control heights using actual ON/pointer/viewport; retain touch, widths, containment and financial assertions. |
| `e2e/issue-741-payroll-automation.spec.ts` | Replace legacy desktop-only 44px minimum height with literal #1004 control heights using actual ON/pointer/viewport; retain touch, widths, containment and financial assertions. |
| `e2e/issue-745-activity-table.spec.ts` | Replace legacy desktop-only 44px minimum height with literal #1004 control heights using actual ON/pointer/viewport; retain touch, widths, containment and financial assertions. |
| `e2e/issue-832-month-plan.spec.ts` | Replace legacy desktop-only 44px minimum height with literal #1004 control heights using actual ON/pointer/viewport; retain touch, widths, containment and financial assertions. |
| `e2e/issue-838-account-overview.spec.ts` | Replace legacy desktop-only 44px minimum height with literal #1004 control heights using actual ON/pointer/viewport; retain touch, widths, containment and financial assertions. |
| `e2e/issue-839-account-detail.spec.ts` | Replace legacy desktop-only 44px minimum height with literal #1004 control heights using actual ON/pointer/viewport; retain touch, widths, containment and financial assertions. |
| `e2e/issue-843-v3-layout.spec.ts` | Expect the authorized wealth period segment group, preserving route structure and chart checks. |
| `e2e/issue-847-contact-settings.spec.ts` | Replace legacy desktop-only 44px minimum height with literal #1004 control heights using actual ON/pointer/viewport; retain touch, widths, containment and financial assertions. |
| `e2e/issue-855-flow-savings-bodies.spec.ts` | Wait for user collapse to finish before testing print opening and restoration; preserve all print assertions. |
| `e2e/issue-994-sync-recap.spec.ts` | Replace legacy desktop-only 44px minimum height with literal #1004 control heights using actual ON/pointer/viewport; retain touch, widths, containment and financial assertions. |
| `e2e/liquidity-navigation.spec.ts` | Replace legacy desktop-only 44px minimum height with literal #1004 control heights using actual ON/pointer/viewport; retain touch, widths, containment and financial assertions. |
| `e2e/pace-marker.spec.ts` | Replace legacy desktop-only 44px minimum height with literal #1004 control heights using actual ON/pointer/viewport; retain touch, widths, containment and financial assertions. |
| `e2e/payments-preview-report.spec.ts` | Replace legacy desktop-only 44px minimum height with literal #1004 control heights using actual ON/pointer/viewport; retain touch, widths, containment and financial assertions. |
| `e2e/payslip-intake.spec.ts` | Dismiss the saved-source toast with its existing Escape behavior before Axe; preserve contrast and Undo checks. |
| `e2e/read-source.spec.ts` | Replace legacy desktop-only 44px minimum height with literal #1004 control heights using actual ON/pointer/viewport; retain touch, widths, containment and financial assertions. |
| `e2e/register-upcoming.spec.ts` | Replace legacy desktop-only 44px minimum height with literal #1004 control heights using actual ON/pointer/viewport; retain touch, widths, containment and financial assertions. |
| `e2e/report-polish.spec.ts` | Replace legacy desktop-only 44px minimum height with literal #1004 control heights using actual ON/pointer/viewport; retain touch, widths, containment and financial assertions. |
| `e2e/tap-targets.spec.ts` | Expect the approved 34px ON desktop segment; retain the 28px OFF and 44px touch checks. |
