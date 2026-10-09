# Sub-pages instead of side panels — 2026-10-05

The owner decision in DESIGN.md supersedes the prototype's content panels. This
first coherent delivery covers Plan › Monat. No dependencies, schema, API, money
calculations or automatic bookings change. Other areas remain explicitly open.

## Inventory and replacement decisions

Inventory: all `DetailPanel`, `SidePanel`, `BottomSheet`, `WideDialog`, native dialog,
aside and secondary grid-column callers in `apps/web/src`, including dev harnesses.
File paths below are relative to that directory. Reuse existing bodies and write
paths when completing the remaining replacements; routes below marked open are
proposed destinations, not implemented routes.

| Location / content | Replacement | Status |
| --- | --- | --- |
| `budget/plan-page.tsx`: right inspector, month overview, income targets, 50/30/20, waterfall | Full-width sections below the list, every month span | Done |
| `budget/envelope-panel.tsx`, `plan-page.tsx`, `plan-multi.tsx`: envelope figures/target | `/plan/monat/envelope/:id?monat=YYYY-MM`; shared read-only body | Done |
| Same: assign, move, cover | Existing FormDialog; compact cover trigger still opens the form directly | Done |
| `expected/income-panel.tsx` from Plan › Monat | `/plan/monat/einnahmen?monat=YYYY-MM`; reuse IncomeBody | Done |
| `heute/heute-page.tsx`: account/wealth dimension details | `/heute/details/:kind`, existing account links | Open |
| `expected/income-panel.tsx` from Erwartet and `reports/onepager-report.tsx` | Income sub-page preserving month and source return route | Open |
| `inbox/inbox-page.tsx`, `shell/panel-host.tsx`, header `PanelLink`: wide inbox dialog and nested read-source/bank details | Header links to existing `/konten/posteingang`; inbox item `/konten/posteingang/:id`; confirm/assignment forms in dialogs | Open |
| `contacts/contacts-page.tsx`: contact statement with receipt/settlement/edit | `/konten/kontakte/:id`; separate input dialogs, including new contact | Open |
| `budget/category-panel.tsx`: category/group management | Category details `/einstellungen/kategorien/:id`; create/edit/group forms in dialogs | Done (#323–#324) |
| `budget/goals-panel.tsx`, `pages/goals-progress-report.tsx`: savings goal history and forms | `/plan/sparziele/:id`; create/edit in dialogs; reports link to same detail | Done (#325–#326) |
| `budget/event-panel.tsx`: annual event create/edit | FormDialog; comparison stays inline in year plan | Done (#327) |
| `expected/payment-panel.tsx`: payment details, versions, occurrences, editing | `/plan/erwartet/:id`; create/edit/confirmation in dialogs | Open |
| `ledger/account-form.tsx`, `pages/accounts-settings.tsx`: new/edit account | FormDialog; existing `/konten/:id` already owns account detail | Open |
| `ledger/reconcile-panel.tsx` | FormDialog for bank balance, correction and confirmation | Open |
| `rules/rule-panel.tsx`: status and threshold editing | `/einstellungen/regelwerk/:code`; threshold form in dialog | Open |
| `wealth/portfolio-panel.tsx`: instrument details, prices, trades, metadata edits | `/vermoegen/portfolio/instrument/:id`; new/edit forms in dialogs | Done |
| `wealth/target-panel.tsx`, `pages/asset-classes-settings.tsx`: class/group/target/archive/instrument editors | FormDialog retaining dirty/save blockers and atomic audit/undo | Open |
| `wealth/savings-panel.tsx`: savings schedule versions and editing | `/vermoegen/portfolio/sparplan/:id`; new/edit/end in dialogs | Done |
| `wealth/trade-panel.tsx`: trade capture/edit | FormDialog retaining settlement and execution validation | Done |
| `reports/payslip-panel.tsx`: payslip history and capture | Payslip detail sub-page under salary report; capture/edit/upload in form dialog | Open |
| `reports/income-expense-report.tsx`: selected cell booking inspector | Linked booking sub-page preserving report filters | Open |
| `shell/global-search.tsx`: search results sheet, Ctrl K | Search sub-page with search input; preserve Ctrl K and keyboard result navigation | Open |
| `shell/panel-host.tsx`, `shell/panels.ts`: example detail | Dev-only detail route; remove placeholder panel entry | Open |
| `routes/components-page.tsx`, `routes/panels-harness.tsx`: detail/side/sheet/work-dialog demos | Detail page demo and input/filter-only dialog/sheet demos | Open |
| `heute/heute.css`: `.heute-main-grid`, secondary monthly content | Full-width inline sections or links to existing detail pages | Open |
| `wealth/wealth.css`: `.vview` composition beside main | Full-width content sections | Done |
| `wealth/debts.css`: secondary comparison columns; `wealth/loan-planning.css`: planning summaries | Full-width content sections; comparison tables retain their numeric columns | Open |
| `reports/reports-future.css`: `.rf-side`; `reports/table-reports.css`: side summaries; report overview/spending/portfolio source grids | Full-width sequential summary/chart/source sections or linked detail pages | Open |
| `shell/sidebar.tsx` | Left application navigation remains | Retain |
| `pages/settings-nav.tsx`: settings navigation rail | Navigation, not content; retain existing destinations | Retain |
| `ledger/booking-panel.tsx`, assignment editor, loan-planning dialogs, PWA conflict confirmation | Existing input/confirmation dialogs | Retain |
| `pages/security-page.tsx`, data sources, payees in ledger settings | Already inline pages/controls; no separate security or payee detail drawer found | Retain |
| `ledger/booking-panel.tsx` status aside; SectionHead `aside` labels; print `Sheet` components | Inline status/heading annotations and A4 print sheets, not content panels | Retain |

The shared `packages/ui` side-panel primitives/CSS still have open callers and
cannot be deleted in this slice. Dead Plan inspector placement, breakpoint and
multi-month side-column overrides are removed. No shared component refactor;
shared changes are limited to registering the Plan routes/history marker and
enabling the installed router's scroll restoration for `/plan/monat` only.

## Acceptance and screenshots

- Synthetic red tests reproduced the unchanged detail URL and desktop side form.
- Regression covers detail URL, breadcrumb, browser back with scroll restoration,
  direct loading, fallback back link, modal Escape/focus return and inline summaries
  at desktop 1440 and phone 390. Existing assign/cover/move/undo/cent guards stay.
- Legacy `/plan/monat?kategorie=…` links redirect to the envelope URL, retaining month.
- Browser back restores the URL and scroll. Temporary list-local state (manually
  chosen grouping, collapsed groups and distribution preview) still resets when
  the list remounts; preserving that state is an open follow-up.
- No screenshot baseline was regenerated locally. Review affected Linux
  Plan › Monat / multi-month / Plan income-target captures and any old envelope
  panel captures; the current Plan specs use functional checks and evidence
  screenshots without committed Plan pixel baselines. Shared component-gallery,
  Erwartet income, shell and other-area baselines are unchanged in this slice.
- New evidence: `plan-detail-pages.spec.ts` outputs `envelope-detail.png` and
  `plan-inline-summary.png` for each viewport. CI remains the Linux visual gate.
  Reviewed synthetic captures: [desktop detail](evidence/no-side-panels-1005/envelope-desktop-1440.png),
  [phone detail](evidence/no-side-panels-1005/envelope-phone-390.png),
  [desktop Plan](evidence/no-side-panels-1005/plan-desktop-1440.png) and
  [phone Plan](evidence/no-side-panels-1005/plan-phone-390.png).

## Local verification

The full `npm run check` was invoked once. All workspace typechecks and ESLint
passed; Prettier stopped it on the exported `IncomeBody` signature. The signature
was formatted and the full lint/format phase passed (exit 0). The remaining full
unit phase was run separately, without restarting the complete check.

The full unit phase passed all 3,176 tests in 336 files (745.94 seconds, exit 0;
two workers, command-line test timeout 30 seconds). No unit rerun or assertion
change was needed.

The production build passed (exit 0), as did the affected envelope unit file
(13 tests). The new detail-page browser cases passed on desktop 1440 and phone
390: URL, deep link, missing category, legacy link, browser back/scroll, axe and
Escape/focus return. Existing Plan views and income-target regressions passed.

The affected browser matrix initially had 18 passed and one failure in the
existing mobile rollover/distribution case. Its carry assertions matched both
months, so it could click the previous month's body before the new read rendered.
The test now waits for the next budget response and displayed total; its literal
money assertions remain unchanged. The final desktop/phone Plan run passed all
9 tests including setup. Month-navigation regressions passed on targeted rerun
(19 passed, 3 planned skips, with the rollover case subsequently resolved).

No local screenshot baseline was regenerated. Linux visuals and owner acceptance
remain open; this is the first coherent Plan slice, not app-wide completion.

## Owner steps

Review desktop and phone navigation, returned scroll position, direct links and
Escape/focus return. Review the new full-width summary order and remaining inventory.
No keys, consents, migrations or provider setup are required. Do not merge until
the required CI checks and Linux visual review pass.

## Vermögen slice — sidepanels-2a (2026-10-06)

Instrument and schedule details use `/vermoegen/portfolio/instrument/:id` and
`/vermoegen/portfolio/sparplan/:id`, with the Plan breadcrumb/history-state/back
pattern and portfolio scroll restoration. Legacy product/schedule queries redirect
with their existing priority; period selection is retained. Metadata, manual quotes,
schedule create/edit/end and trades use the existing FormDialog. Native amount,
validation, pending/dirty navigation, audit and undo paths remain shared. Net-worth
composition follows the lead at full width. Debts, reports and other inventory rows
remain separate deliveries. No Linux screenshot baseline was regenerated locally.


Windows verification for this slice: `npm run check -- -- --maxWorkers=2
--testTimeout=30000 --retry=1` passed (exit 0): 358 files, 3302 tests passed,
2 existing age backup tests skipped because age/age-keygen are unavailable here.
The preceding run hit the unchanged formatter hook's short Windows timeout; its
isolated rerun passed all 34 tests, then the complete check passed. Both
`npm run build` and `npm run build:e2e` passed (exit 0).

The affected desktop/phone browser matrix and corrected-case reruns passed all
64 distinct functional cases, including net worth, instrument exposure and
trade/schedule audit/undo. The final unknown-value and exposure runs each passed
5 tests including setup; net-worth regressions passed 15 with 8 existing Linux
visual skips. Local sandbox startup and browser timeout overrides stayed in
ignored launch files. Old two-column desktop reference regions now assert full
width/alignment/stacking; header/phone comparisons and complete pixel baselines
remain. New URL/composition cases were red before implementation.

[Desktop/phone review evidence](evidence/no-side-panels-wealth-1006/README.md)
uses synthetic fixtures only. Linux net-worth baseline review, required CI and
owner acceptance remain open; no keys, consents or migrations are needed.

Git delivery uses a local index because the managed sandbox protects this
worktree's index/HEAD metadata. Commits use guarded common-repository ref updates.
After delivery, run `git reset --mixed HEAD` in this worktree from a normal
terminal to synchronize its standard index; this preserves the working files.
