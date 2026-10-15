# Traceability and coverage

Review baseline: source `4841e7eb`, 2026-10-15. This maps documentation and source
entry points, not test-to-financial-acceptance certification. Existing tests listed
below are regression starting points; inspect/add cases for the changed behavior.
ONB01 has no financial onboarding implementation/test evidence yet.

## Requirement families → source → acceptance

| Family | Current server source | Existing regression entry | Acceptance examples |
| --- | --- | --- | --- |
| BUD01 | [Source](../../apps/server/src/auth/routes.ts) | [Tests](../../apps/server/src/auth/auth.test.ts) | AC01/02/22 |
| BUD02 | [Source](../../apps/server/src/api/heute.ts) | [Tests](../../apps/server/src/api/heute.test.ts) | AC08/12/21 |
| BUD03 | [Source](../../apps/server/src/api/budget.ts) | [Tests](../../apps/server/src/api/budget.test.ts) | AC03/08/09/13 |
| BUD04 | [Source](../../apps/server/src/api/expected.ts) | [Tests](../../apps/server/src/api/expected.test.ts) | AC08/10 |
| BUD05 | [Source](../../apps/server/src/api/accounts.ts) | [Tests](../../apps/server/src/api/api.test.ts) | AC03/04/05/07 |
| BUD06 | [Source](../../apps/server/src/api/bookings.ts) | [Tests](../../apps/server/src/api/api.test.ts) | AC06/07/09/23 |
| BUD07 | [Source](../../apps/server/src/api/inbox.ts) | [Tests](../../apps/server/src/api/inbox.test.ts) | AC15/16/21 |
| BUD08 | [Source](../../apps/server/src/api/contacts.ts) | [Tests](../../apps/server/src/api/contacts.test.ts) | AC11 |
| BUD09 | [Source](../../apps/server/src/api/invest.ts) | [Tests](../../apps/server/src/api/savings-confirmation.test.ts) | AC12/13/14 |
| BUD10 | [Source](../../apps/server/src/api/wealth.ts) | [Tests](../../apps/server/src/api/freedom.test.ts) | AC12/18 |
| BUD11 | [Source](../../apps/server/src/api/reports-month.ts) | [Tests](../../apps/server/src/api/report-ranges.test.ts) | AC12/13/19 |
| BUD12 | [Source](../../apps/server/src/api/rules.ts) | [Tests](../../apps/server/src/api/rules.test.ts) | AC12/15 |
| BUD13 | [Source](../../apps/server/src/api/export.ts) | [Tests](../../apps/server/src/api/export.test.ts) | AC02/20/22/23 |
| BUD14 | [Source](../../apps/server/src/api/month-close.ts) | [Tests](../../apps/server/src/api/month-close.test.ts) | AC17 |
| ONB01 | Proposed contract, no current endpoint claimed | New empty/populated/interruption coverage required | AC03–05/24–25 |

UI routes are in [sitemap](sitemap.md), Figma references in [screen contracts](screen-contracts.md),
financial subrequirements in [functional contracts](functional-contracts.md),
and literal cases in [acceptance plan](acceptance-plan.md). Each changed
subrequirement names its AC cases; each report names its source component.

## Existing feature inventory reconciliation

All 50 Y/I IDs in [FEATURES](../FEATURES.md) map below; status claims in that
older inventory remain dated and must be checked against current source. Grouped
requirements do not remove a feature or expand its accepted implementation slice.

