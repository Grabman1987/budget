# Issued card settlements and explicit bonuses

This opt-in feature separates the previous issued statement, its payment and an
explicit expense credit. It never takes the current negative card balance as the
issued amount, changes original purchases or sends a bank order. Newer purchases
remain open after the older statement is settled.

## Review and record

In the account's **Abrechnung hochladen** dialog, review the original PDF and
complete the document facts, then choose **Abrechnungsausgleich**. Document review
alone creates no financial record. [Statement intake](statement-intake.md) covers
the original download, storage and extraction limits.

Explicit configuration requires a live credit card and a distinct live checking
or savings account, with the same currency and budget scope. Existing EUR budget
restrictions apply. Configuration never retargets accepted terms; withdraw an
open positive statement before changing its funding account. Disabling prevents
new actions without erasing accepted history or projections.

Acceptance requires a reviewed reference, issue date, currency, amount and
explicit debit date. Unknown differs from zero: zero is nonposting, negative is
manual review, and positive creates an open obligation without a booking.
Separately create a pending/confirmed transfer or link an exact existing whole
two-leg transfer. Linking preserves its money, date, status and reconciliation;
neither representation proves that the bank executed the debit.

An issued EUR 100.00 plus EUR 30.00 of newer purchases still means a EUR 100.00
transfer, leaving EUR 30.00 outstanding. Explicit legacy replacement affects only
the selected payment/date, preserving other payments and later occurrences.

## Bonus and Undo

Review a positive bonus, its actual credit date, selected existing expense splits,
explicit affected-category allocations, existing credits and fees/adjustments.
These are owner-entered facts, not automatically extracted items or differences.
Acceptance alone creates no credit. Separately create a positive expense refund
or link one exact whole existing credit with current booking/split revisions.

Gross EUR 80.00 remains unchanged; an explicit EUR 1.25 refund produces EUR 78.75
expense, not household income. If EUR 78.75 was already charged net, informational
EUR 1.25 is nonposting. Transfer the accepted payable unchanged; never subtract the
bonus again. Unclear dates/categories, partial credits and differences stay manual.

Settlement and bonus have independent history and groups. Created-action Undo
reverses that action; linked-action Undo removes only the association, preserving
independent money. Withdrawal of a statement does not withdraw its bonus. Partial
or forced Undo cannot orphan representations; guarded redo restores their IDs.

## Freshness and selection

Transactions recheck source revision/hash/account, configuration and selected
money, including after source-file I/O. Conflicts require explicit reload/review
while preserving the draft. Exact same-key retries return the saved receipt with
no writes, even after Undo; they do not recreate money. Changed requests with that
key conflict. A fresh-key identical confirmation may add only a delivery receipt.

Authenticated account-local candidate pages contain at most 25 originals, whole
credits or whole transfers. Selection is explicit; actual consumed booking/split
revisions are rechecked before writing. No transfer revision is invented.
Omissions describe that page only; missing identities/invalid boundaries fail
closed. GETs do not reconcile or write.

Backend acknowledged represented-bonus source reassessment preserves the same
credit and immutable old evidence through a grouped replacement. Its dialog
editor remains OPEN; other independent source consumers still block conflicts.

## Migration and evidence boundary

Additive 0046 creates four tables. Synthetic copy tests upgrade a genuine
through-0045 database, preserve rows/FKs, roll back empty 0046, re-upgrade and reject
populated rollback. Existing encrypted AGE backup/decrypt/restore tests preserve
source blobs, representations, superseded history and replay identities. They do
not verify a production-volume or owner restore; database-only recovery cannot
restore receipt bytes. See [receipt backup](receipts.md).

Focused backend results are separate checkpoints. Current UI 15/15 passed, including
normal initialization and draft preservation across a real query refetch. Projection cases passed
across two checkpoints, retaining initial incorrect empty-currency-list failures
before strict zero-EUR assertions passed; no fresh eight-case aggregate is claimed.
The existing integrity-726 fixture is expressly limited through 0045, with every
assertion unchanged: “Ja, nur diesen Testaufbau begrenzen”. New 0046 has separate
migration and backup coverage.

A fresh-build canonical WebKit batch passed seven cases: four explicit desktop/phone
and theme scenes plus three setup cases. The [synthetic originals and limits](evidence/statement-settlement-727/README.md)
record measured actions, independent Undo and scoped privacy evidence.

The first integrated required check stopped before units on formatting of the
NEW generated 0046 snapshot. Types passed; ESLint had no errors and one existing
warning. That failed check did not run a normal production build.

The integrated checkpoint `5c1855e0` passed the required AGE1/one-worker full
check: 575 files / 5,157 tests, 799.95s Vitest duration. The following
normal production build passed. Exact-head CI and serial LIVE remain pending. Net-only/difference extraction/reconciliation, uncertain
partial credits and the represented-source reassessment editor remain OPEN.
#727 is not marked complete. All examples and committed evidence are synthetic.
