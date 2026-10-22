# Source progress — 2026-10-22T22:10:38.215713+00:00

This snapshot supersedes historical source-head and active-task statements in CURRENT-COORDINATION.md. All branch heads below were freshly read from origin. No tests, builds, browser execution, CI dispatch, merges or deployments were performed. NOT VALIDATED / NOT LIVE; #719 STOP.

## Current work

- #591–593: all three scoped Plan findings corrected and independently source-reviewed; final review archived on its branch.
- #473: narrow Sankey text/number role correction independently source-reviewed; final report archived on branch.
- #489: cache-header and bounded-decoding defects corrected and independently re-reviewed; final report archived. No production flag enabled.
- #520: recorded-history reader and split replay/reader corrections independently source-reviewed and archived. Next isolated persistence-source stage is assigned; persistent pair relation/schema/API integration and runtime acceptance remain open.
- #619–623 report package: independent scoped source review complete; no concrete finding. Runtime/print/export acceptance remains open.
- #762: four source findings corrected and reviewed. Actual market/calendar adapters, scheduled ingestion and remaining execution/rebalance lifecycle remain unfinished.

- #594–597: safe-cent aggregation and readonly monetary-text privacy corrections pushed; independent correction review archived. Source-clear for the bounded delta, runtime unvalidated.
- #514 and #518/#521: completed source review reports now archived on their respective branches.
- Heute/month-close: conflicting bank-balance and missing close-revision findings corrected, independently re-reviewed and archived. Router integration and runtime acceptance remain open.

## Dependency and policy notes

- Preserve the shared useBudgetWrite success-versus-refresh correction from #562/#514 together with the optional history callbacks from #727; do not overwrite one with the other.
- Preserve #607 required review-token deletion guard when assembling descendants (#514/#519/#486); descendant branches do not automatically receive parent corrections.
- #516 multiple-match behavior awaits the previously requested owner decision. Other source work continues.
- The last repository count was 94 OPEN issues; this is historical and is not the Projects Warteschlange count. No current board count is claimed.
- Reviews are source-only, with scoped coverage; a pushed branch is not completed acceptance or live delivery.

## Executor recovery

Temporary local evidence storage disappeared during executor recovery. Pushed source and package reports survived. New local coordination files use a workspace-backed directory; reconstructed plans are explicitly labeled. The committed reports, not vanished temporary paths, are the preserved evidence.

## Further source reviews and corrections

- #599 and #550/#551: bounded independent source reviews found no concrete new defect; reports archived on package branches.
- #608: event loading/error no longer hides independently available annual context; correction and independent review archived. Product source `2e9cb9934af1d6b8b0431b0c2e64bee3ed35f822`; runtime remains unvalidated.
- #586: bounded independent source review archived; historical WebKit/device evidence is not current-revision acceptance.
- #564/#565: stale normal reconciliation and readonly monetary-text privacy findings corrected. Product source `4d26b0be2344e77f3f785a9b045ad42b69c6af60` independently source-reviewed; final report archived at docs head `7d24f141e309af1cd531d898befaf0b6bf6b2329`. Runtime remains unvalidated.
- #520: minimal writer plan and independent critique preserved after recovery; readonly API/UI preview source `5e4ed5af801b45d332209ac7f1a69e457f7ac5ce` is independently source-reviewed and archived at `2de7fa9611e7a37683edabdaf8ba075c7c26b944`. Migration0053 is now exclusively reserved for the next isolated persistence-source branch; no migration has been executed and no apply path is active.
- #762: provider and evaluation planning notes preserved; verified index/calendar access remains an external evidence/operation dependency. Automatic monthly persistence still needs an Undo-resistant transaction guard.

## Remote checkpoints

