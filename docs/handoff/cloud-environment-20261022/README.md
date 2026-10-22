# Budget cloud handoff — 2026-10-22

> Current owner clarification and resumed implementation results: [CURRENT-COORDINATION.md](CURRENT-COORDINATION.md). This supersedes the historical coordination assignment below.

This is a documentation-only checkpoint. Existing feature branches are preserved. It is not a combined product branch, release, completed acceptance or validation report. Do not merge this older-base handoff branch as a way to integrate features.

## Current instructions and ownership

- Latest owner mode: implementation only. No new tests/test edits, checks, typechecks, builds, browser checks, CI dispatch, PR creation, merges, deployment or queue loops. A new environment publication does not change that direction.
- Preserve finance, security, locks, audit, idempotency and Undo. No real financial data or credentials in checkpoints.
- All six delegated source agents have completed their current packages. There is no autonomous queue loop.
- External thread `01a16218-41fd-70d0-9b2a-60b070a1659a` previously owned integration of #756/#757/#758/#604. Integration pause was requested on [PR #758](https://github.com/Grabman1987/budget/pull/758#issuecomment-6345239425); no acknowledgment was observed here. Do not assume that external thread stopped or take conflicting integration actions.
- #719 remains STOP. #741 still has separate private historical archival/link work; do not interpret source progress as historical processing completed.
- 94 repository issues were open at the last query. The project board could not be read due to GitHub Projects authorization; its Warteschlange count is unknown.

## Environment transition

The old chat is bound to configuration `cecfg_6abdf330ba0481a0997c587c11e1e0ea`, version `cecfgver_6abe4e94ba5481a09319324b2f4bca1c`. The setup chat edits a different configuration, `cecfg_6ada3b44b8348190a600e064523cb54b`. Publishing the latter has not changed the former binding. Runtime revision numbers alone do not prove a new configuration version.

Use the supported UI to select the corrected environment for a NEW chat when existing-instance reassignment is unavailable. Keep the old chat/workspaces. Desired additional domains must be the union of ALL existing domains and [required-hosts.txt](required-hosts.txt), preserving presets, scripts, credentials and every other setting. No proxy bypass. Read runtime source configuration/version, current observations, enforced network policy and effective hosts in the new chat; an editor publication badge is not an actual browser-start result. GitHub Projects authorization is independent of domain access.

## Remote source inventory

All entries are branch checkpoints. Many are partial implementations. Historical passing evidence only applies to its recorded source revision; no new validation was executed for the implementation-only phase. Read each package handoff before editing.