| Legacy ID | Capability | Current contract family |
| --- | --- | --- |
| Y13-P | Heute › Pace below Kontoprognose; shared One-Pager chart: Ist solid, Hochrechnung dashed accent (red above cap), Deckel rule; scheduled Plan bis heute dot, context lines off by default behind Mehr anzeigen | BUD02 |
| Y13-C | Heute: three answer cards and nearest unfinished savings goal | BUD02 |
| Y01 | Account overview, budget/tracking/investment/debt roles, closed balances; sidebar card/loan debts in ink | BUD05 |
| Y02 | Account register: inline date/amount, status icons, visible flags; ranged balance chart with pending/recurring preview (0–365 days), limit and crosshair | BUD05 |
| Y03 | Income/expenses: cash confirmed by default, booking-month income, no Budgetmonat; Wiederholen creates a schedule atomically | BUD06 |
| Y04 | Split bookings, account transfers and bulk actions | BUD06 |
| Y05 | Kontostand prüfen and confirmed bookings | BUD05 |
| Y06 | Categories/groups, Bedarf/Wunsch/Zukunft, targets and ordering | BUD03 |
| Y07 | Zu verteilen, Zugewiesen, Aktivität, Verfügbar and rollover | BUD03 |
| Y08 | Credit-card payment categories and cash advances | BUD03 |
| Y09 | Month planning: waterfall, time, groups, classes and triage | BUD03 |
| Y09a | Plan › Monat: faded target/median suggestions, Leere füllen, selected Wie letzter Monat / Ø 3 Monate / Ziel | BUD03 |
| Y10 | Cover overspending with remaining-source label, largest sufficient suggestions and grouped partial bulk cover/undo; distribute money and preview next allocations | BUD03 |
| Y11 | Wiederkehrende Zahlungen: weekly/monthly/quarterly/yearly, versions, due dates, contracts, matching, missed payments | BUD04 |
| Y12 | Savings goals and sinking funds, adopt category targets | BUD04 |
| Y13 | Heute: answer cards, daily allowance, next seven days, single attention block, shared net worth and Pace; further figures in remembered device fold | BUD02 |
| Y14 | Plan › Jahr, planned events and scenario workflow | BUD04 |
| Y15 | Contacts, receivables, repayments and contact statements | BUD08 |
| Y16 | Posteingang: categorize, accept/reject suggestions, resolve exceptions | BUD07 |
| Y17 | Command palette (Ctrl K / ⌘K, phone header search) | BUD13 |
| Y18 | Assignment rules / Immer so zuordnen | BUD07/BUD12 |
| Y19 | Bank connection, consent renewal and reconciliation | BUD07/BUD12 |
| Y20 | Nightly bank/source worker with catch-up | PR01/NFR09 |
| Y21 | Receipt photograph/upload and links to bookings | BUD07 |
| Y22 | Payslip lines, projects and side income | BUD07/BUD12 |
| Y23 | registered rules (`RULE_CODES`), stages and Finanz-Check | BUD12 |
| Y24 | Weekly inbox, payday distribution, month/year/quarter closing routines | PR03–08/BUD14 |
| Y25 | Mobile capture, accessible layout, dark mode | NFR05–07 |
| Y26 | Installable PWA and offline booking queue | BUD13 |
| I01 | Securities, cash/reference accounts, depots and asset classes | BUD05/BUD09 |
| I02 | Buy/sell, deliveries, splits, dividends, interest, fees and taxes | BUD09 |
| I03 | Trade linked atomically to its settlement booking | BUD09 |
| I04 | Historical holdings and daily valuations | BUD09 |
| I05 | Historical acquisition costs and booking-date FX | BUD09 |
| I06 | Moving-average default and optional FIFO | BUD09 |
| I07 | Realized/unrealized gains, including fully sold positions and later snapshots | BUD09 |
| I08 | Broker acquisition amounts, execution amounts, fees and withheld taxes | BUD09 |
| I09 | One security at multiple brokers; depot/platform/class aggregation | BUD09 |
| I10 | Price histories, source per price, primary/fallback adapters | BUD09/BUD12 |
| I11 | Manual prices/valuations and undo | BUD09 |
| I12 | Correct price freshness, initial refresh time and stale-source warnings | BUD12/NFR09 |
| I13 | ECB FX and original-currency amounts | BUD09/NFR01 |
| I14 | TTWROR, XIRR, Modified Dietz and external flows | BUD11 |
| I15 | Volatility, drawdown, Sharpe, beta, benchmarks and monthly returns | BUD11 |
| I16 | Allocation Soll/Ist, region/product structure and rebalancing | BUD09 |
| I17 | Savings plans, execution matching and change proposals | BUD09 |
| I18 | Net worth, own contribution vs market, daily history and composition | BUD10 |
| I19 | Debt repayment / Sondertilgung | BUD10 |
| I20 | Freiheitszahl with Soll-Pfad and target year | BUD10 |
| I21 | PP XML parsing, security matching, reversible transfer and Gate 3 report | OP01 |

OP01 is the separate operator migration contract in SPEC section 10 and
[private-source format](../migration/pp-export.md). Its deliverable is approved
private mapping/transfer/reconciliation evidence under explicit authorization,
not an app import feature. PR01–08 and NFR01–11 are defined in this package.

## Other inventories and completion states

- Fixed navigation: every current `PAGES` entry in [sitemap](sitemap.md).
- Reports: every registered slug in [report contracts](report-contracts.md).
- KPIs and rules: M01–M27 and R01–R22 in [metric catalog](metric-catalog.md).
- Processes: PR01–08, concrete stages in [journeys](journeys.md).
- Proposed design/implementation: O01–O08 and DEC01–04; none called delivered.

Run `npx tsx scripts/verify-product-docs.ts` to check IDs, local links, registered
report/component/feature/rule/navigation coverage and acceptance references.
This protects the documentation's inventory completeness, not business correctness
or external availability. Required `npm run check` still applies to delivery.

A record can be specified, implemented, deployed and accepted separately. Link
exact source, PR/CI, actual deployed revision and owner evidence before advancing
its state. No existing gate is closed merely because all rows are mapped.
