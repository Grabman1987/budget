# #741 payroll: four new validation files, outside-only proposal

This packet adds four NEW test paths to the eight-file, independently reviewed payroll continuation. It does not adopt that continuation or these tests into any repository. The original `741-payroll-continuation-outside-source/manifest.json` remains byte-exact at `caebf02ad833da9aaa87b1b52e2a914bc79505faf7dcbfed367199fcb761e0f0`; its eight source files are unchanged. `baseline/` preserves those exact eight files. Source review `741-payroll-continuation-independent-source-high.md` (`1492df2f00bb724007786d747cc51c89c2991a0437be80e2569ceccb1258df15`) remains historical source evidence, not runtime proof.

All four new files are unformatted and unexecuted. No dependency installation, parser/typecheck, unit test, browser, build, full check, old-test edit, new branch, Git mutation, or publication was performed. Case counts below are source declarations, not collection or pass counts.

## Exact proposed additions

| New path | Declared cases | Real boundary / limitation |
| --- | ---: | --- |
| `packages/db/src/repos/payslip-automation-741.test.ts` | 8 | Real migrated DB and writers, synthetic parsed-document metadata, actual payout/association/Undo and full table snapshots; no PDF parsing in this layer. |
| `apps/server/src/api/payslip-automation-741.test.ts` | 4 | Actual `createApp`, AuthStore gate, synthetic authenticated session and real PDF worker with actual generated PDF bytes; no real WebAuthn ceremony and no AI. |
| `apps/web/src/reports/payslip-automation-741.test.tsx` | 6 | Real components/query invalidation/Undo interaction; finite mocked HTTP transport only, fake upload bytes. This layer makes no financial/PDF correctness claim. |
| `e2e/issue-741-payroll-automation.spec.ts` | 5 | Four explicit viewport/theme scenarios and one actual result-route/reload scenario, existing isolated server/bootstrap and actual PDF upload. All browser outcomes and images remain future work. |

There are 23 newly declared cases here. The separately preserved NEW pure file contributes 30 previously reviewed declarations, giving 53 declared cases across five new test files. Setup/dependency tests and project multipliers have not been counted as feature cases.

## Financial and persistence oracles

The independent integer fixture is `400000 - 68000 - 44000 - 500 + 10000 = 297500`, split into salary `287500` and reimbursement `10000`. The API/native PDF fixture retains the real parser's signed SV/tax corrections: raw SV `70000` plus `-2000`, raw tax `50000` plus `-6000`, the same deduction and reimbursements. Neither test computes expected payout via the production calculation.

DB cases cover newly booked payout and persisted source association; whole financial Undo/redo; linking an existing payout without changing its original row, splits, status or booking history; amount-only unknown sender; two equal genuine candidates; rejected intake; config ABA; byte-variant same-slot upload after Undo; and late failure rollback. The rollback case uses an actual JS observer trigger to prove a payout INSERT occurred before a later payslip INSERT aborts, then compares every persisted table and retries without the failpoint.

The HTTP cases exercise explicit eligible intent, exact retained/downloaded PDF bytes, repeated GET association reads, exact-SHA no-repost before and after real `/api/undo`, omitted intent remaining manual, missing printed payout date, authentication and rejection of client-supplied plan fields. The config race wraps the real imported receipt-file verifier, awaits actual verification, changes the configuration through the real authenticated route and returns the real verified path. It does not replace parsing, eligibility or the financial writer.

UI checks target the financial automation group rather than the earlier source-staging group, disappearance of the result link after real component query invalidation, fresh mount/GET, absence for pending/rejected/legacy data, and explicit source account/employer configuration. HTTP responses and their state are mocked in this layer only.

The four native scenarios preserve an earlier unrelated confirmed salary `12345`: account `62345 → 359845 → 62345`. They use the actual filechooser, source download, salary/refund splits, source association reload, real UI financial Undo and duplicate re-upload. The separate existing-payout scenario uses the actual plain result anchor, opens the exact booking route, reloads it and preserves the original booking/history. Route clicking is not claimed for the four screenshot scenarios.

## Browser proof scope and pending gaps

The proposed desktop context is truly `1440×900`, fine/no-touch configuration and DPR 1. Phone is width 390, inheriting a 390-wide project's configured height (otherwise 844), configured touch/mobile and DPR 3. Evidence records actual engine/project/runtime independently. Effective theme resolution handles system preference. No physical touch, OS gesture or Chromium claim is inferred from context options.

Planned full viewport/center-hit checks on the opener, Undo control and separately clicked result link explicitly use Playwright's ordinary `scrollIntoViewIfNeeded`; they are assisted-scroll geometry checks, not proof that every result is initially unobscured. While the four screenshot scenarios keep the actual Undo toast focused, their result link is checked for 44px dimensions only, with no unobstructed or click claim. The separate ordinary Escape/destination-click scenario retains the full link hit check. Native Axe checks are scoped to the actual open upload dialog. Screenshots are genuine viewport captures and safe JSON is written physically and attached only after that scenario's assertions succeed. Failed-scenario safe artifacts are not supplied by this packet; ordinary runner traces/failure screenshots remain the runner's responsibility.

The native source preserves default project timings. Actual PDF worker/CI timing is unmeasured; no timeout increase has been made. No case has been collected or executed. Privacy toggle/rerender behavior is explicitly untested here, and native proof metadata says so; source formatting reads the existing private euro formatter, but that alone does not establish live-toggle rendering in these components. No private documents, real account identities, secrets, authentication snapshots or production data are embedded.

After source review and Root's adoption/validation grant, run the five NEW files against the adopted continuation, appropriate types/static checks, actual canonical browser scenarios, then required full/build and fresh exact-head remote CI. Any necessary existing manual-upload copy selectors remain a separate Root-owned policy review; this packet changes no old tests or financial expectations. Card release, actual integration base and Root's single-heavy-job lock remain prerequisites. No current source-only result closes payroll acceptance.
