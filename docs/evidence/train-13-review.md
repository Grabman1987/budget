# Train 13 independent integration review

Local CLI review of integration `5f60bed4` against `origin/main` `5133ae4a`.
The reviewer did not implement packages #1261–#1264. Synthetic fixtures only;
no private folders, production writes, pushes, merges or releases.

## Confirmed findings

**P2 — cached financial views had no background-refresh state.** After a
successful write closed a dialog, the account balance, account booking rows,
monthly budget and envelope view could retain old figures without indicating
that their reads were still pending. Account balances and booking rows refresh
independently, so one indicator could not cover both. Upcoming balances also have
separately keyed account, future-booking and schedule reads.

Fixed in `account-page.tsx:116`, `account-register.tsx:43`, `plan-page.tsx:181` and
`envelope-page.tsx:77` using the existing `LoadingNote` and `aria-busy`;
`upcoming-register.tsx:146` keeps its loading note during independent refreshes. Ordinary
booking pagination keeps its existing state. No calculation, writer, query key,
payload, stored figure, dialog completion, audit or Undo behavior changed.

All three new pending-state unit regressions failed before their production fix.
Literal retained/fresh values are −3,000/−4,000 cents in Plan and 48,000/47,000
cents in the account register, plus 10,000/9,000 cents for its independent upcoming
balance. Browser coverage additionally holds follow-up GETs,
requires the pending indication after close, and checks the final 9,800-cent
account balance.

**P2 — existing Freedom browser test closed a still-busy settings dialog.**
`e2e/freedom.spec.ts:264` asserted the value already typed into the draft immediately
after PATCH acknowledgement, pressed Escape and attempted navigation. The stored
rule refresh had not finished, so the unchanged close guard rejected Escape and
the modal intercepted navigation until the 30-second test deadline. Both
integration and `origin/main` reproduced the same action/interception sequence.

The spec now waits for the exact threshold rendered from stored query parameters
and asserts that Escape closed the dialog before navigating. No app guard,
financial assertion, Undo check, timeout or retry changed. This is a bounded
test-synchronization correction, independently reviewed after baseline reproduction.

## Reviewed and rejected concerns

- **#1261, queue safety:** ordered first/third delivery around a parked middle
  HTTP 500, error-ID retention, explicit same-key resend, safe discard, committed
  HTTP 500 recovery, correctable 422, network pause and persisted in-flight
  recovery preserve the existing delivery fence. The server receipt and financial
  write share their transaction. Offline capture retains its authorized queue
  behavior; refused edits retain the form and error.
  Receipt fence: `apps/web/src/pwa/queue.ts:76`.
- **#1262, receivables:** the report reads statement `remainingCents`, including
  literal 3,001-cent receivables and a 1,001-cent claim with matching credit.
  Zero net does not hide an open claim/credit pair. Settled history is collapsed
  but counted; shared table alignment, signed quiet ink and privacy are retained.
  No second allocation or receivable formula was added.
  Shared statement figures: `apps/web/src/reports/contact-report-redesign.tsx:427`.
- **#1263, warnings:** disabling prices and resolving fetch warnings share one
  transaction/audit group and Undo. Difference warnings are excluded. Nightly
  disabled-security cleanup cannot select enabled instruments that still fail.
  Operator resolution keeps its explicit reason. Payslip changes are control
  geometry and selected-option titles only, using privacy-aware money formatting.
  Grouped setting: `packages/db/src/repos/securities.ts:120`; disabled cleanup:
  `apps/server/src/market/refresh.ts:198`.
- **#1264, salary:** production changes are labels/comments. Three complete
  payroll response payloads (separate special payment, combined slip, missing
  month) were compared directly with `origin/main` on the same synthetic database
  and were identical. Domain, payroll API and financial input sources are unchanged.
  Label-only series: `apps/web/src/reports/payroll-net-composition.tsx:36`.
- **Merge fallout:** no conflicting writer or calculation change found across the
  four packages. ON and OFF compilation remain available.

## Test changes and independent review

- `pwa/queue.test.ts`: five independent delivery cases, retaining literal cents,
  original keys and ordered calls. Reviewed by a different agent from its author.
- `budget/plan-page-cover.test.tsx`: exposes the existing QueryClient to hold an
  actual refresh and check retained/fresh values; existing assertions unchanged.
- `ledger/first-booking-register-677.test.tsx`: the table mock additionally renders
  its existing balance prop; independent held-refresh regression, existing first
  booking and Undo checks unchanged.
- `ledger/upcoming-register-refresh.test.tsx`: isolates the separately keyed
  account read, retains its literal cached balance during refresh and verifies the
  final balance with exactly one fetch.
- `e2e/issue-1201-dialog-refresh.spec.ts`: pending-state assertion while reads are
  held and exact refreshed account balance; pending-state evidence PNGs. Existing
  write/error checks retained.
- `e2e/freedom.spec.ts`: wait for query-backed stored parameters and confirmed
  dialog close before navigation; existing money and Undo assertions retained.

The final fix diff received independent review. No financial oracle, timeout,
tolerance, skip or existing assertion was weakened. No screenshot baseline changed.

## Validation

