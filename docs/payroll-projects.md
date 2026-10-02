# Captured payroll and project reports

The manual EUR workflow uses the existing `payslip` / `payslip_line` and `project` tables.
Migration 0017 is additive. No capture creates or changes a booking, expected payment or tax assessment.

`POST /api/payslips` and `PUT /api/payslips/:id` take a month, `regular | special`, a nullable
`salary13 | salary14 | other` special type, base `grossCents`, `svCents`, `taxCents`, `netCents`,
nullable existing `bookingId` and `receiptId`, and up to forty `{ section: earning | deduction,
label, amountCents }` lines. Amounts are nonnegative integer cents. Base gross plus additional
earnings minus captured SV, tax and other deductions must equal captured net exactly.
Headers and lines share a transaction/savepoint and audit group. Replacement/deletion retains
soft-deleted lines. `DELETE /api/payslips/:id` retains the booking. Existing group undo/redo
refuses stale snapshots. Receipt reference validation exists; the object-storage upload/UI is separate scope.

`GET /api/payslips?month=YYYY-MM` reads recorded amounts only. Missing months/payments are
unknown, never projected to fourteen salaries. Prior-year gross compares the same recorded calendar
months and payment kinds; a missing matching prior payment makes the comparison unavailable.
The fourteen-position view shows twelve regular month totals and separately labelled 13th/14th
payments; other special payments stay separate. A booking can pay several slips: the consistency
check compares its amount with the sum of all live linked net amounts. Missing/deleted/non-salary
or foreign-currency links remain visible as unavailable. Source links open existing booking details.

`POST /api/projects { name }` and `PATCH /api/projects/:id { name?, archived? }` use existing
audited entities. Archive retains identity and booking attribution, hides the project from new
choices and rejects new booking attribution. Undo of a newly created project is refused while
live bookings still reference it. Undo/redo of rename/archive and retained ledger edits remain supported.

`GET /api/projects/report?period=1M|3M|YTD|1J|3J|Alles` reads closed calendar months, preserving
the household income predicate and each eligible split once. Costs are signed, so refunds reduce
costs. Transfers, contacts/advances, trade settlement, investment/debt/card-payment categories and
capital income are excluded. Untyped uncategorized inflows are not presumed income. Every
project retains monthly results, income, costs, comparable prior-period result and booking ids.
Unsupported project/side-income currencies explicitly make the report unavailable; unsupported
prior currencies suppress the affected comparison. Nebeneinkünfte on budget accounts are shown
as their existing distinct income type, including an unassigned amount. Project profit is not
added a second time to household income.

The source prototype supplies the report sections and chart grammar. Current DESIGN.md's
precision layer supplies the surfaces/tokens; `design/screens` was inspected for section structure,
but its retired shell is not a pixel acceptance baseline. New browser checks use an isolated real
server and passkey session per attempt, synthetic data, both viewports/themes, responsive capture
dialogs, source links, undo and Axe/overflow checks. Receipt uploads, collective/step raises,
inflation comparison, hours/hourly rates and private acceptance remain separate work.

## Verification evidence

The production web/server build and all four isolated browser scenarios passed locally.
The scenarios cover salary capture, a one-cent payout warning, edit/undo, project creation,
archiving with retained P&L, source-booking URLs, both 1440/390 viewports and both themes.
Axe has no serious/critical violations and the document has no horizontal overflow.
The local focused run disables shared-server startup/dependencies only; the unchanged tests
start their own real server, fresh migrated database and passkey session per attempt.
The normal CI configuration still includes these specs in the full desktop/mobile suite.

Synthetic screenshots for review (current DESIGN.md precision layer):

| Report | Desktop 1440 | Mobile 390 |
| --- | --- | --- |
| Salary | [Screenshot](evidence/payroll-projects/salary-desktop.png) | [Screenshot](evidence/payroll-projects/salary-mobile.png) |
| Projects | [Screenshot](evidence/payroll-projects/projects-desktop.png) | [Screenshot](evidence/payroll-projects/projects-mobile.png) |

The screenshots are visual review evidence, not replacement pixel baselines or owner acceptance.
