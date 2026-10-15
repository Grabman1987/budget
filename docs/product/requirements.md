# Product brief and requirements inventory

Status: existing scope summarized; new acceptance examples are proposed review
cases. Binding precedence remains [SPEC](../../SPEC.md), then PRODUCT and the
remaining ordered sources. Review baseline: 2026-10-15 at `01a10de8`.

## Purpose and boundary

Budget lets one person manage household cash flow, envelope budgeting, debts and
investments in one ledger, replacing the agreed YNAB/Portfolio Performance
workflows. Phone: capture in 10 seconds and answer the month question in 5 seconds.
Desktop: distribute money, close a month, plan and review wealth. These are
acceptance targets, not performance measurements from this review.

There are no partner logins or organization roles: other people are contacts.
There is no in-app CSV/YNAB/PP import wizard, automatic bank order, tax filing or
AI adviser in current V1. Private migration is a separate authorized operator task.
CSV ZIP export is not the encrypted application backup.

## Functional inventory

“Present” below means a current source entry point or documented contract exists;
it does not mean every financial, visual or operational criterion is accepted.

| ID | Capability and user outcome | Entry point / implementation anchor | Acceptance focus |
| --- | --- | --- | --- |
| BUD01 | Secure first access, recovery and additional devices | `/setup`, `/login`; `auth/setup-page.tsx`, security settings | One-time bootstrap; recovery handling; no bypass for a second user |
| BUD02 | Understand current cash and required actions | `/`; `heute/heute-page.tsx` | Correct date/month scope, missing-data explanations, drill-down |
| BUD03 | Allocate available money, move/cover categories and review targets | `/plan/monat`; `budget/`, domain rules | Cent-exact changes, no forecast income treated as available cash, undo |
| BUD04 | Plan recurring payments, goals and future months | `/plan/erwartet`, `/plan/sparziele`, `/plan/jahr` | Dated versions, due dates, forecast versus actual distinction |
| BUD05 | Manage accounts, opening balances and reconciliation | `/konten`, `/konten/$id`, settings; `ledger/account-form.tsx` | Type/currency/budget membership; opening balance not duplicated |
| BUD06 | Capture expenses, income, transfers and contact shares | `/erfassen`, account register; `ledger/` | Split total equals amount; cash/bank status rules; paired transfers |
| BUD07 | Review incoming proposals and document/payroll results | `/konten/posteingang`; `inbox/`, server payslip contracts | Posting follows source policy; payroll upload alone never books money; atomic linking, duplicates and concurrent changes |
| BUD08 | Track and settle contact outlays and credit | `/konten/kontakte`, `/konten/kontakte/$id` | Recorded settlement boundary, allocations, remaining open balances |
| BUD09 | Track assets, trades, savings schedules and allocation | `/vermoegen/portfolio`; `wealth/` | Shared valuation, explicit quality, schedule does not place a bank order |
| BUD10 | Understand net worth, debt and freedom forecasts | `/vermoegen/nettovermoegen`, `/vermoegen/schulden`, `/vermoegen/freiheit` | Complete debt terms for projections; actual versus scenario distinction |
| BUD11 | Explain results through reports | `/reports`, `/reports/$reportId`; `nav/reports-catalog.ts` | 34 catalog entries, shared calculations, period/source completeness |
| BUD12 | Configure sources, rules, categories and investments | `/einstellungen`; `pages/` and feature contracts | Valid effective dates, explicit reconnection/failure state, audited changes |
| BUD13 | Search, export, privacy and offline capture | `/suche`, export/security/profile; offline queue | Fresh authentication for export, no secrets in archive, idempotent recovery |
| BUD14 | Complete month close and plan next month | `/monatsabschluss/$month`; `month-close/` | Steps resolve actual state; review and parallel-close acceptance |
| ONB01 | Reach a first usable financial state | Proposed; [onboarding](onboarding.md) | Readiness, interruption, optional modules and existing-data preservation |

## Cross-cutting contracts

Requested open extensions BUD09.08 and BUD10.05/06 are defined in
[functional contracts](functional-contracts.md) and [GAP01–03](open-gaps.md).
Their route/source references do not claim that benchmark comparison, portfolio
EUR history or integrated asset-group development is already implemented.

Money is stored as integer cents, other scales follow the data model. Ledger
mutations retain audit/undo, reconciliation locks and existing validation.
Transfers must balance; a forecast is not a booking. Unknown information is not
equivalent to zero. Provisional valuation must remain visible and must suppress
unsafe proposals according to the relevant existing contract.

New work must specify keyboard/focus behavior, screen-reader labels, German
validation/recovery copy, 44 px touch targets, responsive layout and loading/error/
empty states. Screenshot inspection alone never establishes accessibility.

Operational acceptance covers backup/recovery, source freshness, reconnect,
offline retry/conflicts and exact deployed revision. Existing privacy and
authentication boundaries remain mandatory; no financial data or secrets enter
the repository.

## Independent examples for review

All values here are synthetic; they are acceptance examples, not new formulas.

| Case | Given / action | Expected result |
| --- | --- | --- |
| First manual budget | One EUR budget cash account with 100000 cents on an explicit date, no other ledger activity; assign 30000 cents to one category | 70000 cents remain unassigned; account cash remains 100000; category has 30000 available |
| Capture and undo | From the previous state, capture a confirmed cash expense of 1250 cents in that category | Cash 98750, category available 28750; undo restores the exact previous state |
| No double opening | Return to setup after successful account creation and reload twice | The existing opening is reused, not posted again; requires implementation evidence |
| Planned income | Configure a future salary without receiving it | No increase to today's actual cash or available money solely from that forecast |
| Missing data | No usable price/history or no complete debt terms | Explain unavailable/provisional results according to the feature contract; do not display a fabricated complete result |
| Populated installation | Existing accounts, historical bookings and device access | No seed/sample balances or forced financial reset when onboarding becomes available |

## Definition of ready and done

Before implementation: user outcome, scope, preconditions, inputs, business rules,
state transitions, permission requirements, errors/resume, design and independent
acceptance examples are linked from the task. Unresolved owner decisions stay open.

After implementation: link route/API/domain changes, focused regressions, required
checks, design/device evidence where relevant, deployed revision when deployed,
and owner acceptance where required. Keep implementation, delivery and acceptance
as distinct states.
