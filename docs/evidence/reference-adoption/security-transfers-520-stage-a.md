# Security transfers #520: Stage A

This slice is a pure, synthetic replay proof. It is not connected to the public
domain barrel, portfolio read models, database, API or UI. Existing financial
figures and cost-method selection are unchanged in both redesign modes.

The owner decision in [#520](https://github.com/Grabman1987/budget/issues/520#issuecomment-6346057236)
supersedes SPEC-009's earlier largest-remainder transfer wording: truncate each
partial FIFO lot's transferred basis, or the transferred average pool basis;
leave the residual cent with the source. A later full transfer carries that cent.
Sales retain the existing half-up allocation convention, implemented with the
shared integer helper. No floating-point product or division calculates money.

## Contract and independent literal evidence

`packages/domain/src/invest/security-transfer-replay.ts` accepts explicit,
documented acquisitions from zero, sales with actual net proceeds, and paired
same-security EUR transfers. It sorts by date and explicit within-day sequence,
rejecting ambiguous order and reused event/leg identities. Transfer legs must
agree on date, security, currency and exactly opposite E8 units. Acquisition
basis includes already capitalized purchase fees; this module never computes tax
withholding or changes fee policy. Replay through a date includes that date.

The new `security-transfer-replay-520.test.ts` supplies independent literal
expectations for the authorized Stage A contract; no existing tests or financial
oracles are edited:

- FIFO lots 4 units / 4,000 cents and 6 units / 7,200 cents, transfer 5:
  destination 5,200 cents, source 6,000 cents; acquisition dates retained.
- Average pool 10 units / 10,200 cents, transfer 5: 5,100 cents per side,
  with both original acquisition dates retained as proportional unit provenance.
- Two units / one cent, transfer one: zero cents transferred, one cent remaining;
  the final transfer carries the cent. Three E8 ticks / 100 cents transferred
  individually carry 33, 33 and 34 cents.
- A later sale of three transferred units for 4,500 net cents produces FIFO gain
  1,500 cents or average gain 1,140 cents from the 11,200-cent example.
- Earlier destination acquisitions, branched/reunited lots, ordered same-day
  chains and backdated edits replay deterministically. Removing/reapplying facts
  reproduces the original pure result without mutating caller input.
- Integer products beyond double precision remain exact. Destination aggregate
  overflow returns a typed failure with no partial result.
- Both explicit paired accounts in scope produce zero external flow. One-sided
  scope requires an explicit transfer-date valuation (8,000 cents in the test),
  never the 5,200-cent acquisition basis. Missing/wrong-date values are unavailable.

## Deliberate boundaries and remaining gates

Average pool basis is separate from acquisition provenance: individual average
fragments do not claim FIFO basis. Partial movements, including sales, require
each acquisition's proportional units to be exactly representable in E8. Otherwise
replay rejects with `nonrepresentable_units`; no unit rounding or rational lineage
engine is introduced. FIFO branches of one acquisition reunite before later sale
rounding. Same-day circular account graphs are conservatively rejected, including
funded round trips. Cross-day transfers may return holdings to an earlier account.

Unknown basis, unpaired deliveries, snapshots, split/conversion histories,
mergers/spinoffs and non-EUR basis remain unsupported/manual review in this proof.
Existing live split and unpaired-delivery behavior is untouched. No inference from
matching amounts establishes a pair. The input is a typed domain contract, not a
runtime API schema or proof that a persisted history is complete.

Remaining Stage B/C gates: authoritative history and pair persistence, transaction
failure at either leg, locks, concurrent/stale changes, idempotency, audit and real
apply/undo/redo; API validation/authentication; UI and integrated scope/performance
readers. Pure remove/reapply evidence is not database undo evidence. No migration,
private data acceptance, merge, release or live delivery is claimed.

The older `origin/codex/impl-520-security-transfers` source checkpoint was inspected
as reference. Its broader preview/history/persistence design was not imported into
this bounded slice. Exact revision, final independent review and check outcomes
are recorded in the draft PR; required exact-head CI remains an integration gate.
