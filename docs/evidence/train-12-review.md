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

## First-run browser repairs (2026-11-19)

The local CLI builder reproduced the reported mobile and WebKit failures with
redesign ON before changing them. A separate Codex agent reviewed the repair diff
and the impact of each test adaptation; no blocking findings were reported.

| Failure | Cause | Correction |
| --- | --- | --- |
| `capture.spec.ts:162`, desktop/mobile | After the learned suggestion opens, the non-exact Empfänger label also matches its labelled listbox. | Target the exact input label for keyboard reselection. Rename the test around the reset contract; assert the literal retained date `01.10.2026` and register account ID, empty amount/payee/category, then the learned category. Preserve both saved rows and the 9,200-cent balance. |
| `capture-dialog-layout.spec.ts:255`, all five booking-line scenarios | `/?panel=buchung&konto=…` supplies no register context to the global panel. An unknown payee correctly clears its implicit account under #1145, so Save is disabled. | Open the actual `/konten/:id?panel=buchung` register entry and assert its account ID before Save. Preserve all literal cent splits, contact shares, disabled incomplete states and exact stored-split equality after editing. |
| `capture-dialog-layout.spec.ts:538`, phone viewport/Undo | The same global-entry setup leaves the account empty after choosing an unknown payee; keyboard save is correctly blocked before the layout/Undo assertions. | Use the real register entry and assert its account ID; scope compact-viewport assertions to the open sheet because the register also mounts inactive editor scopes. Keep field/action geometry, keyboard submission and all toast/Undo bounds unchanged. |
| `issue-1048-bank-all-fields.spec.ts:84`, WebKit light/dark | Native IndexedDB `add` rejects the receipt Blob with `UnknownError: Error preparing Blob/File data to be stored in object store`; copying into a memory-backed Blob also fails in the actual flow. | Persist plain `ArrayBuffer` bytes plus MIME in the existing v1 stores, restoring a Blob for list/delivery reads. Existing Blob records remain readable. Synthetic WebKit probes also reproduce Blob failure and successful byte storage. The existing browser spec is unchanged. |

No reset or edit-data regression was found: the edit path does not request
payee history. New desktop/phone units reselect an existing payee whose learned
account/category differ from the edited booking, change only its note, and assert
that stored amount/account/category remain and the patch contains no account or
split replacement. Existing browser edit round trips still assert exact splits.

Additional unit impact: `receipt-store.test.ts` exercises add/list/mark against an
IndexedDB stand-in rejecting Blob serialization. Its literal bytes/MIME/name/target
regression fails before the app fix and passes after it. It also checks legacy
Blob reads/marks without rewriting the payload and a logout fence changing while
bytes are read. Queue, receipt-section and bank browser tests remain unchanged.

This changes the raw-file record encoding only: no IndexedDB version, store,
keypath, database migration or ledger data changes. New code reads old Blob rows.
An already-open older app version needs a refresh to deliver newly encoded rows;
its old sender rejects the bytes before POST/cleanup and retains the intent. That
mixed-version tab scenario was reviewed in code, not exercised in a browser.

The combined viewport run exposed one further fixture interaction in the existing
layout test at line 48: the first viewport saves the shortcut-typed payee `ns?s`;
subsequent viewports then open its learned suggestion over the category actions.
The trace shows that option intercepting the click. After retaining the original
shortcut/focus/discard assertions, the test now leaves the field with Tab and
asserts it is no longer focused before interacting below the overlay. This is a
normal keyboard transition, with no force click or added wait.

The reset test pins browser time to 2026-10-01 before creating its account so the
literal retained booking date does not precede the fixture's opening balance.
The original two-row and 9,200-cent balance expectations remain unchanged.

The additional WebKit #1145 run exposed a stale popup position while focus changes
the phone form layout: the option was obstructed by the action bar. The combobox
now remeasures once on the next layout frame, cancelling the frame on cleanup.
The literal positioning regression (`418px` to `302px`) fails without this change;
all 13 combobox units pass with it. No CSS, tokens or settled popup geometry change.

Native Windows WebKit verification became memory-bound: the 8 GB host had only
about 100-260 MB free, ordinary native actions took over a second, and a calendar
test used 29 seconds before even reaching its payee picker. A later split scenario
also exhausted its existing 90-second limit. These are not passing full runs.
The original #1145 spec and all timeouts remain unchanged. An exploratory
partitioned run exercised every #1145 assertion successfully on all three profiles
(15 passes including setup); those runtime-only partitions were removed to retain
the original single-flow contract. The original full native WebKit run still
times out during later category input under memory pressure.

A temporary local config removes only the three unused auth/sample servers and
the unused sample setup dependency, preserving the requested browser projects,
main ledger setup, test cases and timeouts. This is alternate local verification,
not the exact standard-config invocation. The temporary config is not committed.

Final repair verification (one local heavy job at a time, `VITEST_MAX_WORKERS=1`,
Playwright `--workers=1`, port 4769, redesign ON):

- Workspace typecheck, changed-file ESLint/Prettier and diff whitespace checks pass.
- All 10 affected unit files pass: 145 tests, including capture, combobox and
  receipt storage/section coverage. OFF and ON `build:e2e` both pass.
- Standard-config `capture.spec.ts`: 35 passes including setup, desktop/mobile.
  This file is outside the existing native WebKit project's match list.
- Standard-config `issue-1048-bank-all-fields.spec.ts`: 12 passes including setup,
  all three profiles, with both native receipt inputs and grouped Undo unchanged.
- The full standard-config layout run passes every desktop/mobile case (the
  existing desktop phone-only skip remains). All five native WebKit split/edit
  modes passed in an earlier bounded run; later memory-bound full reruns are not
  reported green. The final focused native WebKit phone viewport/Undo run passes
  unchanged assertions using the alternate local config: 3 passes including setup.
- Original #1145 desktop/mobile flows pass; the exploratory 15-pass run above
  covers every native WebKit acceptance assertion. The restored original full
  native WebKit spec remains locally limited by its unchanged 30-second timeout.
- No full local e2e suite, merge or release was performed. Exact-head Linux CI is
  still required; local memory timeouts are a verification limit, not CI success.

There are no Linux screenshot baselines to regenerate for these repairs: the four
requested specs contain no `toHaveScreenshot` assertions. Their screenshots are
review artifacts. No screenshot assertion, timeout, tolerance, financial oracle
or Undo assertion was weakened.
