# Plan tidy controls and group ordering — #1003

Synthetic local evidence, 2026-11-08. Redesign ON; OFF still compiles.

Plan reuses the category settings handle, complete ordering payload, sort endpoint,
and audited write/Undo wrapper. Pointer drops work in both directions; Up/Down
on a focused handle moves a group and restores focus. On phones, tapping the
handle reveals explicit move buttons without relying on Safari's focus behavior.

Quick actions now open from Geld verteilen. Month close is in the desktop month
header and remains in Optionen on phones. Inactive hidden categories and their
groups leave the displayed list until Ausgeblendete zeigen is enabled. Hidden
categories with available money or month activity remain visible; newly created
empty groups retain their add and sort controls. The canonical
month figures and existing assignment/cover logic are unchanged.

Advance categories retain their month figures in the envelope grid. The initially collapsed bottom
section reads today's canonical contact receivables and credit separately and
links to the existing contact statement. It does not infer claims from an
envelope balance or net away credit. Amount privacy remains active.

## Original implementation verification

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

| Profile | Evidence |
| --- | --- |
| Desktop 1440 light | [Plan](desktop-plan-1440-light.png) |
| Desktop 1280 dark | [Plan](desktop-plan-1280-dark.png) |
| WebKit iPhone 390 dark | [Plan](webkit-iphone-plan-390-dark.png) |

Screenshots were visually inspected for the moved controls, readable contact
amounts, compact group rows and viewport overflow in both themes.

## Test adaptation scope

| File | Reason |
| --- | --- |
| `apps/web/src/budget/plan-redesign.test.tsx` | Add presentation/privacy regressions, retained hidden/advance month figures and list totals, empty-group controls, OFF summary semantics and matching read fixtures. |
| `apps/web/src/budget/plan-group-order.test.tsx` | Exercise loading/pending guards, complete ordering across invisible groups, empty neighbours, handle focus after remount and polite movement announcements. |
| `e2e/issue-1003-plan-tidy.spec.ts` | Add isolated synthetic acceptance flows and visual evidence; retain funded hidden categories and nonzero advances, keep empty groups and step across an inactive archived group. |
| `e2e/issue-587-plan-monat-kopf.spec.ts` | Negative/zero distribution checks target the disabled waterfall action inside the now-enabled menu; phone month close uses Optionen. |
| `e2e/issue-588-plan-menus.spec.ts` | Match the new menu label and retained phone month-close destination; wait for the budget response and split Axe checks by menu without changing assertions or timeouts. |
| `e2e/issue-588-plan-menus-undo.spec.ts` | Match the relocated/renamed menu; money and Undo assertions unchanged. |
| `e2e/issue-992-plan-calm-focus.spec.ts` | Check sticky-header clearance against the retained filter controls after toolbar removal. |
| `e2e/plan-compact-grid.spec.ts` | Check clearance against the retained filter bar in ON mode. |
| `e2e/plan-ghost.spec.ts` | Match the new menu label; ghost and financial expectations unchanged. |
| `e2e/plan.spec.ts` | Enter the existing waterfall flow through its new menu item in ON mode. |
| `e2e/css-scale.spec.ts`, `e2e/issue-832-month-plan.spec.ts` | Measure the relocated distribution summary; keep radius, target size, geometry and financial expectations unchanged. |
| `e2e/issue-481-separated-group-headings.spec.ts` | Measure rendered controls rather than the new collapsed move-button descendants; retain the existing target-size and row-height bounds. |
| `e2e/overspent-counts.spec.ts`, `e2e/topbar-plan-triage-237.spec.ts` | Assert the visible head has no overspending chip, excluding the new closed menu's DOM text; retain count, cover and Undo checks. |

## Review corrections for PR #1016

`planRows` again owns hidden-category visibility. Available or active hidden
categories and advance envelopes retain their month figures; list totals are
checked against the synthetic API summary. Empty groups stay editable and
sortable. Step controls swap visible neighbours while retaining invisible groups
and every category ID in the complete payload. Loading/pending handles do not
drag or handle keys, focus returns after reorder, and successful moves have polite
directional announcements. The explicit summary button role is ON-only.

The previous CI run also exposed Plan regressions: the new desktop grip expanded
group headings beyond the existing 36px bound; it now uses the existing 28px
desktop control height, while phone targets remain 44px. Tests follow the moved
distribution summary, measure only rendered controls, and use the phone's actual
group-add control. Head-chip assertions read visible text rather than the hidden
menu's text. No finance oracle, timeout, tolerance or hook was relaxed.

Local WebKit initially exceeded the existing 30-second test budget in the combined
scenario. The retained trace showed progressing browser actions taking about
1–4 seconds each, rather than a failed reorder assertion. Removing unused shared
servers alone did not resolve the runtime limit. The same assertions are now
split into keyboard, pointer, controls, archive and light/dark visual cases;
expanded phone move controls also retain the existing minimum-target check.

The focused WebKit pointer case then exposed Safari retaining focus on the
previous element during taps. Reorder now records that origin and restores the
handle if focus still rests there; a touch-specific unit regression covers it.
It still avoids taking focus from an unrelated control chosen during the write.
The independent reviewer inspected this correction and the final test split,
including dark archive/contact coverage and unchanged-summary checks.

Correction checks: focused Plan redesign/order/menu/model unit files, workspace
typecheck, changed-file ESLint/Prettier, CSS scale, and ON/OFF builds. Three
refreshed synthetic PNGs were visually inspected. Exact-head CI remains the
delivery gate; local Windows WebKit timing is recorded separately from passing
behavioral evidence rather than changing timeouts.

The first correction CI run exposed one additional Plan layout defect: at 768px,
a long group title overlapped the add button after the sort handle consumed part
of the name column. Desktop group titles now shrink and ellipsize inside their
existing grid cell. The original narrow-desktop overlap assertions remain intact.
Both themes pass the unchanged narrow-desktop Chromium checks. Local Windows
WebKit passed the overlap assertions but reached the existing 30-second limit
later in scroll-action checks; exact-head Linux CI verifies the complete cases.
