# SPEC-002 — Target cadence, snooze and guarded funding

Status: proposed additive specification, baseline `01a10de8` (2026-10-15). WP-006. Existing `SPEC.md` and owner directives prevail.

## 1. Goal / user problem

People need to plan weekly sinking funds and pause a monthly target for one month without changing history. Plan › Monat currently calculates monthly, by-date and keep-balance category targets, but has no weekly set-aside cadence or month-specific snooze. Users also need a safe way to fund selected categories from available budget money or reset selected current-month assignments to zero.

## 2. Sources / reference behavior

References: YNAB-020–031/089/090, Toolkit CustomAverageBudgeting/QuickBudgetWarning, ACT-020–027 and their variants in [the matrix](../feature-matrix/features.csv). Weekly set-aside is distinct from refill; Actual templates are not adopted wholesale.

Reuse `packages/domain/src/ledger/targets.ts` (`targetNeed`, `waterfallFill`), `packages/db/src/schema/budget.ts` (`categoryTarget`, `envelopeMonth`), `apps/server/src/api/budget.ts`, `apps/web/src/budget/category-panel.tsx`, `apps/web/src/budget/plan-page.tsx` and `apps/web/src/budget/plan-inspector.tsx`. The nine-stage money-flow waterfall in `SPEC.md` remains authoritative. `docs/product/target-model.md` retains existing calendar-month means and rejects replacing them with a second target engine. Reference findings are inputs, not proof of feature parity.

## 3. Intended Budget behavior

Add an optional weekly set-aside cadence for an eligible category target. The user selects a weekday; each calendar month requires the weekly amount once per occurrence of that weekday, so months contain four or five installments. Add a month-specific snooze that exempts that category's target from funding need for that month only. Add selected-category funding actions: preview proposed assignments, revalidate on apply, then record all approved changes as one audited undo group. Add selected-zero reset to set current-month assigned amounts to exactly 0 cents. Keep all behavior inside the existing Plan boundary and current distributable funds.

## 4. Scope / exclusions

In scope: weekly set-aside amount and weekday; one-month target snooze; selected funding preview/apply; selected current-month zero reset; audit, conflict checks and undo. Excluded: a new template engine, target dependency graph, automatic recurring assignment, predictive/stochastic funding, target priority replacement, cross-month bulk changes, historical recalculation, and changes to the nine-stage waterfall or calendar-average methods. Snoozing never creates, deletes or edits a booking.

## 5. Flows / error / empty

In Plan › Monat, the user opens a category target editor, chooses a weekly amount and `Wochentag`, reviews the monthly occurrence count, and saves an effective target version. The grid offers `Ziel diesen Monat aussetzen`; confirmation records the snooze for the selected month. `Ausgewählte Ziele finanzieren` opens a read-only preview with category, assigned amount, need, proposed amount and exclusion reason. `Ausgewählte Zuweisungen auf 0 setzen` previews exact negative deltas. Empty selection disables both actions. If all targets are met or snoozed, show “Keine Zuweisung erforderlich” and make no write. A stale preview returns conflicts and requires a new preview; no silent partial success.

## 6. Business rules / formulas

Money is signed integer cents. For weekly set-aside amount `A` per weekday occurrence and weekday `w`, let `N(m,w)` count local calendar dates in month `m` whose weekday is `w`; gross need is `A × N(m,w)`, and remaining need is `max(0, gross − assignedCents)`. This is set-aside, so carry does not reduce gross need. Four occurrences at €20.00 require €80.00; five require €100.00. Do not divide by 4.33, prorate by days, or shift to business days. Weekly set-aside differs from the existing monthly amount every n months target. A snoozed target contributes 0 cents of target need for that category/month; existing assignment, carry, activity, available, target version and prior months remain unchanged. Ordinary target calculations still determine balances. Funding proposals use the existing distributable amount and nine stages in their current order. Selected filtering cannot reorder stages or exceed need. Apply writes only reviewed proposals. Zero reset changes each selected eligible current-month assignment to zero, with an exact reversal delta; it never edits other months or creates bookings.

## 7. Examples / edge cases

A weekly €20 target whose weekday occurs four times in April requires €80.00; five times in May requires €100.00. If €30.00 is already assigned and the set-aside mode does not deduct carry, remaining need is €50.00 and €70.00. Snoozing April makes April target need 0 while the €30.00 assignment and resulting balance stay visible. If selected categories need €40.00 but only €25.00 is distributable, propose at most €25.00 and show the shortfall. If a selected category becomes hidden, deleted, locked or concurrently changed between preview and apply, reject/recompute the operation before commit; never silently apply stale partial results. Zero-resetting €12.34 and €0.00 shows −€12.34 for the first row and no mutation for the second.

## 8. Model / migrations

