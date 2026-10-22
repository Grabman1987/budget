# Source progress — 2026-10-22T21:49:14.266771+00:00

This snapshot supersedes historical source-head and active-task statements in CURRENT-COORDINATION.md. All branch heads below were freshly read from origin. No tests, builds, browser execution, CI dispatch, merges or deployments were performed. NOT VALIDATED / NOT LIVE; #719 STOP.

## Current work

- #591–593: all three scoped Plan findings corrected and independently source-reviewed; final review archived on its branch.
- #473: narrow Sankey text/number role correction pushed; independent final delta inspection remains open.
- #489: initial security review found cache-header and bounded-decoding defects; both corrections pushed; independent correction review pending. No production flag enabled.
- #520: authoritative recorded-history reader corrections source-reviewed; new split replay/reader source pushed and independent review underway. Writer/API/schema integration and runtime acceptance remain open.
- #619–623 report package: independent scoped source review complete; no concrete finding. Runtime/print/export acceptance remains open.
- #762: four source findings corrected and reviewed. Actual market/calendar adapters, scheduled ingestion and remaining execution/rebalance lifecycle remain unfinished.

## Dependency and policy notes

- Preserve the shared useBudgetWrite success-versus-refresh correction from #562/#514 together with the optional history callbacks from #727; do not overwrite one with the other.
- Preserve #607 required review-token deletion guard when assembling descendants (#514/#519/#486); descendant branches do not automatically receive parent corrections.
- #516 multiple-match behavior awaits the previously requested owner decision. Other source work continues.
- The last repository count was 94 OPEN issues; this is historical and is not the Projects Warteschlange count. No current board count is claimed.
- Reviews are source-only, with scoped coverage; a pushed branch is not completed acceptance or live delivery.

## Remote checkpoints

| Issues | Branch | Full remote SHA |
|---|---|---|
| #544, #546, #547, #548 | `codex/impl-544-548-portfolio` | `17ecb6e320b169c7cfab402dcff042e67398ef84` |
| #591, #592, #593 | `codex/impl-591-593-plan` | `12dc0565e9b43b913b49214b9005d427f5ec56ce` |
| #572, #573, #574, #575, #600, #601, #602, #603 | `codex/impl-heute-month-close` | `d27f9a2ff042d3c565009040c701ce37141efe98` |
| #558, #559, #699, #700 | `codex/impl-offline-558-700` | `f24d665fd69019f5b563977390f76fcef5d0ae4a` |
| #611, #612 | `codex/impl-611-612-debt` | `a395db8c9f4990846bc3a3ec65db071d1c0e616c` |
| #553, #554, #619, #620, #621, #622, #623, #628 | `codex/impl-619-623-reports` | `4f50e612fed8d812ae054470a3e31ab9553e2732` |
| #515, #594, #596, #597 | `codex/impl-594-597-ledger` | `6b5401d176658b4225f09d21c018a61cadfd90ea` |
| #608 | `codex/backlog-608-year-delivery` | `59dacbfd3c2c3d17910a81e2f8983533a960183b` |
| #469, #471, #486 | `codex/impl-settings-469-486` | `09312b49e578db493bfe279133d30260c5e2ed44` |
| #609 | `codex/impl-609-payslip-preview` | `813854c29ec095f47179f928fa43b5beb1b8679b` |
| #599 | `codex/impl-599-contacts` | `5bac17b31026aae54e1063d4de607949c51abc1a` |
| #518, #521 | `codex/impl-518-521-explanations` | `e52447882b1def73d3ec9cced5d777c417bf7a35` |
| #607 | `codex/impl-607-payments` | `8325561b7a1a6e47ef0ef67d27d0959d9f7c5b84` |
| #564, #565 | `codex/impl-564-565-reconcile` | `e04b3002d5b843f6de35f3bbf98c2e3c1d506674` |
| #562, #563 | `codex/impl-562-563-inbox` | `f830a1d0b17ed6cedb8e9fed871d7d31b7145192` |
| #485, #486 | `codex/impl-485-486-settings-navigation` | `78fa4838953313be5134add009b9b261b34120a8` |
| #514 | `codex/impl-514-targets` | `ce7c59df2ad5c962b80cd2236cc7ffb502c21113` |
| #519 | `codex/impl-519-fx-transfers` | `8b37818bf1c3160638b9909c8ad7feaf7af7c93b` |
| #520 | `codex/impl-520-security-transfers` | `76b49651e06ca7eb1cc41bd5c2d40eeaf16fbcf8` |
| #471 | `codex/impl-471-icons` | `178c80b15a8e1e6e66115c2635d8992bb703d662` |
| #469 | `codex/impl-469-copy` | `65aee06ce8b5ae970a6b2bcb11b2ef652cddb132` |
| #489 | `codex/impl-489-overview-design` | `0154ab19c9cf10030acc67283cfa41c91a0397df` |
| #516 | `codex/impl-516-import-explanations` | `eef0bec42421abb73f05b2dd8c336431ba584a18` |
| #469 | `codex/impl-469-glossary-goals` | `e0e39d4b0b5b04ad6966e8603d0bd91cf4b66cad` |
| #473 | `codex/impl-473-typography` | `0a673beb9a344f7cb3a460dfcab92e29a0ac6af5` |
| #519 | `codex/impl-519-fx-posting` | `d6cb8e1c0555196c5dcdefa01784f621a4a0d521` |
| #762 | `codex/impl-762-strategy` | `6fbd8475cdbd802cd81362395a34a7e200b458d1` |
| #586 | `codex/backlog-586-mobile-capture` | `4419698b95abd7603efb556198b38324b64ca554` |
| #550, #551 | `codex/backlog-550-551-composition` | `11f870db580add0e5db94ddbc1de8621c0196608` |
| #470 | `codex/impl-470-table-readability` | `28b2b2784e63e7674ea9a9bd9a5b4ec4c3a53340` |
| #474 | `codex/impl-474-design-lines` | `dd11b4e03bdd79ce3074b2e504dd326453080470` |
| #574, #599, #558, #559, #699, #700 | `codex/impl-574-offline-contact-assembly` | `54fe17bc4447bfc8167af83deaef51ed0aac39c6` |
| #488 | `codex/impl-488-answer-first` | `fa0c22083299aa2520e18a365c0ac7d22b10538a` |
| #487 | `codex/impl-487-portfolio-report` | `8ba342d00b995d8611af87e968ce159f54375382` |
| #486 | `codex/impl-486-manual-scan` | `ff620377e9f6905a3fa48f2464e1339269d4ea35` |
| #727 | `codex/impl-727-source-reassessment` | `a6edf91a8bdd8e072c726acac7fafb6d44b5f0c6` |
