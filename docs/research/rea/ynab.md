# YNAB reference analysis

Research date: 2026-10-15. Scope: public official help/API documentation, an initial controlled access attempt, and a subsequent owner-authorized authenticated Codex-browser inspection. Public API documentation lists v1.87.0; the private application build is unknown. YNAB is a proprietary service; no product source or application code was obtained or copied.

The [feature inventory](inventories/ynab.csv) is the canonical row-level record. Each row has a stable ID, behavior, user problem, benefit, precise source/section, retrieval date, evidence status and uncertainty. The [shared matrix](../../product/feature-matrix/README.md) later maps all rows, including equivalent/overlapping observations, to Budget capabilities. An inventory row is not automatically a proposed implementation.

## Purpose, concepts and principal journeys

YNAB prioritizes money already held into category jobs. Categories express spending priorities rather than the physical location of funds; accounts express that location. A plan combines those categories, accounts, monthly allocations and transactions. Targets describe desired funding; scheduled transactions describe expected dated cash movement. Those are separate objects and must not be added twice when estimating a category's funding gap.

Principal documented journeys are Plan (assign, move, cover, target), Accounts/All Accounts (capture, import review, match, reconcile), Reflect (spending and net worth), and mobile Home (priority/pinned categories, summary and future assignments). Plan settings govern formatting and category structure; user/account settings govern subscription, sharing and authorization. Platform capabilities differ; public instructions frequently separate web, iOS and Android.

Typical sequence: capture or import a transaction → resolve category and approval/match → check category availability → move existing money if necessary → reconcile cleared account money → review the month. Future assignments and targets guide planning; they are not new cash receipts.

## Read-only access and REA evidence

The separate browser-control inventory timed out. REA then launched an owned temporary Chrome profile, navigated to the supplied budget and waited 2.5 seconds, capturing only the final URL. It reached `https://app.ynab.com/users/sign_in`. No account content, screenshots, storage, network payloads or credentials were captured. The temporary browser was terminated normally.

- Evidence ID: `ev_5ed3d9f95a69d304c75838a9965c13d0c8f58883f5d9abf34131e015dca9c0fc`.
- Provider: `rea-playwright-browser-scenario`, version 1; Chrome/Chromium 155.0.8059.40; authority controlled replay; confidence observed.
- Observed claim: that temporary unauthenticated profile reached sign-in. This does **not** establish that the owner's normal browser is logged out or that documented functions were observed in the private plan.
- No private URL identifier or raw REA request is persisted here. The login redirect remains the only REA product-runtime finding. The subsequent authenticated observations below used Codex browser control, not REA; public help/API rows remain **documented**.

### Authenticated read-only observation ledger

The owner then supplied an authenticated Codex-browser tab. That changed the access conditions and reopened P2a before substantive Toolkit analysis. Only generic controls, structure and navigation were recorded. No screenshots, copied account/category/payee names, email addresses, financial figures, transaction lists, tokens or private identifiers were saved. All observations are dated 2026-10-15; application build unobserved. Source locator: authenticated `https://app.ynab.com/`, then the named product surface.

| Observation | Surface and directly observed aspect | Related inventory rows | Not verified |
| --- | --- | --- | --- |
| YOBS-001 | Plan category grid has Assigned, Activity and Available columns, group controls, progress-bar On/Off controls and month navigation | YNAB-001, 083, 085, 097 | No assignments, grouping or preference writes |
| YOBS-002 | Monthly summary shows carryover, assigned, activity, available, target needs, expected income and future-month funding | YNAB-003, 007, 026, 095, 096 | No historical recomputation or income-edit action |
| YOBS-003 | Focused-view menu exposes Underfunded, Overfunded, Snoozed, Money Available, New View and Manage Views | YNAB-081, 082 | Custom-view configuration/creation not tested |
| YOBS-004 | Selecting an existing category shows target detail, Edit Target, Snooze and Notes; selection was cleared afterward | YNAB-020–026, 089, 098 | No target, note or snooze mutation |
| YOBS-005 | Expanded Auto-Assign lists Underfunded, prior assignment/spending, average assignment/spending and reset options; disclosure restored closed | YNAB-027–031 | No proposal applied; a conditional option not visible is not declared absent |
| YOBS-006 | Ready to Assign has a breakdown control; Recent Moves exposes assignment/move filtering and a recent-history description | YNAB-002, 087, 088 | No money move, undo or reconciliation action |
| YOBS-007 | Reflect navigation exposes Spending Breakdown, Spending Trends, Income v Expense and Net Worth; the latter two opened with scope/export controls and generic assets/debts or income/expense structure | YNAB-064–068 | No export/download, report values or numerical parity test |
| YOBS-008 | All Accounts and a single account expose capture/import entries, search/view controls and cleared/uncleared/working balances; single-account Reconcile entry is visible | YNAB-041–044, 049, 057, 059 | No capture, import, reconcile or booking selection action |
| YOBS-009 | Credit-card and loan surfaces are distinct; card register has balance/reconcile controls; loan page shows interest/target/payoff concepts and Update Balance | YNAB-009–019, 036–040, 080 | No payment, term, balance or target change; interest math untested |
| YOBS-010 | Plan menu exposes plan/account settings, payee management, export, Fresh Start and plan switching; Plan Settings displays currency/placement/number/date controls | YNAB-046, 062, 076, 091, 094, 099 | No export, Fresh Start, payee or settings write; settings dialog cancelled |

