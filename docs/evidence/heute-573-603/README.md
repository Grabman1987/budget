# Heute #573 / #603 — bounded implementation

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
| `e2e/heute-attention-mobile-shell.spec.ts` | Counts the first four rows separately from the reachable fifth close action; checks accepted order, stored pin switch, no API writes, both-theme Axe/overflow and 44 px controls including new view controls. Quiet missing-rule data stays explicit in availability, then a truly clean fixture hides the section. The obsolete 900 px fold check followed the superseded section order. |
| `e2e/heute-hints-1009.spec.ts` | Two bad rule facts now make one summary row, with three unavailable inputs in the disclosure. The real API count conservation and rulebook destinations remain checked; old tile text is no longer a UI oracle. |
| `e2e/missing-quotes.spec.ts` | Replaces tile visibility with the quote-review task before a real quote and its absence after redo; existing valuation amount/source/Undo assertions stay. |
| `e2e/issue-570-heute-titelblatt.spec.ts` | Current-only labels now target the retained wealth and task sections instead of the removed Finanz-Check tile. |
| `e2e/portfolio-trades.spec.ts` | Four-row limit counts visible source rows, not the reachable overflow disclosure; trade, balance, execution, Undo and accessibility assertions are unchanged. |
| `e2e/ux-distill.spec.ts` | Counts four visible plus one reachable source row and opts into pinned categories before asserting its red amount. Adds the required `urgent` flag to the existing synthetic overspent fixture; original amount and destination assertions remain. |

Scoped changed-file ESLint, Prettier and `git diff --check` passed. A diagnostic ad hoc E2E TypeScript invocation exposed one new Playwright option typo and one pre-existing incomplete synthetic `urgent` field; both were corrected. With the web project's ES2023/Vite type options, only two existing `e2e/sample.ts` Playwright fixture-option errors remain. The repository has no E2E tsconfig, so this ad hoc invocation is not reported as a passing typecheck. Required browser, Axe, touch and screenshots are pending canonical execution.

Suggested bounded Linux runs (after the E2E build) are:

```sh
npx playwright test e2e/attention.spec.ts e2e/heute.spec.ts e2e/heute-attention-mobile-shell.spec.ts e2e/heute-hints-1009.spec.ts e2e/missing-quotes.spec.ts e2e/issue-570-heute-titelblatt.spec.ts e2e/portfolio-trades.spec.ts e2e/ux-distill.spec.ts --project=desktop --project=mobile
npx playwright test e2e/heute-attention-mobile-shell.spec.ts e2e/issue-570-heute-titelblatt.spec.ts --project=webkit-iphone
```
