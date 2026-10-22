# #609 income and payslip review — source implementation, NOT VALIDATED

Base: `6420676d257698767931dd151863765cec914acf` (#757 automatic payroll).
Branch: `codex/impl-609-payslip-preview`.
Prepared preview: `621f1edfdf201199b2c244465557b65bcd0f41c3`.
Historical packet: `40433c559e745281323418aca9182fd62399cd73`.
The implementation checkpoint is the commit containing this document.

## Implemented source

- Plan income and the Plan month income button use the same existing received
  income query. The detail shows received versus expected with a bounded bar;
  budget-month inflow remains the separate “Zählt für Zu verteilen” footnote.
- The income page owns the captured-payslip list and existing upload/review
  dialog. The salary report has no upload control; legacy upload URLs redirect
  to income. Its 14-salary table has recorded positions and one missing line.
- Review composes an explicit, transient inert PNG preview on the left and the
  existing actual financial form on the right. The shared payroll totals feed a
  cent-precision dimension chain with any source summendifferenz disclosed.
  Mapping, selected account/date/expectation, original download and #757 automatic
  result/persisted-payout/financial-Undo acknowledgment code remain in place.
- Optional explicit split acceptance uses a server-owned preview and CAS token.
  The decision recomputes eligibility inside its existing outer transaction,
  invokes ordinary updateBooking without unlock, then saves/links the payslip,
  receipt, expectation and inbox decision under the same audit group.

## Explicit split boundary

Only an exact EUR payout with one proven untouched original salary lump is
eligible. The current known parser, document-derived period/date, reconciled cents,
configured sender/account, committed import run/mapping, complete original audited
booking/split creation snapshots and absence of later/undone child or association
history are required. The token binds source/receipt/booking/splits/account/sender/
configuration/expectation/import/audit identities. Current ordinary ledger guards
are retained. No classification, booking total/date/payee/status, FX or cash rule
is replaced. Existing refund classification is reused.

Locked payouts show link-only notice. Already canonical payouts need no rewrite.
Manual corrections, custom allocations, unknown provenance, unsupported bank or
historical payouts and source-date gaps remain link-only. Thus broad normalization
acceptance remains blocked for records without this proof. Opening a PDF preview
never authorizes normalization. #741 automatic upload supplies no split token and
keeps its strict original canonical-allocation contract.

## Preview and security scope

Historical independent server-three and whole-twelve source reviews were read,
including deadline and account-key lifecycle corrections. They do not review this
new port or split implementation. Preview keeps auth/origin/import/body guards,
no-store, opaque original download and CSP. It uses same-buffer digest checks,
post-render source revalidation, one process-local admission slot, bounded pages/
surfaces/output, cancellation and awaited worker termination. Worker diagnostics
are discarded. Pixels/passwords stay in a transient component session, removed on
source/account switch, close and privacy mode. No persistent raster cache exists.
Native RSS, encoder/decoder peaks, deployment-wide quota and hard wall-clock limits
are not established. Actual native loading/rendering/termination remains unproved.

## Paths and integration

Owned: web `budget/envelope-page.tsx`, `budget/plan-page.tsx`,
`expected/income-panel.tsx`, `receipts/pdf-preview.{tsx,css}`,
`reports/{payroll-report,payslip-income,payslip-intake}.tsx`,
`reports/payslip-intake.css`; server `receipts/pdf-preview.ts` and
`receipts/pdf-preview-thread.mjs`; DB `repos/payslip-intake.ts` and
`repos/payslip-payout-split.ts`; docs `payslip-intake.md`, `receipts.md` and this file.
Root coordinated `Dockerfile`, `apps/server/package.json` and both API files
`receipts.ts` / `payslip-intake.ts`. There is no dependency or lockfile change.
The Plan month header hunk must be combined with inspector checkpoint
`b5b971902416bd933e1185b261d247a6b766305e`; that branch was preserved unchanged.

## Deferred acceptance

No tests were added/edited/run; no formatter, lint, typecheck, build, browser, PDF,
private financial data, DB execution, CI, PR, merge or deployment was used. New
independent whole-financial review, literal split/rollback/exact Undo/CAS/ABA and
savings-rate proof, all rendering/packaging/auth/privacy/resource/error checks,
1440/390/WebKit light/dark, focus, 44px targets, overflow and Axe remain pending.
No issue acceptance or live completion is claimed. Workflow triggers are inspected
before ordinary feature push; workflows/protections/STOP state remain unchanged.
