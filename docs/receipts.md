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
are never embedded inside the app. Payroll review can request one inert PNG page; raw PDFs and HEIF remain download-only.

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

## Inert PDF page preview (#609, source implementation; validation pending)

`POST /api/receipts/:id/pdf-preview` is a read-only, session- and same-origin-guarded
request with strict JSON `{page, preset?, password?}`. Page is 1–30, preset is `fit`
(default) or `detail`, and the transient password is at most 1,024 characters. The
ordinary body limit and import hold apply. This POST does not notify financial
write listeners, reparse a document, retain a password, create an audit entry or
change a receipt/booking. Existing image and opaque download routes are unchanged.

The service verifies the live PDF receipt's size and SHA-256 against the same
bounded buffer passed to the renderer, which verifies the digest again. It
rechecks the live receipt identity after rendering. No caller path or URL enters
the worker. Responses contain only PNG bytes and finite `X-PDF-Page`,
`X-PDF-Pages`, `X-PDF-Width` and `X-PDF-Height` headers, with `no-store` and `nosniff`.
Wrong password, unavailable page, source change, busy renderer and processing limits
have fixed messages; library diagnostics and private source content are discarded.

One server-wide renderer slot per process has no waiting queue; admission precedes
file loading. A 20-second cancellation deadline covers source reading and rendering.
Abort/deadline stops subsequent work and terminates the worker, but in-progress
filesystem operations must finish/close and worker termination must complete before
the slot is released. It is not a hard wall-clock guarantee. There is no generated
image cache, new file, external asset fetch, PDF viewer, annotation/XFA layer or CSP
change. PDF.js uses only its packaged fonts/cMaps/wasm and its own optional Node
canvas facility; application code does not import the optional renderer directly.

Limits are 15 MiB source, 30 document pages, one page per request, 2,048 pixels per
surface side, 4,194,304 pixels per surface/image, 16,777,216 simultaneously tracked
canvas pixels and 8 MiB encoded PNG. Both factory create/reset paths enforce the
surface budget. Actual oversized-image rejection versus omitted-content behavior still requires execution evidence. These
limits do not bound all decoded image/font buffers or PNG encoder peak allocation.
`canvasMaxAreaInBytes` is only an image-resizer setting; the worker’s 128 MiB limit
covers V8 old-generation heap, not native Canvas/Skia or total process RSS. No hard
native-memory isolation or cross-instance renderer quota is claimed. Optional
native-renderer failure leaves preview unavailable and the original downloadable.

The receipt-local view keeps only current-page pixels and a transient preview
password in component memory. Page/zoom changes remove previous pixels; source
switch, close, unmount and privacy mode remove the entire session and abort its
request. There is no persistent React Query, offline or browser-storage entry.
Privacy mode covers the whole image, because text masking cannot conceal amounts
inside pixels. The existing explicit original download remains available and is
not privacy-masked. Garbage collection is not a claim of forensic memory erasure.

This source-only checkpoint has not executed rendering, native-platform loading,
limit/abort/source-race tests, accessibility or desktop/phone verification. Those
gates remain pending. The preview itself never authorizes payout normalization; the separately explicit, audit-proven subset is documented in payslip-intake.md.

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
