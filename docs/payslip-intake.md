# Automatic payslip intake

New payroll PDFs enter **Posteingang**, from the Gehaltsreport/Posteingang upload or
an optional nightly Dropbox scan. No transaction is created. Confirmation saves
the captured payslip through the existing audited repository and optionally links
an existing salary booking and its receipt. Rejection discards the draft from the
queue. Both decisions support grouped undo/redo. Original files and intake identity
remain retained for audit, deduplication and recovery.

## Owner setup

The PDF password can be entered in the app: the upload form has an optional
**PDF-Passwort** field (type password, no autocomplete) and the checkbox **Für künftige
Uploads merken**. The server tries, in order: the password sent with this upload, the
remembered app password, the server secret `PAYSLIP_PDF_PASSWORD`, no password. A typed
password is remembered only if "merken" is set and it demonstrably opened an encrypted
PDF. It is stored in table `payslip_secret` as AES-256-GCM ciphertext (the sealing code
of the bank secret box) under a key derived with HKDF-SHA256 from the existing
`BUDGET_PEPPER` (info `payslip-pdf-password-v1`); no new secret is needed. Without
`BUDGET_PEPPER` of at least 32 characters, remembering is disabled and the UI says so.
The password and extracted text never reach logs, audit entries, API responses or
browser storage; the audit log records only value-free create/update/delete events for
`payslip_secret`. The status endpoint returns just `passwordSet` and
`passwordSource` (`app`, `server` or none). Rotating `BUDGET_PEPPER` makes the stored
password unreadable (treated as not stored); enter it again. **Einstellungen ›
Datenquellen › Gehaltszettel** shows *PDF-Passwort hinterlegt: ja (in der App) / ja
(Server) / nein*, with **Passwort ändern** (stores a new one, checked at the next
upload) and **Vergessen** (deletes the ciphertext). A PDF that cannot be opened keeps a
warning in Posteingang with a password field and **Erneut auswerten**, which accepts the
new password (and "merken") for that retry.

Alternatively set `PAYSLIP_PDF_PASSWORD` as a Fly secret on the running app. The command
shape is `fly secrets set PAYSLIP_PDF_PASSWORD=…`; the ellipsis represents a value
supplied privately by the owner, never a repository value. Do not paste secrets into
issues, PRs, logs or screenshots. Secret updates restart the app; use **Erneut auswerten**
on an existing warning after fixing the password. Unencrypted PDFs also work.

Optional Dropbox setup:

