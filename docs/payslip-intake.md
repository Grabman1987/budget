# Automatic payslip intake

Manual PDF uploads open the parsed result directly in the wide review dialog. The
retained **Posteingang** task lets the owner resume later; optional nightly scans
still enter that queue. With an explicitly configured salary account and employer,
new app uploads request deterministic automatic capture of fully verified cases.
Unknown, incomplete or ambiguous cases stay in **Prüfen**. Legacy clients without
that explicit request and nightly scans retain manual review. The review proposes
the configured active EUR salary account and allows another active EUR account.
Confirmation links an existing matching salary booking or creates a pending payout
(cash: confirmed), together with the payslip, receipt, expectation link and inbox
decision in one audited, undoable transaction. Rejection retains the original and
intake identity for audit, deduplication and recovery.

## Deterministic automatic uploads

The owner authorized this path in #741. Before choosing an automatic action, the
server requires the current known parser, a period printed in the document,
complete mapped wage lines and independently reconciled integer-cent totals. The
existing signed one-cent rounding rule is unchanged. A printed payout date or one
complete, exact configured salary expectation supplies the date; it is never
guessed from month end. A nearby amount-only, wrong-sender or ambiguous booking
keeps the document under review. An existing payout must match account, EUR,
sender, exact date, amount and all salary/reimbursement split semantics.

The original PDF is stored unchanged and verified before the atomic decision.
Source, parse and configuration revisions are checked again after asynchronous
PDF/file work. The existing audited confirmation writer creates or links the
payout, payslip, receipt, expectation and inbox result together. Automatic audit
provenance is explicit. Existing linked payout values, splits, status and history
remain unchanged. The UI reports the result, links the persisted payout and offers
Undo for the financial group, rather than the earlier source-staging group.

Repeated bytes, concurrent uploads, already consumed or reparsed intakes and a
different-byte version of a previously undone payroll slot cannot silently create
another salary. Conflicting amendments remain for review. The stored association
is read again after reload and disappears after financial Undo; it is not inferred
from the current source account setting. Privacy changes immediately mask and
restore displayed payroll figures without changing financial data.

This feature does not process the owner's private historical archive during
development or enable automatic posting from scheduled scans. Original download,
manual review and the existing password/source boundaries remain available.

The review exposes **Auszahlungsdatum**, **Von** and **Gehalts-Erwartung**. An explicit
owner date wins; a printed PDF date or an eligible expected payment supplies a
proposal. Without a date, confirmation cannot create or link a payout. There is no
silent month-end payout fallback. Eligible expectations are unbooked expected EUR
salary/special inflows on the chosen account in the document month; choosing one
settles that occurrence instead of leaving a second expectation. A matched existing
booking keeps its date and payee. Existing production corrections are not migrated.

Known wage codes are classified automatically. Unknown numeric codes show their
label and amount alongside the five existing section choices. **Zuordnen und neu
auswerten** preserves the current salary source configuration and reparses the
original bytes before atomically saving the mapping, parsed result and inbox
urgency. Concurrent source-config or intake changes cause a conflict. An unreadable
PDF never partially saves a mapping. Meal deductions remain labelled deduction
lines; no new schema columns or payroll formulas are invented. Private historical
PDFs have not been used for verification.

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
   account, explicit employer/sender and any additional numeric Lohnart mappings.
   The form stores owner data in the database, not in code. A new app upload
   automatically saves only a fully verified result; inspect its original and
   linked payout, or complete unresolved cases through manual review.

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
content-addressed `RECEIPTS_DIR`, outside static hosting. Raw PDFs remain download-only; a separate inert PNG page preview does not change text extraction.
No decrypted PDF is written. Plain PDFs remain plain on the protected volume.

### Original page beside payroll review (#609, validation pending)

The existing wide upload/review dialog and the inbox review share a receipt-local
PDF preview on the left, with the existing review on the right. On narrow screens
they stack. Explicit **PDF-Vorschau öffnen** requests one protected PNG page;
previous/next page and fit/detail controls never embed the PDF itself. Zoom pans
inside the bounded page region. **Vorschau schließen** removes its image/password
and aborts pending work; closing the review or changing its source does the same.

An encrypted PDF can use **PDF-Passwort für diese Vorschau**, kept only for that
open preview session. It is not remembered or retrieved from the payroll password
store. Preview failure, a wrong password, busy renderer or a processing limit does
not discard review fields, reanalyse the document, change payout eligibility or
disable the existing original download/manual review. It never confirms a payout
or changes an existing allocation. Privacy mode removes the entire image/session
and requires an explicit new open after privacy is turned off.

