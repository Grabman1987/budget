# Portfolio Performance

Research date 2026-10-15. [Official website](https://www.portfolio-performance.info/), [manual](https://help.portfolio-performance.info/en/), [official source](https://github.com/portfolio-performance/portfolio). Source is pinned to `805c20dff5d999e987675181b4f1d82f81df10c0`, master `0.89.1-SNAPSHOT`; the website offers desktop 0.89.0. Source-only additions must not be attributed to that released binary. No application was installed/launched, private portfolio opened, upstream tests run or dependencies installed.

The [feature inventory](inventories/portfolio-performance.csv) has 84 records, including one evidence-boundary metadata row. The [calculation](pp-calculations.md), [ledger/import](pp-ledger.md) and [report/settings](pp-source-review.md) audits contain precise pinned sources and uncertainty. The inventory is a bounded study of the relevant feature families, not an assertion that every widget, broker parser or preference has been exercised.

## Purpose, navigation and workflows

PP is a portfolio tracking and performance-analysis desktop application. The central workflow is to maintain securities, cash accounts and security accounts; capture their full transaction history; update prices/FX; then examine holdings, returns and allocation. It is not the envelope engine for the combined Budget target model. Cash accounts, portfolio positions and selected performance scopes are different concepts.

The reviewed UI/manual organizes securities/watchlists, cash and security accounts, investment plans, all transactions, asset statements, performance dashboards/calculation/charts/securities/payments/trades, taxonomies, currencies and price-update status. Table columns, chart series, reporting periods and filters are configurable. Desktop menu differences by platform exist. The separately advertised mobile application is not proof of desktop editing/sync parity and was not investigated as an executable.

Common flows include buying against settlement cash; recording dividends with fee/tax components; transferring cash or securities; deliveries without cash; updating historical prices; importing broker documents into a review; inspecting a performance breakdown; and comparing actual allocation to targets. A quote failure, import mismatch, unknown instrument or inconsistent transaction is a review state, not authority to fabricate a missing value.

## Objects and accounting rules

`Client` aggregates cash accounts, portfolios, securities, prices, events, investment plans and taxonomies. Cash transaction amounts are unsigned magnitudes with a debit/credit type; Budget stores signed cash amounts. Security transaction types distinguish buy/sell, transfers and inbound/outbound delivery. Cross-entries connect paired legs. Fees, taxes and foreign gross values are transaction units. An ex-date and cash-payment date can differ; performance scope determines which date matters. Do not map every PP transaction to one generic Budget expense.

Money has two decimals, share quantities and stored quotes eight at this source version (`money/Values.java`). Quote precision comments from older formats are not authoritative. PP's scaled integers are not all cents. Budget uses cents, 1e-8 units and micro-unit prices; an operator conversion must detect excess quote precision, apply an explicit conversion policy and preserve original input outside public fixtures. A silently truncated field would undermine parity.

A buy/sell connects securities and settlement cash; internal transactions must not become a second contribution to total investment performance. A delivery changes holdings without settlement cash. A security transfer must preserve acquisition provenance; it is not a new purchase at current market value. Splits change units and per-unit basis without inventing cash or profit. Spin-off/merger how-tos can involve multiple manual transactions; the reviewed model does not establish a universal dedicated cost-allocation wizard. Bond/debt classification does not prove accrued-interest, redemption or amortization accounting.

## Returns and basis: materially different variants

PP's client daily index uses `1+r = (end value + external outflow)/(prior value + external inflow)`, then geometrically links daily factors. Thus inflows are available at day start and outflows leave at day end. Budget currently uses `1+r = (end value − signed net flow)/prior value`, placing flows at interval end. With synthetic prior value 100.00, inflow 100.00 and end value 220.00, the methods give 10% and 20% respectively. This is a convention difference, not evidence that either product was executed or that all their scopes align. See `snapshot/ClientIndex.java:82–100` and Budget `packages/domain/src/invest/returns.ts:18`.

Portfolio-plus-cash, security-only and selected-account scopes classify flows differently. Dividends/sales retained in settlement cash are internal to total portfolio performance; they leave a security-only scope. PP security-level tax treatment also differs from total-client treatment. Budget must disclose its existing after-cost treatment and cannot promise PP parity simply by displaying “TTWROR”. [The official method explanation](https://help.portfolio-performance.info/en/concepts/performance/time-weighted/) corroborates the timing and scope distinctions; pinned source and the calculation audit are authoritative for this reviewed build.

Money-weighted IRR solves a dated cashflow equation; it is not Modified Dietz. Budget already labels Modified Dietz separately from actual/365 XIRR. Preserve both labels, null/failure cases and annualization. Zero/negative opening capital, impossible roots, missing valuation days and multiple sign changes need explicit validity states. A zero-denominator source fallback must not be mistaken for an economically valid 0% return.

Acquisition-cost views include FIFO and moving average. Budget's persisted preference defaults to average, despite an older low-level function/comment using FIFO. Keep that owner-approved default and pass the preference through all consumers. Remaining acquisition basis, realized gain, gross proceeds, fees, taxes and current market value are separate figures. Unknown opening history is incomplete basis, not a free asset with zero cost.

## Prices, FX, reporting and allocation

Prices can be maintained manually or through configured feeds with update status/errors. Provider access, terms, time-zone and historical coverage are external dependencies. Historical as-of values, latest quotes and transaction FX rates serve different purposes. Reviewed PP FX time series can use the first later rate before their earliest observation; empty/fallback series can return 1. This must not be adopted as Budget's missing-FX rule. Budget requires a real on-or-before rate or an explicit incomplete state.

Reports expose holdings/value history, contribution/performance reconciliation, returns, dividends/interest, costs, taxes, risk and benchmark comparisons. Period, filter, method, currency and cost scope must travel with results. Risk estimators, observation frequency and benchmark type are not interchangeable: a price-index benchmark is not an automatically dividend-reinvested total-return index.

Taxonomies offer hierarchical classification, weighted membership and target allocation/rebalancing. Budget already has dated weighted instrument exposures, a limited two-level class/group hierarchy, explicit membership, dated targets and provisional-data guards. Preserve those contracts. Do not create a second timeless taxonomy calculation or let a non-cash classification target become envelope money. Rebalancing recommendations are analytical; no bank order is implied.

## Import/export, automation and recovery

CSV mappings, broker-specific PDF extractors and IB Flex XML are separate import paths. Parsers and duplicate warnings are not a universal guarantee of idempotent re-import. Import review selects rows/instruments and reports errors; source schemas and document variants can change. PDF support does not mean generic OCR. Budget's authorized operator migration remains separate from its product UI; imports are not added by this research.

Investment-plan generation calculates due transactions using dated quotes, FX and fractional units. Missing prices can fail generation. A callable generation algorithm does not prove unattended bank execution or that a transaction actually occurred. Budget's savings proposals require confirmation of actual execution and preserve source transfers separately.

Native XML/protobuf/compressed files, CSV export and password-protected saves have different contents and recovery properties. The encrypted-file implementation is recorded as source behavior in the ledger audit; it is not a cryptographic certification. Backups/restore, password loss, model migration/version errors, file locking and corruption require separate handling. Budget should reuse its own authenticated export and tested encrypted restore design rather than claim file-format compatibility.

The development source includes a local REST API and MCP adapter over open portfolio files. It is off by default, requires global and per-file enablement and client authorization, and can mutate the in-memory file without saving it. The source restricts host/origin access and modal-dialog writes. Nothing was enabled, paired or called. These source-only facilities are a future operator integration reference; they are not a reason to expose Budget's ledger through an additional public API.

## Licenses

Code is [EPL-1.0](licenses/pp-EPL-1.0.txt); the manual declares CC BY-NC-SA 4.0. Dependency and asset licenses remain separate. Before distributing copied or modified covered source, preserve notices and check the EPL source-availability/distribution requirements against the exact reused material. Separate modules have their own boundary; the license is not equivalent to MIT. [Eclipse's license text, §§1–3](https://www.eclipse.org/legal/epl/epl-v10.html) is the primary reference. The recommendation is independent implementation of the financial contracts within Budget, with provenance review before any code reuse. No PP implementation or manual passages are copied into product code.

## Coverage gate

Covered by three bounded source audits and lead review: object relationships/precision; cash/security types; gross/net/fees/taxes/dividends; paired transfers/deliveries/splits and corporate-action limits; investment plans; quotes/FX; basis; client/security returns and timing; risk/benchmarks; report/navigation/settings/taxonomies/rebalancing; import/export/file formats; local REST/MCP; existing tests and licensing. Evidence is source-confirmed or documented, not runtime-observed.

Remaining execution gaps: desktop/mobile behavior, live providers, private history/holdings reconciliation, all broker document variants, full upstream tests, corrupted-file/password recovery and future source-only API deployment. There is no claim of complete PP compatibility. Source-model limitations and manual workarounds remain explicit in the inventory. P2d is closed after canonical CSV/schema checks and lead source review; the next phase is the shared Budget capability assessment.
