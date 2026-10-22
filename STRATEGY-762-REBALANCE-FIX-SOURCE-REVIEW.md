# #762 lifecycle correction — independent exact source review

Base: `1d9085d78557dff2d2f309d21d3bae481d254a82`.
Source: `706f590831ab92f28af2e7e52fd89b2915b1c87b`.
Worktree: `/workspace/impl-762-strategy`; HEAD confirmed, working tree clean when inspected.
Scope: the four changed DB/API/web files and relevant existing valuation DTO producers, against `762-rebalance-lifecycle-source-review.md`.
Source-only: no tests, checks, compiler/build, browser, database/provider operations, runtime execution or repository edits.

## Remaining P2 — Proposal token still omits exact canonical valuation inputs

`packages/db/src/repos/strategy-rebalance.ts:130-135` now hashes the universe, exposures, config/binding and `view.valuation`, and the review action correctly compares that hash before writing. This fixes the missing compare and rejects changed displayed amounts. It does not yet satisfy the requested exact-source scope.

`portfolio-strategy.ts:229-235,288-289` reduces held positions to category/security/valueCents; the new hash receives no units. `portfolio.ts:75-94` explicitly defines ValuationSource as **nonmonetary provenance**: it contains chosen price/FX dates and labels, but no priceMicro or rateMicro. Cash has already been converted and rounded in `allocation-inputs.ts:144-170`. Neither the exact native amount nor the selected FX rate is present in this revision.

Concrete source-level counterexample: between GET and proposal confirmation, correct a held instrument's quote on the same date/source from 1.000000 to 1.000001 EUR for one share. Its cent value, metadata and every hashed field stay identical, so the old reviewed source token is accepted. A larger example is an actual two-for-one split plus a same-date quote correction to half the price: units and quote inputs change while category values and the nonmonetary disclosures remain identical. No current token can distinguish those source states. This is not a cryptographic collision; the inputs have been discarded before hashing.

Minimal correction: augment the server token input with the exact chosen canonical valuation facts under the same transaction/scope: account/security, held units, chosen numeric price/currency and effective date/source, numeric FX rate and date/source, and native cash/manual-value inputs where used. Reuse canonical readers; do not introduce a second formula, guessed provider data, a certificate table or an unbounded audit-history scan. Hash deterministically without the volatile request timestamp. Keep this advisory proposal check separate from actual trade confirmation; no current quote dependency belongs in the actual-link path.

## Closed findings

- **P1 DTO contract:** proposal membership now uses the actual accountIds/securityIds arrays. All new `.universe.accounts/.securities` record accesses are removed. Account names/currency come from the dedicated actual-trade read.
- **P2 initial actual-trade CAS:** the new transactional read returns current economic facts, currency and audit revision with a hash. Link recomputes and compares it inside its write transaction. Existing post-link change detection remains. The UI acknowledgement binds to that token and cannot submit while fetching; a changed token makes the acknowledgement ineffective. Actual capture/linking remains independent of market quotes.
- **P2 deliberate review after Undo:** review request IDs are keyed by month plus event JSON/audit revision. A confirmed Undo changes that revision and permits a new explicit action; unchanged-state uncertain retries retain their prior key. The server no-resurrection behavior is retained.
- **P2 historical native currency:** actual facts now retain the native account currency and both selected and stored trade amounts display it directly, independently of current allocation inclusion. No EUR fallback remains in this new flow.

The new read endpoint inherits the existing authenticated API shell and reads one parameterized trade/account scope. Privacy formatting remains intact. The previous TradePanel post-save refresh/callback conclusion is unchanged because that file is not changed here. Retained idempotency and cross-event Undo/redo conflict logic are unchanged.

Result: original P1 and three P2 findings closed; the proposal-source P2 is partially corrected and remains open as described above. No additional owner policy decision or runtime validation gate is introduced by this source finding.