The [receipt preview contract](receipts.md#inert-pdf-page-preview-609-source-implementation-validation-pending)
documents finite page/surface/image/output limits, process-wide admission and the
distinction between the cancellation deadline, V8 heap and unbounded native RSS.
No private document has been used for this source-only implementation. Actual
synthetic rendering, platform/limit/security checks and 1440/390 light/dark,
keyboard/touch/privacy/draft verification are still pending. Existing payout
split normalization is never authorized by opening the preview. The separate explicit action below is limited to proven untouched imports.

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

Booking suggestions use the selected payout account (initially the configured salary
account), existing EUR salary/special
income splits and ±5 calendar days of the selected/proposed payout date. Without a
date the review returns no matching suggestions. The whole bank payout is compared
with Auszahlung; the difference is visible.
A single exact match is preselected. The owner can choose another disclosed
candidate or explicitly create a new payout. A matching exact payout in that
account blocks accidental duplicate creation; choose the existing booking instead. Confirmation rechecks live account/booking
availability and the date window. No automatic split reassignment occurs: owner
booking splits must separately classify reimbursements to exclude them from
ledger-based savings-rate reports. New payouts separate salary/special income and
tax-free reimbursements in integer cents. Payout, captured payroll, receipt link and
inbox decision share one transaction and undo group. Invalid, closed, non-EUR or
not-yet-open accounts roll back the whole action. Legacy API callers without
`accountId` can still save without creating a booking. Existing records stay intact.

The upload dialog also accepts one PDF dropped into its labelled region, with the
same 15 MB limit and server validation/analysis as the file chooser. This provides
an alternative input path; it does not prove a fix for the reported Chrome hang
before native file selection. The automated chooser test clicks the actual inner
button and waits for a filechooser event before supplying synthetic bytes. Native
Windows dialog/profile behavior remains outside the Linux cloud evidence.

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

## Explicit proven-original payout split (#609)

An optional, unchecked confirmation in the review can split one proven untouched
original salary lump into salary and tax-free reimbursement through the ordinary
booking writer. The action preserves total, account, date, payee, status and other
booking metadata, then links the payslip/receipt/expectation in the same existing
outer decision transaction and audit group. No new payout is created for that path.

Eligibility requires the current known parser, document-derived period and payout
date, complete wage mapping and reconciled integer cents, the configured salary
account/employer and an exact EUR payout. The booking and every original split
must still equal their complete audited creation snapshots in the same group,
with no later mutation, removed/recreated child, Undo/redo or consumed association
history. Proven origins are bounded as follows:

- The existing committed import run/mapping path retains its original guards.
- An untouched original manual `createBooking` has no adopted bank/import identity.
  Pending and confirmed status stay unchanged.
- A fresh explicit `BankSync.confirm` must match its retained original booked
  candidate in account, date, cents, EUR currency, raw text/payee, source and dedupe
  identity. Original candidate audit, callback/account creation, one initial map,
  successful provider stage and original inbox confirmation form an ordered audit
  chain. The mapping projection contains only id, consent id, account, currency,
  start date and watermark; credentials and credential-bearing audit JSON are
  never selected. A changed-provider warning also refuses the split even if the
  retained candidate values stayed unchanged.

Existing ordinary ledger guards remain authoritative. The preview token binds
source, receipt, booking, splits, account, sender, configuration, expectation,
origin values and audit identities; confirmation recomputes it inside the existing
transaction. Mapping refreshes invalidate an old token. Candidate/mapping ABA,
remap, restore, merge/adoption, pending-to-booked promotion and unknown or incomplete
origin history do not become new split authorization. Automatic bank postings
later assigned salary remain corrections and link-only.

Reconciled payouts are only linked, with an explicit notice. Already canonical
payouts need no replacement. Manually corrected, custom-assigned, provenance-unknown
and otherwise unsupported records remain unchanged and may still use the original
link-only path. In particular, this is not blanket normalization for every bank or
historical payout; missing provenance leaves that acceptance scope blocked.
#741 automatic upload remains strict and never supplies the explicit split token.

Plan income owns upload and review. Its received/expected figure uses the same
existing income query as the Plan month title-block income button; the separate
budget-month inflow definition is the “Zählt für Zu verteilen” footnote. The salary
report has no upload control, and its 14-salary table lists recorded positions only
with missing positions on one line. No financial report formula is changed.

Synthetic local checks cover literal cents, exact grouped Undo, rollback, CAS/ABA,
the actual month-result savings-rate reader, and the real bank service origin path.
See [validation](handoff/implementation-609/VALIDATION.md) for revision-scoped
evidence and remaining independent-review, browser, CI and delivery gates. These
bounded cases do not establish blanket normalization of existing bank/history rows.