| Issues | Remote branch | Full observed head |
|---|---|---|
| #544, #546, #547, #548 | [codex/impl-544-548-portfolio](https://github.com/Grabman1987/budget/tree/ce1e67b17a930d3441e827359f1adf5efcb38303) | `ce1e67b17a930d3441e827359f1adf5efcb38303` |
| #591, #592, #593 | [codex/impl-591-593-plan](https://github.com/Grabman1987/budget/tree/b5b971902416bd933e1185b261d247a6b766305e) | `b5b971902416bd933e1185b261d247a6b766305e` |
| #572, #573, #574, #575, #600, #601, #602, #603 | [codex/impl-heute-month-close](https://github.com/Grabman1987/budget/tree/d27f9a2ff042d3c565009040c701ce37141efe98) | `d27f9a2ff042d3c565009040c701ce37141efe98` |
| #558, #559, #699, #700 | [codex/impl-offline-558-700](https://github.com/Grabman1987/budget/tree/f24d665fd69019f5b563977390f76fcef5d0ae4a) | `f24d665fd69019f5b563977390f76fcef5d0ae4a` |
| #611, #612 | [codex/impl-611-612-debt](https://github.com/Grabman1987/budget/tree/45b756eaf31763ad2566c63e1ec7c4e3680507b3) | `45b756eaf31763ad2566c63e1ec7c4e3680507b3` |
| #553, #554, #619, #620, #621, #622, #623, #628 | [codex/impl-619-623-reports](https://github.com/Grabman1987/budget/tree/4f50e612fed8d812ae054470a3e31ab9553e2732) | `4f50e612fed8d812ae054470a3e31ab9553e2732` |
| #515, #594, #596, #597 | [codex/impl-594-597-ledger](https://github.com/Grabman1987/budget/tree/6b5401d176658b4225f09d21c018a61cadfd90ea) | `6b5401d176658b4225f09d21c018a61cadfd90ea` |
| #608 | [codex/backlog-608-year-delivery](https://github.com/Grabman1987/budget/tree/59dacbfd3c2c3d17910a81e2f8983533a960183b) | `59dacbfd3c2c3d17910a81e2f8983533a960183b` |
| #469, #471, #486 | [codex/impl-settings-469-486](https://github.com/Grabman1987/budget/tree/09312b49e578db493bfe279133d30260c5e2ed44) | `09312b49e578db493bfe279133d30260c5e2ed44` |
| #609 | [codex/impl-609-payslip-preview](https://github.com/Grabman1987/budget/tree/6d85aab877d678c0a8f48df237486eaa9e50e36a) | `6d85aab877d678c0a8f48df237486eaa9e50e36a` |
| #599 | [codex/impl-599-contacts](https://github.com/Grabman1987/budget/tree/5bac17b31026aae54e1063d4de607949c51abc1a) | `5bac17b31026aae54e1063d4de607949c51abc1a` |
| #518, #521 | [codex/impl-518-521-explanations](https://github.com/Grabman1987/budget/tree/e52447882b1def73d3ec9cced5d777c417bf7a35) | `e52447882b1def73d3ec9cced5d777c417bf7a35` |
| #607 | [codex/impl-607-payments](https://github.com/Grabman1987/budget/tree/5678b5fe5fd96edd38004294f62d7ed7cef5b24c) | `5678b5fe5fd96edd38004294f62d7ed7cef5b24c` |
| #564, #565 | [codex/impl-564-565-reconcile](https://github.com/Grabman1987/budget/tree/e04b3002d5b843f6de35f3bbf98c2e3c1d506674) | `e04b3002d5b843f6de35f3bbf98c2e3c1d506674` |
| #562, #563 | [codex/impl-562-563-inbox](https://github.com/Grabman1987/budget/tree/5477fdb5b966e7a18aae3ff10c7937736f711ef9) | `5477fdb5b966e7a18aae3ff10c7937736f711ef9` |
| #485, #486 | [codex/impl-485-486-settings-navigation](https://github.com/Grabman1987/budget/tree/07cd4c8984c25343dab801199ba30f0e08524448) | `07cd4c8984c25343dab801199ba30f0e08524448` |
| #514 | [codex/impl-514-targets](https://github.com/Grabman1987/budget/tree/e7566feb0835c697531556651d213e5ef669cad4) | `e7566feb0835c697531556651d213e5ef669cad4` |
| #519 | [codex/impl-519-fx-transfers](https://github.com/Grabman1987/budget/tree/8b37818bf1c3160638b9909c8ad7feaf7af7c93b) | `8b37818bf1c3160638b9909c8ad7feaf7af7c93b` |
| #520 | [codex/impl-520-security-transfers](https://github.com/Grabman1987/budget/tree/a5156b399d3c09094b255c32177c0685fb9213a7) | `a5156b399d3c09094b255c32177c0685fb9213a7` |
| #471 | [codex/impl-471-icons](https://github.com/Grabman1987/budget/tree/d50abbc00c99a59ae5f0c8336832eb52680f7c42) | `d50abbc00c99a59ae5f0c8336832eb52680f7c42` |
| #469 | [codex/impl-469-copy](https://github.com/Grabman1987/budget/tree/27d2e86fe82f5f08eee298ad7631ec2df754f7b4) | `27d2e86fe82f5f08eee298ad7631ec2df754f7b4` |
| #489 | [codex/impl-489-overview-design](https://github.com/Grabman1987/budget/tree/c16eb406451e3aa31c6afcb2abcf5018af408a6e) | `c16eb406451e3aa31c6afcb2abcf5018af408a6e` |
| #516 | [codex/impl-516-import-explanations](https://github.com/Grabman1987/budget/tree/935f685baa16590c1e24c356401eacc926a97a32) | `935f685baa16590c1e24c356401eacc926a97a32` |
| #469 | [codex/impl-469-glossary-goals](https://github.com/Grabman1987/budget/tree/b94f8b722f3daacf5e7bd7a49d8e8ea5239a3a68) | `b94f8b722f3daacf5e7bd7a49d8e8ea5239a3a68` |
| #473 | [codex/impl-473-typography](https://github.com/Grabman1987/budget/tree/9e9a997a0a5cde3c7df430dda2293acc037bf2fb) | `9e9a997a0a5cde3c7df430dda2293acc037bf2fb` |
| #519 | [codex/impl-519-fx-posting](https://github.com/Grabman1987/budget/tree/5e2ab4b4785d1a9f67dd442d96240f369e62ffe4) | `5e2ab4b4785d1a9f67dd442d96240f369e62ffe4` |
| #762 | [codex/impl-762-strategy](https://github.com/Grabman1987/budget/tree/3fef2d5d4d76921e4f1539f5604fd3937aa98827) | `3fef2d5d4d76921e4f1539f5604fd3937aa98827` |
| #586 | [codex/backlog-586-mobile-capture](https://github.com/Grabman1987/budget/tree/4419698b95abd7603efb556198b38324b64ca554) | `4419698b95abd7603efb556198b38324b64ca554` |
| #550, #551 | [codex/backlog-550-551-composition](https://github.com/Grabman1987/budget/tree/11f870db580add0e5db94ddbc1de8621c0196608) | `11f870db580add0e5db94ddbc1de8621c0196608` |