Returned to Plan with no settings dialog and no selected category. Only navigation, disclosure opening/closing and selection were used; no financial/save/apply actions were invoked. Two browser responses timed out; current state was inspected before continuing, avoiding duplicate action assumptions. These observations corroborate controls and read navigation; they do not promote documented financial algorithms to runtime-verified calculations.

## Business rules and calculation boundaries

| Topic | Documented reference behavior | Budget implication |
| --- | --- | --- |
| Assign/available | Assign existing money; categories expose assigned, activity and available amounts | Reuse shared envelope calculations; keep plan money separate from bank liquidity |
| Month boundary | Positive category money rolls over; cash overspending reduces the following month's assignable pool; unfunded card spending becomes card debt | Literal month-end cases are required; negative cash and credit have different consequences |
| Credit-card funding | A funded purchase moves a reserve to the card-payment category; payment transfers cash rather than recording spending twice | Preserve a distinct payment reserve and account debt; do not use a generic expense formula for payments |
| Returns/rewards | Expense refunds go to the original category; statement credits reduce debt without creating a matching reserve | Test refund, reward, positive-card and prior-month cases separately |
| Targets | Weekly calendar counts; monthly set-aside versus refill; due-date and balance targets have different carry/spend behavior | Target mode, period, due date and inclusion in underfunded funding must be explicit |
| Auto-Assign | Selected/all visible-category scope and a reviewable proposal; dated obligations and target/history options | Reuse Budget's explicit shared assignment API; no unreviewed cash or ledger creation |
| Recurrence | Future series and posted instances are distinct; date clamping and enter-now have special rules | Keep Budget's effective versions and stable expected-payment identity |
| Loan estimate | Public help uses monthly interest approximation from entered terms | Display estimate/method; lender-booked interest remains source data |
| Reconcile | Compare cleared money, excluding uncleared transactions; adjustment is an explicit money-changing operation | Never treat a discrepancy as a presentation-only warning or silently manufacture an adjustment |

