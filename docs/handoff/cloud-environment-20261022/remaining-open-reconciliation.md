# Open issue reconciliation — source gaps vs residuals

Compared the saved open-issue snapshot (`backlog-open-current.json`) with the current `checkpoints.json` manifest on central branch `codex/handoff-cloud-environment-20261022` (head prefix `f0c2aaa0`), `SOURCE-PROGRESS-LATEST.md`, and the existing `backlog-coverage-latest.md`. This covers open issues without a direct manifest checkpoint; a missing checkpoint is not treated as missing code. No issue API was polled again. Current phase remains source implementation/review only; #719 STOP; no tests, builds, checks, browser/runtime, CI, PR, merge, deployment, or queue loop.

| Open issue | Classification | Evidence-based disposition |
|---|---|---|
| #741 | Owner-controlled private prerequisite | Payroll/document source is delivered through merged PRs #752/#757. Remaining historical originals, archive, and linking involve private owner data/operations; not new source implementation. |
| #726 | External configuration and owner restore prerequisite | Statement-intake source is delivered in PR #729. Production receipt-volume configuration and owner restore/CLI evidence remain; no source gap established. |
| #626 | Existing implementation; acceptance/archival residual | Dedicated branch `codex/626-explorer-chart` at `1aacdcea934aafb0a8236b305c9c5d1e4af0eb6e` contains chart toggle source and existing evidence artifacts. No direct manifest entry; open status alone does not justify duplicate code work. |
| #604 | Existing implementation in PR | Open PR #760 at head `352412911b60c80d2b64182e95f7c3cfc9ee50b9` contains the reviewed goal lifecycle source. Remaining exact-head integration/CI and merge are not source gaps; do not duplicate implementation. |
| #566 | Existing implementation in PR | Open PR #758 at head `8e1d0bd38ca7f6ad66f3063295e1ca3e444df079` implements task-source grouping and one bank status; the older #561 dependency is closed/live (`985ba992`). Remaining integration/acceptance only; no duplicate source assignment. |
| #542 | No substantiated source gap | The later bounded source diagnosis records the existing low-point clamp from #580 and does not justify a speculative patch. The original overflow artifact was not inspected; exact-case acceptance remains a residual, not a source defect claim. |
| #529 | Coordination | Prioritized implementation-list/coordination issue, not application source work. |
| #527 | Parent / child implementation and integration | Debt source is represented by #611–612. Remaining parent-level composition/acceptance, not a separate source gap established by this audit. |
| #525 | Parent / child implementation and integration | Portfolio source is represented by #544–548. Remaining aggregate acceptance/integration; no new source gap established. |
| #524 | Parent / child implementation and integration | Net-worth/report children are represented by #487 and #550–551. Remaining aggregate acceptance/integration, not duplicate child implementation. |
| #523 | Existing capture source | `capture-form.tsx`, `split-editor.tsx`, and `ledger.css` already contain the requested capture structure; the two-column behavior is also represented by #583. Remaining acceptance, not an uncovered source task. |
| #522 | Child implementations plus private restore prerequisite | WP-014 source packages for offline capture/retry (#558/#559/#699/#700) and statement intake (#726) are represented. Remaining private restore/receipt-volume operations are external; no additional source gap identified. |
| #517 | Existing child PRs and local implementation | Child delivery is present in PRs #701, #715, and #709; local `codex/impl-517-explorer` is at `4f50e612fed8d812ae054470a3e31ab9553e2732`, though no matching remote ref was recorded. Treat as checkpoint/integration bookkeeping, not missing code. |
| #513 | Release/acceptance gate | Portfolio Performance cut-over requires full acceptance evidence. This is not a request for new source in this phase. |
| #508 | Owner adoption/aggregate review | Child reference-adoption packages have source checkpoints; remaining adoption and owner review are product acceptance, not an evidenced source gap. |
| #499 | Owner acceptance/aggregate integration | Constituent owner-feedback source deliveries are checkpointed. Open epic status does not establish missing source; remaining aggregate/owner acceptance is separate. |
| #490 | Deferred PUB1 | Login/onboarding/glossary is deferred until public release. No current source work is due. |
| #483 | Parent / child implementation and integration | Month-close child screens #600–603 have source checkpoints. Remaining parent acceptance/integration, not a distinct gap established here. |
| #482 | Parent / child implementation and integration | Plan children #607–609 and #608 have source checkpoints. Remaining aggregate acceptance/integration. |
| #479 | Parent / child implementation and integration | Register children #586, #594–597, and #599 have source checkpoints. Remaining acceptance/integration. |
| #477 | Parent / child implementation and integration | Inbox/reconciliation children #562–565 have source checkpoints. Remaining aggregate acceptance/integration. |
| #476 | Existing implementation in PRs | Forecast tools/detail were delivered in merged PR #756; open PR #759 (`codex/backlog-476-catalog-link`, source commit `f4e97e93bbd2d8c2393d71e4fcf873a6c5832ebb`, PR head `0a4f7ef19f7f2f99bd656e4e89c00e6206190bb5`) adds catalog navigation. Remaining browser/keyboard/touch/accessibility/CI acceptance; no duplicate source task indicated. |
| #475 | Parent / child implementation and integration | Today child screens #572–575 have source checkpoints. Remaining aggregate acceptance/integration, not a separate source task. |
| #467 | Delivered child issues | Children #577–582 have delivered source via PRs #753, #714, #651, #667, #674, and #684. Open parent is acceptance/aggregate bookkeeping; do not duplicate account-source work. |
| #450 | Parent / child implementation and integration | Monthly overview/side-list source is in #591–593. Remaining parent acceptance/integration. |
| #449 | Parent / child implementation and integration | Monthly header/filter source is in #591–593. No separate source gap is established absent a specific unmet AC. |
| #358 | User prerequisite | Owner must personally confirm a current account balance. |
| #357 | User acceptance/evidence | Month-close proof requires owner review; no source change implied. |
| #356 | User acceptance/evidence | Return comparison requires owner review; no source change implied. |
| #355 | User acceptance/evidence | Portfolio holding requires owner review; no source change implied. |
| #354 | User acceptance/evidence | Account/month comparison requires owner review; no source change implied. |
| #310 | User/device acceptance | Requires acceptance on a real iPhone; no source change implied. |

No accepted, uncovered source gap is substantiated among the issues lacking direct checkpoints in this snapshot. That conclusion is limited to the evidence above; it does not close issues or replace package acceptance.

## Relevant caveats

- #516 has a direct checkpoint. Its import-explanation presentation correction is source-reviewed; the separate equivalent-match/multiple-candidate policy discrepancy remains pending an owner/product decision. Do not treat that unresolved policy as a reason to expand the explanation UI or rewrite the matcher.
- #520 persistence/writer/Apply and #762 rebalance source corrections now have current source reviews, but runtime and integration acceptance remain outstanding. Their current direct checkpoints are not missing implementation entries.
- #741's private archive/link operation is a separate owner-controlled action; no private data was accessed here.
- #719 remains STOP and prohibits automated queue-loop behavior; this reconciliation performs no loop or issue write.
