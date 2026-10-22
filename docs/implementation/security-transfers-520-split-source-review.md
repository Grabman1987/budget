# #520 split source review

Reviewed head `76b49651e06ca7eb1cc41bd5c2d40eeaf16fbcf8` against exact parent/base `a5c7216743253f20f8dcbbff9f4f7930e7053249` in `/workspace/impl-520-security-transfers`. Four-file delta: pure preview, pure replay, recorded-history reader, NOT-VALIDATED handoff. Source inspection only; no executable validation, tests, build, database, provider, or repository modification.

## Findings

### P2 — Validate every member of the split vector, not only the selected source

`packages/domain/src/invest/security-transfer-preview.ts:263–278,296`: the new `unit-adjusted` proof checks scalar facts and `fragmentLatestDate` for the complete pre-split vector, but traverses full ancestry only for `derivation.source`. The other vector members determine the denominator and last-lot remainder without having their account, arithmetic, transfer path, or ancestry validated. `fragmentLatestDate` is merely a date scan, not a substitute for `validDerivation`.

Concrete source-derived case: selected acquisition A has 100,000,000 E8 and 100 cents in account X; a second, later acquisition B has the same units/basis but a receipt that establishes its current account as Y. A split proof for X using `[A,B]` and delta +100,000,000 E8 can certify A's 150,000,000 E8 output. B's receipt date passes the scan, yet its contradictory account is never inspected. B need not be a current top-level fragment, because the vector is historical evidence. Similarly an invalid derivation on B can be hidden there. These inputs were reasoned from source, not executed.

Minimal correction: fully validate every pre-split member at the split date and account, preserving each member's own acquisition identity; validate nested split vectors as well. Share memoization, active-cycle detection, adjustment-identity consistency and a bounded work budget across this graph. Do not simply push mixed acquisitions through the current root-wide same-acquisition comparison. Include validated vector ancestry in consistent evidence handling rather than treating shallow scalar equality as proof of identical history.

### P2 — Reject malformed vector members before sorting

`packages/domain/src/invest/security-transfer-preview.ts:261–273`: `fifoSplitLotUnits` validates units, then `ordered(sources)` calls `acquiredOn.localeCompare` before the new member date/identity checks. A nonselected member with positive safe units and `acquiredOn: null` causes an exception instead of an unavailable result. The public preview explicitly validates caller evidence and should retain that fail-closed result contract for the added nested input.

Minimal correction: check member object/scalar shapes, including string/date and acquisition order, before sorting, mapping signatures, or using those fields. This is a source-derived malformed-input path, not a runtime reproduction.

## Bounded positive findings

- FIFO signed allocation implements exact `floor(x + 1/2)`, including negative half-ties, compares the result with existing `Math.round`, and assigns the residual to the final lot. Positive safe pool/lot outputs are required. Lot cents and original acquisition date/order survive.
- Replay checks zero amount/fee/tax and signed E8 split rules, normalizes reunited acquisitions, and compares aggregate results with the existing canonical cost calculation. Reverse splits that eliminate a lot return unavailable.
- Average uses a distinct integer unit-adjustment node. It retains acquisition/event ownership shares, adds a conserved split-output key, checks before-mass/account/date/security, and shares split signatures between preview pools. Subsequent analytical fractions scale those ownership budgets normally. No concrete new defect found in that bounded path.
- Reader maps native split rows into its established per-account canonical date/buy-first/stable DB order, with existing canonical position comparison. No writer, API, schema, or apply capability is introduced.
- Replay-created vector arrays are snapshots retained separately from later account arrays. This does not cure the caller-supplied nested-evidence gaps above.

Conclusion: two bounded P2 corrections remain before this split delta is source-clear. No new financial policy decision is needed. This review does not establish runtime correctness or AC-009-06 completion.
