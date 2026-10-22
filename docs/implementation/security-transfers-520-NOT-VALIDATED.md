# Same-security transfer preparation — NOT VALIDATED

Refs #520. Base: `ce1e67b17a930d3441e827359f1adf5efcb38303`, the specified
portfolio source checkpoint. It is not declared merged or live by this work.
Owner implementation-only direction (2026-10-22) applies. No tests, test edits,
test runs, typechecks, builds, browser checks, CI, PR, merge, deployment or database
operation was performed. This is bounded preparation, not Stage-A acceptance.

The prospective paired writer remains a design only. Its [reconstructed
plan](security-transfers-520-writer-plan.md), [independent
review](security-transfers-520-writer-plan-review.md) and [implementation
addendum](security-transfers-520-writer-plan-addendum.md) retain the one-relation
contract after temporary storage loss. The review recommended bounded source
preparation with explicit on-budget rejection, pair-aware canonical cost/flow
reads, before/after component validation and distinct intent/fact hashes. No
migration slot, including 0053, is reserved; no schema, writer or API was added.

The implementation-only FIFO slice at `1709597413ba00933631c9af22b11a6343a83f65`,
based on `a5156b399d3c09094b255c32177c0685fb9213a7`, uses the
[bounded lineage policy review](security-transfers-520-lineage-policy-review.md).
It completes the same-original-acquisition FIFO interpretation in the two pure helpers.
The subsequent source-only average graph, based on `31c94f331233e397540383b24cae9c95030feb19`,
extends those helpers; authoritative
database/API work remains separate.
The [independent source review](security-transfers-520-fifo-source-review.md) found a
numeric-basis average projection regression; this follow-up records an explicit
pooled-basis derivation that retains the prior numeric receipt and keeps current
pooled-only fragment basis null. That is a source correction, not executed validation.
The later [average graph source review](security-transfers-520-average-graph-source-review.md)
records its input-validation findings and narrow source clearance. It does not
establish executable acceptance or authoritative repository provenance.

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
preview. The adjacent replay is now exported for a repository-only native-history
reader; neither is connected to an authenticated API, financial page, UI or writer.
There is no migration reservation or schema change. `applyAvailable` always remains false.

Inputs describe documented remaining source/destination fragments immediately
before the proposed transfer. Explicit account/security/date, EUR basis, original
acquisition IDs/dates and stable acquisition order are required. Those declarations
are **not** themselves proof of database lineage, lock state or an authoritative
replay; a future repository adapter must derive them and revalidate transactionally.
The helper does not accept caller-entered fragments through an authenticated API.

- FIFO consumes the declared acquisition order, deriving one current economic lot
  from reunited fragments of the same original acquisition in one account. Immutable
  contributing records retain their separate quantities, cents and transfer paths.
  Average moves exact proportional ancestry through a bounded immutable pool graph,
  with one separately allocated pool basis. No method defaults
  or switches are introduced.
- BigInt intermediate arithmetic preserves exact E8 units and applies the approved
  source-residual cent policy.
  Source remaining basis plus moved basis conserves the supplied basis. Destination
  existing fragments may be shown as a normalized economic lot with its contributing
  records intact; the preview does not invent new persisted fragment IDs or claim a
  complete destination replay by itself.
- Fractional average ancestry is retained as reduced rational split ratios; actual
  holdings and transfer quantities stay integer E8. Unknown basis,
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
graph leaves retain original identities/dates and integer acquisition units;
rational split nodes preserve fractional output ancestry. Individual acquisition
basis is not assigned because cents belong to the pool. The result exposes `basisAllocation`
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
the database package or connected to a server route, UI or canonical position
writer. The domain function is exported for repository use. Its input declares a
`recorded-ledger-zero-seed` and `all-supported-recorded-facts` through a named day.
That means the existing app cost engine's analytical zero seed plus all supported
recorded facts in the reader's scope. It does **not** certify a physical zero opening,
complete external broker history or Gate 3 private reconciliation. Events beyond
declared coverage are rejected. There is no invented historical opening or legacy
pairing.

