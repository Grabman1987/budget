# Offline source checkpoint — NOT VALIDATED

Refs #558, #559, #699, #700. Base: `6420676d257698767931dd151863765cec914acf`.
Owner implementation-only direction (2026-10-22) forbids new tests, test runs,
typechecks/builds/browser validation, CI dispatch, PR creation, merge and deployment.
None were performed. This is source implementation, not accepted or live delivery.

- #558: reuse protected snapshot provenance/epoch store from prepared `4529f404`;
  add capture hook for completed authorized HTTP responses, current-month-only Plan,
  unfiltered latest first booking page, and a separate read-only local viewer with
  Vienna timestamp. Query-cache or optimistic values never establish provenance.
  Local views have no cached authentication or write controls. Read copies clear
  through existing device cleanup. Authenticated routes remain hidden/inert during
  local viewing so a connection change does not discard unsaved inputs.
- #559/#699: reuse native IndexedDB Blob intent store and separate bounded FIFO
  delivery from `83505ed1`. Acknowledgment removal remains fenced; lost/auth/server
  failures preserve immutable bytes, key and target. Once a native claim starts,
  uncertainty is monotone, including after 400/413/415/422 responses: a later
  refusal cannot establish that an earlier or concurrent attempt was undelivered.
  Only the existing valid same-key acknowledgment removes the claimed intent;
  safe cancellation applies only before any claim. This conservative rule may
  retain a first-attempt validation refusal for manual retry/clarification.
  Explicit sign-out fences erase raw files, while expiry retains them. The text
  booking queue and existing saved bookings are unchanged.
- #700: existing receipt selection now always persists an upload intent before
  transport. Shared picker retains the selected File in memory on persistence failure;
  raw-file queue shows pending/uncertain/rejected state, manual retry and safe cancel.
  Cold-local capture creates unlinked uploads. Successful delivery uses existing
  grouped Undo. Raw formats are not previewed; same-origin metadata/eviction limits
  and explicit sign-out deletion are disclosed.
- #698 API, additive schema and delivery cache already exist at the base and were
  deliberately not duplicated. Service worker already excludes API responses and
  caches only app shell assets; it was not changed.

The independent review of `f24d665fd69019f5b563977390f76fcef5d0ae4a` is
archived in `offline-558-700-SOURCE-REVIEW.md`. Its two P2 findings have bounded
source corrections here: monotone uncertainty across rejection/concurrent claims,
and `maskMoneyText` on SavedToday finance-check value text. The separate, unapplied
`docs/handoff/offline-574/01-offline-section-adapter.patch` carries the same
value-text mask and masks its adjacent unavailable-wealth diagnostic. Preserve those
lines when applying that patch once in the eventual #574 combined tree.

The coordinating owner applied all six shared-file integration patches into this
checkpoint. Base-relative copies remain outside the checkout at
`/workspace/.budget-tools/impl-offline-558-700/`: `01-http.patch`,
`02-security.patch`, and the four `03`–`06` consumer hook patches. These are
base-relative source patches for the respective owners. The four two-line consumer
hook mounts must survive later integration of those owners’ view changes.
HTTP integration combines the two prepared protocols and optional confirmed-login
queue recovery. Security integration starts raw-byte wipe at explicit logout intent,
independent of logout HTTP; failed erasure remains fenced and visibly unresolved.
Generic auth expiry cleanup does not erase raw-file intents.

Remaining: preserve those shared hooks/boundaries during cross-owner integration;
independent review of this exact correction head; all acceptance evidence (real Blob restart/lost acknowledgment/quota/privacy,
literal booking/receipt/idempotency/Undo, desktop/mobile/WebKit/a11y), ordinary
required exact-head checks and authorized deployment/live verification. Existing
historical evidence belongs to its original prepared commits, not this checkpoint.
No issue is closed or claimed complete.
