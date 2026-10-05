# Planning hit rate — owner decision 2026-10-05

Report 1.11 `Budgettreue` (`/reports/planungstreue`) measures whether the day-15
Pace forecast anticipated the final spending. Report 2.2 retains its existing
assignment-versus-spending and 50/30/20 question.

## Sources and figures

Additive Drizzle migration `0039_plan_snapshot` stores month, day 15, nullable
category (NULL means total), integer planned/spent/projected cents and creation
timestamp. The extra primary-key id supports the existing audit implementation.
SQLite enforces unique category observations and a separate unique NULL total.
Each monthly capture and its audit group commit in one transaction/savepoint.
Repeated runs retain the first snapshot, even after later assignments change.
Snapshots do not create bookings, assignments or provider requests.

Capture calls `paceOfMonth` with the existing `loadFacts` and
`occurrencesBetween` inputs. The total is the exact Heute Pace figure. Each
Bedarf/Wunsch category calls that same model with its category scope. Zukunft
and classless pass-through categories are outside Pace. Category projections
are independently rounded and clamp variable refunds in the shared model;
their sum is therefore not a replacement for the centrally calculated total.
Closed-month actuals use the same Pace spending source at month end. Current
ledger corrections remain visible in actuals; the saved projection stays fixed.
Category names and classification come from the current ledger, not a new
historical classification model.

Deviation is projection minus actual. Relative deviation uses positive actual
spending as denominator; zero or net-negative actuals retain the EUR error but
have no percentage or hit. A hit satisfies `abs(error) * 20 <= actual`, before
rounding. The mean is the arithmetic mean of absolute relative errors, rounded
only for output in basis points. The headline window is the last six completed
calendar months, with missing/unrateable months excluded and the actual count
displayed. The report shows its reliability state below two comparable months;
Heute's one sentence appears from three comparable months in that window.
The chart shows the latest twelve observations with signed bars; the monthly
table retains the whole stored history. Category rows sort by absolute relative
error, then absolute cents, and link to the selected month's bookings.

## Nightly capture and backfill

The application checks every five minutes after 02:30 Europe/Vienna, once per
successful civil day, independently of bank and market configuration. Startup
catches up; a failed capture retries and a held import write lock defers it.
An opt-in test clock disables this real-time timer.

Historical assignments alone do not prove what Pace knew on an earlier 15th.
Backfill is deliberately conservative: every relevant current/removed input
timestamp and audit event must be no later than that month's 15th. Any later
change, including an undo that restored older row timestamps, refuses the
reconstruction. Foreign-currency contract history is refused because FX rows
do not retain a complete edit history. This can reject otherwise reconstructible
months; complete audit replay is outside this slice.

**Which months can be backfilled:** a month with a positive Pace plan whose
entire checked input history was already stable by its 15th. Existing snapshots
remain usable regardless of later changes. Imported history or later-created
settings/bookings usually means earlier months cannot be reconstructed. No
private database was inspected, so no real month is claimed as eligible.
The operator command reports the result for each requested month without
printing financial figures:

```powershell
# DATABASE_PATH or DATA_DIR identifies the running application's database.
npx.cmd tsx scripts/plan-snapshot.ts 2026-01 2026-09
```

Statuses: `captured`, `exists`, `not_due`, `no_plan`, `unavailable_history`.
The nightly job applies the same conservative check to the previous two months only; older months need the operator command (docs/ops.md 12.9). A month judged unrecoverable is stored in `plan_snapshot_gap` and not retried. A failing night is attempted at most three times, then reported once to the Posteingang.

Methodology note: the snapshot is taken on the first run after 02:30 Vienna on day 15; bookings entered later that day are excluded, and a month missed on day 15 gets no snapshot (only the conservative backfill can recover it). No new
secret, consent or dependency is needed. If deployed before 15 October 2026,
October is the first new observation; two closed months become available in
December, and the Heute sentence can first appear in January 2027. These dates
depend on actual capture and positive final spending, not just elapsed time.

## Verification and owner acceptance

Synthetic unit/repository/API/component tests cover shared-source cent equality,
fixed/variable projection, exact hit thresholds, zero denominators, six-calendar-
month windows, sign cancellation, missing months, idempotence, backfill refusal,
NULL-total uniqueness, rollback, night scheduling/retry and German copy.
The isolated Playwright scenario covers real API figures, month/category tables,
booking drilldown, Heute's sentence, desktop 1440/mobile 390, light/dark Axe and
horizontal overflow. Images are written to `test-results`; no screenshot
baseline is regenerated locally.

Affected visual surfaces/baselines: Reports catalog and Monat und Einkommen
group, report navigation (1.10/1.11/2.1), new report 1.11 and Heute Pace when
three comparable snapshots exist. Linux visual CI and owner design/ledger
acceptance remain required before merge/deployment. The owner must deploy the
approved migration/build, inspect per-month backfill statuses on the server,
and review the first observed month-end comparison. No keys or consents are
required.

Local verification: the single full `npm run check` passed typecheck and ESLint,
then stopped on formatting of the generated migration metadata. Those two JSON
files were formatted; the complete lint command then passed. The complete unit
run passed 3,208 of 3,210 tests (343 of 345 files). The two unrelated failures
were the portfolio-allocation timeout and the formatter-hook subprocess under
load; isolated repeats passed all 10 and 34 tests respectively. Production build
passed. The isolated Playwright run passed both desktop/mobile cases, including
light/dark accessibility checks. No existing screenshot baseline was updated.

Reviewed synthetic evidence: [desktop light](evidence/planning-accuracy/desktop-light.png),
[desktop dark](evidence/planning-accuracy/desktop-dark.png),
[mobile light](evidence/planning-accuracy/mobile-light.png), and
[mobile dark](evidence/planning-accuracy/mobile-dark.png).
Existing baselines affected by the new catalog entry are
`e2e/shell.spec.ts-snapshots/shell-reports-light-desktop-linux.png` and
`e2e/shell.spec.ts-snapshots/shell-reports-light-mobile-linux.png`.
