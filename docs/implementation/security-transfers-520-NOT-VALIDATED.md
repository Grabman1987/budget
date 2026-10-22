# Same-security transfer preparation — NOT VALIDATED

Refs #520. Base: `ce1e67b17a930d3441e827359f1adf5efcb38303`, the specified
portfolio source checkpoint. It is not declared merged or live by this work.
Owner implementation-only direction (2026-10-22) applies. No tests, test edits,
test runs, typechecks, builds, browser checks, CI, PR, merge, deployment or database
operation was performed. This is bounded preparation, not Stage-A acceptance.

The subsequent implementation-only FIFO slice at `a5156b399d3c09094b255c32177c0685fb9213a7`
uses the [bounded lineage policy review](security-transfers-520-lineage-policy-review.md).
It completes the same-original-acquisition FIFO interpretation in the two pure helpers;
moving-average rational ancestry and authoritative database/API work remain separate.

## Existing implementation inventory

The actual #520 issue remains an epic. Its 2026-10-22 owner comment records the
approved residual-cent policy below; it does not establish legacy lineage or
authorize E8 rounding. Dependencies #509/#511 are closed. SPEC-009 and reference-adoption
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

- FIFO consumes the declared acquisition order, deriving one current economic lot
  from reunited fragments of the same original acquisition in one account. Immutable
  contributing records retain their separate quantities, cents and transfer paths.
  Average moves exact proportional
  acquisition-unit fragments, with one separately allocated pool basis. No method defaults
  or switches are introduced.
- BigInt intermediate arithmetic preserves exact E8 units and applies the approved
  source-residual cent policy.
  Source remaining basis plus moved basis conserves the supplied basis. Destination
  existing fragments may be shown as a normalized economic lot with its contributing
  records intact; the preview does not invent new persisted fragment IDs or claim a
  complete destination replay by itself.
- Unrepresentable E8 fragment units are rejected, not rounded. Unknown basis,
  ambiguous/duplicate fragment identity or unrelated tied acquisition order, insufficient units,
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

## Approved residual-cent policy — owner decision 2026-10-22

The user approved retaining residual cents at source until its eventual full transfer.
For two units / **1 cent** basis, transferring one unit carries **0 cents** and
leaves **1 cent** at source. The eventual full transfer of the remaining unit carries
the retained cent. This decision supersedes this checkpoint's earlier fractional-cent
rejection; it does not approve rounding unrepresentable E8 acquisition fragments.

FIFO applies the floor to the consumed fraction of each source lot; the unconsumed
lot keeps the remainder. Full-lot transfer carries that lot's complete remaining basis.
Average applies the floor **once to the whole moving-average pool**. It does not
independently floor each acquisition fragment: two equal fragments of 3 cents each,
with half the pool moved, transfer **3 cents**, not 1 + 1 = 2. Average acquisition
fragments retain original identities/dates and exact units, while their individual
basis remains null because basis is pooled. The result exposes `basisAllocation`
and separate transferred/source/destination pool totals. Subsequent previews can
supply explicit `poolBasisCents`; fragment provenance is not fabricated lot economics.

Basis evidence has two distinct forms. Numeric fragment bases assert **current
allocated cents**; an explicitly supplied pool must equal their sum. All-null
fragment bases assert **unit/acquisition provenance only**, requiring an explicit
known pool total. Mixed known/null fragment bases or a conflicting declared total
are rejected; a pool total never silently overrides current fragment-basis evidence.

## Pure dated replay source — still nonwriting

`packages/domain/src/invest/security-transfer-replay.ts` adds a standalone full-input
replay for one security and a selected FIFO/average method. It is not exported from
a barrel or connected to any repository, API, UI or canonical calculation. The source
requires an explicitly documented zero opening for every account, complete history,
EUR basis and authoritative date/sequence order. Those input declarations are not
database proof. A future repository reader must establish them; absence of a
snapshot is insufficient. There is no invented historical opening or legacy pairing.

