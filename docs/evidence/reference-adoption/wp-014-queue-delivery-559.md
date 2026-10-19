# #697 — existing booking-delivery assurance slice (parent #559)

Refs [#697](https://github.com/Grabman1987/budget/issues/697), a bounded test-only child of [#559](https://github.com/Grabman1987/budget/issues/559). This is a test-only slice over the existing booking queue. No product write, schema, test/configuration rule, existing test or financial calculation changes. **It does not implement offline physical receipt files and does not complete #559.** The owner explicitly requested a separate offline-file retry on 2026-10-19; that additional work remains open.

## Terms and existing boundary

`booking_delivery` is a technical idempotency record containing a request hash and saved response. It is never a physical receipt/Beleg. The current `QueuedBooking`/`BookingCreate` contains booking JSON, not files or receipt references. Physical uploads are separate actions: [receipts](../../receipts.md) states that receipt capture never creates a booking, identical bytes share an immutable blob, and each deliberate upload has independent metadata and audit. A failed later file upload must preserve its already-saved booking.

The proof imports unchanged `submitCapture`/`sendQueue`, the real client JSON request function, real Hono booking/undo routes and SQLite repositories. Only the device-store adapter and network-loss boundary are injected. A no-op signed-in middleware fixture makes authorization an explicit precondition, as in existing ledger API tests; this is not WebAuthn, CSRF/session, native IndexedDB, cross-tab locking or production assurance. No physical file is read or written, and the physical `receipt` table is explicitly empty.

## Literal state and three meaningful failure cases

The existing synthetic fixture starts Giro at **100000 cents**. The request is **−1375 cents**, with **−1000 / −375 cent** splits; expected balance is the independent literal **98625 cents**. Undo restores **100000**, redo restores **98625**. No expected amount is calculated from the function under test.

1. Two replies are lost **after** the real server commits/returns success. The real queue persists uncertainty before every POST and retains exactly the same key and request body. The third delivery clears the head. There is one new booking, one new payee, one technical delivery record and no replayed financial/audit change; complete ordered rows are compared after each replay.
2. The server commits successfully, then local queue deletion fails. The same uncertain item survives and the next real queue delivery receives the original response without a second booking or audit action.
3. A temporary SQLite trigger rejects the **final** `booking_delivery` insert after booking, splits, a new payee, recurring payment/version and audit work have succeeded within the existing transaction. Every ordered financial/audit row matches the prior state, balance remains **100000**, and the key remains reusable. Removing the trigger permits the same queued key/body to succeed, including a **1375-cent EUR** recurring version starting **2026-11-19**.

Every successful write in these cases is undone and redone through the unchanged real undo route. A duplicate request arriving while undone returns the prior response while preserving the full undone state; it never revives a booking or releases its delivery identity. Foreign-key checks remain empty. Database connections and global transport stubs are closed/reset after every test.

## Validation

Focused validation passed **5 files / 87 tests**, including all three new failure/undo cases and the four unchanged suites listed below. Both existing web/server TypeScript configurations, targeted ESLint and formatting/diff checks passed. Independent Codex whole-diff review of frozen `ffd66f4258a277d5c34dd2fc450bcb3e819c60c0` was **CLEAR**; its separate rerun of all three new integration cases passed and both frozen-file hashes remained unchanged. The review confirms this is only the booking-delivery assurance slice, not physical-file acceptance. The serialized repository-wide age check/build remain pending after this evidence-only child-issue clarification; the reviewed test source is unchanged. No full-suite or release claim is made from focused totals.

```sh
npx vitest run apps/web/src/pwa/queue-delivery-proof.test.ts apps/web/src/pwa/queue.test.ts apps/server/src/api/api.test.ts apps/server/src/api/booking-ux.test.ts apps/server/src/api/receipts.test.ts --maxWorkers=1
npm run typecheck -w @budget/web -w @budget/server
npx eslint apps/web/src/pwa/queue-delivery-proof.test.ts
```

Required unchanged regression scope: `apps/web/src/pwa/queue.test.ts`, `apps/server/src/api/api.test.ts`, `apps/server/src/api/booking-ux.test.ts`, and `apps/server/src/api/receipts.test.ts`. Existing native browser queue coverage in `e2e/offline-queue.spec.ts` remains unchanged; the new proof does not replace it.

## Open physical-file work

The approved next design must give each deliberate upload a stable distinct intent key: retrying one uncertain intent yields one physical receipt/link, while deliberately uploading identical bytes twice still creates two metadata/audit actions sharing one blob. The file queue must retry separately, preserve a previously saved booking on upload failure, and explicitly preserve existing privacy/auth/undo boundaries. No physical-file acceptance is inferred from the technical delivery row in this slice.
