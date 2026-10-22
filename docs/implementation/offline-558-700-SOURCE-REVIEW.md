# #558/#559/#699/#700 offline and receipt package — independent source review

Pinned head: `f24d665fd69019f5b563977390f76fcef5d0ae4a`.
Own package base: `6420676d257698767931dd151863765cec914acf`.
Branch/worktree: `codex/impl-offline-558-700`, `/workspace/impl-offline-558-700` (located through read-only worktree inventory).

Reviewed the own 20-file/2,286-added-line package delta, its NOT-VALIDATED handoff, and only the inherited API/auth/receipt/privacy/domain contracts needed to assess that delta. The large inherited application history was not re-reviewed. The final commit also contains a separate, unapplied #574 compatibility patch; findings distinguish that handoff from active runtime source.

Source inspection only: no tests/checks, typecheck, build, browser, network/upload, database/provider/CI operations or repository edits. No private data was opened, and no previously rejected #699 private operation was repeated.

## Findings

### P2 — A later validation/transport rejection incorrectly clears earlier delivery uncertainty

`apps/web/src/pwa/receipt-queue.ts:61–65` treats every HTTP 400/413/415/422 as a conclusive rejection and invokes `rejectReceiptUpload`. `receipt-queue-store.ts:487–492` unconditionally changes the durable intent to `uncertain:false`. Cancellation then permits deleting its only retry key.

Concrete source-derived sequence: an upload commits on the server but its 201 response is lost; the immutable intent remains uncertain. A retry later receives an upstream 413 or a 400 from a rollback server that rejects the new `uploadIntent` field. Neither response establishes whether the earlier request committed. Nevertheless the client makes the intent cancellable. After removal/reselection, a fresh UUID can duplicate the already-created receipt/link action. The inherited receipt API explicitly anticipates rollback servers, and its idempotent lookup is after multipart/file validation; the client cannot infer prior non-delivery from this status code alone.

There is also a concurrent form of the same gap without Web Locks: `claimReceiptUpload` intentionally permits repeated same-key claims, relying on server idempotency. One request's rejection cannot establish that another request has not succeeded or is no longer in flight.

Minimal correction: make prior unresolved delivery uncertainty monotonic across retries and concurrent claims. A complete first-attempt validation refusal may become cancellable only if an atomic attempt/provenance fence proves there was no previous ambiguous attempt and no competing claim. Otherwise preserve bytes, target, key and uncertainty until the existing same-key acknowledgment arrives. Do not rotate keys or infer non-delivery from bare HTTP status. A bounded attempt generation/prior-attempt latch in the existing intent store is sufficient; this does not require a booking-writer change or a new server financial policy. Conservative retention is preferable to falsely advertising safe cancellation.

### P2 — Saved finance-check text leaks an amount when privacy is enabled

`apps/web/src/pwa/read-snapshot-viewer.tsx:99` renders `item.valueText` without privacy formatting. The domain `rules/check.ts` includes R07 among `KEY_RULES`, and `rules/evaluate.ts::r07` produces `Tiefpunkt <EUR amount>` in that exact field. `useAmountPrivacy()` only rerenders the viewer; it does not mask arbitrary strings. Thus a saved Heute view can show its numeric amounts masked while disclosing the liquidity low through R07.

The same raw output is duplicated at line 233 of the **unapplied** `docs/handoff/offline-574/01-offline-section-adapter.patch`, so correcting active source alone would reintroduce it on companion integration.

Minimal correction: use the existing `maskMoneyText` for returned monetary rule text in active SavedToday and the prepared section adapter (and any adjacent monetary diagnostic rendered by that adapter). Retain original stored DTOs; masking belongs only at presentation.

## Source conclusions outside those findings

- Receipt selection persists a native IndexedDB Blob intent before network transport. Byte content, filename, booking target and UUID are not replaced by retry/status updates. Quota/storage failure retains the selected File in the picker instead of claiming durable success. A cold-local picker creates an unlinked upload; it does not invent a booking target.
- Receipt delivery has a separate lock/pass from the text-booking queue. The exact multipart transport reads only a claimed durable intent and posts to the fixed same-origin `/api/receipts` endpoint with both the idempotency header and uploadIntent field. No arbitrary URL/body capability was added. Existing authenticated server routing, origin protections, request limits and no-store remain inherited boundaries.
- The inherited #698 endpoint binds a key to raw digest, detected MIME, sanitized name and booking target, repeats the lookup inside the transaction after file I/O, and publishes receipt/link plus response cache atomically. A cached acknowledgment survives Undo without recreating the action. The new client requires a 201 with bounded UUID-shaped receipt/group IDs before acknowledging local removal. Financial booking writers and the server receipt API/schema are unchanged by this package.
- Lost network/auth/5xx/conflict outcomes preserve the key and bytes. Native epoch and transaction fences protect late acknowledgment/status operations against explicit sign-out; failed cleanup does not recreate old payloads. The rejected-response exception is the first finding.
- Explicit sign-out starts a durable local/native hold and raw-byte wipe before awaiting logout HTTP. Failed wipe/release remains fenced and visibly disclosed. Session expiry retains raw intents. Confirmed login/recovery uses an opaque, single-use pre-request recovery snapshot, preserving newer holds rather than blindly clearing every reservation. Same-origin markers are not claimed to be authentication or encryption.
- The app is single-owner. The local raw queue does not claim account/session authorization; each upload meets the live server session and target validation. Explicit sign-out erases raw pending files while existing text-booking retention remains unchanged. No speculative multi-user storage model is required for this bounded scope.
- Snapshot provenance starts before an allowlisted request, is enabled only by an actual authenticated status response, clones the completed response before query-cache consumers can mutate it, and checks generation/epoch/logout fences before persistence. Query-cache values do not establish authorization or snapshot provenance. Auth expiry clears read copies without erasing receipt intents.
- Stored views are separate, read-only DTO presentations with timestamps in Europe/Vienna. Plan capture is current-month-only and the viewer rejects an old month instead of relabelling it; booking capture restricts itself to the unfiltered latest page. Monetary numeric fields use existing private formatters; rule text is the exception above. The shell hides/inerts mounted authenticated content while showing local copies, retaining drafts without granting cached authentication or adding financial write controls.
- The shared HTTP guard permits only existing queued booking replay, exact claimed receipt delivery through its separate helper, and bounded auth-reconnect ceremonies. Service worker API exclusion is inherited and unchanged. Neither financial snapshots nor raw document bytes are added to shell cache. Storage/metadata and browser-eviction limits are disclosed, and raw file formats are not previewed.
- #574 remains a committed integration handoff, not active behavior at this head: it names its companion SHA and preserves separate section stand/timestamps, with native read/merge/write and epoch checks. It does not fabricate a complete aggregate from missing sections. This review did not apply that patch or claim combined integration acceptance.

## Regression boundaries and disposition

The two correction cases are the material remaining source concerns: previously lost acknowledgment followed by later rejection/concurrent claim; and R07 monetary text under privacy. Subsequent authorized executable acceptance should also exercise the existing promised Blob restart/quota, sign-out/late-response, exact key/target retry and grouped Undo cases. None were executed for this review.

Correct the two bounded P2 findings and obtain a narrow pinned source re-review. No new product decision, private-data access, migration or booking-writer change is needed. This package is not runtime-validated, merged or deployed; inherited historical evidence cannot be attributed to this head.
