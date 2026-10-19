# Account review rules — #578

Status: source candidate only. No dependency installation, typecheck, unit test, browser run,
aggregate check, or production build has yet been executed for this candidate. Independent
whole-diff review and the coordinator's execution slot are required before first validation.

## Read contract

The owner decision in #467 (16 October 2026, comment `6209941680`) and #578 override the old
35-day rule for supported accounts. Checking, cash, and savings in Budget-Konten, plus credit
cards, have an inclusive fourteen-day deadline. Loans and supported Investments have a calendar
month deadline clamped to its final day. Budget membership uses `onBudget`, not the reserve role;
credit cards retain their group regardless of that flag. Receivables retain the existing legacy
hint and unsupported-action behavior; this change introduces no contact review policy.

The authoritative read model supplies account-list badges, `/accounts/reminders`, and Heute's
existing single source row. Its count is the same reminder array length. An account checked
months ago remains checked when there is no subsequent live eligible activity. Accounts never
checked use the opening date, without inventing a check. Closed, deleted, not-yet-open, and empty
never-checked accounts do not produce reminders. P2P and other assets use their stored manual
valuation; other supported types use the selected live reconciliation.

Statement date and actual check ceremony are separate. A booked day after the statement counts
once that day becomes eligible, even if entered before the ceremony. Audit insertion order also
detects later creation, restoration, and financial changes with backdated or identical dates and
identical clocks. Memo/flag-only edits do not trigger review. Current deleted and future bookings
are excluded. Equal or unknown timestamps without audit evidence conservatively cannot prove a
quiet interval.

Reconciliation undo/redo preserves the original ceremony boundary and excludes only that check's
own audit group and replay lineage, including stamps and adjustment. A later undo of an unrelated
financial booking edit remains later activity. A new explicit valuation update on the same row
advances its checkpoint; undo restores the previous checkpoint and redo restores that update's
original checkpoint. Batched SQL returns only identity, chronology, and change predicates, not
private audit snapshots or monetary values.

## Compatibility

No schema, migration, financial formula, booking/check/lock policy, audit writer, or undo writer
changes. A read cannot unlock a reconciled booking. In particular, changing a booked day already
stamped by reconciliation still requires the existing explicit unlock flow. New backdated
bookings and restoration are observed by the read model without changing those write rules.

Legacy reminder setting storage, validation, API, audit, and undo remain available. That setting
continues to govern the unsupported receivable fallback, and cannot override the covered fixed
rules. Profile wording explains the fixed rules; the separate future-preview editor retains its
original storage and undo behavior. No general account-list layout or #566 inbox grouping change
is included. The due ink reuses the existing orange `--minus-ink` token.

## Validation prepared, not executed

- New pure fixed-date tests cover group mapping, day 14/15, calendar-month clamping, quiet accounts,
  opening/empty/closed cases, and separately supplied backdated/same-day activity evidence.
- New real SQLite tests exercise equal-clock create/restore, live deletion/redo, original and older
  reconciliation undo/redo, own adjustment/stamp exclusion, unrelated financial-edit undo,
  same-row valuation save/undo/redo, pre-created future maturity, and unchanged money/audit bytes.
- New API tests compare due IDs from all three read routes, literal balances and manual values,
  real check/value/undo routes, the preserved legacy setting, and read-only storage snapshots.
- New UI tests pin authoritative DTO display, exactly one Heute source row and existing action
  destinations, fixed-rule wording, and the independent future-preview editor with undo.
- New isolated-ledger browser scenarios are prepared for real completion/undo, literal values,
  due badge/count parity, quiet/empty accounts, actual theme controls, Axe, forty-four-pixel
  affected actions, overflow, and phone/desktop captures. Real WebKit desktop layout is explicitly
  separate from Chromium desktop/mobile acceptance; no engine substitution is claimed.

Existing tests remain unchanged in this author worktree. Known obsolete 35-day/custom-override
fixtures and selectors are listed separately for coordinator-owned adaptation under #467/#578;
their money, lock, dialog, undo, accessibility, and strict financial assertions must be retained.

Pending: independent whole financial review, first execution, any approved existing-test
adaptations, actual Chromium mobile and WebKit evidence, aggregate age-required check, production
build, exact-head CI, reviewed PR, serial integration, and exact deployed revision verification.