| Issues | Branch | Full remote SHA |
|---|---|---|
| #544, #546, #547, #548 | `codex/impl-544-548-portfolio` | `17ecb6e320b169c7cfab402dcff042e67398ef84` |
| #591, #592, #593 | `codex/impl-591-593-plan` | `12dc0565e9b43b913b49214b9005d427f5ec56ce` |
| #572, #573, #574, #575, #600, #601, #602, #603 | `codex/impl-heute-month-close` | `496b4e029585a2ddf2120442060244a14edc58e0` |
| #558, #559, #699, #700 | `codex/impl-offline-558-700` | `f24d665fd69019f5b563977390f76fcef5d0ae4a` |
| #611, #612 | `codex/impl-611-612-debt` | `a395db8c9f4990846bc3a3ec65db071d1c0e616c` |
| #553, #554, #619, #620, #621, #622, #623, #628 | `codex/impl-619-623-reports` | `4c6827344f9853787c64bdf117f10e5cc9617653` |
| #515, #594, #596, #597 | `codex/impl-594-597-ledger` | `f140d6ac8086f3902887f8d68660bc1a5f1bbde0` |
| #608 | `codex/backlog-608-year-delivery` | `6b2892ad22dfdd1e44da4184b8dad20ab54c1e4d` |
| #469, #471, #486 | `codex/impl-settings-469-486` | `09312b49e578db493bfe279133d30260c5e2ed44` |
| #609 | `codex/impl-609-payslip-preview` | `813854c29ec095f47179f928fa43b5beb1b8679b` |
| #599 | `codex/impl-599-contacts` | `9fd8c9555f52fa07e0d2015acbc32b67bf8c187b` |
| #518, #521 | `codex/impl-518-521-explanations` | `4b5eba00bdc448c4f0285bd7d8070e7252eb9a04` |
| #607 | `codex/impl-607-payments` | `8325561b7a1a6e47ef0ef67d27d0959d9f7c5b84` |
| #564, #565 | `codex/impl-564-565-reconcile` | `7d24f141e309af1cd531d898befaf0b6bf6b2329` |
| #562, #563 | `codex/impl-562-563-inbox` | `f830a1d0b17ed6cedb8e9fed871d7d31b7145192` |
| #485, #486 | `codex/impl-485-486-settings-navigation` | `78fa4838953313be5134add009b9b261b34120a8` |
| #514 | `codex/impl-514-targets` | `4e4a938ee7cca6adeffc35849991a8abb3c4afc3` |
| #519 | `codex/impl-519-fx-transfers` | `8b37818bf1c3160638b9909c8ad7feaf7af7c93b` |
| #520 | `codex/impl-520-security-transfers` | `2de7fa9611e7a37683edabdaf8ba075c7c26b944` |
| #471 | `codex/impl-471-icons` | `178c80b15a8e1e6e66115c2635d8992bb703d662` |
| #469 | `codex/impl-469-copy` | `65aee06ce8b5ae970a6b2bcb11b2ef652cddb132` |
| #489 | `codex/impl-489-overview-design` | `9fab18bbb2a9b54b17bbc2e2ef06206212c18b5a` |
| #516 | `codex/impl-516-import-explanations` | `eef0bec42421abb73f05b2dd8c336431ba584a18` |
| #469 | `codex/impl-469-glossary-goals` | `e0e39d4b0b5b04ad6966e8603d0bd91cf4b66cad` |
| #473 | `codex/impl-473-typography` | `9ef01d05ade1a6f5ac3a2ac99dd5e8275888107c` |
| #519 | `codex/impl-519-fx-posting` | `d6cb8e1c0555196c5dcdefa01784f621a4a0d521` |
| #762 | `codex/impl-762-strategy` | `1ecd8b3d6935b9d4dc6c8d7bacc505d47d1a36ce` |
| #586 | `codex/backlog-586-mobile-capture` | `df13e773cf355ec5ea082c7316b05df0b340c517` |
| #550, #551 | `codex/backlog-550-551-composition` | `ecfdcef53317815c0363e0b1c67ca83bd95cd1b2` |
| #470 | `codex/impl-470-table-readability` | `28b2b2784e63e7674ea9a9bd9a5b4ec4c3a53340` |
| #474 | `codex/impl-474-design-lines` | `ced6c7805f1d74541084a1835b1f154de76a3dec` |
| #574, #599, #558, #559, #699, #700 | `codex/impl-574-offline-contact-assembly` | `54fe17bc4447bfc8167af83deaef51ed0aac39c6` |
| #488 | `codex/impl-488-answer-first` | `fa0c22083299aa2520e18a365c0ac7d22b10538a` |
| #487 | `codex/impl-487-portfolio-report` | `8ba342d00b995d8611af87e968ce159f54375382` |
| #486 | `codex/impl-486-manual-scan` | `ff620377e9f6905a3fa48f2464e1339269d4ea35` |
| #727 | `codex/impl-727-source-reassessment` | `a6edf91a8bdd8e072c726acac7fafb6d44b5f0c6` |

## Next isolated source stage

`codex/impl-520-transfer-persistence` is assigned to the same #520 author. It starts from the preserved0048–0052 dependency source stack, brings forward the separately reviewed607 deletion guard and current portfolio/transfer deltas, and will keep the original branches intact. Migration0053 is reserved; source assembly is not integration, runtime validation or deployment. The first persistence stage remains without an enabled apply endpoint.

An independent source-only review of the preserved offline558–700 package is also assigned. No private files or previously blocked private operations are part of that review.
