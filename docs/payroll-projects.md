# Captured payroll and project reports

The manual EUR workflow uses the existing `payslip` / `payslip_line` and `project` tables.
Migration 0019 is additive; migration 0020 extends the payslip-line section constraint by
rebuilding that table while retaining live/soft-deleted lines and audit references.
No capture creates or changes a booking, expected payment or tax assessment.
The migration does not infer classifications from labels or rewrite previously captured
earning lines; any earlier reimbursement entered as salary must be corrected manually.

`POST /api/payslips` and `PUT /api/payslips/:id` take a month, `regular | special`, a nullable
`salary13 | salary14 | other` special type, base `grossCents`, `svCents`, `taxCents`, `netCents`,
nullable existing `bookingId` and `receiptId`, and up to forty
`{ section: earning | deduction | reimbursement, label, amountCents }` lines.
Amounts are integer cents, bounded to 100 billion in magnitude. Base gross, net and line
amounts are nonnegative. `svCents` and `taxCents` are signed: positive means withholding,
negative means a refund/correction from an Aufrollung. Capture the signed balance from the slip;
this model does not retain separate positive withholding and correction components within one slip.
Base gross + additional earnings − signed SV − signed Lohnsteuer − other deductions +
reimbursements must equal captured net exactly, with no cent tolerance.

Owner decision: Telearbeit, Fahrgeld/Fahrtkostenzuschuss and Reisespesen (including Diäten and
Dienstreise-Auslagen) are **Steuerfreie Erstattungen**, never salary. All Fahrgeld is entered
as reimbursement even if the slip taxes part of it; the captured tax stays in `taxCents`.
`reimbursementsCents` is exposed separately for month/year/timeline totals and has its own
report rows/column. It never enters `grossCents`, the gross prior-year salary comparison or
any deduction ratio. `salaryNetCents` excludes reimbursements; the salary trend uses this
value and the fourteen-position table separates it from reimbursements and total payout.
Ratios use signed SV/tax/other
balances divided by salary gross, so they may be negative; at zero gross they are null.
The segment band uses salary net only and is hidden for negative SV, any Lohnsteuer refund,
negative salary net or zero gross. Negative tax has its own **Lohnsteuer-Erstattung (Aufrollung)**
line, also shown separately in the monthly chain when other slips have positive tax. Aufrollung
refunds remain salary in the budget; capture does not modify that booking classification.

