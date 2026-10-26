# Heute #573 / #603 — bounded implementation

Base: `e90ae12984d91b491e8c096147de1f2432b674ec` (producer #600–#602). The two prepared handoff packets and mixed source branch were consulted as source provenance, not current runtime evidence. This package changes Heute presentation/read and reuses the existing stored close state and audit log. It does not edit the producer's month-close read, revision, financial calculations, write, lock or Undo paths.

## Behavior

- The complete source task pool is deduplicated before the first four rows are shown; remaining tasks are reachable in **Weitere Aufgaben**. Changed closed months rank after overspending and before other routine work. A prior-month close row first appears on Vienna day 1. Rule rows count only violated (`bad`) rules and lead to the existing rulebook. Missing inputs remain visible as an availability note without claiming a violated rule.
- **Fällig 14 Tage** precedes **Letzte Buchungen**. **Angepinnte Kategorien** is off by default and its separate **Ansicht anpassen** choice persists in local storage, independently of the existing month expansion choice. The old separate Finanz-Check tile is removed from Heute; its detailed route and server facts remain.
- A closed-month change row is based on retained booking and split audit events after the audited close event. The close CAS source revision intentionally covers earlier balances and next-month distribution too; that broader scope does not create a misleading *nach Abschluss geändert* booking notification. Multiple changes collapse to one month row, actual Undo retains the event, and an actual reclose resets the notification boundary. No GET writes occur. A legacy close without comparable audited time/snapshot is reported as unavailable instead of inventing history.

## Changed-test reasons

| File | Reason |
| --- | --- |
| `apps/server/src/api/month-close.test.ts` | Extends existing literal close fixtures with September day boundary, no GET audit write, two late bookings, split-only edit, real Undo, reclose, and October booking/next-month distribution exclusion from notifications despite the broader source revision. Original money, work, lock, stale revision and Undo assertions remain. |
| `apps/web/src/heute/attention-bar.test.tsx` | Adapts the close row to server-provided facts; checks deduplication before the four-row cap, reachable remainder, clean/warning/violated rule states, and retained missing-input information. Existing source actions remain asserted. |
| `apps/web/src/heute/valuation-attention-511.test.tsx` | Gives its existing synthetic action rule the `bad` status now required by the DTO and aligns its synthetic count. The quote/account/loan destination and four-row assertions are unchanged. |
| `apps/web/src/reports/forecast-tools-card-568-569.test.tsx` | Reuses its real synthetic Heute API mount to check default-off pinned section, persisted switch, due/bookings DOM order and no writes. Existing forecast money and navigation assertions are unchanged. |

## Local checks

Node 22, `--maxWorkers=1`: **5 affected files / 57 tests passed** in the final run, including the two expanded month-close cases, source pool and actual persisted view case. Workspace typecheck initially identified a missing DTO fixture status and a union narrowing error; both were fixed. Final server/db/domain/other workspace typechecks and rerun web typecheck passed. Changed-path ESLint, CSS scale, Prettier and `git diff --check` passed. Full CI, independent final diff review, desktop 1440, Chromium mobile 390, WebKit iPhone, light/dark Axe, horizontal overflow and phone touch-target checks remain pending at integration. No browser run, PR, push, merge or release was made by this implementer.
