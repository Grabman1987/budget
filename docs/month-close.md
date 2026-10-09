# Guided month close — F1 and F2

## F2 implementation plan (2026-10-06)

1. Reuse Plan's bulk assign API and audit-group undo. Group/all history buttons
   edit a local draft; a group apply saves that group and retains other drafts. Repeated applies
   share one stored audit group, so one undo restores the whole step. Expected income is never booked or
   added to the assignable pool. Require live zero remaining before closing.
2. Read next-month schedules through the existing occurrence read model, show
   the shared 15th/preceding Austrian bank-day boundary separately from actual
   scheduled receipt dates, and disclose missing income estimates/history.
3. Compare prior assignments and actuals with up to twelve completed calendar
   months of actuals (zero-spend tracked months count; pre-tracking months do not).
   Use integer-cent arithmetic and the shared allocation bar for the draft.
   History sums and draft deltas use exact integer intermediates. Group shares use
   the existing monthly assignments directly, including periodic savings; unsafe
   aggregate amounts show a plain-language draft error and cannot be saved.
4. Reuse the full One-Pager, add a shared factual verdict fallback (Job E is absent
   from this baseline), three largest absolute plan/actual deviations and open
   rule findings. Persist an audited, undoable close date in the existing setting;
   no data lock. Reject premature or incomplete closes on the server.
5. Synthetic domain/API/component tests first, then all-five-step desktop/phone
   E2E with accessibility and screenshots; full check/build before draft PR.

F1 plan (owner task 2026-10-04, now extended by F2):

1. Read monthly work through the existing inbox, account summaries/reconciliations
   and Plan envelope calculation. Keep all money in integer cents.
2. Persist the current step and explicit, reasoned exceptions in one audited
   `app_setting` per month. Derive completion from live work; changed/new work
   reopens the step. Reuse undo/redo and existing booking/reconcile/cover actions.
3. Render one inline step with accessible five-step progress and a sticky phone
   continuation. F2 adds planning and an explicit close marker.
4. Add Heute month-boundary and Plan entries. Job E is not on the fetched main
   baseline; use existing assignment review and global search provisionally.
5. Prove monthly status, exceptions, resume, audit/undo, validation and financial
   writes with synthetic API tests; stepper component and desktop/phone evidence.

The flow does not introduce a month lock or automatically book anything. Gate 4
requires a real parallel month close by the owner after deployment.

## API and persistence

- `GET /api/month-close/:month`: live work, five derived statuses and the saved
  current step, next-month Plan/schedules/history and three largest absolute
  category deviations (actual minus the plan including carry and assignment).
  Month is a validated `YYYY-MM`; step 4 is complete only when live next-month
  Zu verteilen is zero.
- `PATCH /api/month-close/:month`: `currentStep` (1–5) and/or reasoned decisions
  (`step`, `id`, server-issued `fingerprint`, nonblank `reason`). Decisions merge
  by step/id atomically into `app_setting` key `month_close.YYYY-MM`, using the
  standard audit group and undo/redo. Changed work rejects stale decisions (409)
  and reopens accepted work. `close: true` sets server-dated `closedOn`, idempotently,
  only at/after month end with steps 1–3 complete or explicitly deferred and
  step 4's live next-month Zu verteilen exactly zero. The
  client cannot supply a close date. The marker is undoable and locks no data;
  later changes may reopen prior steps without deleting the historical marker.
  This requires no schema migration.
- `PUT /api/budget/:month/assigned`: the existing assign path accepts optional
  `closeMonth`, which must name the immediately preceding month. The server stores
  a group UUID in `month_close_plan.YYYY-MM` in the same transaction as assignments
  and reuses it across step-4 applies. Standard pool/category/cent guards remain;
  failure rolls back the group marker too. One undo restores every assignment in
  that group, and a subsequent apply starts a new group. Progress/close markers
  remain independent. Other budget writes keep their existing behavior.
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
The One-Pager's daily net-worth series applies the snapshot resolver's manual-value
rules to the existing cash series: newest live valuation on or before each day,
native currency conversion at that day, cash fallback, and product-valued-account
precedence. Two queries load the relevant accounts and valuation history for the
whole window, so step 2's valuation also appears in step 5. The synthetic daily
comparison against `netWorthAsOf` covers zero, deleted and future valuations,
opening dates, positions and foreign currency.
Late fetched bank candidates are attributed by booking date, not fetch date.
Undated stored warnings use their creation month. Unlinked receipts remain in
the global inbox; without a booking date they have no monthly attribution.

## Owner acceptance

Review the synthetic screenshots and the German flow, then integrate Job E's
palette/verdict entry once its source is available. The existing global search
remains the entry and the shared factual One-Pager sentence is the verdict fallback.
No new keys, consents or provider calls are required. After deployment, perform the real parallel month
close and compare balances, categories and reports for Gate 4.