Windows, Node 24.12.0, npm 11.13.0. The installed Node version is below the
repository's declared Node 24 range (`^24.15.0`); comparisons used the identical local runtime.
No dependency or engine requirement was changed.

### Builder red-unit-check verdict

The identical command ran in both checkouts:

```sh
VITE_BUDGET_REDESIGN=1 VITEST_MAX_WORKERS=1 npx vitest run apps/web/src --maxWorkers=1 --reporter=json --outputFile=test-results/unit-web.json
```

| Checkout | Files passed / failed | Tests passed / failed |
| --- | --- | --- |
| Integration, before register correction | 321 / 37 | 2,257 / 179 |
| `origin/main` `5133ae4a` | 321 / 37 | 2,241 / 179 |

All **178 builder-reported failing tests** are shared, with identical primary
error lines. The only integration-only failure is the newly added pre-fix register
regression. Main's only additional failure is the legacy outside-click gesture in
`budget-ui.test.tsx`, already technically migrated in #1261.

These failures are pre-existing ON test-harness/catalog debt, not package
regressions and not collectively Windows failures: missing Router and matchMedia
fixtures, and legacy catalog/selector expectations. Relevant source/test blobs are
unchanged. The existing financial assertions, timeouts and expectations were not
relaxed to make this comparison green.

### Completed checks

- `npm run typecheck`: passed; web typecheck repeated after the final hook change.
- `npm run lint`: passed. ESLint and Prettier checks repeated on changed source;
  the final Freedom spec also passed its focused static checks.
- Redesign ON `npm run build:e2e` and OFF web build: passed on the final app source.
- Full remaining unit suite:
  `VITE_BUDGET_REDESIGN=1 VITEST_MAX_WORKERS=1 npx vitest run apps/server/src apps/worker/src packages scripts --maxWorkers=1`
  — **6,157 passed, 0 failed, 1 existing skip, 573 files** (6,158 tests total).
  The conditional skip requires the Litestream binary in `backup/restore-test.test.ts`.
- Changed-web run: **90 passed, 1 expected pre-fix upcoming-refresh regression**;
  final pending-state run: **7 passed, 0 failed, 3 files**. The register regression
  is also green. The full web/baseline counts above retain their original run
  provenance rather than pretending the broad ON suite was green.
- Three direct complete payroll payload comparisons against main: identical.

All test jobs ran serially with `VITEST_MAX_WORKERS=1` and `--maxWorkers=1`.
Browser specs ran one at a time, one profile at a time, with `--workers=1` per the
resource cap, redesign ON, `E2E_PORT=4779`, `E2E_START_TIMEOUT=400000` and
`--update-snapshots=none`. The full browser suite was not run locally.

### Browser comparison

The first scoped matrix, excluding repeated setup tests:

| Checkout / selection | Desktop passed / failed / skipped | Mobile passed / failed / skipped |
| --- | --- | --- |
| Integration, 13 specs before Freedom synchronization correction | 65 / 4 / 1 | 66 / 3 / 1 |
| Main, four diagnostic specs | 16 / 4 / 0 | 16 / 3 / 1 |

The ten affected product specs are green: **53 desktop + 54 mobile native tests**,
with one existing desktop layout skip. They cover queue/reload, dialog close/error,
capture and capture layout, booking acceptance, both contacts report specs,
payslip intake and the salary report.

The three touch assertions per profile reproduce on main: Windows Chromium returns
`maxTouchPoints = 10` where two unchanged specs require zero. These are local
browser-capability failures; the assertions remain intact. The Freedom timeout also
reproduces on main, with identical modal interception after premature Escape; its
spec correction is described above. The historical payslip upload/status timeout
does not reproduce on either branch in the requested fresh isolated runs; its
original broad-run cause remains unproven.

The corrected Freedom spec is green on both profiles: **3 native desktop tests
passed; 2 native mobile tests passed with its existing single-writer skip**
(6 desktop / 5 mobile passes when setup is included). All original financial and
Undo assertions now complete within the unchanged test limit.

Taking the latest result for each scoped spec gives **132 native passes, six
baseline-reproduced touch-capability failures and two existing skips**. This is
per-spec evidence reused for unchanged content, not a claim that one fresh full
browser run was green. The 178 baseline ON unit failures also remain; required
full CI and release gates are the lead's responsibility.

Specs exercised: `issue-1144-queue`, `issue-1201-dialog-refresh`, `offline-queue`,
`capture`, `capture-dialog-layout`, `booking-acceptance`, `contact-report`,
`issue-850-contacts-redesign`, `payslip-intake`, `issue-854-payroll-body`,
`issue-481-single-category-band`, `issue-509-reference-assurance`, and `freedom`.
Main comparison used the last two capability specs, `freedom`, and `payslip-intake`,
with the same per-spec commands, profiles, port and worker count.

### Visual evidence

Inspected desktop/mobile pending account and Plan captures and desktop payslip
actions. Held-read PNGs are under `build/train13-e2e/*/issue-1201-dialog-refresh/`;
the payslip, contacts and salary specs also emit light/dark evidence. Existing
specs wrote 16 tracked report-evidence PNGs; these generated images were preserved
under `build/train13-generated-evidence/` and their tracked originals restored.
No screenshot baseline or generated PNG is part of either fix commit. Browser
emulation is not physical-device or production acceptance.
