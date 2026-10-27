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
  booked delta, including positive capped resets; no-op plans are disabled.
  Offsetting changes remain enabled even at a displayed net zero: +500/−500
  resets to both0, keeps TBA0 and Undo restores both exactly. UI and API literal
  cases cover this independent HIGH review correction without changing policy.
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
- `e2e/issue-481-single-category-band.spec.ts`: actual first runtime showed its
  pre-target amount after Undo is the 100,01 EUR ghost, not a funded assignment.
  An added API literal asserts assigned0, then the actual +100,01 EUR sidebar row
  is checked enabled and clicked. The original exact target API request remains.
  All existing identity, guard, assignment, penny move/cover and Undo assertions
  remain unchanged. No timeout, retry, skip or financial oracle is relaxed.

## Bounded old-consumer inventory and next gates

Second exact-source focused proof 40563931002 passed format, lint, types, CSS,
11 unit files/72 cases, build and the baseline guard. Browser result was 33 pass,
13 fail, with three actual classes: all-profile #481 incorrectly assumed a ghost
was funded; all-profile new #592 selected two identical shortfall paragraphs;
new #593 plus old ghost/inspector cases found Axe label-content-name-mismatch
in the new rows. The row's span/strong text lacked a literal separator although
its explicit aria-label contained one. Native content-derived naming plus an
explicit text separator now makes visible and accessible labels agree; a literal
UI assertion checks the zero-net row's full displayed text, retaining its enabled
effective-reset/Undo case. The new shortfall locator waits for the named Ziele
+5,00 EUR row and checks its own exact guard. No first/force/timeout/skip or Axe
filter is introduced. All original financial, API, grouped Undo, zero-no-op,
offsetting-reset and missing-history/legacy-skip oracles remain.

Late privacy/nowrap/theme assertions had not been reached in the failed new
cases; they remain intact and require the next bounded proof. The earlier
successful stages are evidence for exact3bc only, not runtime acceptance here.

First focused proof 40562333412 found three new test-harness blockers before
acceptance execution: Testing Library's role lookup does not support `exact`,
the API fixture's public web root must not contain the default receipts path,
and isolated-ledger exports only its test fixture, not Playwright expect.
The corrections retain the literal heading name/focus assertion, adopt existing
`test-results/no-web` isolation (no security guard bypass), and import expect
directly from Playwright. No financial expectation or timeout is changed.

The complete 12-path, 58,307-byte remote formatter patch was inspected, SHA256
`8f02cb01d2af7acd2309b4e93ee2a05c6aaec64a17e5fca46544975d38d19d9f`
verified, and applied unchanged after a clean apply-check on c1892aef. Its only
effect is source/test wrapping; reverse applicability was checked before the
three harness edits. Scoped ESLint/CSS/build and the other 62 unit cases passed
in that earlier proof; API/browser acceptance and final checks remain pending.

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

## Second focused proof and bounded late-stage correction

Exact-source34ea proof40566445894 passed formatting, ESLint, full typecheck,
CSS tokens, all72 units and build; browser43 passed/3 failed first attempt,
retries0/snapshotsnone. The baseline/source mutation guard passed and its
formatter patch is empty (SHA256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855).
All previous13 failure cases passed. Only the new selected593 case remains red.

The desktop trace's second visible inspector control is the actual ActivityLink
anchor,24px from the existing dense activity-link rule. A scoped inspector-only
44px minimum improves that action without changing compact worksheet links.
The new browser helper now applies its complete44px width/height loop on phone
profiles only, matching the literal own592/593 AC. Unchanged legacy desktop
AmountInput operator buttons are intentionally22px and hidden on phone; making
this new assertion desktop-wide invented a requirement. Axe, page overflow,
nowrap, all literal cents, cover/Undo and focus remain asserted on every profile.

The phone failure showed no-selection Monatsüberblick after the profile-menu
privacy interaction. The initial Escape-bubbling diagnosis was incomplete:
changing the new helper to native summary click did not preserve selection.
No old test, money/write/Undo guard, timeout, retry or skip was changed.

## Narrow593 proof and actual profile-click source correction

Exact-source47cad proof40569531911 passed format/ESLint/full typecheck/CSS/build
and baseline mutation guard. Its entire desktop593 case and3 setups passed;
both phone593 cases remained red at the unchanged masked-cover assertion.
Formatter patch is empty with the same e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 hash.

Retained mobile trace2-trace.trace call lknx@387 is the FIRST profile-summary
click. Its after snapshot already replaces the selected inspector with
month-overview-inspector BEFORE privacy-button call389. PlanBody's actual
outside-click exclusions omitted the global .m-profile menu, so opening that
appearance/privacy menu cleared selection. Exempt only .m-profile from Plan's
outside-click handler; keep its other exclusions, ordinary toolbar/outside
clicks and Escape behavior unchanged. No new593 browser assertion changes.

In budget-ui.test.tsx, extend the existing selected-category/Escape/outside
regression with native .m-profile details and the real PrivacyButton. Opening
the summary, toggling actual privacy both ways and closing it must retain the
same selected heading; activity text is literally masked to ••• € and restored
to0,00 €. The entire original editing/dialog/Escape/focus/income/Optionen
outside-click flow remains. Reset the presentation-only privacy store after
cleanup so a failed privacy assertion cannot leak hidden state to another test.
This bounded source/test delta needs independent HIGH review then the full
unchanged593 case on all3 profiles and this affected unit file. No local heavy
commands or public feature push were run.

## Exact5f0 narrow proof and type-only correction

Proof40570808444 actually passed all3 complete593 profile cases in both themes
plus3 setups (6/6 first attempt), including the final privacy/selection/focus
assertions. The changed selected-profile unit passed1/1;17 other file cases
were excluded by the explicit test-title filter, not changed/skipped in source.
Format/ESLint/CSS/build and the tracked-source/baseline guard passed; formatter
patch is empty (SHA256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855).

Full typecheck alone failed because the newly added Testing Library role lookup
used unsupported `exact:true`. Remove only that option: the literal string
name remains Beträge verbergen, with Testing Library's default exact name match.
The production fix and every browser assertion remain byte-identical to the
passing exact5f0 proof. This correction requires independent review and tiny
remote formatting/type/selected-unit verification; no repeated browser suite is
needed for the test-type-only change. No local heavy command or public push.
