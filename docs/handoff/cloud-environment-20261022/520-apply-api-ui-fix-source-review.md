# #520 Apply API/UI correction — independent exact source review

Base: `8ef1be134832232b79c0b3588bef7f65f78cabe9`.
Reviewed source: `d52d3cbd37d2052f9d096f7e86057c5c1a474f23`.
Worktree: `/workspace/impl-520-transfer-persistence`; HEAD confirmed and working tree clean during inspection.
Scope: exact correction of the four P2 findings in `520-apply-api-ui-source-review.md`, including the affected surrounding state and invariant paths. Three product files and two documentation files changed.

Source-only: no tests/checks, compilation/build, browser, database/provider operations, runtime execution or repository edits.

## Result

All four original findings are source-scoped closed at this head. No additional actionable source defect was identified in this bounded correction.

1. **Unknown outcome survives a later rejection.** The save closure distinguishes a retry with retained `delivery` from the initial attempt. A retry 4xx now leaves the exact proposal, fingerprint and intent key intact and preserves uncertainty. Only a definitive first-attempt rejection clears the uncommitted proposal. A live/undone success response resolves the retained attempt. Pending/saved guards still prevent concurrent sends through the form.
2. **Discard/close paths respect uncertainty.** Sending clears an already-open discard prompt; entering uncertainty also clears it. Both the common close function and the discard handler check the current busy/uncertain refs at execution time. The existing navigation and before-close guards remain. The original inline-prompt bypass no longer discards the unresolved key.
3. **Earlier native facts remain eligible.** The paired invariant excludes only `account_unopened` from generic mutation-date blockers. Reconciliation and closure checks still use the earliest affected native date. Actual pair endpoint lifetimes are still checked against the pair date before replay. Proposed-transfer preview readiness and the writer's explicit endpoint opening-date checks remain intact. This closes the earlier-A-acquisition/later-B-opening regression without weakening the dated lock correction.
4. **Exact optional boundary normalized.** Both preview and Apply route calls now override sourceReference with a definite string or null before passing it to repository interfaces. This matches the declared exact-optional contract without widening the accepted body or allowing client basis.

The reviewed writer, strict confirmation/intent API boundary, amount privacy and save-receipt versus refresh behavior are unchanged. This conclusion does not establish transport/browser execution, compiled types, migration application, concurrency or financial/Undo runtime acceptance. No new owner policy decision is needed.