Create/edit rejects a second live `(month, kind, specialType)` position. The exception is
`special/other` (the existing model's representation of other payments), which may repeat.
Editing the same id and replacing a deleted slip are allowed; undo/redo, including forced
undo, refuses to restore a duplicate and rolls back the entire audit group.
Headers and lines share a transaction/savepoint and audit group. Replacement/deletion retains
soft-deleted lines. `DELETE /api/payslips/:id` retains the booking. Existing group undo/redo
refuses stale snapshots. Receipt reference validation exists; the object-storage upload/UI is separate scope.

`GET /api/payslips?month=YYYY-MM` reads recorded amounts only. Missing months/payments are
unknown, never projected to fourteen salaries. Prior-year gross compares the same recorded calendar
months and payment kinds; a missing matching prior payment makes the comparison unavailable.
The fourteen-position view shows twelve regular month totals and separately labelled 13th/14th
payments; other special payments stay separate. A booking can pay several slips: the consistency
check compares only its eligible salary/special income-type splits with the sum of all live
linked salary net amounts (captured net minus reimbursements). Contact and transfer splits
are excluded; reimbursement and other income splits never inflate the comparison. Candidate
amounts also show the salary/special split sum. Missing/deleted/non-salary
or foreign-currency links remain visible as unavailable. Source links open existing booking details.

`POST /api/projects { name }` and `PATCH /api/projects/:id { name?, archived? }` use existing
audited entities. Archive retains identity and booking attribution, hides the project from new
choices and rejects new booking attribution. `GET /api/lookups?bookingId=...` also retains that
live booking's existing archived project; the editor marks it **archiviert** and preserves it
on unrelated edits. Other archived projects stay hidden. Undo of a newly created project is refused while
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

### PR #139 review fixes (working tree, 2026-10-03)

- `VITEST_MAX_WORKERS=2 npm run check -- -- --testTimeout=30000 --hookTimeout=30000`:
  typecheck, ESLint and Prettier passed; all 223 test files and 2,166 tests passed.
  Worker/timeouts are local settings; repository and CI settings remain unchanged.
  Existing dependencies were reused; no dependency or lockfile change was needed.
- Synthetic payroll domain/API/migration regressions: 18 tests passed, including exact
  cents, signed ratios, reimbursement exclusions, duplicate create/edit/undo/redo rollback
  and preservation of existing line/audit data during migration 0020.
- Production build and four real-API desktop/mobile payroll/project scenarios passed with
  `E2E_PORT=4450 npx playwright test --config dist/payroll-playwright.config.ts --workers=1`.
  This uses the same ignored local config described below. The scenarios now also capture
  reimbursements, enter negative SV/Lohnsteuer, verify separate Aufrollung lines and signed
  ratios, and edit a booking while retaining its archived project.
- Both themes passed Axe serious/critical and document overflow checks. Updated synthetic
  salary screenshots and additional Aufrollung screenshots are linked below.
- Full-suite verification also exposed two pre-existing millisecond-dependent fixture
  assumptions. Fixed synthetic capture times make the duplicate-booking choice deterministic;
  an explicitly earlier fixture timestamp separates the audit update check from SQL/JS clock
  rounding. Both affected files passed all 47 tests. Their production logic is unchanged.
- Prettier formatting was required for the previous migration snapshot 0019; parsed JSON
  content is unchanged. Migration 0020 changes only `payslip_line` in the generated snapshot.

### Initial implementation verification

Verified locally on 2026-10-03 after integration of `origin/main` (implementation commit
`b10d9c1`; the final follow-up changes documentation only):

- `npm ci`: dependencies installed, lockfile unchanged.
- `VITEST_MAX_WORKERS=1 npm run check -- -- --testTimeout=30000 --hookTimeout=30000`:
  typecheck, ESLint and Prettier passed; all 217 test files and 2,077 tests passed.
  Worker and timeout overrides are local execution settings; repository/CI settings are unchanged.
- `npm run build`: production web and server builds passed.
- `E2E_PORT=4450 npx playwright test --config dist/payroll-playwright.config.ts --workers=1`:
  all four salary/project desktop/mobile scenarios passed against that production bundle.
  The ignored local config extends the normal config, selects these two viewport projects/specs,
  and disables shared web servers and setup dependencies. Each scenario still starts its own
  real server, migrated synthetic database and passkey session.

This is local verification, not a claim that the full GitHub CI/E2E suite or owner acceptance passed.

The scenarios cover salary capture, a one-cent payout warning, edit/undo, project creation,
archiving with retained P&L, source-booking URLs, both 1440/390 viewports and both themes.
Axe has no serious/critical violations and the document has no horizontal overflow.
The normal CI configuration still includes these specs in the full desktop/mobile suite.

Synthetic screenshots for review (current DESIGN.md precision layer):

| Report | Desktop 1440 | Mobile 390 |
| --- | --- | --- |
| Salary | [Screenshot](evidence/payroll-projects/salary-desktop.png) | [Screenshot](evidence/payroll-projects/salary-mobile.png) |
| Salary Aufrollung | [Screenshot](evidence/payroll-projects/salary-aufrollung-desktop.png) | [Screenshot](evidence/payroll-projects/salary-aufrollung-mobile.png) |
| Projects | [Screenshot](evidence/payroll-projects/projects-desktop.png) | [Screenshot](evidence/payroll-projects/projects-mobile.png) |

The screenshots are visual review evidence, not replacement pixel baselines or owner acceptance.
