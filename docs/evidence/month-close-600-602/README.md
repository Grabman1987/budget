# Month close #600 / #601 / #602

Local implementation on base `8962cf7817125995abc22ca634e1d60a1a03fc55`.
Only the month-close portions of prepared source `496b4e02` were reused, with
the shared reconciliation category guard and close-mode form hooks. No Heute
charts, section readers, reminders, task UI, request memo changes, migration or
dependency changes are included. Earlier source-only reviews are provenance,
not validation of this runtime or diff.

- #600: Prüfen / Konten abgleichen / Überzogenes ausgleichen / Nächsten Monat
  planen / Ergebnis; empty steps are skipped, progress counts steps with work,
  and each step explains Warum and Danach. A synthetic quiet month opens at
  Ergebnis and saves with one click.
- #601: bank-first conservative quiet-account cohort, transactional revision and
  exact cohort recheck, canonical reconciliation per account and one audit/Undo
  group. Movement, pending work, missing lineage, later changes, holdings and
  contradictions remain individual. A newer contradictory bank observation uses
  its observed day or Vienna fetch day. Individual residual adjustments require
  a reason and keep the existing category, cents and booking-lock guards.
- #602: current report-reader figures and a bounded version-1 retained result,
  server close time, no additional month lock, idempotent unchanged close,
  required reviewed source revision and retained audit-event fence against
  change followed by Undo. Earlier markers and snapshots remain readable;
  presentation sorting does not reorder the retained revision facts.

## Regression evidence

The first extracted-source run reproduced `SQLITE_ERROR: near "AS": syntax
error` in `month-close-reconciliation.ts` when an earlier personal check existed.
The existing account-completion API test failed; a direct synthetic read showed
the query location. Its changed-event subquery lacked a closing parenthesis.
The correction changes syntax only. The literal quiet cohort regression now
expects Giro 98,750 cents after a 1,250-cent expense from 100,000 opening cents,
Sparen 0 cents and USD 0 native cents. It verifies exactly one new check each,
the grouped audit, retained financial locks and exact original rows after Undo.
Another regression forces the second canonical insert to fail and proves the
whole group's accounts, checks and audits roll back.

Report/close fixtures retain independent expected values: spending 400 cents,
income 0, saved -400, assignments 99,600, open overspending 400 and unassigned
carry 400 (100,000 opening cents less 99,600 assigned). Overspending and
unassigned carry remain distinct existing measures. Tests also cover report
reader equality, idempotent time/state with no extra audit, actual financial
editing after close, stale close and stale batch rejection after change/Undo,
bank-date fallback, pending/moved/unproven exclusions, residual-reason rollback,
and legacy snapshot reads.

## Changed-test reasons

| File | Reason |
| --- | --- |
| `apps/server/src/api/month-close.test.ts` | Existing close requests now send the reviewed revision required by the API. Original financial, stale-work, lock and Undo expectations remain. New scoped cases prove transactional writes, rollback, exact grouped Undo, report parity, source CAS and retained close behavior. |
| `packages/domain/src/month-close.test.ts` | New task-only navigation and legacy marker/version-1 parsing checks; existing calculation assertions are unchanged. |
| `apps/web/src/month-close/stepper.test.tsx` | Renamed Prüfen selector and task-only progress/empty-step labels; retains five-step, current-step and keyboard assertions. |
| `apps/web/src/month-close/month-close-page.test.tsx` | Adds quiet-month one-click completion through the real API. Supplies JSDOM's missing ResizeObserver/scroll APIs; original account-date, amount and Undo checks remain. |
| `e2e/month-close.spec.ts` | Renamed headings, expands the new report disclosure before the existing report/verdict assertions, checks stored time and retained source revision. Existing amounts, plan Undo, accessibility, overflow and screenshot assertions remain. |
| `e2e/inbox-pagination.spec.ts` | Only the renamed Prüfen heading; pagination assertions remain unchanged. |
| `playwright.config.ts` | Add the existing month-close spec to the WebKit iPhone match, so the required engine actually executes this flow. Profile settings, assertions, timeouts and retries are unchanged. |

The existing scoped Linux snapshot workflow now retains only `test-results` PNG
screenshots as a seven-day artifact. This permits inspecting synthetic browser
evidence without repeating the same flow on the memory-constrained Windows host.
Auth state, JSON, databases and PDF originals are not included in this new artifact.
The workflow's existing test command, baseline selection, commit behavior and CI
gates are unchanged; its `|| true` still requires inspecting the actual test summary.

## Local checks and remaining gates

Node `v22.23.3`; `npm ci --no-audit --no-fund` refreshed the old installed graph
without manifest or lock changes. All-workspace `npm run typecheck` passed.
Changed-path ESLint passed (the supplied CSS path produced its normal ignored
warning); the final browser-test/component edits passed scoped ESLint too.
CSS scale check passed. `npm run build` passed for web and server; existing Vite
config-loader and ineffective dynamic-import warnings remain.

The first current-graph parallel run hit fork startup timeouts on the
memory-constrained Windows host. No timeouts, assertions, heap limits or worker
configuration files changed. The next run used `--maxWorkers=1`: 49/50 passed;
the new quiet component case exposed the missing JSDOM ResizeObserver fixture.
Its focused rerun passed all 3 component cases after that fixture was supplied.
Final run: **6 files / 50 tests passed**, 39.19 seconds, using:

```powershell
node node_modules/vitest/vitest.mjs run --maxWorkers=1 packages/domain/src/month-close.test.ts apps/server/src/api/month-close.test.ts apps/web/src/month-close/stepper.test.tsx apps/web/src/month-close/month-close-page.test.tsx apps/web/src/month-close/next-month-plan.test.tsx apps/web/src/ledger/reconcile-panel.test.tsx
```

