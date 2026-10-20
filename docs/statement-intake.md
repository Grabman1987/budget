# Statement PDF intake

Statement intake stores and reviews document facts for the selected account. It
does not create a booking, payment, statement obligation, forecast or bank order.
Financial settlement is a separate feature. A reviewed statement does not mean
that its amount was paid or reconciled.

## Upload and review

Open an account and choose **Abrechnung hochladen**, then **PDF auswählen**. The
same dialog contains the account's recent documents and opens the upload result
for review. The account ID supplies context; a printed or masked account hint
never silently selects a different account. Existing nondeleted accounts can hold
documents, including closed accounts. No funding-account setup is required.

The app retains the original PDF and its receipt metadata before the document is
reviewed. Downloads use the existing authenticated **Original-PDF herunterladen**
link; there is no inline PDF renderer. Upload accepts one PDF up to 15 MiB. A
request-local password can be supplied for extraction; it is not remembered or
borrowed from payroll settings.

Inspect the proposed reference, dates, period, amount and explicit currency
against the original. Printed facts and owner-entered corrections have distinct
provenance. The current extractor supplies flattened line references where
available; page numbers remain unavailable. It does not import individual
purchases, calculate a missing payable total, or convert currencies. Supported
labels/layouts are limited; an unreadable, scanned, password-blocked or ambiguous
document remains retained for manual review. Parser success is not a guarantee
that a particular issuer's layout is supported.

**Einzugsdatum** must be explicit. An issue date, **Bankeinzug** or **0 Tage netto**
does not supply a debit date. Unknown fields stay blank; an explicitly entered
zero amount remains different from an unknown amount. German date entry uses
`TT.MM.JJJJ` and is validated as a calendar date before ISO transport.

**Entwurf speichern** retains valid but incomplete manual facts. **Als geprüft
speichern** requires the account, reference or full period, issue date, amount,
currency and debit date. Neither action moves money. Close/account-navigation
guards protect unsaved edits and in-flight actions. Amount privacy masks displayed
money without changing the underlying document values.

## Duplicates, revisions and document actions

- Identical bytes reuse the same intake, even when the filename changes. A
  duplicate cannot silently retarget another account or reopen a rejected or
  deleted document. A removed same-account document offers explicit restoration.
- A different file with a matching account/reference or period is a possible
  amendment, not an automatic replacement, merge or payment identity.
- Reanalysis is explicit and pending-only. Reopen a reviewed/rejected document
  before reanalysis; inspect the new proposal again. Parser changes do not
  silently modify reviewed facts.
- Updates compare the captured revision, source hash and account in the write
  transaction. A conflict creates no partial document change. The UI preserves
  the local draft and offers **Stand neu laden**; reload/discard is explicit,
  rather than automatically resubmitting stale facts.
- Review, rejection, removal and restoration use tracked document audit groups.
  **Rückgängig** and redo apply to those document actions, not financial
  settlement. Reload the displayed document after Undo before another edit;
  the dialog does not silently replace an edited draft with a new revision.
- Removal soft-deletes the intake and its dedicated receipt only when no other
  live reference uses it. Original bytes remain for restoration and older
  backups. Generic receipt removal and partial/forced Undo must not leave a
  live statement pointing at deleted or mismatched receipt metadata. Explicit
  restoration/download verifies the retained source; missing or corrupt bytes
  produce an error rather than a reconstructed document.

## Private extraction script

Run from the repository with its existing Node/tsx environment. Replace the paths
below with files in a private directory outside the checkout and public web root:

```sh
node --import tsx scripts/statement-extract.ts /private/INPUT.pdf /private/OUTPUT.json
node --import tsx scripts/statement-extract.ts /private/INPUT.pdf /private/OUTPUT.json --password-stdin
```

The private extraction CLI is not supported on Windows. It refuses the action
before inspecting the input file, consuming a password or creating an output. Run
it on a POSIX host with a private output directory and a filesystem that honors
`0600` creation permissions. This CLI restriction does not change the app upload
or server extraction workflow.

The second form reads an optional password from bounded standard input until EOF.
Supply it through a protected input stream; never put it in command arguments,
environment variables or shell history. The script does not use saved payroll
passwords. The output directory must already exist and be private. The script
creates the output exclusively with mode `0600` and refuses an existing output
file, including an existing symlink. The input must be a regular non-symlink file
within the PDF size limit.

The script shares the app's parser/extraction service. It reads one file, writes
only the explicit output JSON and never opens a ledger database, scans a folder,
calls the app API or posts a payment. Source text and passwords are not printed;
stdout/stderr contain generic status only. A successful exit means a proposal was
written: inspect its extraction status, fields and warnings before relying on it.
Extraction is bounded to 20 seconds, 128 MiB worker heap, 30 pages and 200,000
text characters. There is no external OCR/model service or automated Gmail or
Dropbox synchronization in this feature.