1. Create a scoped app in the [Dropbox developer console](https://www.dropbox.com/developers/apps).
   An existing folder outside the application's app folder requires Full Dropbox
   access. Enable `files.metadata.read` and `files.content.read`. Add `files.content.write`
   only if you want uploads copied to Dropbox (step 6); without that flag no write scope
   is needed.
2. Authorize the owner at `https://www.dropbox.com/oauth2/authorize` using the app's
   `client_id`, `response_type=code`, `token_access_type=offline`, the read scopes,
   and a random `state` verified on return (add `files.content.write` to `scope` only for step 6). Register and use the same `redirect_uri`
   throughout if using a redirect. This is an owner setup operation outside Budget.
3. Exchange the returned one-use authorization code with a form-encoded POST to
   `https://api.dropboxapi.com/oauth2/token`: `grant_type=authorization_code`, `code`,
   `client_id`, `client_secret`, and the identical `redirect_uri` when supplied before.
   Store the returned refresh token privately. The worker exchanges it for short-lived
   access tokens; access tokens are cached only in memory.
4. Set `DROPBOX_PAYSLIP_ROOT`, `DROPBOX_REFRESH_TOKEN`, `DROPBOX_APP_KEY` and
   `DROPBOX_APP_SECRET` as Fly secrets. Alternatively set `DROPBOX_TOKEN` with the
   root for a read-only access token; it takes precedence and must be replaced when
   it expires. Never expose these values to the browser.
5. Under **Einstellungen › Datenquellen › Gehaltszettel**, choose the EUR salary
   account and configure any additional numeric Lohnart mappings. The form stores
   owner data in the database, not in code. Upload a PDF, inspect the draft and
   check the original document before confirming.

6. Optional, write-back of uploads: set `DROPBOX_PAYSLIP_WRITE=1` (with the Dropbox
   settings above, a refresh-token setup, and the `files.content.write` scope; a
   read-only `DROPBOX_TOKEN` will make copies fail visibly). A manually uploaded PDF
   is then also stored byte-for-byte unchanged (still encrypted if it was) as
   `<DROPBOX_PAYSLIP_ROOT>/<YYYY>/<original file name>`. YYYY is the year of the
   parsed Abrechnungsmonat, else of a filename `YYYYMM`, else the current year. The
   upload uses `files/upload` with `mode: add`, `autorename` and `mute`; an identical
   file already at the target is not uploaded again, a different file of the same name
   is kept and the new one renamed by Dropbox. The copy happens after the intake is
   staged and never fails the upload: the upload response carries
   `dropboxCopy` (`saved`, `failed`, `off`), the UI shows *In Dropbox abgelegt* or
   *Dropbox-Ablage fehlgeschlagen*, and a failure also raises a generic source warning in
   Posteingang. Files fetched from Dropbox are never written back; the nightly scan
   later sees the uploaded copy and skips it through the SHA-256 deduplication.
   **Einstellungen › Datenquellen › Gehaltszettel** shows whether write-back is active
   and whether the PDF password is set (stored as server secret `PAYSLIP_PDF_PASSWORD`).

Provider setup reference: [Dropbox OAuth guide](https://developers.dropbox.com/oauth-guide).
Listing/download contract: [Dropbox HTTP API](https://www.dropbox.com/developers/documentation/http/documentation).

## Scan, parsing and confirmation

The separate worker shares the SQLite/receipt volume. It scans at **02:30 UTC**,
with an immediate catch-up for an overdue or first scan and a 15-minute retry on
provider/download failure. Initial listing is recursive; subsequent pages and
changes use the persisted cursor. Files directly in the root and PDFs anywhere
under any four-digit year folder qualify; no list of years is embedded. A root
change resets the cursor. Cursor reset responses trigger a full rescan. Removed
source files do not remove retained receipts or confirmed payslips.

A page's cursor advances only after its eligible downloads are processed. Dropbox
revision, byte length and its block content hash are checked before staging;
SHA-256 deduplicates manual and fetched copies. Rejected/confirmed content is
skipped. Files above 15 MB produce a source warning and are skipped. Up to 100
listing pages are processed per tick, with continued catch-up on the next tick.
The status counts refer to the most recent scan attempt, not all historical PDFs.

PDF.js extracts text in a bounded worker thread (20 seconds, 128 MiB JavaScript
heap, 30 pages, 200,000 text characters). Evaluation and font rendering are disabled;
library diagnostics are discarded. The password and extracted text never enter
the database, application logs or client responses. Original bytes use the existing
content-addressed `RECEIPTS_DIR`, outside static hosting. PDFs are download-only.
No decrypted PDF is written. Plain PDFs remain plain on the protected volume.

The pure adapter interface accepts extracted text plus owner mappings. The Austrian
wage-line adapter supports LGV/BMD/ZFA2-style labels, final amount columns, signed
amounts, regular/SZ SV-DN and Lohnsteuer, separate signed Aufrollung lines, other
deductions and tax-free reimbursements. Brutto includes printed earning rows;
those rows are not added a second time. Owner code mappings take precedence over
generic labels. Unknown codes/corrections, missing totals and unsupported documents
remain warnings and block confirmation. Text-only extraction does not perform OCR.

The document's Abrechnungsmonat (numeric or German month name) takes precedence over filename YYYYMM;
filename fallback is explicitly disclosed. The adapter recognizes employee bonus
documents separately as a special/other payslip, and pension statements as a
distinct receipt requiring review, never salary. Summary checks tolerate at most
one cent; confirmation records that difference as an explicit signed rounding line.
Lohnsteuer refunds remain their own lines. Reimbursement lines do not enter the
captured salary net or salary ratios.

Booking suggestions use the configured salary account, existing EUR salary/special
income splits and ±5 calendar days of the document's payout date, otherwise month
end. The whole bank payout is compared with Auszahlung; the difference is visible.
A single exact match is preselected. The owner can choose another disclosed
candidate or save without linkage. Confirmation rechecks live account/booking
availability and the date window. No automatic split reassignment occurs: owner
booking splits must separately classify reimbursements to exclude them from
ledger-based savings-rate reports, as in the existing captured-payroll workflow.

### Scope of the scheduled scan

The scan only reviews documents from the start of the records (month of the earliest account
opening date; never a fixed year). A year folder before that year is not downloaded or staged;
within the start year, and for any year folder, the period read from the document decides, so
new year folders such as 2027 are picked up without configuration. A scanned document whose
month and kind (special payments: same gross) are already captured is staged as rejected with
the reason "Bereits erfasst." and its inbox task is resolved. When the records start changes
(and on the first run after this rule exists) one full listing re-evaluates pending Dropbox
intakes by the same rules; they are rejected with a reason, never deleted. Counts of skipped
documents are kept per run, never names or paths. Manual uploads are always staged.

## Backup and verification

The existing encrypted archive includes the SQLite database and every referenced
receipt blob, including rejected/soft-deleted history. Configure the existing age
backup and test its restore according to [receipts](receipts.md) and [operations](ops.md).
Intake adds no separate storage location. A real owner backup/restore and private
layout reconciliation remain operational acceptance, not synthetic test claims.

All new PDF scenarios generate documents in memory with PDFKit and dummy passwords.
Dropbox tests use synthetic HTTP responses and never provider credentials. Focused
browser tests use a fresh local database and passkey session per viewport; run
`npm run build:e2e`, then
`npx playwright test --config e2e/payslip-intake.config.ts`.
The isolated configuration avoids unrelated seed servers on memory-limited machines.
