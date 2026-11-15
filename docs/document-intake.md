# Central document upload

One **Dokument hochladen** action replaces choosing between three separate
uploads. It appears with the redesign on the account and depot pages (inside
"Dokumente und Kontoauszüge", with that account as context) and on Prüfen.
With the redesign off the existing buttons are unchanged.

## Flow

1. The owner picks or drops one file (JPEG, PNG, WebP, HEIC/HEIF or PDF, up to
   15 MiB).
2. `POST /api/document-intake/classify` (multipart `file`, optional `password`)
   inspects the file and answers
   `{ type, confidence, hints, needsPassword }`. It stores nothing, books
   nothing, calls no external service and logs no content, names or passwords.
   Same authentication, origin guard and body limit as the other uploads.
3. The dialog shows "Erkannt: …" with a selector to correct the type and, for
   statements, an account selector (pre-selected from the page context). An
   encrypted PDF asks for the password and classifies again.
4. "Weiter" hands the **same `File`** to the existing flow, unchanged:
   - Receipt: `POST /api/receipts` (stored under Prüfen; nothing is booked).
   - Card statement / bank statement: the account's statement dialog uploads to
     `POST /api/statement-intake/upload` and shows the review. Booking only
     happens if the account's #741 automation is set up and every gate passes;
     otherwise nothing is booked before the owner confirms.
   - Payslip: the payslip upload dialog posts to
     `POST /api/payslip-intake/upload` with the existing automation flag. With
     payroll source set up and an unambiguous result the payout is booked or
     linked (undoable); otherwise it waits under Prüfen.

## Detection rules (deterministic, in this order)

1. Not a PDF (image): receipt, probable.
2. PDF that cannot be opened: with a password error `needsPassword: true`;
   otherwise `unreadable`. Passwords tried: typed, remembered payroll password,
   server secret (same candidates as payslip intake).
3. Card layout recognised by `parseCardDocument`: `card_statement`, certain.
4. A payroll adapter accepts the text: `payslip`, certain when
   `parsePayrollDocument` produces a known document type, else probable.
5. At least two printed statement facts (`parseStatementText`: reference, issue
   date, period, payable total, debit date): `card_statement` if a masked card
   hint or card wording is present, else `bank_statement`; probable with three
   or more facts, otherwise unknown.
6. Anything else readable: `receipt`, unknown.

Hints contain only the printed period, a masked card hint and the MIME type.

## Not done

- No new parsers, no AI or OCR, no change to the #741 automation gates.
- No automatic account matching from a printed card hint; the owner picks.
- Unreadable or unrecognised documents are filed as receipts, never guessed.
