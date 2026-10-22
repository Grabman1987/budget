# Plan inspector #591 / #592 / #593 — implementation only

Status: source implementation, NOT VALIDATED. No issue acceptance is claimed.

Base: `6420676d257698767931dd151863765cec914acf`.
Branch: `codex/impl-591-593-plan`.
Prepared source: `d785b65eef4f01d17389c5697af76c903aeb181a`.
Historical packet: `bbd367ba8bc90ec1d2e95b4a75063c51719006a1`.
The current commit is the implementation commit containing this document.

## Implemented source

- #591: remembered global/section disclosures, canonical whole-month accounting,
  actual next-month target coverage with signed assignments, separate unmet need
  and excess, and explicit zero-goal/positive-need wording. Existing owner layout
  and compact fine-pointer worksheet styles remain.
- #592: five ordered quick-assignment previews derived from shared
  `quickAssignPlan`, filtered/selected eligible scope, signed deltas, zero-net/busy
  disabling and capped-shortfall copy. Reset is an additive canonical planner/API
  mode with desired absolute zero; original release-first funding guards remain.
- #593: selected-category forms/history/actions, capped one-click suggested cover
  through the existing writer, partial free TBA source selection, private nowrap
  amounts, keyboard/touch Pace tooltip and deliberate responsive heading focus.
  Existing collapsible move/cover controls and write paths remain.

## Historical HOLD findings carried forward with source corrections

1. Remove the more-specific desktop rule hiding the global fold summary.
2. Persist global preference only on explicit summary activation; inspection
   auto-open remains local and clearing selection restores the saved preference.
3. Keep the four-month read key stable across span/phone changes. Require matching
   month records, retain captured panel and left-month snapshots in memory during
   partial responses, and fence unavailable inspector actions without relabelling
   another month's data or unmounting the existing draft.
4. Restore the exact `inspector-income` jump target.
5. Keep null percentage with zero goal and disclose any positive remaining need.

The early selector HOLD and whole-nine HOLD were superseded by the packet's final
independent source review and correspondence. Those reviews cover historical
source only. The present port and its additional source fixes have not received
new independent review or execution evidence.

## Owned and coordinated paths

UI, all under `apps/web/src/budget/`: `envelope-panel.tsx`, `plan-inspector.tsx`,
`plan-model.ts`, `plan-page.tsx`, `quick-assign-actions.tsx` and `plan.css`.
Root coordinated the only additive edits to `apps/server/src/api/schemas.ts` and
`packages/domain/src/ledger/quick-assign.ts`. This document is the only docs change.
No tests, global router/barrels/shared UI, Plan year or savings-goal files changed.

## Deferred by explicit owner direction

No tests were added, edited or run; no typecheck, lint, formatter, build, browser,
CI, PR, merge or deployment was performed. Remaining acceptance for all three
issues includes literal-cent accounting/coverage/action cases, capped negative
reset, exact grouped Undo, persisted disclosures, missing-month/draft/focus flows,
1440/390/WebKit light/dark layout, first-viewport height, privacy, 44px targets and
Axe. Existing-test adapters, if required, remain coordinator-owned.

Before normal feature-branch push, all workflow triggers were read: CI push is
main-only; recovery/register workflows are pull-request-only; snapshots are manual;
deployment is main CI completion or manual main. No workflow or protection changed.

## Follow-up to independent source review — NOT VALIDATED

The [independent source review](591-593-plan-source-review.md) of
`b5b971902416bd933e1185b261d247a6b766305e` identified three P2 read/scope
defects. This follow-up limits the no-selection quick-action IDs to category rows
actually rendered beneath expanded groups in both single- and multi-month tables.
Explicit selections retain their prior scope and ordering, so the displayed
preview and POST use the same ordered IDs. The global month status now counts
underfunded and overspent envelopes from the complete canonical month summary,
including hidden categories omitted from table rows. Finally, a failed or
in-flight bounded month refetch may keep cached data and the inspector draft
visible, but the inspector's money shortcuts stay unavailable until a successful
fresh bounded read; the existing source-unavailable notice and disabled selected
fieldset express that state. No financial formula, server writer or Undo path was
changed.

The corrected source awaits independent exact-delta review. No tests, test edits,
checks, typechecks, builds, browser/accessibility run, CI, PR, merge or deployment
were performed. All issue acceptance and LIVE status remain open.