The bounded input accepts explicit buys, sales and transfer events with distinct
pair/out-leg/in-leg identities. Dates are valid and same-day positions unique; the helper
replays the entire input in that order, including later sales. A backdated input is
recomputed from zero and an impossible later transfer rejects the whole result.
Same-day transfer cycles, missing/duplicate legs, unsupported events, unknown
opening/provenance, declared transfer locks, insufficient units and arithmetic/size
limits return a typed failure and no partial plan. Limits are 50 accounts, 1,000
events and 2,000 fragments per account; the two-pool preview additionally bounds
combined fragments to 2,000. No input is written or mutated.

For FIFO, original acquisition identity/date/order is distinct from fragment identity.
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
the remaining lot's derivation. Average sales reuse `averageCost`; their current
integer units and cents are account-level balances. Acquisition, split, sale,
receipt and merge ancestry is a separate immutable graph. A split stores its
reduced numerator/denominator, so one transferred E8 quantum can carry half an
E8 quantum of provenance from each of two acquisitions without writing fractional
holdings or choosing an arbitrary acquisition date. The receipt node retains
the actual pair, both legs, date, security and account boundary. Historical
graphs are not mutated by subsequent account events. A full sale/transfer leaves
an empty graph and zero units, without treating a known zero basis as unknown.

The preview still accepts documented fragment inputs with numeric current basis:
their cents must match the declared pool, and a separate graph leaf retains their
complete numeric receipt/derivation snapshot. A subsequent graph input has no
current fragment-cent claims and requires an explicit known pool basis. Mixing a
current fragment array with an explicit graph is rejected. Existing all-known,
all-null and mixed-fragment basis conflicts are unchanged at the fragment boundary.
Graph input checks shape, acquisition identity/date/order, security, account and
transfer boundaries, chronology, cycles, exact root mass, integer E8 mass at
each received pair, consistent pair/leg identities and exact received source
shares, and a bounded per-leaf
rational ownership budget across both current accounts. Acquisition/fragment,
actual receipt and sale-remainder outputs each have their own conserved budget,
with consistent event identity, physical quantity and source shares.
This permits complementary split branches but rejects duplicate economic
contributions from the same historical output.
Acquisition leaves and documented fragment leaves for one original acquisition
cannot be mixed without an authoritative quantitative equivalence.
Nodes, edges, share work and numerator/denominator size are bounded.
A declared graph is still not proof that its pairs, disjoint ownership outside
the supplied accounts or zero-opening history exist in the database.
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
keeps the combined 1-cent pool and still floors once at the aggregate level;
its rational provenance remains separate from integer E8 holdings.

For two different acquisitions of one E8 micro-unit each, a one-micro-unit
average transfer stores a 1/2 split of the two-unit provenance pool. Source and
destination each have one actual E8 unit; each has a half-micro-unit ancestry
contribution from each acquisition. This is analytical evidence, not a new
physical unit or a per-acquisition cent assignment.

## Repository-only recorded-ledger reader — still no apply

The [revised history-bridge plan](security-transfers-520-history-reader-plan.md),
[minimality review](security-transfers-520-history-plan-minimality-review.md) and
[pinned source review](security-transfers-520-history-reader-source-review.md)
record the scope correction and source-only findings.

`packages/db/src/repos/security-transfer-history.ts` reads one security in two
investment accounts from a consistent DB snapshot. It accepts validated
native buys, sells and zero-cash splits with EUR account basis, selected persisted average/FIFO method
and their canonical same-day cost order; multiple native events on one day are not
blanket-rejected. It validates zero-unit cash kinds and settlement links, but does
not turn them into basis events. Unpaired deliveries and nonredundant
snapshots return typed unavailable results. A null-basis snapshot is ignored only
when both canonical methods establish its units from native facts; otherwise it
is an unknown-basis anchor. Numerically redundant snapshots only corroborate the recorded native history; they do not prove an
external opening or transfer ancestry. Source account reconciliation locks block
the read result.