## Integration dependencies and remaining source work

- Most branches started at `6420676d257698767931dd151863765cec914acf`. Never overwrite newer whole files with older branch files; preserve intentional scoped hunks and existing local changes. Fetch refs and compare bases first. No mass cherry-pick or blind merge.
- Migration chain: #604 PR #760 checkpoint `352412911b60c80d2b64182e95f7c3cfc9ee50b9` has 0048; #607 adds0049; #514 adds0050; #519 posting adds0051. These branches carry that dependent chain, including unaccepted source. Check current main independently before later integration.
- #514 includes a scoped #591–593 Plan source carry. #609 adds income/UI and PDF preview. Combine minimal Plan/income hunks rather than replacing either whole page.
- #574 split Heute transport and #599 reminders need [574-contact-599-integration.patch](574-contact-599-integration.patch), preserved but NOT APPLIED/VALIDATED. Offline/Heute companion patches already live on `codex/impl-offline-558-700` under `docs/handoff/offline-574/`; also unapplied. Preserve per-section freshness, auth fencing and partial-offline honesty.
- #516 is based on #562/#563 bank suggestions. #473 discovered a residual typography literal there; [473-crossbranch-516-css.patch](473-crossbranch-516-css.patch) is preserved but NOT APPLIED/VALIDATED.
- #469 copy and glossary branches are separate: copy is based on newer Heute, glossary on #514. Combine content changes without replacing product logic. Rule-code/template copy remains incomplete.
- #471/#489/#473 share an icon/overview/typography source chain. Later integration with new UI should retain only their semantic styling/props; preserve other source changes. Typography/overflow/Axe/device acceptance has not been executed.
- #485/#486 settings changes overlap InboxPage, PlanIncomePage and routes. Latest source includes provider cards/status and explicit bank scheduling; cross-process manual Dropbox scan, durable export history/restore evidence and exact worker health telemetry remain incomplete. Settings allocation links must retain the separate #518/#521 provenance companion.
- #519 old `impl-519-fx-transfers` is nonwriting preparation. New `impl-519-fx-posting` is the bounded writer package, not both independent deliveries. It implements exact actual native amounts, separately disclosed quote/reference effects, explicit budget/tracking categories and separate actual fees. Preserve unsupported-case refusals. Independent financial/security/migration review and all execution evidence remain pending.
- #520 is pure preview and dated replay only. No persistence/API/migration/canonical writer. Restcent policy is approved; original acquisition provenance must be retained. Same-acquisition FIFO fragment order/coalescing and authoritative history adapter remain unresolved; no invented legacy pairs.
- #762 has config/domain/API/UI preview and immutable decision source, but no trusted Nasdaq USD index/US-session adapter, ingestion/monthly automation or complete product-level rebalance execution/tax lifecycle. Missing evidence defaults unavailable; client HTTP cannot self-attest provider facts.
- #517 saved-view/CSV source largely exists; avoid duplicate implementation. #513 acceptance and #542 actual Linux overflow diagnosis remain evidence tasks; do not pretend they were fixed through unexecuted source.
- #608 latest CSS change has NOT proven the two-screen height acceptance. Prior screenshots failed that bound; previous passing unit/native runs are historical, not proof of current layout.
- #550/#551 preserve their historical evidence on their own branch. #476 PR #759 remains a separate preserved forecast/catalog package. #490 publication onboarding is deferred.

