# Guided month close — F1

Plan (owner task 2026-10-04):

1. Read monthly work through the existing inbox, account summaries/reconciliations
   and Plan envelope calculation. Keep all money in integer cents.
2. Persist the current step and explicit, reasoned exceptions in one audited
   `app_setting` per month. Derive completion from live work; changed/new work
   reopens the step. Reuse undo/redo and existing booking/reconcile/cover actions.
3. Render one inline step with accessible five-step progress and a sticky phone
   continuation. Steps 4–5 remain pending F2; never claim the month is closed.
4. Add Heute month-boundary and Plan entries. Job E is not on the fetched main
   baseline; use existing assignment review and global search provisionally.
5. Prove monthly status, exceptions, resume, audit/undo, validation and financial
   writes with synthetic API tests; stepper component and desktop/phone evidence.

The flow does not introduce a month lock or automatically book anything. Gate 4
requires a real parallel month close by the owner, after F2 and deployment.

## API and persistence

- `GET /api/month-close/:month`: live work, five derived statuses and the saved
  current step. Month is a validated `YYYY-MM`; steps 4–5 always remain `following`.
- `PATCH /api/month-close/:month`: `currentStep` (1–5) and/or reasoned decisions
  (`step`, `id`, server-issued `fingerprint`, nonblank `reason`). Decisions merge
  by step/id atomically into `app_setting` key `month_close.YYYY-MM`, using the
  standard audit group and undo/redo. Changed work rejects stale decisions (409)
  and reopens accepted work. This requires no schema migration.
- `PUT /api/accounts/:id/valuation`: explicit manual value in the account's native
  currency, integer `valueCents` and calendar `date`, for P2P/other asset accounts.
  Future/pre-opening dates, closed/nonmanual accounts and checked dates are
  refused. Restore after undo and replacement share an audit group. A later
  reconciliation also blocks undo/forced undo of an earlier valuation until the
  check is undone. Valuation history makes the native account currency immutable,
  including replay; undo respects the account/value dependency. Shared
  net-worth/account/report valuation uses these values and stays zero before the
  current tracking start. Product-valued accounts retain their holding valuation.

The existing booking, assignment review, candidate confirmation/dismissal,
reconciliation and envelope cover/move endpoints perform financial actions.
Month-close decisions acknowledge work; they never change a booking or envelope.
Late fetched bank candidates are attributed by booking date, not fetch date.
Undated stored warnings use their creation month. Unlinked receipts remain in
the global inbox; without a booking date they have no monthly attribution.

## Owner acceptance

Review the synthetic screenshots and the German flow, then integrate Job E's
palette/verdict entry once its source is available. No new keys, consents or
provider calls are required. After F2/deployment, perform the real parallel month
close and compare balances, categories and reports for Gate 4.