The reader compares both account results with the existing selected-method
`documentedCostOf` projection at the requested day and at the latest recorded day.
It reads the full current affected history for a deterministic fact fingerprint;
the fingerprint also includes the latest existing audit revisions for the cost
preference and relevant source rows, so an average → FIFO → average change cannot
reuse the old preview identity. Current settlement links and a capped trade audit
history are read to reject still-live detached settlement bookings, including
after a trade becomes zero-net or is deleted. The replay input returned for a
possible preview ends at the requested day.
Later recorded events are also replayed and must remain viable, so a backdated
candidate cannot ignore an already recorded later sale. A future apply must reread
the then-latest facts and compare the same full-scope fingerprint in a transaction.
No such apply path, persisted pair relation, public API or authenticated preview
was added. Existing delivery legs stay unavailable; no amount/date/import-key
matching creates a pair. The reader and changed helper contract are **NOT
VALIDATED**; source review and executable acceptance remain separate gates.

## Existing split replay — source only

The [initial independent split source review](security-transfers-520-split-source-review.md)
identified two FIFO evidence gaps. The [pinned correction review](security-transfers-520-split-fix-source-review.md)
closed both on source inspection at `da3e0b3a9cdac012a6c7b6e6af412cc7f046dc7b`.
The correction traverses every pre-split lot's ancestry and account under one
bounded graph walk and validates each lot's scalar shape before ordering. No
executable check has been run.

The pure dated replay now accepts a stored `split` as an absolute signed E8 unit
delta with zero amount, fee and tax. It requires a positive proven pool before
and after the event. Average preserves pool cents and acquisition ownership in
an explicit `unit-adjusted` graph node carrying the split trade identity and
integer before/after units. This is separate from the fractional graph node used
for sales and transfers. FIFO first normalizes reunited same-acquisition fragments,
then follows the existing canonical per-lot `Math.round` allocation and last-lot
remainder. Each output fragment retains its source acquisition identity/date and
lot cents, and references an immutable pre-split lot vector and split identity.
The reader places split rows in the existing buy-first/date-and-ID cost order and
compares replay units/basis with the canonical selected-method position projection.

Zero or negative post-split pools, zero or negative individual FIFO lots, unsafe
integer bounds and rounding disagreement are typed unavailable. No cost formula,
trade writer, schema, public API, UI, or new split action changed. Stage A
executable acceptance of this split slice remains open; this text
does not assert AC-009-06 completion.

## Literal intended controls, not executed evidence

The specified FIFO example (4 units / EUR 40 plus 6 / EUR 72, transfer 5) must carry
EUR 52 and leave EUR 60 with dates retained. An exactly representable average pool
of 10 units / EUR 102 transferring 5 must carry EUR 51 and leave EUR 51. The two-unit
one-cent case above must carry zero and retain one cent under the approved policy. These are future independent acceptance
controls, not results obtained by running this source.

## Remaining before any canonical financial mutation

Executable independent acceptance of the bounded dated replay, FIFO
same-acquisition normalization and average rational graph;
split runtime/source acceptance, snapshot/unpaired-delivery provenance and wider supported history;
explicit authoritative pair/lineage relation with migration reservation/review and
same-day pair order;
transactional backdated-edit revalidation; locks, stale preview,
idempotency, two-leg rollback, audit and exact apply/Undo/redo; public API/UI; all
required independent literal/regression/financial/browser evidence and authorized
integration/deployment/live gates. Stage A's tested replay exit criterion is not
satisfied by these source helpers. Existing split behavior is unchanged; this narrow
replay now recognizes supported split events but does not claim AC-009-06 coverage. No issue or
private-financial validation is claimed. No persistence/API work follows this
checkpoint until the replay contract and remaining provenance work are complete.
