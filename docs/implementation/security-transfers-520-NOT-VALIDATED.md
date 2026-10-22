# Same-security transfer preparation — NOT VALIDATED

Refs #520. Base: `ce1e67b17a930d3441e827359f1adf5efcb38303`, the specified
portfolio source checkpoint. It is not declared merged or live by this work.
Owner implementation-only direction (2026-10-22) applies. No tests, test edits,
test runs, typechecks, builds, browser checks, CI, PR, merge, deployment or database
operation was performed. This is bounded preparation, not Stage-A acceptance.

## Existing implementation inventory

The actual #520 issue has no newer product decision beyond bounded preparation;
it is an epic. Dependencies #509/#511 are closed. SPEC-009 and reference-adoption
require explicit same-security pairing and replayable lot lineage; equal delivery
amounts/dates do not prove an internal transfer. No prepared #520 source branch or
pair/lineage engine was found in the inspected source/history.

Existing `invest/cost.ts` sorts account-local cost trades and calls FIFO/average
pools. Its cost-trade projection does not retain acquisition dates or cross-account
fragment lineage. Existing `trade-rules.ts` correctly gives deliveries zero cash,
but independent delivery_in/delivery_out rows do not hand original basis/dates
between accounts. None of those canonical functions or trade writers was changed.

## New nonwriting computational preview only

`packages/domain/src/invest/security-transfer-preview.ts` supplies an isolated pure
preview, intentionally not exported from a shared barrel or connected to an API,
repository, financial calculation, UI or writer. There is no migration reservation
or schema change. `applyAvailable` always remains false.

Inputs describe documented remaining source/destination fragments immediately
before the proposed transfer. Explicit account/security/date, EUR basis, original
acquisition IDs/dates and stable acquisition order are required. Those declarations
are **not** themselves proof of database lineage, lock state or an authoritative
replay; a future repository adapter must derive them and revalidate transactionally.
The helper does not accept caller-entered fragments through an authenticated API.

- FIFO consumes the declared acquisition order, retaining every carried fragment's
  original acquisition identity/date/order. Average moves an exact proportional
  share of each documented remaining fragment and its basis. No method defaults
  or switches are introduced.
- BigInt intermediate arithmetic accepts only exact integral E8 units and cents.
  Source remaining basis plus moved basis conserves the supplied basis. Destination
  existing fragments remain separate; the preview does not invent new persisted
  fragment IDs or claim a complete destination replay.
- Fractional cents or E8 fragment units are rejected, not rounded. Unknown basis,
  ambiguous/duplicate fragment identity or acquisition order, insufficient units,
  unsupported corporate actions, unestablished transfer boundary, declared locks,
  unsupported currency and unsafe integer bounds fail closed.
- A separate scope helper accepts both explicit paired legs with a pair identity,
  same security/date/EUR and equal opposite units. It classifies internal movement
  only when both accounts are in scope. A one-sided scope requires explicit
  transfer-date valuation of those units; source-only is an external withdrawal,
  destination-only an external contribution. No equal-value/date matching is run.
  The helper does not prove that the supplied pair is persisted or authoritative.
- Both helpers are read-only; no realized sale gain, cash, fee, tax, settlement
  booking or envelope activity is created. Unsupported non-EUR basis/valuation
  stays unavailable in this deliberately narrow first preview.

## Concrete unresolved allocation policy

Two units have a total known basis of **1 cent**. Transfer one unit. Proportional
basis is **0.5 cent moved / 0.5 cent retained**. Largest remainder alone leaves a
tie: moved **1**, retained **0**, or moved **0**, retained **1** both conserve the
cent. They lead to different one-cent sale gains later. No accepted tie winner or
persistent residual-allocation rule was found. This preview rejects the case;
it does not decide which account/fragment receives the cent.

A similar lineage choice arises for two fragments of one E8 micro-unit each when
one micro-unit is transferred proportionally: each fragment would contribute half
an E8 micro-unit, which the storage units cannot represent. The helper rejects
that allocation rather than choosing which original acquisition date moves.

## Literal intended controls, not executed evidence

The specified FIFO example (4 units / EUR 40 plus 6 / EUR 72, transfer 5) must carry
EUR 52 and leave EUR 60 with dates retained. An exactly representable average pool
of 10 units / EUR 102 transferring 5 must carry EUR 51 and leave EUR 51. The two-unit
one-cent tie above must remain unavailable. These are future independent acceptance
controls, not results obtained by running this source.

## Remaining before any canonical financial mutation

Full dated cross-account replay of acquisitions/disposals/transfers, including
subsequent sales, same-day dependencies/cycles and backdated edits; confirmed
allocation/tie policy; explicit authoritative pair/lineage relation with migration
reservation/review; snapshot/unpaired-delivery provenance; locks, stale preview,
idempotency, two-leg rollback, audit and exact apply/Undo/redo; public API/UI; all
required independent literal/regression/financial/browser evidence and authorized
integration/deployment/live gates. Stage A's tested replay exit criterion is not
satisfied by this preview. No issue or private-financial validation is claimed.
