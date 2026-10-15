# SPEC-007 — Investment calculation identity and explainability

CAP-016/017/018. WP-002, WP-004 and WP-005. First increment adds read-only transparency and evidence to implemented accounting.

## 1. Goal and user problem

Two identical “return” labels can refer to different scopes, flow timing or tax treatment. Make existing Budget results understandable and comparisons reproducible without silently changing their mathematics.

## 2. Sources and reference behavior

PP-001–006/011–014/016–019/041–046/085–092, TK-CalculateIRR and YNAB tracking/report boundaries. [PP audit](../../research/rea/pp-calculations.md), CASE-006–012. Budget: `packages/domain/src/invest/{returns,performance,performance-report,cost,trade-rules,series}.ts`, `packages/db/src/repos/{portfolio,portfolio-summary,trades}.ts`, `apps/web/src/pages/portfolio-performance-report.tsx`. UI already distinguishes Modified Dietz and XIRR and labels security-only scope; do not redo those as missing features.

## 3. Intended Budget behavior

Expose a compact calculation identity for every existing investment summary: scope, interval, EUR currency, return method, flow timing, fee/tax convention, cost preference, valuation policy and quality. Reuse existing figures and valuation detail. Add only missing identity fields and explanation. The same calculation on Vermögen and Reports has the same identity/value; different scopes remain visibly different.

## 4. Scope and exclusions

Include current trades, settlement, basis, TTWROR, Dietz, XIRR, benchmark and risk interpretation. No alternate PP timing implementation, pre-tax-security switch, source-currency gain decomposition, new solver, new benchmark feed or retrospective basis change in the first increment. Separate FX-gain attribution is deferred until complete acquisition provenance exists. Paired security transfer has SPEC-009.

## 5. Flows, errors and empty states

From a result open “Berechnung” and see included scope, dates, components and reasons for gaps. Drill to existing security/account/trade detail. Empty history and unavailable XIRR remain unavailable, never displayed as 0%. Explain current benchmark price-index basis and differing fee/tax scope. A failed metadata request retains current usable values with an explicit unavailable explanation, never guessed fields.

## 6. Rules and formulas

Keep Budget daily `r_t=(V_t−F_t)/V_(t−1)−1` for net signed external flow in `(previousDay,day]`; chain `R=product(1+r_t)−1`. The existing validity policy handles nonpositive base/gaps; expose it, do not fill missing intervals. PP reference uses `(V_t+O_t)/(V_(t−1)+I_t)−1`; do not assert equality. Total-scope trades/dividends inside included cash are internal, while security-only contributions/withdrawals follow existing `series.ts` rules including costs. Gain is `end−start−net external contributions`. Dietz is `(end−start−sum F)/(start+sum(w_i F_i))`, `w_i=(endDay−flowDay)/periodDays`; it is an approximation. XIRR solves `sum(C_i/(1+r)^((day_i−day_0)/365))=0` from investor-signed cashflows. Annualization uses the existing method-specific days policy and validity. Cost preference is passed explicitly: average default, FIFO alternative; unknown basis remains unknown. Display rounding never enters cashflows. Risk/benchmark frequency and price-versus-total-return identity remain explicit; no PP estimator substitution.

## 7. Examples and edges

CASE-008: end-flow 20% versus PP reference 10%; no-flow two days 100→110→121 compounds 21%. CASE-009 one-year XIRR 10%. CASE-010 FIFO realized 150.00/remaining basis 200.00 versus average 100.00/150.00. CASE-007 net dividend 7.00 appears once. Cover complete liquidation, zero units with retained realized gain, unknown opening basis, no/ambiguous IRR root, negative capital, same-day opposing flows, partial month, leap year, missing benchmark and unvalued date. Legacy solver limitations are disclosed, not “fixed” with an invented 0%.

## 8. Model and migrations

No financial schema migration. Add a derived typed `calculation` descriptor to relevant read DTOs; reuse current scope/quality fields rather than duplicate them. Minimal proposed fields: `methodId`, `flowTiming`, `scopeKind`, included stable account/security IDs, `currency`, `from`, `to`, `costMethod`, `feeTaxBasis`, `valuationPolicyId`, `validityReasons`. Descriptor values come from the same path that computed the number, not browser inference. Public method IDs are versioned constants; no generic metric engine.

## 9. Interfaces and integrations

Extend existing portfolio/report responses additively. Keep route/status contracts and auth. DTO builder receives the selected method/scope/options already used for calculation; missing context is a validation defect. Reuse existing performance and valuation services and test that two consumers return the same tuple/value. Operator comparison manifests record the tuple and explicit exclusions without public personal data.

## 10. Navigation and design

Vermögen retains its compact shared performance overview; detailed comparison stays Reports. Reuse current Term explanation, dimension chain, period controls and report detail links, with a retained URL for substantial calculation detail. No extra side panel or control on non-chart details. Amount privacy masks monetary components while method text stays readable.

## 11. Privacy, security and performance

Metadata/underlying facts remain authenticated/no-store; no tokens or private source dumps in logs. Stable included IDs may be returned only to the owner. Construct descriptor alongside existing computation, with no per-position extra requests or duplicated expensive replay. Large detail lists use existing pagination. This read-only increment creates no audit events or financial writes.

## 12. Dependencies

SPEC-001 synthetic boundaries, SPEC-008 valuation quality and existing source-derived series. WP-002 descriptor precedes WP-004 UI; WP-005 validates both together. No dependence on adopting another PP algorithm or accessing private financial data.

## 13. Acceptance criteria

- **AC-007-01:** CASE-006–010 expected values and flow scopes are asserted independently; PP 10% reference is explicitly different from current 20% and is not a product mode.
- **AC-007-02:** API/Reports/Vermögen identity accompanies the exact existing value, including interval, scope, end-flow convention, cost method and fee/tax basis.
- **AC-007-03:** UI retains existing Dietz/XIRR distinction and labels timing/scope; missing values/gaps and benchmark basis are understandable and masked correctly.
- **AC-007-04:** Average/FIFO preference reaches every affected consumer explicitly; unknown basis and retained realized gains are preserved. No numerical/history/mutation changes are introduced by metadata delivery.

## 14. Tests and validation

Use literal synthetic domain/API fixtures, descriptor contract tests and shared-consumer equality tests. Assert old figure fields unchanged across read-only metadata addition; test no writes and no extra unbounded queries. Desktop/phone browser evidence covers interval switching, detail/back navigation, missing states, privacy and accessible explanation controls. Private PP parity still needs independently aligned data/methods and is not claimed by these tests.

## 15. Open decisions and recommendations

Retain current end-flow method and after-cost conventions. Defer selectable PP timing/pre-tax comparison and FX decomposition; require a separate owner decision with migration/parity impact before implementation. If a descriptor exposes an existing calculation defect, isolate that fix with literal evidence; do not smuggle a numerical change into read-only transparency. The first increment can proceed without these later choices.
