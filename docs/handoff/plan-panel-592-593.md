# Plan month automatic rows and selected panel — source checkpoint

Refs #592 and #593; parent #450 remains open for its own acceptance. Sole local
source author, isolated `codex/plan-actions-592-593`. Starting clean 1ad02264 was
privately merged with immutable checked/live a16757e466bacf6f8244a83dfc8c6620bc09a840
as 12ed7416745740f0409c3dc9d3f7721379d943b4, with no conflicts. Incoming F/G
source is retained; no mixed historical checkpoint or other checkout is edited.

## Bounded implementation

- `quickAssignPlan` gains only an early reset desired-value branch; the existing
  reduction-first pool, displayed order, partial funding and missing-cent logic
  remain. Reset needs assigned cents, not optional history. Existing four modes
  still skip rows without their figures. API validation accepts the additive
  mode; the panel uses the same classed-category eligibility as the canonical
  read (not classless advance/card/income rows). quickAssignMany rereads current
  enriched rows and reuses assignMany's
  existing eligibility, transaction, guard and grouped Undo unchanged.
- The five sidebar rows preview that same planner and use a shared safe integer
  sum of its absolute items minus loaded assigned cents. Labels show the signed
  booked delta, including positive capped resets; zero deltas are disabled.
  Missing amounts remain visible. The click sends the same ordered category IDs
  to the existing quick-assign call. Selection takes precedence; otherwise the
  existing filtered displayed row universe is used, including collapsed groups
  consistently with the existing toolbar. Multi-month bulk actions are disabled.
- No-selection `Automatisch zuweisen` uses the existing remembered native
  disclosure, initially closed, retaining the owner's two open defaults and
  compact #591 frame. Selected panels show the rows openly. Legacy toolbar and
  phone selection-bar actions are retained; no new menu or route.
- The selected panel retains assignment, manual move/cover, expected payment,
  target, activity, history and category actions. Class and existing pace text
  become visible. A primary `Mit X decken` uses the existing selected source and
  useCover writer, bounded by overspending/free source, with shortfall text and
  one Undo. The original detailed move/cover controls remain available.
- Below 1180 the actual selected heading receives focus and scrolls into view;
  reduced motion uses instant scrolling. Phone bulk-selection mode retains its
  existing grid/bar focus behavior rather than moving away on each toggle.
  All new amount spans are nowrap, privacy uses existing formatting, all icons
  use existing 16px/1.75 conventions and all added CSS uses design tokens.

## Meaningful tests and per-file reasons

- `packages/domain/src/ledger/quick-assign-reset-592.test.ts`: independent literal
  +1200/−500, TBA0 → both0/net−700; only−500/TBA200 → −300/+200/300 missing;
  zero and absent-history reset. The four legacy modes' original tests remain.
- `apps/server/src/api/plan-reset-592.test.ts`: actual API projected/booked signed
  deltas for all five modes, capped positive/negative resets, exact TBA and one
  Undo; actual existing cover with both full/partial source caps and both restored
  categories. All expectations are literal fixture cents, not copied output.
- `apps/web/src/budget/plan-automatic-592.test.ts`: all five literal previews,
  displayed order, boundary funding, selection-only input and signed shortfall.
- `apps/web/src/budget/plan-panel-592-593.test.tsx`: actual five-button rendering,
  zero disabled, same quick call IDs and Undo, privacy, free-source cap despite
  committed money, plus actual heading focus and both motion behaviors.
- `e2e/issue-592-593-plan-panel.spec.ts`: real isolated API/UI all-five action and
  grouped Undo equality, filtered vs selected scope, excluded category unchanged,
  zero disabled, persisted disclosure, preselected/full/partial cover restoring
  both categories, focused phone heading, class/pace, light/dark privacy, Axe,
  44px controls, nowrap and page overflow. Canonical desktop/390/WebKit filename
  selection requires no config change; viewport evidence only, no baselines.
- `e2e/plan-ghost.spec.ts`: only three desktop selector changes to the actual
  new amount-bearing sidebar rows; phone selection bar and all existing literal
  cents, guards, grouped Undo and accessibility assertions remain unchanged.
- `e2e/plan-inspector.spec.ts`: only its two old `Ziel` selectors now address the
  new `Ziele` row; original exact request body/cents, move, Undo, group defaults,
  focus, category actions and screenshots remain unchanged.
- `e2e/issue-481-single-category-band.spec.ts`: its already-funded zero-delta
  scenario now asserts the new row is disabled, then uses the unchanged toolbar
  `Ziel` entry to preserve the original no-op quick-assign request assertion.
  All existing identity, guard, assignment, penny move/cover and Undo assertions
  remain unchanged. No timeout, retry, skip or financial oracle is relaxed.

## Bounded old-consumer inventory and next gates

`rg` found the three direct sidebar quick-action consumers above. Direct legacy
QuickAssignActions unit tests and toolbar/menu/phone selection tests retain their
interfaces and labels. Default section/state and #591 layout/phone focus need
focused compatibility proof, together with the changed selected-panel consumers.
No existing Plan own screenshot comparison was found in those directly affected
specs; evidence screenshots remain assertions/artifacts, never regenerated here.

This is source-only: no local Node/npm/build/test/browser/install/lint/formatter,
no Cloud run, public feature push/PR or production change. No passing runtime or
format claim. Independent capable full-diff HIGH review precedes a scheduler-
approved bounded proof, including original legacy domain/API/UI/Plan cases and
the new full three-profile scenarios. No migration, route, query, financial
engine, source-selection policy, lock/guard/Undo implementation or production
data change. Protected owner reset interpretation is explicit above.
