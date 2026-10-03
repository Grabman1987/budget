# Automatic payslip intake

New payroll PDFs enter **Posteingang**, from the Gehaltsreport/Posteingang upload or
an optional nightly Dropbox scan. No transaction is created. Confirmation saves
the captured payslip through the existing audited repository and optionally links
an existing salary booking and its receipt. Rejection discards the draft from the
queue. Both decisions support grouped undo/redo. Original files and intake identity
remain retained for audit, deduplication and recovery.

## Owner setup

Set `PAYSLIP_PDF_PASSWORD` as a Fly secret on the running app. The command shape is
`fly secrets set PAYSLIP_PDF_PASSWORD=…`; the ellipsis represents a value supplied
privately by the owner, never a repository value. Do not paste secrets into issues,
PRs, logs or screenshots. Secret updates restart the app; use **Erneut auswerten**
on an existing warning after fixing the password. Unencrypted PDFs also work.

Optional Dropbox setup:

1. Create a scoped app in the [Dropbox developer console](https://www.dropbox.com/developers/apps).
   An existing folder outside the application's app folder requires Full Dropbox
   access. Enable only `files.metadata.read` and `files.content.read`; no write scopes.
2. Authorize the owner at `https://www.dropbox.com/oauth2/authorize` using the app's
   `client_id`, `response_type=code`, `token_access_type=offline`, the two read scopes,
   and a random `state` verified on return. Register and use the same `redirect_uri`
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