Add only absent intent. Prefer nullable `weekly_day` (ISO Monday=1 through Sunday=7) on the existing target version rather than changing the SQLite kind CHECK: non-null means weekly set-aside and is valid only with `kind=monthly`, `every_months=1`, no `target_date` and no `due_day`. For that cadence, existing `amount_cents` means cents per weekday occurrence. API/UI expose the explicit cadence and never infer it from the label. Existing null-field rows retain today's interpretation; `valid_from` remains an ISO month, so no partial-month prorating is introduced. Add a small month/category snooze record uniquely keyed by `(category_id, month)`, with provenance under existing audit conventions. Do not persist derived occurrence counts, need or available balances. Do not rewrite historical envelope months, target versions or assignments. Validate compatible field combinations and cents at database and API boundaries; no backfill is needed.

## 9. Interfaces / integrations

Proposed extensions to `/api/categories/:id/target` and `/api/budget/:month`: target write with explicit cadence; `POST /:month/target-snoozes`; `POST /:month/funding-preview` returning category need/proposal/exclusion and preview token; `POST /:month/funding-apply`; and corresponding zero-preview/apply operations. Names are proposals, not current APIs. Validate with Zod and write through repository/domain functions in one `withGroup` transaction. Token binds selected IDs, month, target/assignment versions, current distributable amount and policy version. Apply re-reads and recomputes. Use existing audit-group undo. No external integration.

## 10. Navigation / design

Keep Plan › Monat (`Plan › Monat`). Edit cadence in the existing target inspector; place funding/reset in the existing selected-category action surface. Follow the Plan inspector exception from SPEC #446; no new dashboard or permanent side panel. German labels: `Wöchentlich zurücklegen`, `Wochentag`, `Ziel diesen Monat aussetzen`, `Ausgewählte Ziele finanzieren`, `Vorschau`, `Übernehmen`, `Ausgewählte Zuweisungen auf 0 setzen`. Show occurrence count beside exact euro amount. Keep keyboard access, existing semantic tokens and 44px phone touch targets; retain the current collapsible inspector below its breakpoint.

## 11. Privacy / security / performance

Require the existing authenticated same-origin session and server-side authorization; follow current CSRF policy. Preview is read-only and short-lived. Apply is atomic, retry-safe, revalidated and audited; never trust client-supplied need/available values. Do not add category names or amounts to logs beyond existing audit policy. Bound selections (initial recommendation 100) and response size. Calculation cost is linear in selected categories plus current Plan projection; no historical day scan is needed to count weekdays. Preserve reconciliation/locked assignment rules and undo.

## 12. Dependencies

WP-006 / SPEC-002; CAP-003 and reuse from CAP-001. Dependencies: Plan month read model, current target calculation, nine-stage waterfall, target versioning, assignments repository, audit/undo, API validation and Plan UI. No new package. Confirm component placement against the live target inspector during implementation. This does not depend on reference products or extension runtime.

## 13. Acceptance criteria

- AC-002-01: Four weekday occurrences at 2,000 cents yield 8,000 cents; five yield 10,000 cents, using integer cents.
- AC-002-02: Snoozing category C in 2026-04 yields zero target need for C that month, leaves assignment/activity/carry unchanged and leaves March/May unchanged.
- AC-002-03: Preview follows existing nine-stage ordering, never exceeds need or distributable funds, and shows shortfalls/exclusions before writes.
- AC-002-04: Any relevant target/assignment/fund change after preview rejects stale apply with no writes; refreshed apply creates one audit group and one undo restores all changes.
- AC-002-05: Zero preview shows exact cents; apply affects only selected eligible current-month assignments and is reversible.
- AC-002-06: Existing monthly, by-date, keep-balance, calendar-average and card-reserve fixtures remain unchanged when new fields are absent.

## 14. Tests / validation

Use independently stated dates: April 2026 has four Fridays and May 2026 has five; at 2,000 cents expected results are 8,000 and 10,000. Cover month boundaries, leap years, timezone-independent ISO weekdays, zero amount and invalid weekday/range. Test snooze current month only and unchanged history/balances. API tests create preview, mutate target/assignment concurrently, then assert conflict and zero writes; separately assert one transaction/group and full undo. Test nine-stage ordering and distributable shortfall with literal fixtures. UI tests assert occurrence count, German labels, empty/excluded state, keyboard flow, phone target size and preview-before-confirm. Run migration forward and backup/export compatibility checks. Never compute expected values by calling the production function under test.

## 15. Open decisions / recommendations

Recommend only weekly set-aside, per-category per-month snooze, and guarded selected funding/reset using the existing waterfall. Stop for owner review if implementation would change the nine-stage order, rewrite historical envelope rows, change default target meaning, or consume money outside current distributable funds. Confirm whether cadence belongs in the existing target editor or an adjacent affordance; default to the target inspector and preserve effective-version semantics.
