# Ledger delete (#597): private implementation checkpoint

Owner #479 decisions of 16 October and issue #597 govern this package. Ordinary unlocked/unlinked deletion is immediate with grouped Undo; protected single deletion retains canonical writer guards and adds an explicit confirmation; bulk deletion previews selected/eligible totals and named exclusions, then excludes locked/linked rows and offers one grouped Undo.

Base: verified live `45b2762521c66fb8d0be6fb346bcb688836f63dc`. Checkout B is the sole source workspace; completed #544 branch is preserved. #594 remains a separate PR. No #515 or #597 sibling scope is included.

## Contract conflict awaiting coordination

The existing `api.test.ts` transfer bulk-delete regression requires both selected transfer legs to be deleted. The owner's #597 bulk contract requires linked rows to be skipped. This is a protected semantic conflict, not a selector change. No existing bulk transport, canonical writer or old financial oracle has been changed. The coordinator escalated the choice to the root. No parallel write route is introduced while that choice is unresolved.

## Current changes and test reasons

- `booking-delete-597.test.ts`: new literal read-only preview fixtures. Eligible EUR -1234 + 567 = -667; foreign USD -4321 remains separate. A reconciled EUR -890, contact-linked EUR -300, and both transfer legs are named exclusions. Complete selected EUR is -1857 (the two transfer sides cancel). Exact booking/split state and the entire pre-preview audit table must remain unchanged. A changed selected memo invalidates the source fingerprint; duplicate/reordered IDs retain the same fingerprint.
- `bookings.ts`: read-only `/delete-preview`, using the current #596 authoritative ownership reader. It computes eligible totals through the same reader and hashes full current row/split snapshots plus the audit head internally; no raw snapshots leave the server. The head is a conservative ABA fence, including Undo. No writer behavior has changed.

Tests were authored before the read route. Runtime RED/GREEN, static checks, independent HIGH financial/security review and browser acceptance remain pending under the owner's no-local-runtime/private-source instruction. No VM, push, PR, merge, or live claim is made.
