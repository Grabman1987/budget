# #520 average rational graph — independent source review

Final inspected uncommitted correction: **source-scoped clear for the bounded graph slice**. The findings and correction reviews below are retained as evidence of what changed. This is not executable validation or approval of a later uninspected commit, persistence/API input or financial apply.

Reviewed uncommitted source delta in `/workspace/impl-520-security-transfers` atop `31c94f331233e397540383b24cae9c95030feb19`. This is source reasoning only; no tests, executable checks, build, browser, database operation or delivery action. Author is still revising; findings below apply to the initial graph delta inspected, not a later corrected checkpoint.

The immutable pool/split/receipt/merge direction preserves the existing financial methods: account-level integer units/cents, one transfer floor, canonical sale half-up, rational acquisition ancestry. Replay-generated examples use integer actual transactions and unique explicit event/leg identities. Three explicit-graph input gaps prevent source clearance:

1. **Duplicate acquisition contribution passes exact root mass.** A merged node whose sources are `[leaf, leaf]` is accepted for declared units twice that leaf's units. Memoized traversal validates the leaf once, while merge adds its mass twice. Separate same-ID leaves with equal facts likewise pass. Metadata agreement is not conservation. Track bounded exact current contribution weights by original acquisition/established fragment identity and reject excess; preserve legitimate complementary branches sharing historical nodes. Compare current source and destination roots together, because whole source acquisition plus a receipt of that same whole acquisition otherwise passes separate root checks while claiming it twice.
2. **Actual receipt nodes can have fractional E8 mass.** Two half-E8 received branches can merge into a one-E8 root and satisfy the current final root check. Analytical fractions are permitted; each node claiming a real transfer pair still needs an integer, safe, positive physical quantity. Require that at every received node, not just the final account root. Preserve rational split/merge ancestry internally.
3. **Pair/leg identities are not validated across graph nodes.** Each received node checks nonempty IDs and differing legs, but the same pair can claim conflicting dates/accounts/quantities or one leg can belong to different pairs. Maintain shared pair facts/leg membership while validating both roots. Repeated traversal of the same historical receipt must remain allowed; contradictory receipts or reused legs must fail. The replay input already rejects these cases for actual events; accepting equivalent contradictions through explicit graph evidence bypasses that contract.

Suggested correction remains bounded representation work, with typed graph/weight complexity limits and no owner financial-policy question. Do not expose this graph as authoritative HTTP/persistence input. Acquisition leaves require documented evidence; an accepted graph is not proof of historical database pairing or zero opening.

## First correction re-review — uncommitted source

The added per-leaf rational coefficients reject repeated identical acquisition contributions and apply a shared ownership budget across the two graph roots. The receipt-node integer/safe mass guard addresses fractional physical receipt claims. Reduced fraction helpers and the 1,000,000 share-work limit bound coefficient propagation; existing node/edge and 4096-bit limits remain. Receipt quantity was subsequently added to the pair signature at postorder completion, where it is known exactly.

Two remaining actionable gaps were sent to the author:

- **Equal-quantity conflicting receipt ancestry:** the same pair/legs/date/accounts/security/quantity can still claim acquisition X in one receipt node and acquisition Y in another. Merging those nodes yields twice the actual receipt while each distinct leaf stays within its ownership budget. Compare the exact source contribution vector as part of repeated-pair consistency, or require a single canonical receipt node with equivalent evidence. Legitimate re-use of a historical node remains allowed.
- **Mixed leaf representations bypass ownership:** `acquisition:X` and `fragment:F` are different budget keys even when F declares `acquisitionId: X`. An acquisition can be claimed once as an acquisition leaf and again as a documented-fragment snapshot, within one graph or across the two inputs. Conservatively reject these mixed representations for the same acquisition when their quantitative relationship cannot be established. Existing callers can use one consistent evidence representation; no new allocation policy is needed.

No executable validation was performed. Source clearance remains pending these consistency guards.

## Second correction re-review — uncommitted source

Exact source contribution vectors are now part of repeated-receipt signatures. A shared acquisition-form map rejects mixed acquisition/documented-fragment representations for the same original acquisition across both inputs, including fragment-array input. Those two earlier gaps are addressed in the inspected correction.

One narrower conservation issue remains: a receipt of one E8 unit from an original four-E8 acquisition can be duplicated as `merged[receipt, receipt]`. Its identical receipt signature agrees, and summed acquisition ownership is only one-half, so the graph accepts two current E8 units from one actual one-E8 incoming leg. Likewise, duplicating a one-unit remainder from an explicitly identified sale can restore disposed units while staying below the original acquisition budget. Add conserved output budgets for explicit receipt identities and sale-remainder events, propagated through split/merge operations and combined across current roots. Original-acquisition capacity alone cannot prove conservation of these later outputs.

Two budget details were also sent to the author: enforce the edge cap immediately after incrementing edges, before enqueuing children (the current pre-visit check is skipped for memoized children); count receipt-signature share sorting/serialization against the existing work budget. Review remains source-only and open pending the bounded correction.

## Third correction re-review — uncommitted source

Explicit receipt and sale-remainder output budgets now propagate through split/merge and both current roots; duplicates cannot rely on spare original-acquisition capacity. The edge cap is checked immediately after increment, and receipt signature serialization is charged to share-work. These reported corrections are source-consistent.

The newly introduced sale-output identity needs the same consistency treatment as a receipt: repeated `saleId` must agree on date, source account, exact integral source mass, remainder mass/ratio and exact source contribution vector. Otherwise two contradictory sale nodes can each be scaled by one-half and merged while their shared sale budget sums to one. Require integral safe **source** mass as well as remainder mass for a node asserting an actual sale. This remaining source guard was sent to the author; replay-generated events already obey it.

## Final narrow correction re-review — uncommitted source atop 31c94f331233e397540383b24cae9c95030feb19

The sale guard now requires integral safe positive source and remainder mass and compares repeated sale IDs against date/account/source mass/remainder mass/reduced ratio/exact source-share signatures. A shared sale map spans both preview inputs; signature work counts toward the work cap. This addresses the last reported consistency gap.

No further actionable finding in the reviewed bounded slice. The graph carries exact proportional ancestry while actual acquisition/receipt/sale balances remain integer E8 and pooled cents. Original acquisition/fragment budgets and explicit receipt/sale-output budgets propagate through splits/merges and are conserved across both current graph roots. Receipt facts, leg membership and sale signatures reject contradictory explicit identities. Different representations for the same original acquisition fail closed. Iterative cycle detection, immediate edge checks, node limits, reduced-fraction limits and share-work limits bound the new validation work. Historic graph nodes are not mutated during replay.

The canonical average sale calculation and pool-level transfer floor remain the economic calculations; empty/full-disposal state uses no remaining graph and known zero units/basis. FIFO normalization stays separate. Trusted documented-fragment snapshots remain evidence supplied by a future authoritative reader; this graph does not establish their historical disjointness, persisted pair existence or completeness from external data. All helpers remain isolated and nonwriting with `applyAvailable: false`.

No tests, test changes, executable checks, typecheck, build, browser, database operations, PR, merge or deployment were performed. Review applies to the uncommitted source inspected; the author/root must identify the subsequent commit independently.
