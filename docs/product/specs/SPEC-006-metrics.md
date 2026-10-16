# SPEC-006 — Metric definitions and optional historical cash runway

CAP-015; WP-010. Reuse existing pace, money age, savings and free-until-payday. A bounded later report addition, not a replacement primary KPI.

## 1. Goal and user problem

Prevent spending pace, money age and hypothetical cash coverage from being mistaken for each other. Optionally answer how long current net liquid cash covers a precisely defined recent consumption rate.

## 2. Sources and reference behavior

YNAB-068, TK-DateOfMoney/DaysOfBuffering/DaysOfBufferingExcludeCreditCards/Pacing/SavingsRatio and ACT-092. [Toolkit calculations](../../research/rea/toolkit-calculations.md) records its 30-day-month/lookback and minimum-spend-date quirks. Budget has `packages/domain/src/kpi/{age-of-money,pace,free-until-payday}.ts`, `heute/pace-sources.ts` and `reports/savings-report.tsx` under the web app. CASE-014/015 distinguish denominators. Do not adopt Toolkit heuristics verbatim.

## 3. Intended Budget behavior

Keep existing metrics/placements. Explain each numerator, denominator, period and eligibility. A later optional Reports › Sparquote und Geldalter section may show **Historische Liquiditätsreichweite** with a source breakdown; it is descriptive, not a prediction of future bills or an investment recommendation. Existing forecast remains schedule/event based.

## 4. Scope and exclusions

No subtraction of upcoming schedules or savings into Verfügbar, no alternate money-age algorithm, stochastic projection, default Heute tile or credit-card-exclusion toggle. Initial runway requires 90 complete calendar days of usable ledger history and complete current EUR cash conversion. No historical backfill from invented pre-migration data.

## 5. Flows, errors and empty states

Open metric explanation, inspect eligible accounts and historical consumption, follow existing filtered register links. Incomplete history/FX shows “Nicht berechenbar” with reason and retained native cash. Zero consumption shows “Keine geeigneten Ausgaben im Zeitraum”, not infinity. Negative net liquid cash displays zero coverage plus signed underlying cash; no celebratory status.

## 6. Rules and formulas

As-of is a local ISO day. Window is `[asOf−90 days, asOf)`, excluding the incomplete current day. Consumption is confirmed/reconciled budget-account Need/Want expense activity, refunds offset in the same eligible categories; exclude internal transfers/card payments, opening/adjustment entries, contact repayments, investment funding and Future allocations. Sum signed eligible activity; `S = max(0, −sum(activity))`. Complete-history cash basis `L = max(0, liquid asset cash − outstanding credit-card debt)` in EUR; exclude security value, loan credit limits, positive prepaid card balances and nonliquid assets. Show the selected membership. `days = floor(L * 90 / S)` for `S>0`, with exact safe-integer/rational intermediates; never round a daily cents average first. Money age retains FIFO aged-outflow windows and rounding from existing domain. Pace retains dated fixed costs plus variable-rate model; savings ratio retains its existing earned-income base, separate from capital returns/refunds.

## 7. Examples and edges

CASE-015: L=60,000 cents, S=90,000 cents gives 60 days. L=0 gives zero; S=0 is unavailable. Three spending months 120/0/120 average 80 under calendar averaging, not Toolkit's 120. Refunds exceeding spend do not create negative consumption or infinite runway. Missing a foreign balance's FX invalidates the consolidated numerator; transfers and card purchases/payments must not count twice.

## 8. Model and migrations

No persisted metric totals. Reuse account roles/currencies, booking facts, category classes and valuation quality. Add a pure domain result with eligibility counts, excluded reasons and coverage dates. No new per-account “liquid” column in this slice: use an explicit allowlist of existing cash/checking/savings types and document it. Unclear account purpose is excluded and shown.

## 9. Interfaces and integrations

Extend the existing savings-report read model/API with an optional bounded metric result and its identity, without separate provider calls. SQL aggregates eligible facts once server-side; the browser formats. Reuse existing account/native/FX reads and record-level links. No new financial mutation endpoint.

## 10. Navigation and design

Reports owns the optional secondary metric and its explanation. Heute keeps its owner-approved lead/pace and due list. Use semantic neutral historical presentation, text validity reasons, de-AT integer-day formatting and privacy masking. Narrow screen uses the existing disclosure/table pattern.

## 11. Privacy, security and performance

Authenticated no-store read; do not store account values in local query preferences or telemetry. One bounded aggregate over a 90-day indexed date range; no per-day HTTP requests. Check safe integer products or use exact BigInt internally, serializing only validated numbers. Render unavailable states accessibly.

## 12. Dependencies

SPEC-001 eligible-ledger assurance, SPEC-007 calculation identity, SPEC-008 FX quality, SPEC-005 report/drill conventions. WP-010 follows first-increment evidence and a review of the actual usefulness of another metric.

## 13. Acceptance criteria

- **AC-006-01:** Existing pace, age and savings amounts are unchanged; explanations identify their different scope and denominators.
- **AC-006-02:** CASE-015 produces exactly 60 days; zero/negative cash, zero spend and refunds have the defined states.
- **AC-006-03:** Missing history/FX suppresses a numeric consolidated runway; transfer/card-payment pairs never inflate consumption.
- **AC-006-04:** Optional result stays secondary in Reports and no value changes Available, assignment, forecast or bookings.

## 14. Tests and validation

Pure eligibility/date/rounding cases, literal transfer/card/refund fixtures, DST/leap-day window tests and API coverage/incomplete states. Browser tests check source links, masking, explanatory labels and 390px layout. Compare arithmetic to hand-derived constants, not another call of the metric. No upstream or product tests were executed by this specification.

## 15. Open decisions and recommendations

Recommend retaining the present primary KPIs and adding runway only after the existing source explanations prove insufficient for the owner's review task. The proposed 90-day/minimum-history/type allowlist is the bounded default for that later slice. If another income base, period or liquidity membership is requested, name/version the method; do not silently change this denominator. WP-010 can finish with explanation-only delivery if no distinct runway need is accepted.
