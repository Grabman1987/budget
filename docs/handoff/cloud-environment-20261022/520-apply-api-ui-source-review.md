# #520 Apply API/UI — independent source review

Base: `e2e58ef5e8d63b662014a6a0fe83356fe1283a45`.
Reviewed source: `8ef1be134832232b79c0b3588bef7f65f78cabe9`.
Worktree: `/workspace/impl-520-transfer-persistence`; HEAD confirmed, working tree clean during review.
Scope: all seven changed files, the previously reviewed writer, paired-invariant callers, API middleware/request helper, dialog close/navigation paths and actual save callbacks.
Source-only: no tests/checks, compiler/build, browser, database/provider operations, runtime execution or repository edits.

## P2 — A later 4xx clears uncertainty about an earlier possibly committed attempt

`apps/web/src/wealth/trade-panel.tsx:745-753` treats every 4xx as proof that the transfer was not saved, clears `delivery` and the uncertainty guard, and permits a new proposal/intent.

Concrete sequence: the first Apply commits but its reply is lost; the dialog correctly retains its key. The retry is then refused before reaching the writer, for example by the existing `import_running` 409 middleware (`app.ts:159-168`) or an expired session 401. That refusal says nothing about the first attempt. The UI nevertheless states “nicht gespeichert” and discards the only retained key. Re-previewing and confirming generates a new UUID and can record the same transfer twice when enough units remain. An identical-intent writer retry can also return 409 if its current-history validation later fails; that likewise does not prove the original pair never existed.

Minimal correction: retain a monotone unknown-outcome flag per attempted intent. Once an attempt may have committed, an unrelated later HTTP rejection must retain exact proposal/token/key and honest uncertainty; only an authoritative live/undone result for that key can resolve it. A definitive first-attempt rejection may permit editing, but must not erase earlier uncertainty. Do not weaken durable writer idempotency or silently allocate a replacement key.

## P2 — An already-open discard prompt bypasses the uncertainty close guard

`trade-panel.tsx:215-238`, together with `setUncertainNow` and `close`.

The ordinary header/dialog/navigation close paths consult `uncertainRef`, but the existing inline “Verwerfen” action checks only `busy` and directly calls `close()`/`blocker.proceed()`. Concrete path: open the discard prompt while the filled preview is present; instead of discarding, confirm/apply the still-interactive form; let that request have an unknown result. The prompt is not cleared on start or when uncertainty is set. Once `busy` becomes false, its discard action can unmount the form and lose the retained key despite the visible promise that the window remains open until resolution. The prompt is a normal bordered block, not a modal that prevents the Apply action.

Minimal correction: close/reset the discard prompt when sending or entering uncertainty, and guard the discard handler plus the common close path against busy/unknown state at execution time. Do not rely solely on disabled rendering. The unresolved action must retain its key through every internal exit path.

## P2 — New pre-opening blocker leaks from transfer readiness into historical native edits/Undo

`packages/db/src/repos/security-transfer-history.ts:200-205` adds `account_unopened` to the shared writeBlockers list for the input asOf. `security-transfer-invariants.ts:77-82` passes the *native mutation date* as that asOf and rejects every blocker.

Example: account A opens in 2023 and has a native acquisition that year; account B opens in 2024; a valid A→B transfer occurs in 2025. Both accounts are open now, with no reconciliation lock. A valid correction of A's 2023 native acquisition (or its Undo) replays the complete history correctly. The paired guard nevertheless reads scope A/B at mutationDate 2023, sees B was not yet opened, and rejects it. B needs to exist on the actual 2025 transfer date, not on A's earlier acquisition date. The invariant already checks endpoint opening dates against `scope.asOf`, the actual pair date.

Minimal correction: keep proposed-transfer endpoint opening eligibility at the actual proposed transfer date in preview/writer, and do not treat an unopened endpoint at an earlier native mutation date as a generic history lock. For example, project this readiness reason separately or explicitly distinguish it from reconciliation/closure blockers in the native/Undo invariant caller. Preserve the before/after mutation-date reconciliation fix and actual pair-date lifetime validation.

## P2 — Optional sourceReference is passed across an exact-optional type boundary without normalization

`apps/server/src/api/invest.ts:495,527-528`; also the adjacent preview call at 524-525 inherited from the earlier source-reference addition.

The Zod optional output permits `sourceReference?: string | null | undefined`. The repository writer input declares `sourceReference?: string | null`, and `tsconfig.base.json:11` enables `exactOptionalPropertyTypes`. Passing the raw/rest Zod output directly violates that source contract: an explicitly present undefined is not the same as an absent property. The same router already uses `defined<TradeInput>`/`defined<TradePatch>` for exactly this boundary, and `api/http.ts` documents why.

Minimal correction: omit undefined using the existing `defined` helper with the appropriate repository input type, or construct a normalized object with a definite null/conditional property. Apply the same bounded correction to the adjacent preview call. This is a source/type-contract finding; no compiler was run.

## Source-scoped observations

- The new Apply endpoint remains under the existing session/origin guards, 64 KB body bound, no-store API policy and global write hold. The strict body rejects client-supplied basis/lots/graphs and requires UUID intent, proposal fingerprint and literal confirmation. No new authorization bypass was found.
- Preview/writer share the exact normalized proposal hash. The reviewed writer rechecks stored facts, opening/eligibility, reconciliation/closure and the full later suffix in its transaction; it never trusts client basis. Pair/leg creation and audit grouping are unchanged by this delta.
- The API reply contains only pair/group identifiers and live/duplicate flags. Known live duplicates retain grouped Undo; known undone duplicates clear the old preview and require deliberate new review rather than resurrecting the pair. Those explicit result branches are coherent; the unknown-to-4xx transition above is the gap.
- Amounts and units use the shared privacy formatting, reference input follows privacy state, and error display uses maskMoneyText. No raw private logging or new persistent browser copy was introduced.
- Successful Apply is marked saved before refresh. Its refresh helper absorbs refresh rejection and retains the Undo receipt. Existing onSaved callbacks perform navigation/selection, not a second financial write. The shared budget-write port likewise separates the mutation rejection from refresh failure and retains the receipt/Undo action. No new regression was found in that bounded helper port by source inspection.
- Native writer, generic settlement writer and financial formulas are not replaced. The newly added readiness blocker does, however, alter shared invariant behavior as documented above.

Result: four actionable P2 findings; not source-clear at this head. No additional owner financial-policy decision is needed. Runtime financial acceptance, migration application, compiled types, transport ambiguity, browser blocking and Undo/redo execution remain unvalidated.