## Storage and backup boundary

The existing receipt store is authoritative for app download and backup.
`RECEIPTS_DIR` overrides its directory; otherwise it is `receipts` beside the
resolved `DATABASE_PATH`. The database defaults to `$DATA_DIR/budget.sqlite`.
The checked-in Fly configuration uses the existing `/data` mount and
`DATA_DIR=/data`, giving `/data/receipts` with the default database location.
An override must remain on persistent storage, outside the public web root and
writable by the server user. Files are SHA-addressed immutable originals, with
`0700` new-directory creation/`0600` new-file publication. PDF metadata is retained. Permissions
do not newly encrypt an unencrypted PDF; encrypted originals remain encrypted.

The existing encrypted backup archive includes the database and every
receipt-table-referenced blob, including pending, unbooked and soft-deleted
statement sources. Missing/corrupt blobs fail verification. Synthetic tests have
verified a pending statement's database-and-source backup/restore round trip.
This does **not** verify the actual production volume, its current receipt
configuration, a successful owner backup or a private owner restore.

Litestream's database-only recovery does not restore receipt bytes. After volume
loss, restore the matching database **and** receipt directory from the same
verified encrypted archive. See [receipt storage and backup](receipts.md) and
[operations](ops.md) for the existing procedure. This feature adds no new archive
destination, provider credentials, automatic mail retrieval or folder scanner.


## Synthetic implementation evidence

All committed screenshots and fixtures are synthetic. The shared extractor was
also checked privately outside the checkout; no original documents, identifiers
or extracted values are included here.

The initial canonical WebKit compatibility batch passed 17 cases on its first
attempt, including existing account-register, toast/dialog and capture/bank-review
flows. After the local phone-toast fix, a focused batch passed five cases on its
first attempt in 40.384063 seconds: two statement-review cases plus three setup
cases. These are separate checkpoints, not a combined larger batch.

The final statement cases exercise both selected themes in a manually configured
1440×900 desktop context (DPR 1, fine pointer) and the configured 390×664 phone
context (DPR 3, coarse pointer), using the same WebKit container. Raw system theme
was light and raw maximum touch points were zero. File selection, focus, Enter,
click and ordinary scrolling are automation evidence, not a physical-device or
mobile-OS test.

The cases preserve the literal printed gross 120.00 EUR instead of net 100.00,
VAT 20.00 or individual card totals. A missing debit date starts blank and blocks
review until the owner supplies a valid date. They verify the original download,
document-only review, complete 44px Undo geometry and activation, restoration to
pending, explicit reload, and normal-scroll access to the three footer actions.
Axe covers the open statement dialog. Privacy checks cover recent-document
summaries; they do not claim that PDFs or all fact-form fields are hidden. Six
financial tables are compared unchanged; document and audit writes are expected.

The four unmodified originals below show internally scrolled, reviewed dialogs.
Phone full-page images include background below the viewport and do not show the
whole form at once. Fields above the scroll position are off-frame.

- [Desktop, light](evidence/statement-intake-726/desktop-light.png)
- [Desktop, dark](evidence/statement-intake-726/desktop-dark.png)
- [Phone profile, light](evidence/statement-intake-726/phone-light.png)
- [Phone profile, dark](evidence/statement-intake-726/phone-dark.png)

All 44 new unit cases passed in the first required AGE full run. That run used
`VITEST_MAX_WORKERS=2`: 5,064 of 5,067 tests passed across 568 files, with a
539.79-second Vitest duration. Two existing account-filter API tests reached
their unchanged 5,000 ms limit; both then passed unchanged in a selected comparison
against this source and the delivered comparison tree (four cases total). That
comparison does not establish the timeout cause. One existing migration-44 test
assumed that migration 44 was still the latest. Its expressly approved setup now
limits its disposable fixture to migration 44, preserving every original
assertion; the isolated test passed in 2.48 seconds. The first full check was red
and did not run the normal production build.

The required check before the Windows CLI correction used `BUDGET_REQUIRE_AGE=1` and
`VITEST_MAX_WORKERS=1`: all 568 test files and 5,067 tests passed, with an
833.67-second Vitest duration. The normal production build then passed. Final-head
CI and serial LIVE verification remain pending. Actual production receipt-volume
configuration and an owner backup/restore remain unverified, so this is a partial
delivery and #726 remains open.

Later Windows CI exposed that POSIX mode bits did not establish private CLI
output there. The CLI now refuses unsupported Windows execution before reading
input, consuming a password or creating output. Focused Linux validation passed
all six integrity cases (6.17s Vitest duration), server types, lint and format
checks. The guard-ordering probe and real POSIX worker/private-output cases passed;
actual Windows refusal and fresh exact-head aggregate CI remain pending. The
568-file full check and production build above belong to the earlier `15aa5a8`
checkpoint, before this CLI correction.