Primary rule sources are row-linked help sections: [rollover](https://support.ynab.com/en_us/when-the-month-rolls-over-a-guide-rkyyd6qC9), [cards](https://support.ynab.com/en_us/handling-credit-cards-overview-ry7cNub1s), [target types](https://support.ynab.com/en_us/getting-started-with-targets-ryAEP08xC), [underfunded](https://support.ynab.com/en_us/underfunded-a-guide-BJwPhQO09), and [loan interest](https://support.ynab.com/en_us/handling-interest-in-loan-accounts-a-guide-r1Y17LAkj). Exact mixed cash/card allocation ordering, every recurrence exception and internal target rounding are not published calculation contracts in the reviewed evidence.

### Synthetic acceptance probes derived from the reference

These are analyst-designed tests, not observations of the private budget:

1. Category starts with 10,000 cents; a funded card expense of 3,000 leaves 7,000 spendable and reserves 3,000 for payment. Paying 3,000 transfers bank cash to card liability and consumes the reserve; it creates no second 3,000 expense.
2. At month-end a cash deficit of 2,000 and a credit deficit of 3,000 must not both be subtracted as cash from next month's assignable amount. The 2,000 reduces the pool; the 3,000 persists as unfunded debt. Mixed-category ordering remains a separate investigation.
3. A weekly **set-aside** target of 2,000 cents with its selected week-start weekday occurring five times has a gross monthly requirement of 10,000; four occurrences give 8,000. Refill-mode rollover can reduce the remaining request. A fortnightly schedule is a different concept.
4. Reconcile a bank-cleared balance of 10,000 against YNAB-cleared 10,000 and an uncleared outflow of 1,500: reconciliation difference is zero, working balance is 8,500.
5. A refund and ordinary new income with equal positive amounts must not automatically have the same effect on household income reporting or assignment-based target progress.

## Data, integration, reports and recovery

Public API entities include plan, account, category group/category, payee, month, transaction/subtransaction, scheduled transaction and money movement. Report views include spending, income versus expense and net worth; Age of Money is a distinct cash-age measure, not investment return or a guaranteed runway. Reports must expose scope because tracking-account transfers and card payments do not behave like ordinary categorized expenses.

File import, bank linking and API import/mutation are separate workflows. Bank matches and duplicate suppression are not interchangeable. Export produces reviewable data rather than a full round-trip application backup. Some mobile export/import paths are absent. Multi-currency use is documented through separate plans; it does not supply Budget's unified EUR valuation model.

API integration constraints: HTTPS authorization; milliunits require lossless conversion checks before integer cents; rolling token rate limits and delta knowledge cursors require bounded retry/checkpoint handling. The reviewed API changelog now uses `/plans`, retaining older `/budgets` routes for compatibility. No YNAB token was requested or used. [Official API documentation, Data Formats / Delta Requests / Rate Limiting / Changelog](https://api.ynab.com/).

Errors and recovery include negative assignment, overspending, incomplete target funding, import connection delays, duplicate/match review, cleared-balance discrepancies, revoked sessions and offline/stale synchronization. Undo availability differs by platform; web help says refresh/logout ends the current undo history. A Fresh Start preserves configuration in a new plan while keeping an archived original; it is not proof that exported CSV can restore that application state. [Undo/redo](https://support.ynab.com/en_us/how-to-fix-mistakes-with-undo-and-redo-HJzO5CfA9), [reset/Fresh Start](https://support.ynab.com/plan-resets-and-fresh-starts-HkXYR_c0q).

## Relevance and early conflicts with Budget

Preserve envelope/card distinctions and explicit previews; Budget already implements much of this. Do not replace its nine-stage distribution policy with YNAB ordering without a deliberate selectable policy. Reuse Budget's durable audit/undo rather than copying shorter session-only limits. Retain native-currency source amounts plus explicit EUR conversion rather than adopting separate plans as a currency workaround. User-facing file import, multi-user sharing and wholesale fresh-start workflows conflict with current V1 boundaries and need explicit disposition in the matrix.

YNAB's user-facing behavior is a comparison reference, not the sole truth for Budget's existing owner-approved rules. Full financial parity remains a later private comparison using aligned scope, dates and mappings.

## Coverage audit and closure

| Search area | Coverage | Remaining gap / reason |
| --- | --- | --- |
| Purpose/navigation/concepts | Official documentation plus authenticated web navigation | Onboarding and other platforms not exercised |
| Budget/categories/moves/targets/auto assignment | Documented plus observed grid/inspector/view/disclosure controls | Internal precision and mixed cash/card ordering need independent fixtures; writes excluded |
| Accounts/bookings/transfers/splits/reconcile | Documented plus observed register, card and loan surfaces | Private balances and stored data deliberately excluded; changes not exercised |
| Scheduled items/loans | Documented | Every calendar/lender exception not established |
| Settings/personalization/sharing | Documented; web plan format controls observed then cancelled | Other platforms, sharing and saved setting changes not exercised |
| Reports/import/export/sync/API | Documented | Bank-provider availability and real-source reliability not tested |
| Securities/quotes/dividends/fees/tax/performance | Tracking scope only established | No evidence of a native securities ledger/TTWROR suite in reviewed YNAB sources; absence of evidence is not a universal absence claim |
| Errors/offline/recovery | Public procedures | Runtime state transitions, stale age and full failure matrix not verified |
| Source/license | Proprietary service; public API/help | No application source audit; no copied product code |

P2a is closed again after the authenticated supplement: 99 inventory rows (95 documented, four observed control/display features), with ten scoped observation records corroborating additional documented rows. This is not a claim to have exercised every screen, option or calculation. Write behavior, other platforms and listed calculation details remain gaps. Next product: Toolkit for YNAB.

Independent evidence review checked rollover, cards, target modes, imports, undo and API constraints. The weekly probe was narrowed to set-aside mode; a multi-URL CSV cell was normalized. `YNAB-009`/`080`, `039`/`050`, `032`/`061` and `040`/`051` are overlapping observations to consolidate in the matrix, not independent feature-count claims.
