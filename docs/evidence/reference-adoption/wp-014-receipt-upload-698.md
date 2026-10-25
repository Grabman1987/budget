# Physical receipt upload delivery (#698)

Refs #698, the server/schema child of #559. Owner decision on 2026-10-19:
“Ja: Offline-Belegdateien mit separatem Retry ergänzen”. This slice makes one
physical upload intent safe to retry. It does not yet implement the device Blob
queue (#699), entry/retry/logout UI (#700), or complete parent #559 acceptance.
A technical `receipt_delivery` acknowledgment is distinct from the physical
`receipt` metadata, immutable file and optional `booking_receipt` link.

## Reproduced gap and behavior

Before the change, the new same-key upload test failed against main `297a574c`:
the second upload returned a different physical receipt ID and audit group.
The old route ignored `Idempotency-Key` and created another metadata action.

The existing authenticated upload endpoint accepts an optional 16–80 character
ASCII letter/digit/hyphen `Idempotency-Key`. Its durable request hash covers an
operation version, original raw-file SHA-256, signature-derived MIME, sanitized
filename and optional saved booking target. The original successful response is
retained. An identical retry returns that acknowledgment with status 201;
changed content, filename or target returns 409. This remains an acknowledgment
after undo or booking deletion and cannot resurrect any row. Intents have no
expiry or undo-driven key release. Authentication, origin and no-store middleware
still apply before cached replies; a cached session or client-side check grants
no permission.

New offline clients must also send multipart `uploadIntent` equal to the header.
This API accepts that matching marker, rejects duplicate/file-valued/mismatched
markers and a marker without a header with 400 before storage. Older servers
reject this unknown form field, so an application downgrade cannot silently
ignore a queued retry key. Header-only requests remain supported. Deliberate
uploads need fresh keys: identical bytes uploaded under two new intents create
two independent physical metadata/link/audit actions sharing one immutable blob.
Legacy uploads with neither key nor marker preserve that independent behavior.

Signature/size checks and metadata stripping remain in the existing path. Only
the raw digest enters the canonical hash; raw EXIF/text metadata is not stored in
the acknowledgment table. Immutable sanitized bytes publish before the database
transaction, as before. Inside that transaction the key is checked again after
awaited file I/O, then metadata, optional link, audit and the delivery record
commit atomically. A late link/delivery insertion failure leaves all those rows
unchanged, retains the already-saved booking and its cents, and permits retry.
The existing retained immutable-blob policy can leave an orphan on DB failure;
this change does not delete files or introduce a compensating booking mutation.

## Additive migration and rollback boundary

Migration `0044_receipt_delivery` adds one technical table and no financial
columns. A new test builds a synthetic ledger using only the preceding 44
migrations, closes it, copies its SQLite file and applies the new migration to
the copy. Every old table row, including ordered raw audit rows and splits, is
compared exactly (only the migration journal grows). Literal account balance is
98,625 cents after a −1,375 cent booking with −1,000/−375 cent splits from
100,000 cents. The original source file remains on the old schema.

On a disposable copy with an **empty** new table, the test removes only that table
and migration-journal entry, proves the original rows/journal remain exact, then
reapplies. Once an upload is acknowledged, application rollback must retain the
additive table and its keys: dropping populated delivery records would allow a
later uncertain retry to duplicate an action. An older migration runner is run
against a populated copy and preserves those acknowledgments and all old rows;
the new runner can then resume. There are no destructive production commands or
claims that dropping a populated cache is safe. Foreign-key checks stay empty.

## Synthetic verification

New `apps/server/src/api/receipt-delivery.test.ts` exercises the actual app's
cookie/session/origin middleware, real Hono receipt/booking/undo routes, SQLite
and a temporary immutable-file directory. Its disposable known-session fixture
does not establish a new WebAuthn ceremony assurance. It proves lost replies,
concurrent same-intent retries, independent identical-byte intents, legacy
uploads, raw metadata binding and stripping, conflict/no-write cases, malformed
markers/keys, target/magic/size bounds, atomic late failures with reusable keys,
undo/redo and booking deletion without replay resurrection, and denial of cached
replies to unauthenticated/cross-origin requests. Stored bytes equal a literal
68-byte synthetic PNG with SHA-256
`3fd24bcfdb17a6027c5f3ed896d17a020d6ff9d9e4d06362461a9b44b6ac1b52`.

New `packages/db/src/receipt-delivery-migration.test.ts` proves the real copy
migration/empty reversal/retained-key rollback boundary above. Existing tests,
manifests, financial calculations, receipt storage policy and auth rules are
unchanged. All data, credentials and directories are disposable synthetic
fixtures; no production storage or user backup is accessed.

Commands:

```sh
npx --no-install vitest run apps/server/src/api/receipt-delivery.test.ts packages/db/src/receipt-delivery-migration.test.ts apps/server/src/api/receipts.test.ts --maxWorkers=1
npm run typecheck -w @budget/db
npm run typecheck -w @budget/server
```

Targeted run passed 3 files / 30 tests (24 new and 6 unchanged receipt cases).
Existing database/server TypeScript configurations and scoped ESLint passed.
Independent HIGH whole-eight-file Codex security/migration review at
`c6672ceb086b386cff5c242893c5cc20c15d8e6a` was **CLEAR**. Its own 30/30
rerun passed, as did separate persistent-database close/reopen/new-app replay
and competing same-key PNG/PDF probes (201/409, one physical action). All eight
frozen hashes remained unchanged.

At that unchanged head, serialized
`BUDGET_REQUIRE_AGE=1 VITEST_MAX_WORKERS=2 npm run check` passed
**489 files / 4443 tests** and `npm run build` passed. All eight hashes were
verified unchanged again after both processes exited, with a clean worktree.
This final delta records results only; product/schema/test sources remain frozen.
Exact-head CI and deployed verification remain pending.
Parent #559 stays open for the actual device queue/UI and complete live criteria.
