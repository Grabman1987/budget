# #609 continuation validation

Prepared source `813854c29ec095f47179f928fa43b5beb1b8679b` was merged into
`1caaa84b9e26e607b6fb47ce50fa419f99f9872d` on `codex/continue-609`.
The historical NOT-VALIDATED and SOURCE-REVIEW documents describe the earlier
checkpoint; this file records the new bounded local evidence. No live acceptance.

## Implementation correction

Real native rendering reproduced a Windows failure before any PNG was returned:
PDF.js requires asset directory strings ending in `/`; `path.sep` supplied `\`.
The worker now ends its standard-font, CMap and WASM paths in `/` on both platforms.
The financial/provenance guards and matching tolerance were preserved.

## Local evidence (Node 22.23.3, Windows, synthetic fixtures)

- Existing payout, intake API and receipt tests passed before new coverage (30 tests).
- Focused DB/Plan/income/payroll tests: 12 files, 117 tests passed.
- Real HTTP native rendering covers PNG dimensions/signature, fit/detail, auth,
  origin, strict request validation, no-store, password rejection/success/no reuse,
  malformed original, page bounds and no persisted password.
- Preview component checks explicit opening, privacy/source/visibility/close abort,
  focus restoration, transient password reset and finite error messages.
- Real split confirmation checks one booking, literal 297500 = 287500 salary +
  10000 refund, original booking metadata, exact original booking/split Undo,
  refusal after consumed-and-undone split history, stale configuration/ABA token
  rejection without audit writes, rollback after a later payslip insert failure,
  corrected-import refusal and reconciled link-only confirmation/Undo.
- The actual month-result reader sees 287500 earned, 100000 consumption, 187500
  saved and 6522 bp savings rate; reimbursement is outside the denominator.
- Production web/server build passed; bundled `dist/pdf-preview-thread.js` loaded
  native PDF.js/canvas and returned a 960px synthetic PNG (14783 bytes).

## Test changes and review rationale

| File (relative to repository) | Reason |
| --- | --- |
| `packages/db/src/repos/payslip-payout.test.ts` | Reuse existing literal payroll fixture; add meaningful existing-import split, exact Undo, rollback, CAS/ABA, locked fallback and real savings-rate reader coverage. Existing oracles retained. |
| `apps/server/src/api/receipts.test.ts` | Exercise the actual new native endpoint, request guards, transient password/error behavior, cancellation/admission and post-render source revalidation. Broaden helper Buffer generic only for PDFKit's synthetic Buffer type. |
| `apps/web/src/receipts/pdf-preview.test.tsx` | New component lifecycle/privacy/password/focus boundary coverage, no browser claim. |
| `apps/web/src/budget/plan-page-head.test.tsx` | Supply new read endpoint fixture and assert received 25 EUR differs from budget-month 100 EUR. Existing budget assertions retained. |
| `apps/web/src/budget/plan-page-cover.test.tsx` | Add new received-income read fixture; cover/write expectations unchanged. |
| `apps/web/src/budget/plan-menus.test.tsx` | Add new received-income read fixture; menu/write expectations unchanged. |
| `apps/web/src/budget/plan-separated-headings-481.test.tsx` | Add new received-income read fixture; category identity/selection/amount expectations unchanged. |
| `apps/web/src/budget/plan-phone-selection-590.test.tsx` | Add new received-income read fixture; selection/write expectations unchanged. |
| `apps/web/src/budget/plan-activity-735.test.tsx` | Add new received-income read fixture; activity/navigation/write expectations unchanged. |
| `apps/web/src/budget/plan-filter-page-589.test.tsx` | Permit only the new GET income query with the two fixture months; preserve unexpected-request and write guards. |
| `apps/web/src/budget/budget-ui.test.tsx` | Add new received-income read fixture; existing financial/action expectations unchanged. |
| `apps/web/src/expected/income-panel.test.tsx` | Adapt intended head/footnote labels; preserve literal amounts and privacy assertions. |
| `apps/web/src/reports/payslip-automation-741.test.tsx` | Require each existing literal amount twice (new chain plus retained detail), preserving mask/no-refetch/payout-link checks. |

## Remaining acceptance and delivery gates

- Independent full-diff financial/security/test review of the final merged packet
  is required; the archived earlier source review cannot approve this revision.
- Full exact-head required CI, Docker/Linux runtime packaging and deployment are
  not run locally. The build/native proof above uses installed Windows modules.
- Desktop 1440, Chromium 390 and WebKit iPhone light/dark visual checks, overflow,
  Axe and actual phone target measurements remain pending. No baselines changed.
- Broad existing-bank/manual/historical normalization remains unsupported when
  original provenance cannot be proven; those records remain link-only. Therefore
  this packet does not establish the broad existing-payout #609 criterion for all
  matching records. Automatic #741 upload still supplies no split token.
- Native RSS/encoder/decoder peaks, deployment-wide concurrency and hard wall-clock
  termination guarantees remain unestablished. The process-local limits are not
  a native sandbox or deployment-wide quota.

## Browser handoff (not yet executed)

Existing `e2e/payslip-intake.spec.ts`, grep
`synthetic encrypted PDF upload, confirm, undo and reject`, on `desktop`, `mobile`
and `webkit-iphone`, `--workers=1`, is the focused three-profile run. It now uses
Plan income, asserts head/detail equality and report no-upload, opens the actual
native encrypted PNG and dimension chain, retains confirm/Undo/reject, captures
both themes and checks overflow. The existing viewport helper additionally checks
all dialog Axe violations and preview phone button sizes >=44px. Evidence files
are emitted even without the optional evidence directory. No baselines or timeout
changes. `issue-741-payroll-automation.spec.ts`, grep `in phone dark`, WebKit only,
retains its separate automatic upload/persisted payout/financial Undo/privacy and
all-violations Axe path.

Additional per-file adapter reasons:

| File | Reason |
| --- | --- |
| `e2e/payslip-intake.spec.ts` | Move upload navigation to its intended Plan income home; extend the existing real-PDF confirm/Undo flow for the bounded #609 browser acceptance above. Existing payout literals and Undo checks retained. |
| `e2e/issue-741-payroll-automation.spec.ts` | Move upload navigation; scope the existing payout value selector to the retained detail list because the dimension chain repeats the label. No financial/privacy/Undo oracle changes. |
| `e2e/expected.spec.ts` | Match intended received/expected label wording, same literal 461200 cents. |
| `e2e/income-scope-266.spec.ts` | Match intended head/footnote wording; same literal figures, privacy and read scopes. |

Final local static evidence: scoped server/web/db typechecks, changed-source ESLint,
CSS scale check and changed-file Prettier checks passed before freeze. The
first broad typecheck attempt exposed only the synthetic Buffer helper generic;
that helper was corrected, without a dependency or compiler configuration change.
ESLint exposed a type-only schema import and an unsafe-finally throw; the latter
now propagates a failed close via promise rejection while retaining buffer zeroing.
The first strengthened head assertion exposed its old PageFrame mock discarding
income; the mock now renders that prop and the four head tests pass. No retries,
timeouts or financial expectations were loosened.

The boundary batch passed 4 files / 25 tests. The final affected repeat passed
32 split/native/privacy tests; the strengthened Plan head fixture then passed all
4 tests, and the final typed mock cleanup passed both preview component tests.
Playwright discovery selected the intended three profile cases without starting
browsers or servers. No full suite or Docker run was performed locally.

## Independent review corrections

The income progress element exposed raw expected/received cents in DOM attributes
while text was masked. It is now absent in privacy mode; the existing privacy test
checks visible -> hidden -> visible and absence even from the hidden accessibility
query, retaining the literal text/masking checks. No financial math changed.

All new Plan income fixture branches now match GET only. In particular, the menus
and cover mocks continue to record non-GET writes through their original guard,
and the #481/#590 mocks retain their original non-GET 422 behavior.

Browser consumer search covered upload action/route strings, old income labels,
and `.plan-detail h2`. The existing chooser/drop flow now opens its dialog after
its final income/report navigation; the salary-history upload consumer navigates
from the report to Plan income and verifies the retained month after Escape.
The expected-income focus assertion targets the named original heading within
its income region because the payslip list adds a second h2.

| Changed test file in correction packet | Reason |
| --- | --- |
| `apps/web/src/expected/income-panel.test.tsx` | Extend the existing mask test to verify unmounted progress attributes and restoration; original amount/scope assertions retained. |
| `apps/web/src/budget/plan-menus.test.tsx` | Bind the new read fixture to GET, preserving original non-GET write recording. |
| `apps/web/src/budget/plan-page-cover.test.tsx` | Bind the new read fixture to GET, preserving original non-GET write recording. |
| `apps/web/src/budget/plan-separated-headings-481.test.tsx` | Bind the read fixture to GET so non-GET requests retain original recording and 422. |
| `apps/web/src/budget/plan-phone-selection-590.test.tsx` | Bind the read fixture to GET so non-GET requests retain original recording and 422. |
| `apps/web/src/budget/plan-page-head.test.tsx` | Make the new fixture explicitly GET-only as in other Plan consumers. |
| `apps/web/src/budget/plan-activity-735.test.tsx` | Make the new fixture explicitly GET-only, preserving original request recording. |
| `e2e/payslip-intake.spec.ts` | Open the existing chooser/drop dialog after final navigation so both real upload methods remain exercised. |
| `e2e/payroll-projects.spec.ts` | Preserve report-back assertion and financial/history/focus/cancel checks, then use Plan income for the moved upload and assert its month remains on close. |
| `e2e/expected.spec.ts` | Scope the original focus assertion to the named income heading, retaining the focus requirement. |

No screenshot baseline, timeout, retry or financial expectation changed. Browser
execution and the affected `expected-income-dark.png` baseline remain coordinated
by the root agent after freeze.

Correction validation: 7 affected unit files / 56 tests passed; changed-file
ESLint, web typecheck, Prettier and diff whitespace checks passed. No browser,
build, full suite or baseline update was run for this correction packet.

Focused browser commands after final freeze (run serially; use Node 22 and the
normal E2E build/config). These supersede the earlier first-test-only suggestion:

```sh
npx playwright test e2e/payslip-intake.spec.ts e2e/payroll-projects.spec.ts --grep "synthetic encrypted PDF upload|new payout via|salary history deep links" --project=desktop --project=mobile --project=webkit-iphone --workers=1
npx playwright test e2e/issue-741-payroll-automation.spec.ts --grep "in phone dark|741 links an existing payout" --project=webkit-iphone --workers=1
npx playwright test e2e/expected.spec.ts e2e/income-scope-266.spec.ts --grep "the 90 days and the Einnahmen panel|Today and Plan explain" --project=desktop --project=mobile --workers=1
```

## Proven-original manual and bank extension (after independent viability review)

This section supersedes the earlier import-only limitation for the two additional
proven origins below. It does not authorize blanket historical normalization.
The original committed-import branch and common parser/date/EUR/exact-cent,
configured sender/account, one original salary lump, lock, audit, child history,
association, CAS and grouped financial Undo guards remain in place.

- An original manual `createBooking` may be split only while its complete original
  booking/split snapshots remain identical, with exactly their creation audits,
  one group and no bank/import identity. Ordinary pending/confirmed metadata is
  retained. Later correction, correction+Undo and creation Undo/redo fail closed.
- A fresh explicit bank confirmation needs its retained original BOOK candidate,
  matching account/date/cents/currency/raw text/raw payee/source/dedupe identity,
  an actual callback/account creation, exactly one initial account mapping,
  successful provider stage watermark, and original inbox confirmation sharing
  the booking creation group. Audit insertion order verifies that the provider
  stage preceded the original booking. Unknown mapping/callback history fails.
- The bank helper selects only the mapping id, consent id, account, EUR currency,
  start date and watermark; safe audit projections include only these fields and
  audit identities/actions/groups. It never selects mapping/consent credentials
  or credential-bearing audit JSON. Candidate, mapping, consent and inbox evidence
  binds CAS. A legitimate later poll changes the token. Audited candidate/mapping
  ABA, remapping, restoration, adoption/merging and changed-provider warnings
  remain unavailable; a warning matters even when retained candidate values stayed
  equal. Pending-to-booked candidate promotion is outside this new narrow path.
- An automatically posted unclassified bank row subsequently assigned salary is
  an edited record and remains link-only. No bank sync posting, mapping, provider,
  booking, locking, Undo, API or UI implementation was changed.

Additional test reasons:

| File | Reason |
| --- | --- |
| `packages/db/src/repos/payslip-payout.test.ts` | Reuse the literal existing fixture through actual import/manual ledger writers. Add original manual pending metadata, one booking, 287500 salary + 10000 reimbursement, savings reader and exact grouped Undo proof, plus correction/Undo/redo no-write rejection. Original import assertions and rollback/lock/association tests remain. |
| `apps/server/src/bank-sync/payslip-payout-split-609.test.ts` | New focused integration tests use the real start/callback/map/tick/confirm service with a synthetic provider. They prove original bank metadata, exact cents/Undo and the actual savings reader (287500 earned, 100000 consumption, 187500 saved, 6522 bp), missing/mismatched candidate and missing original mapping audit refusal, real poll stale-token rejection, changed-provider warning refusal and actual postBooked-then-classified refusal. ABA and storage corruption are explicitly negative fault injections after real positive provenance, never fabricated positive evidence; existing protocol Undo/permissions remain untouched. |

The bank positive and manual token-eligibility regressions were observed failing against the prior helper
before implementation. Two affected test files then passed 37 tests, including all
existing payout regressions. After adding account mismatch and missing-original-
mapping-audit fault cases, the bank test file was rerun; its result is recorded
below. Scoped DB/server typechecks and all three financial-source/test ESLint
checks passed. No UI/E2E, build, browser or full CI was run for this financial delta.
Independent review of this delta and exact-head integration/delivery gates remain.

Final focused bank result: 14 tests passed. Combined relevant evidence is 25
repository payout tests plus 14 bank-origin tests (39); no shared source changed
between the passing two-file run and the final two added negative bank cases.

One additional affected browser case was requested before this financial freeze:
`e2e/payslip-intake.spec.ts` now appends only
`proven original manual payout splits only after explicit acceptance and one Undo restores it`.
It reuses the existing isolated ledger, real API, synthetic PDF generator and toast
helper. It asserts no booking mutation on upload or checkbox selection, unchecked
explicit acceptance, a server token in the actual confirmation request, one same-ID
payout with literal 287500/10000 splits and retained metadata/status, and full
original API booking equality after one grouped Undo. Existing scenarios, financial
fixtures/oracles, timeouts and retry settings are unchanged. Per-file rationale:
this case covers the newly supported manual provenance branch and its checkbox/token
wire through the real UI, rather than repeating every repository guard boundary.

The new case is formatted and linted but NOT EXECUTED. Root coordinates the only
new affected browser flow after building this frozen revision:

```sh
npx playwright test e2e/payslip-intake.spec.ts --grep "proven original manual payout" --project=desktop --project=mobile --project=webkit-iphone --workers=1
```

Earlier browser evidence remains scoped to its tested pre-extension revision and
is not represented here as runtime proof of the new financial helper.
