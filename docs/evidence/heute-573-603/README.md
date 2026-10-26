# Heute #573 / #603 — bounded implementation

Current acceptance checkpoint (26 October): independent source, financial, test and follow-up reviews are complete. Canonical run [40343685711](https://github.com/Grabman1987/budget/actions/runs/40343685711) checked `387c9d6224b6f9cf26a69e23607fe7b5f71e963c`: **91 passed in 3.7 minutes, two existing conditional skips, no failures, retries or baseline changes**. Configured desktop, Chromium mobile and WebKit iPhone cases were selected. The owner explicitly approved scrolling while retaining the accepted section order. Exact-head required PR CI and publication remain pending; the earlier checkpoints below are historical evidence, not claims of current delivery.

Base: `e90ae12984d91b491e8c096147de1f2432b674ec` (producer #600–#602). The two prepared handoff packets and mixed source branch were consulted as source provenance, not current runtime evidence. This package changes Heute presentation/read and reuses the existing stored close state and audit log. It does not edit the producer's month-close read, revision, financial calculations, write, lock or Undo paths.

## Behavior

- The complete source task pool is deduplicated before the first four rows are shown; remaining tasks are reachable in **Weitere Aufgaben**. Changed closed months rank after overspending and before other routine work. A prior-month close row first appears on Vienna day 1. Rule rows count only violated (`bad`) rules and lead to the existing rulebook. Missing inputs remain visible as an availability note without claiming a violated rule.
- The accepted 16 October page order places **Vermögen · Zu tun · Fällig 14 Tage · Letzte Buchungen** in that sequence. **Angepinnte Kategorien** is off by default and its separate **Ansicht anpassen** choice persists in local storage, independently of the existing month expansion choice. The old separate Finanz-Check tile is removed from Heute; its detailed route and server facts remain.
- A closed-month change row is based on retained booking and split audit events after the audited close event. The close CAS source revision intentionally covers earlier balances and next-month distribution too; that broader scope does not create a misleading *nach Abschluss geändert* booking notification. Multiple changes collapse to one month row, actual Undo retains the event, and an actual reclose resets the notification boundary. No GET writes occur. A legacy close without comparable audited time/snapshot is reported as unavailable instead of inventing history.
- Independent review identified a split chronology false positive: a booking moved from September to October **before** September was closed still had an older September audit row, so an October-only split after close falsely notified September. A literal API test reproduced it first. Split events now resolve the latest retained parent booking state **as of the split event**. A prior September date alone is not proof of a September split. The booking-event before/after predicate remains unchanged, including retained Undo/moves, and the producer's broader CAS predicate is untouched.

## Changed-test reasons

| File | Reason |
| --- | --- |
| `apps/server/src/api/month-close.test.ts` | Extends existing literal close fixtures with September day boundary, no GET audit write, two late bookings, split-only edit, real Undo, reclose, and October booking/next-month distribution exclusion from notifications despite the broader source revision. Adds the red-to-green September-to-October pre-close move / October-only split chronology regression. Original money, work, lock, stale revision and Undo assertions remain. |
| `apps/web/src/heute/attention-bar.test.tsx` | Adapts the close row to server-provided facts; checks deduplication before the four-row cap, reachable remainder, clean/warning/violated rule states, and retained missing-input information. Existing source actions remain asserted. |
| `apps/web/src/heute/valuation-attention-511.test.tsx` | Gives its existing synthetic action rule the `bad` status now required by the DTO and aligns its synthetic count. The quote/account/loan destination and four-row assertions are unchanged. |
| `apps/web/src/reports/forecast-tools-card-568-569.test.tsx` | Reuses its real synthetic Heute API mount to check default-off pinned section, persisted switch, accepted wealth/tasks/due/bookings DOM order and no writes. Existing forecast money and navigation assertions are unchanged. |

## Local checks

Node 22, `--maxWorkers=1`: **5 affected files / 57 tests passed** in the final run, including the two expanded month-close cases, source pool and actual persisted view case. Workspace typecheck initially identified a missing DTO fixture status and a union narrowing error; both were fixed. Final server/db/domain/other workspace typechecks and rerun web typecheck passed. Changed-path ESLint, CSS scale, Prettier and `git diff --check` passed. Full CI, independent final diff review, desktop 1440, Chromium mobile 390, WebKit iPhone, light/dark Axe, horizontal overflow and phone touch-target checks remain pending at integration. No browser run, PR, push, merge or release was made by this implementer.

Review follow-up on `488edaf6`: the new chronology case failed before the reader fix and passed after it. The affected API and real Heute mount files passed **35/35 tests** after the fix, including the original late split/Undo/reclose cases and accepted section order. DB and web typechecks, changed-path ESLint, CSS scale, Prettier and diff checks passed. Other original source/test files were unchanged by this follow-up; browser/full CI and independent delta review remain pending.

## Browser-test consumers prepared after review

The accepted #573/#603 UI removes the standalone Finanz-Check tile and defaults pinned categories off. Existing browser tests were updated to exercise the new public contract while retaining their financial, source navigation, accessibility, Undo and ledger assertions. No browser run or screenshot refresh was performed on this memory-constrained Windows host; the commands below are for the canonical Linux run.

| File | Technical reason |
| --- | --- |
| `e2e/attention.spec.ts` | Its intended quiet GET fixture now explicitly clears server-provided close tasks, account/loan/quote tasks and missing-rule availability before asserting no task block. |
| `e2e/heute.spec.ts` | Replaces default-on pin and removed tile selectors with default-off → opt-in → reload persistence, a bad-only summary backed by the actual Heute response, order, rule destination and zero write checks. Its empty fixture clears all task sources; money, forecast, capture, Undo, source amounts and existing deadlines remain. |
| `e2e/heute-attention-mobile-shell.spec.ts` | Counts the first four rows separately from the reachable fifth close action; checks accepted order, stored pin switch, no API writes, both-theme Axe/overflow and 44 px controls including new view controls. Quiet missing-rule data stays explicit in availability, then a truly clean fixture hides the section. The original desktop 900 px bound is retained for the collapsed four-row state after a deliberate scroll to the top. Both disclosures are then opened before measuring their visible controls. |
| `e2e/heute-hints-1009.spec.ts` | Two bad rule facts now make one summary row, with three unavailable inputs in the disclosure. The real API count conservation and rulebook destinations remain checked; old tile text is no longer a UI oracle. |
| `e2e/missing-quotes.spec.ts` | Replaces tile visibility with the quote-review task before a real quote and its absence after redo; existing valuation amount/source/Undo assertions stay. |
| `e2e/issue-570-heute-titelblatt.spec.ts` | Current-only labels now target the retained wealth and task sections instead of the removed Finanz-Check tile. |
| `e2e/portfolio-trades.spec.ts` | Four-row limit counts visible source rows, not the reachable overflow disclosure; trade, balance, execution, Undo and accessibility assertions are unchanged. |
| `e2e/ux-distill.spec.ts` | Counts four visible plus one reachable source row and opts into pinned categories before asserting its red amount. Adds the required `urgent` flag to the existing synthetic overspent fixture; original amount and destination assertions remain. |

Scoped changed-file ESLint, Prettier and `git diff --check` passed. A diagnostic ad hoc E2E TypeScript invocation exposed one new Playwright option typo and one pre-existing incomplete synthetic `urgent` field; both were corrected. With the web project's ES2023/Vite type options, only two existing `e2e/sample.ts` Playwright fixture-option errors remain. The repository has no E2E tsconfig, so this ad hoc invocation is not reported as a passing typecheck. Required browser, Axe, touch and screenshots are pending canonical execution.

Review did not establish that the accepted section order superseded the 900 px
bound; its earlier removal was corrected before any browser run. The quiet
fixture now also marks the retained total as `ok` when bad/warn/not-evaluated
counts are zero, preserving its count conservation. Current captures in the
mobile-shell, hints and UX-distill specs use `info.outputPath` so the scoped PNG
artifact retains them without overwriting revision-scoped historical images.
These corrections change test setup/evidence only, not product code, financial
expectations, budgets or retry settings. Actual browser results remain pending.

Suggested bounded Linux runs (after the E2E build) are:

```sh
npx playwright test e2e/attention.spec.ts e2e/heute.spec.ts e2e/heute-attention-mobile-shell.spec.ts e2e/heute-hints-1009.spec.ts e2e/missing-quotes.spec.ts e2e/issue-570-heute-titelblatt.spec.ts e2e/portfolio-trades.spec.ts e2e/ux-distill.spec.ts --project=desktop --project=mobile
npx playwright test e2e/heute-attention-mobile-shell.spec.ts e2e/issue-570-heute-titelblatt.spec.ts --project=webkit-iphone
```

## First canonical Linux browser run and bounded follow-up

The first Linux run at `da28b3ed` selected 91 cases: 84 passed, five failed and two existing intentional cases skipped. The five failures reduce to three causes; the run log and screenshots are retained in `private/573-603-first-linux.log` and `private/573-603-first-browser-screenshots`. The follow-up keeps all money, quote, Undo, write, deadline, retry and accessibility assertions.

| File | Follow-up reason |
| --- | --- |
| `apps/web/src/heute/heute-page.tsx` | Puts the existing Pace section before the existing compact forecast, as the 16 October accepted order says; no chart, calculation or data source changed. |
| `e2e/ux-distill.spec.ts` | Replaces the obsolete physical section list with answers → lead → Pace → forecast → wealth → tasks → due → recent → more; checks every section exists and retains the ordered geometry, fold persistence and independent net-worth equality. |
| `e2e/pace-marker.spec.ts` | Updates only its immediate DOM-neighbor assertion to the accepted Pace → forecast order. The chart lines, values, tooltip, keyboard and marker checks stay intact. |
| `e2e/missing-quotes.spec.ts` | The account/quote action can be the fifth task in the complete pool. Opens its existing reachable **Weitere Aufgaben** disclosure when that row is there, then asserts the unique visible row, exact quote count and visible **Kurse prüfen** link. The API count, valuation, manual quote and Undo checks remain. |

The protected desktop `e2e/heute-attention-mobile-shell.spec.ts` check still requires the collapsed task section to end before 900 px. It failed at **2046.84 px** in the first Linux run. The 1440×4245 screenshot shows the title, three KPIs, lead, full forecast and Pace charts, wealth and five task rows in the accepted sequence. The current SVGs alone are 280 px (Pace) and 248 px (compact forecast); their headings, Pace figures, labels and notes add height, and `.heute` uses 38 px section gaps. A desktop two-column chart row could save approximately 350–450 px, still leaving the tasks around 1550–1650 px. Even removing both complete chart sections would not plausibly place the wealth and task rows before 900 px. This is a measured layout/acceptance conflict; the bound, chart content and task priority remain unchanged pending an owner-reviewed layout decision. No local browser attempt was made.

Follow-up checks on Node 22: web typecheck passed; scoped ESLint and Prettier passed; affected forecast/attention Vitest files passed **15/15** with `--maxWorkers=1`. Canonical Linux rerun remains pending.

## Owner-approved scroll acceptance and corrected browser evidence

On 26 October the owner explicitly chose: keep the accepted section order and allow scrolling. This releases only the old desktop requirement that the entire task block end before absolute page coordinate 900. The collapsed four-row block must instead become fully visible in the viewport after scrolling. Row limits, reachable overflow, section order, financial expectations, no-write checks, accessibility, touch targets, retries and deadlines remain unchanged. The per-file reason for `e2e/heute-attention-mobile-shell.spec.ts` is this explicit acceptance change; independent review and the broader canonical browser run are still required.

The bounded correction run [40342361785](https://github.com/Grabman1987/budget/actions/runs/40342361785) checked actual source `97eec42d03a24a9515b2114dfd153046e7d88d34`: all 15 selected cases passed in 1.1 minutes, with no retries, failures or baseline changes. It selected missing-quotes, ux-distill and pace-marker on desktop/mobile plus their setup cases. These filenames are excluded by the configured WebKit test match, so this result does not establish WebKit acceptance. Current PNGs are retained privately in `private/573-603-correction-browser-screenshots`; static image inspection does not prove interactive or physical-device behavior.

Final static WebKit image review found the task rows and reachable overflow clear in both themes. A pre-existing floating capture button overlaps the end of a long savings-goal progress link in the title/KPI capture. The separate first-screen/bottom-spacing work remains tracked by #575; this package does not claim to resolve that broader layout item. The task actions have their own passing reachability checks. The two conditional skips are unchanged: the shared-ledger capture/Undo/redo writer runs only on desktop, and the phone-attention/FAB test only on mobile.
