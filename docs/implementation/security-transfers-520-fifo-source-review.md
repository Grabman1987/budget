# #520 FIFO normalization — independent source review

Archived review of `1709597413ba00933631c9af22b11a6343a83f65` before the
subsequent pooled-basis projection correction. The P2 and P3 findings below are
preserved as the reason for that source-only follow-up; this document does not
review the corrected checkpoint.

Reviewed `/workspace/impl-520-security-transfers` at **1709597413ba00933631c9af22b11a6343a83f65**, compared with **a5156b399d3c09094b255c32177c0685fb9213a7** and the preceding lineage-policy report. Scope: two pure helpers and their documentation. No source changes, tests, checks, compilers, builds, browser, CI, database, API, apply, integration or deployment performed. Only source reads/read-only Git inspection and this external report were used. Findings below are source reasoning, not executed validation.

## Result

The bounded FIFO financial interpretation is source-scoped clear: proven same-original-acquisition fragments are grouped before both transfer allocation and sale calculation; full disposal is no longer rejected for artificial fragment ties. One average-input compatibility defect in the new ancestry handling should be fixed before calling the entire slice source-scoped clear. A documentation checkpoint label also needs correction.

## P2 — Average projection can return ancestry that the next preview rejects

Location: `packages/domain/src/invest/security-transfer-preview.ts:187`, `:324–325`, `:336–338`.

The helper permits moving-average evidence with numeric current fragment bases, provided any explicit pool total agrees. A valid `received` fragment can therefore have, for example, 1 unit / 10 cents and a source ancestor with the same 1 unit / 10 cents, correct pair/leg identities, consistent accounts/dates and matching linear path. This passes `validDerivation` and the normal average pool-evidence rules.

The average output then sets its current `basisCents` to null while retaining the existing derivation. This happens unconditionally for `destinationExisting`, and for a full source-fragment move at lines 324–325 because the new `allocated` derivation is only added for partial moves. The retained `received` derivation still references its numeric-basis source. On the next preview, line 187 rejects null versus 10 as an inconsistent received basis. Appending the next real receipt node does not help: traversal still reaches that inconsistent inner node. Aggregate units, pooled basis and E8 proportionality can all be perfectly valid.

This is not a requirement to support method switching from an existing FIFO state: numeric average fragment evidence is already explicitly supported by this helper. The pure zero-opening average replay currently initializes all fragment bases to null, so this particular failure affects the preview's supported numeric-evidence boundary rather than its current replay-generated average histories.

Minimal correction: make conversion from known fragment cents to pooled-only provenance explicit and self-consistent. For example, preserve the complete numeric received snapshot under a dedicated pooled-basis projection node with unchanged units, rather than overwriting the node that asserts receipt equality. Alternatively, distinguish a current average null-basis projection in the validator while preserving and validating the numeric historical receipt. Keep FIFO received-basis equality strict, preserve known/null pool-evidence conflicts, and retain all existing average arithmetic and E8 rejection behavior. Do not “fix” this by discarding the received ancestry or rewriting its historical numeric source.

Source-derived acceptance expectation: valid numeric average received evidence, both as an existing destination fragment and as a fully moved source fragment, must produce lineage that can be supplied to the next preview with explicit pooled basis and actual receipt identities. This expectation was not executed.

## P3 — Documentation identifies the old checkpoint as the completed FIFO slice

`docs/implementation/security-transfers-520-NOT-VALIDATED.md:9` calls `a5156b399d3c09094b255c32177c0685fb9213a7` the “subsequent implementation-only FIFO slice.” That is the pre-normalization review checkpoint. Label it “based on” that checkpoint, or identify the actual implementation commit separately. The archived policy report correctly identifies itself as pre-implementation reasoning.

## FIFO conclusions and limits

- `normalizeFifoAcquisitionFragments` groups by original acquisition ID within its caller's account, sums current units/basis using BigInt intermediates, retains original date/order, and keeps contributing records under a reunion node. Both actual callers establish the needed input constraints first: preview validates documented evidence and safe aggregate limits; replay creates its own fragments from validated events. The exported normalizer is an internal assumption-bearing helper, not a standalone validated public financial boundary.
- Preview still rejects unrelated tied acquisition positions, inconsistent date/order for an acquisition, duplicate current fragment handles, unknown FIFO basis, unsupported currency and limits. Replay's globally unique date/sequence positions and acquisition identities prevent unrelated ties; its sale ambiguity check now examines normalized lots.
- The stated 2-unit/1-cent acquisition arriving as 1/0 then 1/1 is normalized to 2/1. The transfer path uses floor once on this lot, so a subsequent 1-unit transfer carries 0 and leaves 1. The sale path projects this lot to existing `fifoCost`, so the corresponding sale consumes 1 under half-up and leaves 0. Full consumption carries/consumes all 1 cent. Remaining actual disposal changes are retained; original acquisition basis is not restored after a sale.
- Reunion removes the single linear transfer path instead of concatenating branch paths. Later receipt nodes retain actual pair/out-leg/in-leg identities, date and account boundary. Partial allocation and sale remainder nodes retain their predecessor. The helper implementation creates new derived objects and does not mutate predecessor records during replay; readonly typing communicates the borrowed-preview-input contract, rather than providing runtime deep freezing of arbitrary caller objects.
- Ancestry traversal is iterative, detects object cycles, bounds visited nodes and reunion width, checks acquisition identity/date/order and known FIFO basis throughout, verifies reunion sums, rejects decreasing dates and conflicting established account boundaries, and checks receipt equality/path extension. It validates supplied structure; it cannot prove external pair existence, disjoint ownership or persisted same-day event order. The existing documented-input/authoritative-reader limitation remains essential.
- Average pool-floor arithmetic, canonical sale half-up and exact-E8 divisibility rejection remain unchanged. Rational average ancestry remains explicitly deferred. The compatibility issue above arises from newly added provenance structure, not a changed cost formula.
- No claim is made about executable correctness, Stage-A acceptance, canonical caller integration, authoritative database provenance or safe apply. The NOT-VALIDATED boundary remains appropriate.

## Narrow correction re-review — uncommitted delta atop 1709597413ba00933631c9af22b11a6343a83f65

Independently read the subsequent source diff and archived-review heading. P2 is addressed: numeric average fragments now acquire a separate `pooled-basis` projection preserving their complete numeric predecessor, before any partial allocation wrapper. Full moved fragments and existing destination fragments preserve that projection too. Validation permits this node only for average, with unchanged units, null current basis, numeric predecessor, inherited path/account and nondecreasing date; ancestor traversal still validates the numeric received node and its strict basis equality. Existing all-null fragments need no projection. Pool-evidence conflict checks and cost/E8 arithmetic are untouched.

P3 is addressed by identifying 1709597413ba00933631c9af22b11a6343a83f65 as the implementation and a5156b399d3c09094b255c32177c0685fb9213a7 as its base. The archived review clearly states that its findings predate this correction.

No further actionable finding in this narrow source delta. Source-scoped clear for P2/P3 correction, subject to the original nonvalidation boundaries above. This re-review describes the uncommitted delta inspected, not an independently verified later commit. No tests, executable checks, build, browser, source edits or delivery actions were performed by the reviewer.
