# Receipts (Y21)

The owner can capture a photo or upload a file in Konten › Posteingang before a
booking exists. `Beleg ohne Buchung` lists these files and offers an explicit
booking search/selection. The booking editor's `Beleg` section accepts new files
and unlinked inbox receipts, shows image thumbnails and downloads, and removes
links with the shared undo/redo toast. Receipt capture never creates a booking.

## Storage and lifecycle

- Owner decision for this task: immutable files on the Fly volume, rather than
  separate receipt object storage. `RECEIPTS_DIR` overrides the directory;
  the default is `receipts` next to `DATABASE_PATH` (`/data/receipts` on Fly).
  An override must stay on persistent storage and be writable by the server user.
  The server refuses a directory inside its public web root.
- Files use the lowercase SHA-256 of the stored, metadata-stripped bytes as their
  entire filename. A temporary file is atomically published before the database
  transaction. Identical bytes share a blob; each upload has independent metadata
  and its own audit action. No client filename can select a filesystem path.
- Additive migration 0019 extends the existing `receipt` placeholder with
  `sha256`, `original_filename`, `created_by`. `size_bytes`, MIME and creation
  time remain; `booking_receipt` supplies n:m booking links with soft deletion.
  Old split-level placeholders remain untouched and are excluded from the new
  file workflow when they have no hash. This is not a migration of external files.
- Upload/link/unlink/remove writes use the existing tracked writes, transactions
  and audit groups. Generic undo/redo refuses dangling receipt links, including
  forced undo. Split edits preserve links. Deleted bookings return receipts to
  the inbox; restoring a booking restores visibility of its retained links.
- Removing an inbox receipt soft-deletes it and any retained historical links.
  Files are retained for undo and old backups. No garbage collector or physical
  erasure is part of this feature. A database failure after file publication can
  leave an unreferenced blob; monitor volume space before enabling many uploads.

## Server boundary

Every route is behind the existing session guard; mutations use the existing
same-origin/CSRF guard and import write lock. Step-up is not required for ordinary
receipt capture. Requests are bounded to 15 MiB plus 64 KiB multipart overhead;
each nonempty file is separately bounded to 15 MiB. Only one file and an optional
booking ID are accepted. Magic bytes, not the extension or client MIME, allow
JPEG, PNG, WebP, HEIC/HEIF and PDF. This is format screening, not antivirus or full
document validation.

JPEG APP1/APP13/comments, PNG EXIF/text and WebP EXIF/XMP are removed without
recompressing pixels. This removes standard EXIF GPS containers and orientation
metadata; there is no pixel reorientation. Verify orientation on the real phone. **HEIC/HEIF and
PDF metadata are retained**: reliable removal requires a decoder/parser beyond
this dependency-free slice. The UI discloses this limitation. PDF active contents
are never rendered inside the app; there is no PDF/HEIF inline preview.

Downloads use `application/octet-stream`, `Content-Disposition: attachment`, a
sanitized RFC 5987 filename, `nosniff` and `Cache-Control: no-store`. Authenticated
JPEG/PNG/WebP thumbnail responses use only the stored server-detected MIME.
Reads verify size and SHA-256 and report missing/corrupt files explicitly.
The photo control uses native HTML file capture (`capture="environment"`), not
`getUserMedia`; the browser's native camera chooser needs testing on the owner's
actual phone. The existing camera permissions policy is retained.

API: `GET /api/receipts` lists unlinked receipts; `?bookingId=` lists a booking's
receipts. `POST /api/receipts` accepts multipart `file`, optional `bookingId`.
`POST /api/receipts/:id/links` accepts `{bookingId}`; `DELETE .../links/:bookingId`
unlinks. `DELETE /api/receipts/:id` removes an unlinked receipt.
`GET .../:id/download` downloads; `GET .../:id/preview` supplies raster thumbnails.

## Backup and owner acceptance

The nightly age backup now seals a TAR containing a consistent `budget.sqlite`
snapshot and every hash-referenced receipt, including soft-deleted rows needed
by undo. Missing/corrupt blobs fail the backup and use its existing inbox alert.
Ciphertext is hashed and streamed to storage, so archive size does not set RAM use.
New keys are `encrypted/budget-YYYY-MM-DD.tar.age`; retention also recognizes old
`.sqlite.age` copies. See [ops section 8](ops.md#8-nightly-age-encrypted-copy-spec-section-9).

Litestream and its automatic empty-volume restore still restore only SQLite.
After volume loss, restore DB **and** receipts from the same encrypted archive.
Old DB-only encrypted copies cannot restore receipt bytes. CSV data export is
unchanged and excludes receipt files. No real owner restore or phone acceptance
is claimed by synthetic tests.

Owner steps after review/deployment: ensure the directory is on the volume,
check space and successful new-format nightly backups, test a photo on the real
phone, and perform an offline encrypted archive restore with the private key.
No new secret or provider consent is required. Keep the existing backup key
offline and continue the monthly independent download until a second target exists.