## #586 browser records

PR #761, `codex/backlog-586-mobile-capture`, checkpoint `4419698b95abd7603efb556198b38324b64ca554` contains `e2e/issue-586-mobile-capture.spec.ts` and `docs/evidence/issue-586-mobile-capture/README.md` plus retained textual run outputs and two original synthetic PNGs. Existing adapted consumers: `e2e/booking-acceptance.spec.ts`, `e2e/mobile-panels.spec.ts`, `e2e/capture-dialog-layout.spec.ts`.

Historical results: Chromium1248 installer HTTP403 Domain forbidden; native-host WebKit missing libGLESv2.so.2; initial container storage failure. Actual native WebKit first layout run13passed/1failed because the NEW test expected raw120 after blur instead of formatted120,00. Corrected new assertion: final focused5/5 including3setup, plus M04close4/4 including3setup. Existing nine capture/layout cases passed. Actual physical iPhone keyboard/safe-area, Chromium desktop/390 and full integration remain open. No unexecuted test was represented as passing.

## Owner decisions to preserve

- #519 actual native principals unchanged, quote discrepancy separately visible; reference/execution delta is an effect, not invented fee/income; budget and tracking supported with principal and actual fee categories separate.
- #520 residual cent remains at source until later full transfer; combined basis conserved. This does not approve E8 unit rounding or ambiguous same-acquisition FIFO order.
- #604 rate includes current month; assign only missing monthly amount; selectable start month; achieved goal closes after first subsequent real expense or manually, with Undo behavior preserved.
- #550 signed net-worth shares; only EUR amounts when net wealth is below100EUR or values incomplete.
- #762 only monthly rate by default; existing free depot cash opt-in; broker-independent planned15th is not a guaranteed actual execution day.
- #481 clear separate group headers take priority:44rows/20percent reduction accepted against55-row main.
- Existing standing permission for narrowly technical UI/API test adaptations requires per-file documentation and independent review; financial/security/lock/audit/Undo/tolerance/timeout oracles unchanged. CURRENT implementation-only phase still suspends those test edits and all execution.

## Handoff use

Read `checkpoints.json` and the selected package README/NOT-VALIDATED document from its pinned Git commit. The two small patches here are portable synthetic source diffs, not machine-local-only references. Existing source and historical evidence stay accessible via their remote branches; no credentials or raw private logs are included. Reconfirm current issue/PR status read-only in the new environment. Continue only unfinished source within current owner directions; do not claim issue completion based on branch existence.