The bounded input accepts explicit buys, sales and transfer events with distinct
pair/out-leg/in-leg identities. Dates are valid and same-day positions unique; the helper
replays the entire input in that order, including later sales. A backdated input is
recomputed from zero and an impossible later transfer rejects the whole result.
Same-day transfer cycles, missing/duplicate legs, unsupported events, unknown
opening/provenance, declared transfer locks, insufficient units and arithmetic/size
limits return a typed failure and no partial plan. Limits are 50 accounts, 1,000
events and 2,000 fragments per account; the two-pool preview additionally bounds
combined fragments to 2,000. No input is written or mutated.

Original acquisition identity/date/order is distinct from fragment identity.
Buys create namespaced fragment IDs; every incoming transfer fragment gets a
different namespaced ID derived from its explicit incoming leg and allocation
index. Its original acquisition fields remain unchanged. A linear pair path is
extended only while it remains a single path. A received reunited lot instead
retains an immutable derivation referencing the source aggregate and the actual
pair/out-leg/in-leg IDs, date and account boundary; it never concatenates contributing
paths. Results retain
pair and both leg identities, computational allocation
and incoming fragments. Repeated transfers to the same recipient can therefore
coexist without claiming a second acquisition or reusing a fragment identity.
The preview accepts repeated acquisition positions only for the same original
acquisition with documented derived/transfer ancestry; inconsistent dates/orders
for one acquisition identity and unrelated ties remain rejected.

FIFO sales normalize current fragments of the same original acquisition before
the existing `fifoCost` disposal rule, and preserve the contributing records in
the remaining lot's derivation. Average sales reuse `averageCost`; provenance units are reduced exactly
proportionally while basis remains pooled. Any fractional E8 provenance is rejected.
Existing representable average reductions now retain their prior-fragment references;
this does not implement exact rational pooled ancestry or alter the average cost rule.
Both shared sale results are reconciled against exact BigInt half-up cents, and a
floating-point mismatch is rejected instead of changing canonical sale arithmetic.
The approved **transfer floor** is applied only to transfers; actual sales keep
their existing half-up disposal rule. Transfers themselves add no realized gain,
cash, fees, taxes or settlement activity. Historical replay previews are kept
independent from later appends to the same account.

For a documented original lot of 2 units / 1 cent transferred to B in two steps
(1/0 then 1/1), B's current FIFO economic lot is 2/1. Its two arrival records
remain separate evidence. A further 1-unit transfer carries 0 cents under the
approved transfer floor; a 1-unit sale consumes 1 cent under canonical sale
half-up. Those are code interpretations, not executed acceptance results. Average
keeps the combined 1-cent pool and still floors once at the aggregate level; its
exact-E8 provenance constraint remains.

A similar lineage choice arises for two fragments of one E8 micro-unit each when
one micro-unit is transferred proportionally: each fragment would contribute half
an E8 micro-unit, which the storage units cannot represent. The helper rejects
that allocation rather than choosing which original acquisition date moves.

## Literal intended controls, not executed evidence

The specified FIFO example (4 units / EUR 40 plus 6 / EUR 72, transfer 5) must carry
EUR 52 and leave EUR 60 with dates retained. An exactly representable average pool
of 10 units / EUR 102 transferring 5 must carry EUR 51 and leave EUR 51. The two-unit
one-cent case above must carry zero and retain one cent under the approved policy. These are future independent acceptance
controls, not results obtained by running this source.

## Remaining before any canonical financial mutation

Independent source review and acceptance of the bounded dated replay and this FIFO
same-acquisition normalization; exact rational moving-average ancestry;
authoritative zero-opening/history/order
reader, existing split/snapshot/unpaired-delivery provenance, and wider supported
history; explicit authoritative pair/lineage relation with migration reservation/review;
transactional backdated-edit revalidation; locks, stale preview,
idempotency, two-leg rollback, audit and exact apply/Undo/redo; public API/UI; all
required independent literal/regression/financial/browser evidence and authorized
integration/deployment/live gates. Stage A's tested replay exit criterion is not
satisfied by these source helpers. Existing split behavior is unchanged; this narrow
replay rejects split events rather than claiming AC-009-06 coverage. No issue or
private-financial validation is claimed. No persistence/API work follows this
checkpoint until the replay contract and remaining provenance work are complete.
