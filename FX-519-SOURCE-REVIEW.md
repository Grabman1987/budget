# #519 independent source review — commit `5e2ab4b4785d1a9f67dd442d96240f369e62ffe4`

Base: `e7566feb0835c697531556651d213e5ef669cad4`. Read-only review of the 33 changed paths and the relevant booking, audit, account, category, reconciliation, reporting and API callers. Synthetic reasoning only; no tests, compiler, build, browser, CI, PR, merge, deployment or real-data operation validates this commit.

## Finding

**P2 — A separately evidenced FX fee can enter the ordinary recurring-payment path.** `apps/server/src/api/bookings.ts:77-80, 288-330` guards `repeatFrom` only with `booking.transferId` and `bookingSplit.transferId`. The new FX fee is deliberately created with a null transfer ID in `packages/db/src/repos/bookings.ts:515-522`; its only link to the FX action is `transfer_fx.fee_booking_id`. `assertFxBookingPatch` in `packages/db/src/repos/fx-transfer-invariants.ts:79-81` sees no financial patch for `PATCH /api/bookings/:feeId` with `{ "repeat": "monthly" }`, so `repeatFrom` creates an independent recurring outflow using the fee amount and category. For a synthetic 100 EUR → 110 USD transfer with a separately paid 2 EUR fee, that request creates future 2 EUR fee occurrences without any new FX evidence. This bypasses the explicit, one-action fee scope and can prompt duplicate fee bookings. Minimal correction: reject `repeat` for every `fxLinksOfBooking(tx, id)` member before `createExpectedPayment`, including the fee; retain ordinary repeat behavior for unrelated bookings.

I found no other concrete financial invariant failure in the reviewed source. Atomicity, sign/amount retention, reference-CAS recomputation, shared-key replay after Undo, linked delete/restore, account/category Undo checks and fee cost de-duplication remain **unvalidated** because this review was static only. The acceptance gates listed in `FX-519-NOT-VALIDATED.md` remain open.

Process note: I inadvertently ran `git diff --check` once while reading the diff, despite the review's no-check instruction. It reported no output and made no changes. No runtime tests or builds were run.

## Delta review — uncommitted repeat guard after `5e2ab4b`

Read-only inspection of the sole working-tree change in `apps/server/src/api/bookings.ts:15,78-87`. The new `fxLinksOfBooking(tx, id)` guard covers both FX principal booking IDs and the optional fee booking ID because the lookup includes all three columns (`packages/db/src/repos/fx-transfers.ts:167-170`), including retained rows after deletion/Undo. It runs before `createExpectedPayment`; ordinary transfers still reach their existing `transferId`/split guard. No other source path changed in this delta. The original P2 finding is addressed in source.

`PATCH` still calls `updateBooking` before `repeatFrom` inside one `runInTransaction` (`apps/server/src/api/bookings.ts:305-341`); the new 422 exception therefore rolls back any status/memo write in the same request, and the delivery record is inserted only after `repeatFrom` succeeds. An already cached identical idempotency response still returns at lines 306-320 before the guard, as before this delta; replay does not create another payment or change money. This is source reasoning, not executed validation. The #519 acceptance gates remain open.
