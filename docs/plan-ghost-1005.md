# Plan month quick assignment — 05.10.2026

Owner-approved benchmark slice, limited to Plan › Monat. No migration, dependency,
provider call or automatic booking. Suggestions are only text until the owner acts.

- A zero assignment shows `≈` in muted ink for a positive suggestion. An existing
  target takes precedence, including a zero requirement: use the shared `needCents`
  from `summarizeMonth`/`targetNeed`, respecting carry, refill, due date and rhythm.
  Otherwise use median net category spending from three complete calendar months.
- Spending is read from `reportTables` (the source of reports 1.5–1.8 and spending
  reports), including refunds and Zukunft money set aside. The window precedes the
  shown month, or today’s month for future plans; empty months count as zero.
  Net credits never produce a negative spending suggestion or average assignment. The source tooltip
  names the target or the exact history months; screen readers get the same source.
- Wie letzter Monat sets the preceding shown month’s stored assignment (also in
  future plans, preserving negative assignments). Ø 3 Monate sets the shared rounded mean of the history spending.
  Ziel tops up the existing target need; categories without a target stay unchanged.
  Native row checkboxes select one or several spending categories. The action bar
  belongs to the single-month layout; faded cells also appear in adjacent-month columns.
- Leere füllen includes all visible eligible categories, including collapsed groups.
  The selected table grouping supplies order; categories omitted by Triage follow
  in category-list order. Only zero assignments are filled. Nonempty rows are
  rechecked on the server and cannot be overwritten by a stale empty-fill request.
- `POST /api/budget/:month/quick-assign` accepts only a known mode and 1–500 unique
  category IDs. It reuses the existing session/origin guards, synchronous transaction,
  `assignMany`, assignment guard, tracked envelope writes and grouped undo/redo.
  Income, card-payment, advance and nonexistent categories refuse the entire action.
  Reductions in a selection can fund another selected category in that same group.
- Every action is capped at existing Zu verteilen. The boundary category can receive
  partial funding; the toast names changed categories and exact remaining cents and
  category count. No-change responses offer no undo for an empty audit group.

## Verification and visual review

Focused files: `packages/domain/src/ledger/quick-assign.test.ts`,
`apps/server/src/api/budget.test.ts`, `apps/web/src/budget/budget-ui.test.tsx`,
and `e2e/plan-ghost.spec.ts`. Fixtures are synthetic. The browser scenario exercises
all three selected actions, partial empty-fill and grouped undo/redo at 1440/390,
with light/dark Axe checks and screenshots in `test-results/plan-ghost-*.png`.

Local verification (Windows, Node 24.12.0): all workspace typechecks passed;
`npm run check -- -- --maxWorkers=2 --testTimeout=30000` stopped at a formatting
issue in the final added test. After formatting, the remaining stages passed:
`npm run lint` and `npm test -- --maxWorkers=2 --testTimeout=30000` (342 files,
3,217 tests). `npm run build` and the E2E build passed. The new browser scenario
passed twice (desktop/mobile), with zero Axe violations in both themes. The
default four-server browser startup hit Windows ENOMEM; the same scenario passed
with a temporary configuration using one isolated server per attempt and one worker.
Existing bundle/Zod annotations and jsdom scrollTo warnings remain warnings.
Synthetic review images: [desktop light](evidence/plan-ghost-1005/desktop-light.png),
[desktop dark](evidence/plan-ghost-1005/desktop-dark.png),
[mobile light](evidence/plan-ghost-1005/mobile-light.png),
[mobile dark](evidence/plan-ghost-1005/mobile-dark.png).

No committed screenshot baseline is affected: existing shell baselines cover
Heute/Reports; expected-payment baselines cover Erwartet. Plan reference overlays
and evidence images from `plan.spec.ts`, `reference.spec.ts`, `full-width.spec.ts`,
`ux-distill.spec.ts` and the new ghost spec change in the header/cells/selection.
No screenshot baseline was regenerated locally. Pinned Linux comparison and owner
visual/device acceptance remain open.

Owner steps: review the draft PR/CI and try the three actions, partial-fill and
Rückgängig on desktop/phone. No keys or consents are required for this slice.
