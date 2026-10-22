> Discovery snapshot. Subsequently, root independently pinned the #519 fee correction at d6cb8e1c (519-fx-fee-pinned-fix-source-review.md), and #516/#469 glossary gained independently reviewed corrections. Consult SOURCE-REVIEW-COVERAGE.md for later evidence.

# Archived source-review index — remaining matrix rows

Read-only discovery at the exact package revisions in `docs/handoff/cloud-environment-20261022/checkpoints.json`. This indexes committed review artifacts only; it does not review product code or infer whole-package clearance. A later docs head is not the reviewed source SHA. All packages remain NOT VALIDATED / NOT LIVE unless their own acceptance evidence says otherwise.

| Issue / manifest package head | Archived independent report and reviewed source | Evidence status |
|---|---|---|
| #519 FX transfers — `codex/impl-519-fx-transfers`, `8b37818bf1c3160638b9909c8ad7feaf7af7c93b` | No issue-specific independent source-review report found at this manifest revision; `FX-519-NOT-VALIDATED.md` is a status handoff, not a review. | No archived independent review evidenced for this package. |
| #519 FX posting — `codex/impl-519-fx-posting`, `d6cb8e1c0555196c5dcdefa01784f621a4a0d521` | `FX-519-SOURCE-REVIEW.md`: initial review of `5e2ab4b4785d1a9f67dd442d96240f369e62ffe4` against `e7566feb0835c697531556651d213e5ef669cad4` found a P2 involving recurring FX-fee bookings. The same archived report records a read-only review of an uncommitted repeat-guard working-tree delta, without a commit SHA. | A correction was described as addressed in that uncommitted delta; no committed reviewed-correction SHA is recorded there. Do not mark the finding closed at a pinned committed source revision. |
| #486 manual scan — `codex/impl-486-manual-scan`, `ff620377e9f6905a3fa48f2464e1339269d4ea35` | `docs/implementation/payslip-manual-scan-486-source-review.md`: initial reviewed source `04f8ab9aa9942aa382a4e67e65ce148f2a28e8dd` against `d6cb8e1c0555196c5dcdefa01784f621a4a0d521`; follow-up reviews `04f8ab9..9664552b062391c070ca8315286ff71a2b631063`. | Follow-up says the four findings in that bounded review were addressed in source at `966455…`; no runtime, migration execution, provider, or release validation. The manifest head is a later package checkpoint; report wording does not claim it reviewed that entire head. |
| #487 portfolio report — `codex/impl-487-portfolio-report`, `8ba342d00b995d8611af87e968ce159f54375382` | `docs/implementation/portfolio-report-487-source-review.md`: reviewed `ac5e55291ffe55c7872ab43c1407d7b117afe480` against `ca931813e58fe6076a26e70b626ff4050076066a`; found a P2 where default print omits the annual return grid. `docs/implementation/portfolio-report-487-print-fix-source-review.md`: reviewed correction `8978fa30a944cd3d74fa29327f5a520e9c39a38a` against `ac5e55291ffe55c7872ab43c1407d7b117afe480`. | The bounded print finding is source-clear at `8978fa…`. Print layout/output, runtime, and full package acceptance remain unvalidated; the current manifest head is not itself the reviewed source SHA. |
| #516 import explanations — `codex/impl-516-import-explanations`, `eef0bec42421abb73f05b2dd8c336431ba584a18` | No independent source-review report found at this manifest revision; `IMPORT-516-NOT-VALIDATED.md` is a status handoff. | No archived independent review evidenced. |
| #469 glossary/goals — `codex/impl-469-glossary-goals`, `e0e39d4b0b5b04ad6966e8603d0bd91cf4b66cad` | No independent source-review report found at this manifest revision. `docs/handoff/implementation-469-glossary-goals/NOT-VALIDATED.md` documents source scope and remaining review/acceptance gates; it is not an independent review. | No archived independent review evidenced. Do not conflate with the separate #469 copy branch. |

## Package paths inspected

- `impl-519-fx-transfers/FX-519-NOT-VALIDATED.md`
- `impl-519-fx-posting/FX-519-SOURCE-REVIEW.md`
- `impl-486-manual-scan/docs/implementation/payslip-manual-scan-486-source-review.md`
- `impl-487-portfolio-report/docs/implementation/portfolio-report-487-source-review.md`
- `impl-487-portfolio-report/docs/implementation/portfolio-report-487-print-fix-source-review.md`
- `impl-516-import-explanations/IMPORT-516-NOT-VALIDATED.md`
- `impl-469-glossary-goals/docs/handoff/implementation-469-glossary-goals/NOT-VALIDATED.md`
