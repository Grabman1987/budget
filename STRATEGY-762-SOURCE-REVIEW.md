# #762 strategy planning, persistence, API and UI — independent source review

Reviewed **3fef2d5d4d76921e4f1539f5604fd3937aa98827** against **47a61e523c624802b2cc4683095c7a3326324bdd** in `/workspace/impl-762-strategy`. Scope: all 12 changed files, the owner brief at `docs/portfolio-trend-strategy.md`, `STRATEGY-762-NOT-VALIDATED.md`, and relevant valuation, allocation, entity/audit, API middleware and UI component contracts. The earlier pure daily-trend module was already independently reviewed; this review concerns the new strategy-plan, DB/API/UI slice.

**Disposition: four bounded source corrections required (one P1, three P2).** Missing trusted provider wiring is an acknowledged integration gap, not a bug in the default fail-closed behavior. No new owner financial-policy decision is needed for the findings below.

## Findings

### P1 — opening strategy settings invokes `Field` with the wrong child contract

`apps/web/src/wealth/strategy-page.tsx:194–214` supplies `<TextInput>` or `<Select>` JSX directly as every new `Field` child. The actual shared component, `packages/ui/src/components/field.tsx:6–25`, requires a render callback and unconditionally evaluates `children({ id, describedBy, invalid })`. Thus opening the settings form reaches a React element where a function is required and throws; the user cannot configure the strategy. This follows directly from the source contracts; no browser/type check was run.

Minimal correction: convert every new `Field` usage to its established callback form and pass the supplied `id`, description and invalid-state attributes to the input/select. Keep the existing shared component contract. This also establishes the intended accessible label association.

### P2 — monthly decision POST has no decision-history CAS across Undo

`packages/db/src/repos/portfolio-strategy.ts:143–161` fences the configuration revision, then treats absence of `portfolio_trend_decision.<month>` as permission to create it. That revision includes only audit history for the configuration key (`:36–39`), not the monthly decision. `app_setting` has no deleted marker, and existing audit Undo hard-deletes a reverted creation (`packages/db/src/repos/audit.ts:515–524`).

Concrete sequence inside the allowed monthly window: POST creates the decision; the owner explicitly undoes it; a delayed duplicate request with the same month/config revision arrives. The month row is absent and config revision unchanged, so the request creates the decision again with a new knownAt/group. The old request silently reverses the owner's Undo. The current append-only/per-month check only protects a row while it exists.

Minimal correction: expose and require a decision-specific revision/history token, including the absent-but-previously-written state from retained audit history, and check it transactionally alongside config CAS. Alternatively use an existing durable request-receipt mechanism that survives Undo. Preserve ordinary duplicate handling while a record exists and permit intentional recreation only after a fresh read/explicit confirmation. A new migration is not inherently necessary. Apply the same token to the UI/API payload so reopening settings or changing a contribution is not the accidental mechanism for resolving decision history.

### P2 — a shifted contribution disappears after the nominal 15th

`packages/domain/src/wealth/strategy-plan.ts:217–225` chooses the nominal month solely from `today.day <= 15`, then consults the verified execution calendar. If the 15th is Saturday and the first verified execution day is Monday the 17th, the correct current contribution is still upcoming on Sunday the 16th. The function instead switches to next month's 15th, losing the upcoming 17th (or throwing because a calendar covering the current execution does not cover next month).

Minimal correction: when a verified execution calendar is available, resolve the current month's nominal date and shifted execution before advancing to the next nominal month. Retain the current contribution while its execution date is today/future. Missing coverage remains explicitly provisional; do not infer weekend/holiday execution from weekdays. No broker/order execution lifecycle needs to be invented for this correction.

### P2 — monetary settings bypass the application's amount-privacy mode

The settings inputs at `apps/web/src/wealth/strategy-page.tsx:194,210–211` contain the monthly contribution, minimum gross purchase and fixed fee but omit the shared `TextInput`'s `money` property. `packages/ui/src/components/field.tsx:43–60` masks input values under amount privacy only when that property is true. Calling `useAmountPrivacy` at page level masks formatted read-only values, not these editable values. Once the Field crash is fixed, opening settings reveals the saved monetary amounts even while global amount privacy is enabled.

Minimal correction: use the existing money-input privacy option for those financial amount inputs while retaining decimal editing. Review other numeric strategy controls against the existing privacy convention rather than implementing a separate masking mechanism. No browser privacy test was run.

## Financial source conclusions outside those findings

- Category targets retain the approved weak/mixed/strong weights. `V` includes classified holdings and signed included cash; only the new external rate increases the target denominator. Optional positive cash increases funding once and does not inflate `V` a second time. Missing/incompatible/unmapped/stale/estimated holdings suppress the contribution instead of disappearing from its denominator. Cash with missing FX is null, not fabricated zero.
- Positive category and internal route deficits use BigInt arithmetic. Largest-remainder cents use stable saved/category order. Held products no longer receiving purchases remain in category values. Contribution allocation does not create sales; gross rebalance is a separate explicitly non-executable category proposal. The incomplete product-sale/cost/tax execution lifecycle is disclosed in the handoff, not misrepresented as implemented.
- The affordability solver includes fixed fees and upward-rounded basis-point fees in each product budget, uses canonical cent valuation for quantity steps, applies the gross minimum before fees, and leaves residual cash instead of silently redistributing it. A failed minimum charges no fee. Purchase gross + fees + residual conserves funding in the reviewed control flow. Null constraints remain unknown; unit quantities require an exact selected price. Safe integer/BigInt limits fail rather than silently truncating amounts. The documented literal examples remain expectations, not executed validation.
- Settings CAS hashes both current value and retained configuration audit count, so configuration Undo/ABA is fenced. Route/class checks use the current dated exposure mapping and leverage metadata; Nasdaq purchase routes also require explicit daily-2x confirmation. The decision-history hole above is separate from that correctly scoped configuration CAS.
- Monthly calculations use the penultimate supplied verified US session and retain 220 sessions/closes, exact sums, source/index/calendar metadata and knownAt. Existing records are not overwritten by daily preview or ordinary routing/rate changes. Readback replays retained observations and checks the summary fingerprint/calculation; filtering respects knownAt and effective date. GET does not write decisions. These contracts assume the server-owned adapter fulfills its verified calendar/index identity contract; the implementation does not authenticate arbitrary external provider data by itself.
- HTTP accepts configuration or month/revision fields, never caller-supplied price/calendar/verified evidence. The optional evidence provider defaults to unavailable and POST refuses to manufacture a monthly decision. An existing binding decision can still drive contributions when a current provider result is explicitly unavailable. Existing session, origin and write-hold application middleware remain in place; strategy routes do not introduce financial trade/booking writes.
- The query key is under the existing ledger prefix, so existing write/Undo/redo invalidation includes strategy reads. Settings retain their captured revision and block stale saves. Read-only UI values use the existing privacy formatting and source/quality disclosures. The settings child-contract and input-privacy defects above remain actionable regardless of provider availability.

## Limits and handoff

Source inspection only: no tests or test changes, executable checks, compilers/type checks, build, browser/accessibility runs, database/provider operations, CI, PR, merge or deployment. No repository files were edited by the reviewer. No real or invented market observations were used. This does not claim a runtime-validated feature or close #762.

Findings sent to root and correction author `/root/copy_469_rule_names`; author was asked to retain the pinned source until this full report. Re-review the bounded corrected commit, then retain the existing runtime, trusted-provider and delivery gates.
