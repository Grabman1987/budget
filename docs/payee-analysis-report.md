# Empfänger-Analyse (Report 2.5)

`/reports/empfaenger` is a connected first report body, not completion of the report catalog or Gate 4. It reuses the budget ledger's `splitEffect` and `need|want` classification for closed-month activity on live budget accounts. It describes eligible budget consumption, not every cash outflow. Monthly amounts reconcile to the existing budget activity source under the same split opening-date and live-row rules.

## Included activity

- Expense splits are stored as negative ledger amounts and raise the recipient's reported net expense; positive refund splits reduce the recipient where the refund was booked. The report does not infer the original purchase's recipient.
- A split without a payee is conserved in the explicit **Ohne Empfänger** row. Aggregation and drilldown use stable payee IDs, never names as identity.
- Booking count is distinct qualifying booking IDs. A booking with offsetting eligible splits remains present with zero net when its source splits have activity.
- Pending, confirmed, and reconciled booking statuses are included and shown. A booking's payee is parent booking metadata and applies to its qualifying splits. Detail shows that booking's eligible split amount, not its unsplit parent total.
- Same-budget transfers are neutral under `splitEffect`; eligible categorized budget-to-debt repayments count as budget activity; future-class activity is excluded. Account opening dates apply separately to each split's account.

Income, card-payment, advance, future, internal transfer, uncategorized, and deleted-category activity is outside the recipient sum. Unclassified outgoing activity is disclosed separately where the shared budget reader identifies it. This report must not be described as all spending or all money leaving accounts.

## Period and comparison

All ranges end at the last closed calendar month. The default is `1J`; `3J` requests up to 36 closed months, clamped to available live budget history; `Alles` uses all available closed months. The UI displays the actual range. A previous-period comparison appears only when the entire equally long preceding range is available. It shows signed net change and does not assign refunds to earlier purchases.

The net percentage share is available only when total eligible net expenses are positive. With a positive total, a recipient's negative refund net remains a valid negative share; zero-net recipients remain visible. No absolute-value or 100% clamp is applied.

## Drilldown and limits

The read-only detail endpoint returns only qualifying bookings and category splits for the selected payee (including an explicit null-payee filter). It paginates by the stable `(date, booking ID)` key; the client never aggregates a page to produce report totals. Booking links navigate to the existing ledger selection. Query failures and unsafe exact-cent calculations are shown as unavailable/error states; figures are not fabricated.

The visual report and focused evidence cover this bounded body. Other report 2.5 calculations, broader spending coverage, print acceptance, private-data reconciliation, and the remaining report catalog are still open.
