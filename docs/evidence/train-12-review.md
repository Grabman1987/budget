# Train 12 independent integration review

Scope: main package 20 plus #1255, #1256, #1257 and #1258. The reviewer did not
implement the incoming packages. Fixes stay on `train/12`; no push, merge, release,
Playwright run, migration or private-data access was performed. All examples are
synthetic.

## Confirmed findings

| Severity | Location | Finding and correction | Commit |
| --- | --- | --- | --- |
| P1 | `apps/web/src/ledger/capture-form.tsx:813` | Save and new retained the previous payee, category, project, income type, transfer destination and implicit account. Reset to an empty draft, retaining only date, booking mode and explicit register account context. Disable remembered-account fallback for this new form; invalidate both outstanding history requests. | `bb035424`, e2e readiness `70d5a82b` |
| P2 | `packages/db/src/repos/operator-source-rebuild.test.ts:269` | The exact verdict assertion omitted #1258's additive diagnostic fields. Assert complete literal missing-leg objects, including empty references, dates and 10,000/20,000 cents. All existing financial, idempotency and Undo assertions remain. | `475cd052` |
| P2 | `apps/web/src/inbox/bank-candidate-row.test.tsx:82` | A full candidate fixture omitted currency and crashed the native-currency bank facts renderer. Supply the real API field with synthetic EUR; retain the -1,201-cent amount and every bulk/merge assertion. | `100b4842` |

The reset regression covers expense, income, transfer and split bookings, including
a queued save result mocked at the mutation boundary. Literal cases use 1,001 cents,
a 667/334-cent split and a subsequent 203-cent booking. A delayed history response cannot replace a category typed in
the current form; the saved split is exactly the selected category and -703 cents.
An ambiguous category prefix remains visibly invalid; its unique full label saves
the literal selected ID and -1,000 cents.

## Review conclusions

- #1255: the rewritten unmatched-category and changed-payee expectations implement
  #1145 rather than weaken it. Typed, clicked and keyboard selections retain
  displayed-label/saved-ID assertions. Manual choices and outstanding responses
  use separate account/category guards. The queue persists the same input/draft
  pair handed to the mutation; resetting replaces the draft instead of mutating
  that submitted pair.
- #1256: actual router and navigation definitions match ON costs ->
  `/reports/psteuern`, finance check -> `/reports/onepager`, and contacts ->
  `/reports/kontakte`. OFF destinations and old bookmarks remain covered. The
  total-template CSV comparison asserts complete bytes, BOM, CRLF, row order and
  literal cents. No report financial formula changed.
- #1257: bank account/date/amount/original text come from the server candidate.
  Manual note does not overwrite stored bank text. Cent splits must sum exactly;
  receipt links, booking and inbox resolution use the same transaction/audit group.
  Literal tests retain the one-Undo restoration and rollback checks.
- #1258: no ledger write action was added. Stored diagnostics explain the existing
  match result. Integer guards, decimal source strings and bigint rendering retain
  exact e8 quantities; privacy masks amounts and units, including movement detail.
- No duplicated helper or conflicting user-story merge was found. The reset story
  was corrected in both the index and the detailed capture story.

## Test-file rationale and independent review

- `capture-form.test.tsx`: assert immediate clearing, register context, late-response
  invalidation, queue payloads, exact splits and the typed-category race.
- `capture-category-picker-734.test.tsx`: add an ambiguous-prefix regression with
  an exact category-ID/cent expectation.
- `e2e/capture.spec.ts`: wait for the learned payee option and reselect it by
  keyboard after reset; keep the original two-row and 9,200-cent balance expectations.
- `e2e/issue-1145-capture-values.spec.ts`: assert empty account/payee/category after
  each reset and select an account for each subsequent form. Existing request and
  response category-ID assertions remain.
- `operator-source-rebuild.test.ts` and `bank-candidate-row.test.tsx`: complete
  additive diagnostic/currency contracts as described above.

A separate agent reviewed the reset implementation, every retained test change,
the exact diagnostic literals and the bank fixture. The primary reviewer also
checked the complete incoming diff. No financial oracle, timeout, tolerance, lock,
audit or Undo assertion was relaxed.

## Verification

- `npm run typecheck`: passed.
- `npm run lint`: passed; changed-file ESLint and Prettier also passed.
- Prettier on all files changed against `origin/main`: passed.
- ON full application build and OFF web build: passed.
- ON focused units: **13 files, 300 tests passed**, one isolated thread worker.
- Standard full unit suite: **930 files completed** with 8,480 passed tests,
  47 failed, one expected failure and 41 skipped in the isolated thread pool.
  Both failed files were unchanged host-tool tests with unavailable Git Bash in
  that pool. Their default fork-pool rerun passed **2 files / 88 tests**.
- Replacing those two host-tool results yields distinct standard-suite coverage of
  **8,567 passed, one existing expected failure and one existing skip**. This is
  the combined result of the full run and bounded rerun, not a claim that the
  initial full invocation exited green.

The host-tool failure was reproduced independently: Windows stores the environment
key as `PROGRAMFILES`; `process.env.ProgramFiles` resolves in the main process but
not in worker threads. Only `queue-glue.test.mjs` and `review-followups.test.mjs`
use that lookup for Git Bash discovery. The full thread run therefore failed 47
cases and skipped 40 additional cases; the unchanged fork rerun exercised all 88
cases successfully. No queue script, test assertion, timeout or skip was changed.

An exploratory full suite with a global ON override was stopped after it reported
137 failures in 21 files. Two are the fixture/diagnostic findings fixed above and
now pass in the focused run. The other 135 reports are in 19 unchanged legacy
test files, across Plan, Heute, Reports, account overview/review, search, goals and
inflation settings. This is an incomplete diagnostic run, not a passing full ON
suite. Examples include missing router/media/dialog fixtures, strict read
allowlists rejecting ON header/preview reads, replaced entry controls and old
forecast source-lifetime expectations. The latter conflict with the explicit ON
aggregate-source tests; changing those expectations is not accepted in this
bounded review. These suites remain unchanged. Existing #1256 evidence already
documents analogous OFF-suite/ON-fixture gaps; see
[the retained report proof](rest-reports-1156.md#remaining-audited-red-tests-triage).

CI's standard unit command has no global redesign override. The complete standard
suite is therefore checked separately from the explicit ON package checks. Local
runtime is Windows with Node 24.12.0, below the declared supported engine; exact-head
Linux CI remains required. No local result establishes production acceptance.

## Browser impact

The reset fix affects `e2e/capture.spec.ts` and
`e2e/issue-1145-capture-values.spec.ts`. The incoming packages also affect
`e2e/issue-625-explorer-templates.spec.ts`,
`e2e/issue-1048-bank-all-fields.spec.ts` and
`e2e/issue-1081-crypto-cause.spec.ts`. Report, bank and crypto screenshots are
review artifacts in those specs. No PNG baseline was changed or regenerated.
