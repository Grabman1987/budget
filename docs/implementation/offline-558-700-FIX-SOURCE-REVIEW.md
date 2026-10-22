# Offline #558/#559/#699/#700 — exact correction source review

Reviewed head `3f09e1a664da3ac80c93651fed6becea6574153d` against `f24d665fd69019f5b563977390f76fcef5d0ae4a` on `codex/impl-offline-558-700`, worktree `/workspace/impl-offline-558-700`. This is a narrow follow-up to `offline-558-700-source-review.md`, not a new review of the inherited application. Source reading only: no tests/checks, build, browser, DB/provider/network/CI operations or product edits.

**Both original P2 findings are closed at source level. No additional actionable finding in this exact delta.**

- Receipt delivery no longer branches on 400/413/415/422 to downgrade uncertainty. Every failed claimed request uses the existing guarded `updateReceiptUploadStatus`, which retains the same immutable payload/key/target and sets `uncertain:true`.
- The resetting `rejectReceiptUpload` function is removed, with no remaining source caller. The only receipt enqueue path initializes `uncertain:false`; native claim and subsequent status writes retain true. Cancellation still serializes with claim in native storage and refuses an uncertain intent. Thus later rejection cannot erase evidence of an earlier lost acknowledgment, including competing claims without Web Locks.
- A successful same-key acknowledgment still removes the intent through the existing epoch fence. A late failed request cannot recreate a removed row because status update returns on missing intent. Existing explicit sign-out erase behavior remains separate and unchanged.
- The correction deliberately takes the conservative option: even a first claimed request's complete validation refusal remains uncertain and cannot be cancelled through the unsent-item control. The handoff and revised UI text disclose this limitation. That avoids introducing an unproven first-attempt/parallel-claim exception; no extra metadata or financial writer is needed for this fix.
- Active SavedToday now applies shared `maskMoneyText` to rule `valueText`; its existing `useAmountPrivacy` subscription triggers display updates. Stored data is unchanged.
- The unapplied #574 adapter imports the same helper and masks both rule value text and the adjacent unavailable-wealth diagnostic. The patch's new-file hunk length and handoff description were updated with the added import. It remains an integration artifact; no application or combined runtime correctness is claimed.

The initial review's remaining source/runtime limits continue to apply. This follow-up closes the two bounded findings only; no executable privacy, lost-acknowledgment, native-storage concurrency or delivery/Undo acceptance was performed.
