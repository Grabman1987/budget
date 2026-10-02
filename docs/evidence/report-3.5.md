# Report 3.5 — first stored-goal slice

`/reports/sparziele` connects the original prototype's goal section to existing stored goals.
This is partial report coverage: emergency-fund reach, Tagesgeld allocation, independent
funding for goals sharing a source, a linear Soll path and owner acceptance remain open.
No private financial data or new financial policy is used.

## Source and display contract

- Existing authenticated `GET /api/goals` selects the server month. Its progress/rate/forecast/status values feed bars, source table and details unchanged. Existing `goalBar`, `goalLine` and `planSummary` are reused; no `goalTotals` or aggregate money chain is added.
- The header's report-specific `Stichtag` is that month's last day, labelled `Monatsende`; it is the source/read boundary, never a synchronization stamp. Loading/error replaces it with loading/unavailable, and browser assertions cover the exact September30 boundary and both states.
- Category backing is month-end Available from the protected EUR budget. Account backing is the month-end native cash balance, never nullable securities/portfolio valuation. `GET /api/accounts?asOf=<month-end>` and `/api/categories` provide live identity and currency metadata only.
- Only a unique live category or EUR account shows figures. Shared, missing/deleted, absent, dual-linked and foreign-currency sources keep their goal identity/date but show unavailable progress/rate/status. The existing repository's zero fallbacks cannot become false report figures.
- Combined reads hide all cached figures while any source is loading and after refresh failure. Retry rechecks every source. The query uses `LEDGER_KEY`, already invalidated by goal/category writes, booking/account writes, undo and redo; no new mutation or endpoint exists.
- Details reuse identical API values and identify the last-three-month assignment/growth basis. Filtered source bookings end at the viewed month end; category Plan and primary Sparziele links retain that month. The bar tick is labelled target amount, never an invented Soll/start date.

## Focused verification

- `goals-progress-model.test.ts`: literal category and account figures, unique EUR source identity, missing/dual/shared/foreign source guards, zero/negative rate, reached/null forecast, unsafe or incomplete numeric data.
- `goals-progress-query.test.ts`: real synthetic API September2026 category85000/target300000/remaining215000/needed21500/rate25000/June2027/on_track; account30000/target100000/remaining70000/needed11667/rate10000/April2027/behind. Repeated GETs and failed metadata reads preserve stored goals, bookings, envelopes and audit rows exactly.
- `use-category-writes.test.tsx`: report rereads after shared audited writes, undo and redo alongside expected-payment families.
- `e2e/goals-progress-report.spec.ts`: literal bar/table/detail equality and source URLs, keyboard panel focus/escape/return, scrollable table, shared/missing/no/foreign sources, reached/large exact cents, zero/negative rate/no date/overdue, loaded→blocked metadata→error→retry and empty state.
- Real seeded synthetic API drives all five report rows without writes. Light/dark screenshots and Axe serious/critical checks run at actual viewport widths1440 and390; document width must not overflow. The goal section is visually compared with `design/screens/desktop/report-sparziele.webp`; original sections lacking stored sources remain explicitly open.

Full repository checks and owner/private acceptance are separate integration gates.
