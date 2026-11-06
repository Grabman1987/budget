# Shared expenses and contact credit

Approved scope: #963 and its owner comments of 2026-11-06. The purchase UI remains
one category line with contact shares. Largest-remainder splitting is unchanged;
new share splits retain that category, so it carries the full purchase until repaid.

The existing contact settlement/allocation rows remain authoritative. A receipt
keeps its contact movement through Auslagen and adds balanced category-return
splits. Allocated category inflows are offset against Auslagen, so only excess
remains there. Legacy outlays without an original category retain Auslagen. The
ordinary manual booking API also persists receipt allocations; import/operator
callers retain their existing semantics unless explicitly opting in.

Credit is replayed as receipt lots. Category earmarks consume only matching
category shares; free credit uses receipt order. New category purchases never
consume credit from a different budget scope. Category repayment into an
off-budget account is refused instead of claiming it restored budget money.

Credit decisions create zero-cash bookings. A debit consumes the selected receipt
lot; the counterline retains free/earmarked credit or records gift income. Free
and earmarked decisions can retain a closed source account; gifts require an
explicit open EUR budget account. The existing zero-booking gift conversion
pattern is retained, with an explicit gift record distinguishing it from legacy
unclassified write-offs. There is no migration or historical data rewrite.

The existing audited `app_setting` table stores `contacts.credit.<booking-id>`
provenance: selected credit source, category earmark, automatic uses and repayment
returns. No per-contact mutable balance is stored. These records and their money
rows can only be undone as a whole action. Final invariants replay all live
movements and reject source changes, partial Undo, invalid category returns or
orphaned provenance. Empty purchase manifests protect against silent backdated
credit use without blocking ordinary edits, gift conversion or deletion.

The statement shows original categories, receipt allocation destinations,
remaining credit and historical earmark labels. The normal booking editor exposes
the balancing category lines and preserves original categories even for a 100%
contact share. Net-zero contacts with both open outlays and earmarked credit stay
visible.

## Historical operator preview

On an explicitly selected operator database copy outside any `private` directory:

```powershell
npx tsx scripts/contact-repayment-dry-run.ts --database C:/operator-copy/budget.sqlite
```

The connection is read-only and query-only; it never opens the application writer,
runs migrations or modifies the database. Output identifies receipt/split/contact
IDs and integer-cent proposed allocations, retained credit, uncertain category
candidates and existing credit-to-income conversions needing owner review. It
omits names, account details and notes. The output may still contain private
financial information and belongs only in operator-controlled storage, never a
commit, issue or PR. Current-model receipts are excluded. Candidate categories
from sibling splits are explicitly uncertain, even when there is only one.
Unrecorded allocations need review; a proposal is not permission to apply it.
For an RTA receipt without a contact split, the proposal uses remaining outlays at
the end of its booking day. It is not a reconstruction of uncertain same-day order.

No production database was opened or rewritten during implementation. An operator
must inspect this report and obtain the owner's separate yes before implementing
or applying any historical correction.
