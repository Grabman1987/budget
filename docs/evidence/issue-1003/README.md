# Plan tidy controls and group ordering — #1003

Synthetic local evidence, 2026-11-08. Redesign ON; OFF still compiles.

Plan reuses the category settings handle, complete ordering payload, sort endpoint,
and audited write/Undo wrapper. Pointer drops work in both directions; Up/Down
on a focused handle moves a group and restores focus. On phones, tapping the
handle reveals explicit move buttons without relying on Safari's focus behavior.

Quick actions now open from Geld verteilen. Month close is in the desktop month
header and remains in Optionen on phones. Hidden categories and empty groups
leave the displayed list until Ausgeblendete zeigen is enabled. The canonical
month figures and existing assignment/cover logic are unchanged.

Advance categories leave the envelope grid. The initially collapsed bottom
section reads today's canonical contact receivables and credit separately and
links to the existing contact statement. It does not infer claims from an
envelope balance or net away credit. Amount privacy remains active.

## Verification

- `npm run typecheck`, changed-file ESLint and Prettier, and CSS token scale check.
- ON e2e build and OFF web build (separate output directory).
- Focused Vitest: Plan redesign, Plan menus and category order model. The added
  assertions cover the new control locations, hidden groups, advance separation,
  contact links, net-zero contacts with gross claims/credit, and amount privacy.
- `issue-1003-plan-tidy.spec.ts`: 9 passed, one worker, desktop Chromium,
  mobile Chromium and WebKit iPhone. Covers bidirectional pointer movement,
  keyboard focus, phone tap controls, one-action Undo, persistence, agreement
  with settings, archive visibility, contact reads, Axe and unchanged canonical
  month summaries/account responses.
- `issue-588-plan-menus.spec.ts`: 21 passed including setup, using the normal
  repository config and one worker across all three profiles. Both menus retain
  keyboard navigation, Escape, month/group controls, touch targets and Axe checks
  in both themes. Budget-response synchronization and one Axe check per test
  resolved local loading/runtime failures without changing any timeout.
- The first shared-server launch exceeded its existing startup timeout. The
  final #1003 run used a temporary config with the same three browser profiles
  and the spec's existing isolated-ledger server, without unrelated sample/setup
  servers. No timeout, assertion, tolerance or baseline was relaxed.
- Independent read-only code/test-impact review completed by a separate local
  Codex agent. Focus restoration, downward drops and phone selector drift found
  in review were fixed and re-reviewed. The WebKit focus issue was then fixed
  and independently re-reviewed; no remaining blocking finding.

The browser profiles are emulation, not a physical-device acceptance or a
production release. Existing screenshot baselines were not regenerated.

## Screenshot index

| Profile | Light | Dark |
| --- | --- | --- |
| Desktop 1440 | [Plan](desktop-plan-1440-light.png) | [Plan](desktop-plan-1440-dark.png) |
| Desktop 1280 | [Plan](desktop-plan-1280-light.png) | [Plan](desktop-plan-1280-dark.png) |
| Chromium 390 | [Plan](mobile-plan-390-light.png) | [Plan](mobile-plan-390-dark.png) |
| WebKit iPhone 390 | [Plan](webkit-iphone-plan-390-light.png) | [Plan](webkit-iphone-plan-390-dark.png) |
| Desktop expanded contacts | [Contacts](desktop-contacts-light.png) | [Contacts](desktop-contacts-dark.png) |
| Chromium expanded contacts | [Contacts](mobile-contacts-light.png) | [Contacts](mobile-contacts-dark.png) |
| WebKit expanded contacts | [Contacts](webkit-iphone-contacts-light.png) | [Contacts](webkit-iphone-contacts-dark.png) |

Screenshots were visually inspected for the moved controls, readable contact
amounts, compact group rows and viewport overflow in both themes.

## Test adaptation scope

| File | Reason |
| --- | --- |
| `apps/web/src/budget/plan-redesign.test.tsx` | Add presentation/privacy regressions and matching category/contact read fixtures. |
| `e2e/issue-1003-plan-tidy.spec.ts` | Add isolated synthetic acceptance flows and visual evidence. |
| `e2e/issue-587-plan-monat-kopf.spec.ts` | Negative/zero distribution checks target the disabled waterfall action inside the now-enabled menu; phone month close uses Optionen. |
| `e2e/issue-588-plan-menus.spec.ts` | Match the new menu label and retained phone month-close destination; wait for the budget response and split Axe checks by menu without changing assertions or timeouts. |
| `e2e/issue-588-plan-menus-undo.spec.ts` | Match the relocated/renamed menu; money and Undo assertions unchanged. |
| `e2e/issue-992-plan-calm-focus.spec.ts` | Check sticky-header clearance against the retained filter controls after toolbar removal. |
| `e2e/plan-compact-grid.spec.ts` | Check clearance against the retained filter bar in ON mode. |
| `e2e/plan-ghost.spec.ts` | Match the new menu label; ghost and financial expectations unchanged. |
| `e2e/plan.spec.ts` | Enter the existing waterfall flow through its new menu item in ON mode. |
