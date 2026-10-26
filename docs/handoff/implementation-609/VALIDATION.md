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
