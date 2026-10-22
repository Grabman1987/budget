# #520 split — bounded correction review

Reviewed exact head `da3e0b3a9cdac012a6c7b6e6af412cc7f046dc7b` against `76b49651e06ca7eb1cc41bd5c2d40eeaf16fbcf8` in `/workspace/impl-520-security-transfers`. Scope: both findings in `520-split-source-review.md`, the changed ancestry traversal and its callers, and the documentation delta. Source inspection only; no tests/checks, build, runtime, database/provider operations or repository edits.

**Both reported P2 findings are closed at source level. No additional actionable finding in this bounded correction.**

- Every pre-split vector member is now placed on the same iterative ancestry stack. On completion, each member's established account and latest ancestry date are checked against the split account/date. Thus the earlier other-account vector example fails, and an invalid derivation on a nonselected lot is traversed and rejected.
- Each vector branch carries its own acquisition identity/date/order expectation. Ordinary ancestry and reunited branches retain that expectation; the selected source is explicitly required to match its output acquisition. The correction therefore validates mixed-acquisition vectors without incorrectly requiring every lot to belong to the selected acquisition.
- Active-node cycle detection and completed-node memoization cover nested vectors. Stack processing and vector visits consume the shared work budget, and the existing node/vector limits remain. Sequential split snapshots can share earlier vector objects without being mistaken for an active ancestry cycle.
- All vector members now pass identity, string/date, order, positive safe units and known safe basis checks before ordering. The malformed `acquiredOn: null` example is rejected before `localeCompare`.
- Repeated split IDs must agree on their scalar signature and exact ordered source objects within the shared FIFO preview adjustment map. A shallowly equal replacement with different ancestry is rejected. This is the current in-memory evidence contract; this review makes no claim about future serialized persistence or rehydration.
- Allocation arithmetic, unchanged cents, canonical sale/transfer rounding, average unit-adjustment graph logic, replay ordering and reader mapping are untouched by this fix. Documentation archives the initial findings and accurately leaves executable acceptance unclaimed.

This closes the two narrow source findings; it does not establish runtime correctness, AC-009-06 completion, database/API/apply readiness or integration approval.
