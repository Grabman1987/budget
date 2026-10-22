# Implementation-phase residuals — NOT VALIDATED / NOT LIVE

## Scope and concrete remaining work

This record ends the current source-only batch; it does not claim the backlog is delivered, issues are closed, or Projects is empty. Tests/test edits, builds/typechecks, browser/API/database execution, CI starts, PR creation, merges, deployments and queue loops remain outside the owner-authorized current phase. #719 remains STOP.

The 37 normal pushed source branches are listed with exact full remote SHAs in `checkpoints.json` and `SOURCE-PROGRESS-LATEST.md`. Product revisions and independent bounded source-review results are distinguished from later documentation heads in `SOURCE-REVIEW-COVERAGE.md`. Per-package handoffs retain implementation scope, dependency and validation limitations. No old branch/evidence was deleted or force-pushed.

### #762: external source contract and access

Monthly decision service and rebalance linkage/lifecycle source are implemented and reviewed. Actual automation still lacks an authoritative, reviewed mapping of the chosen close feed to the unlevered NDX USD price index, usable supported access, and complete actual US-session/close-time calendar evidence for the covered window. Existing source research was blocked by CONNECT403 when inspecting those public endpoints; no blind download retry or fabricated calendar was used. FRED supported API is a candidate requiring its server-side key; no secret belongs in this repository.

Next step: supply authorized access to a supported close source and independently verify its index/precision contract together with a versioned official calendar/exception source. Then implement the real adapter and provider-gated scheduler shared by API and monthly evaluation, preserving observed-time and absent-plus-audit fences. Do not install an unavailable-provider timer, use ETF/Yahoo prices as proof of identity, or infer complete sessions from weekdays. Broker execution day remains nominal/provisional per owner decision. See `762-remaining-provider-source-scope.md` and the branch's existing provider plan. No new investment policy or broker choice is being requested.

### #516: unresolved existing matcher/ambiguity policy

The read-only explanation layer and presentation fixes are secured and independently source-reviewed. Existing `matchBankLines` pairs equal-sized identical source/candidate groups in order and resolves competing lines for one target by nearest date, then source order. SPEC-004's universal multiple-candidate-open wording conflicts with those existing financial oracles. The previously asked owner decision has not been answered in this work context: preserve the existing deterministic equivalent-match behavior, or require every ambiguous case to remain unresolved. No matcher or oracle was silently changed and no repeat approval request was sent. Historical key-kind/ordinal information absent from persisted hashes is shown unavailable, never reconstructed as fact. See `IMPORT-516-NOT-VALIDATED.md` on the package branch.

### Private/configuration and acceptance work outside this phase

- #741: prior payroll application delivery is preserved. Historical Gmail/Dropbox originals, archive and transaction links are private-data operations, not another source rewrite. Prior user authorization is retained; no repeated approval is inferred. Actual connector/access and reconciliation evidence must be established in that separate operational phase.
- #726/#522: production receipt storage/volume and restore evidence are operational gates; existing source is retained. No production configuration or restore was performed in this source-only phase.
- #699: prior automatic approval rejection of a private operation remains binding; do not retry or reroute it. Its independent offline-source package is preserved.
- #626/#719: retained chart implementation/evidence does not lift STOP or establish missing trace/device acceptance. #542's exact overflow artifact remains uninspected; existing clamp source does not justify an invented fix or acceptance claim.
- #310 and #354–358: actual-device and owner financial comparisons/balance confirmation remain their individually documented acceptance tasks.
- #490: public onboarding remains deferred PUB1; do not implement a new public product during this batch.
- Existing #566/#758, #604/#760 and #476/#759 implementations remain preserved; integration and exact-revision validation are a later phase. Parent/coordination issues have the specific child/PR mappings in `remaining-open-reconciliation.md` and are not duplicate source assignments.

## Final read-only inventory

GitHub read at `2026-10-22T23:22:59.769979+00:00`: 94 OPEN repository issues, 62 with direct references in the 37-source-branch manifest. Issue set unchanged from the previous snapshot. These are repository issue counts, not a Projects Warteschlange count or completed-feature count.

All 37 source worktrees were read with `git status --short` and had no pending changes before the final bounded settings fix; that fix is now committed at `79d9f35a4e87ab12f472a54035fac630b6f6888e`, independently reviewed, and archived on clean pushed settings head `ad331cb8a30c8da1ecd1edbe58144962a99353cf`. No product execution was used as evidence. Other worktrees were preserved, not reset or cleaned.

## Next permitted work

Once the #762 evidence/access or #516 product decision is available, continue the existing source branches and request only bounded independent review of new deltas. Testing, package assembly/integration and release remain expressly separate: none is silently authorized by a source-clear finding. Do not claim background agents are still running after their assigned source tasks have finished.