The existing account-flow cases emit JSDOM's nonfatal scrollTo notice; no test
failed. The new quiet-month case supplies that fixture explicitly.

Required independent full-diff financial review and exact-head required CI are
still pending. No full local suite, Docker/restore, browser run, workflow, PR,
push, merge or release was started here. Desktop 1440 / mobile 390 /
webkit-iphone light/dark, Axe, no horizontal scroll, touch-target checks and
affected visual evidence remain browser gates; JSDOM does not establish them.
No live or complete acceptance is claimed. #573/#603 remain separate work.

## Independent review correction: historical change followed by Undo

Review found that the retained event predicate covered bookings/splits only in
the selected month. An August booking can affect September's reviewed balance
and carry, so editing it and actually undoing the edit restored the hashed facts
without changing the event count. The old September revision was then accepted
by both close and individual reconciliation, and a stored close incorrectly
reported no change.

Before changing product code, two new cases in the existing API test reproduced
the defect: an August amount/split edit and an August split-only edit. Both
proved equal restored figures/accounts, unchanged revision, false
`changedSinceClose`, accepted stale close (200) and individual reconciliation
(201), and an unwanted reconciliation audit. The fixture uses literal opening
100,000 cents minus a confirmed 400-cent historical expense = 99,600 cents.

The correction includes historical booking before/after dates through the
selected month end and split events whose current or retained parent booking
has such a date. Before/after predicates continue to cover moves out of scope.
No snapshot version, property/array order, money calculation or locking/Undo
rule changes. The API regressions retain the restored-fact equality checks and
now require a changed revision, visible changed state, both stale writes refused
(409), and exact unchanged audits/reconciliations after those refusals.

After correction: **all 26 tests in `apps/server/src/api/month-close.test.ts`
passed** with Node 22 / `--maxWorkers=1` (19.69 seconds). Scoped ESLint, Prettier
and `git diff --check` passed. Earlier six-file results above remain evidence of
the original package; this correction reran the complete affected API file.
Browser/full-CI/release gates remain pending as described above.

## Boundary follow-up: reviewed next-month distribution

`fa9dfa3c` was not final review clearance. Re-reading the complete hashed facts
confirmed that they include both historical balances/current results and the
next month's assignment pool (`nextSummary` and step 4). The August correction
alone therefore left October income edit/Undo unfenced for a September close.
New October amount/split and split-only cases reproduced the unchanged revision,
false changed state and accepted stale close/individual writes before this fix.

Only booking/split event predicates now use a dedicated horizon through the end
of the next month. Booking before/after dates, split current-parent dates and
retained-parent before/after dates all use that same horizon; deleted parents
are not filtered out. Valuation retains the selected-month end, and other event
scopes remain unchanged. No version, hashed-fact order or financial formula
changes. Events solely after next-month end do not cause global invalidation.

Both August regressions remain. October fixtures independently expect 10,000
cents income plus 100,000 opening cents to support 110,000 assigned next month,
with zero remaining. After actual Undo, current figures/accounts and the full
next-month summary must equal the reviewed values while revision/changed state
retain the event; stale close and individual requests must both refuse with 409
and leave audits/checks exactly unchanged. An additional November-only fixture
must preserve September's revision; moving it into October and actually undoing
that move must retain the change despite equal restored facts.

Final affected-file run: **29/29 API tests passed**, Node 22 / `--maxWorkers=1`,
16.18 seconds. Scoped ESLint, Prettier and diff checks passed. No full CI,
browser run, push or release was executed for this correction; exact-head
independent re-review and the previously listed runtime gates remain required.

## Browser coverage follow-up and carry label

The orchestrator's initial scoped Linux run `40319469838` on the integrated
pre-follow-up source reported **7 passed / 1 flaky**. WebKit's first guided-flow
attempt reached the existing 30-second deadline at the final stored-state
message; its existing retry passed. No baseline changed. PNG-only artifacts
were retained in private `600-scoped-browser-screenshots`. This is qualified
evidence for that revision, not a pass for the new case below.

Changed-file reasons for this follow-up:

- `e2e/month-close.spec.ts`: adds the missing actual UI batch path to the existing
  isolated-ledger fixture. Two API-created EUR accounts have proven original
  personal checks and pre-check bookings: 10,000 + 2,345 = 12,345 cents and
  70,000 - 2,110 = 67,890 cents. Reviewing the rendered cohort must write nothing.
  The real button must post the displayed revision/cohort and create one
  canonical check per account in one audit group. One real toast Undo must
  restore exact original accounts, bookings, splits and live checks; original
  audit history remains and the two creates/two Undo events append. Both themes
  include Axe, overflow checks and screenshots; actual viewport widths below
  768 also check 44px targets, including WebKit iPhone. The original guided flow,
  financial expectations, deadlines and retry settings are unchanged.
- `apps/web/src/month-close/month-review.tsx`: changes only the label to
  “Übertrag nach …”. The value is the existing `carryInCents`, which can remain
  nonzero after the next month's remaining assignment pool reaches zero. The
  note, retained snapshot and calculations are unchanged; no mirror unit added.
- This README records the new coverage and its validation limits.

Scoped ESLint, Prettier and diff checks passed for this delta. Local Playwright
discovery did not establish a result on the memory-constrained host; no browser
was started. The test uses narrow existing DB client/schema imports for its
read-only snapshots instead of loading the entire repository barrel. The
orchestrator will run the new batch and existing guided cases in the
canonical Linux desktop, mobile and WebKit iPhone profiles and review their
synthetic PNGs. No local browser, full CI, push, PR or release is claimed here.
