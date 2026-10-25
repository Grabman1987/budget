# SPEC-008 — Valuation, currency precision and FX boundaries

CAP-019; WP-003 and later WP-011. Existing valuation assurance first; conditional transfer design is a separate future gate.

## 1. Goal and user problem

Avoid complete-looking totals built from missing prices, assumed FX or incompatible precision. Preserve usable native cash while explaining the source, age and policy of consolidated values.

## 2. Sources and reference behavior

YNAB-073/075, ACT-100/101, PP-007–010/045–047/058/096–099/110. [PP valuation audit](../../research/rea/pp-calculations.md) and CASE-012/013. Budget `packages/domain/src/invest/series.ts`, `packages/db/src/repos/{portfolio,market,portfolio-summary}.ts`, `packages/db/src/schema/{bookings,invest}.ts`, `docs/allocation-quality-scope.md`. PP before-first FX and empty-series parity are source behavior, not desirable Budget defaults.

## 3. Intended Budget behavior

Reuse current owner-approved quote/trade/cost fallback and quality DTOs. Surface actual valuation day, source day/currency, FX day/source and missing/stale/estimated reasons at relevant results. Keep native balances readable when EUR values are incomplete. Explain any approved future-trade fallback explicitly as look-ahead data. First increment adds no new price service or valuation formula.

## 4. Scope and exclusions

First slice: metadata/quality consistency and lossless adapter checks. Later WP-011 may implement a separately accepted manual cross-currency transfer contract. Current same-currency-only transfer rejection stays. No Actual notes-based fixed-FX rewrite, assumed 1:1 FX, general provider selection framework or retrospective source-currency trade provenance fabrication. No automatic cross-currency bank matching in the proposed first transfer slice.

## 5. Flows, errors and empty states

Owner opens a value's existing quality detail, sees the affected position/currency and can follow current manual quote/data-source workflow. Incomplete totals are clearly incomplete; missing native cash is different from unavailable EUR conversion. Proposed transfer preflight shows both native legs, executed rate, separately documented charges and historical valuation policy; rejection leaves no leg. Price/FX refresh failure preserves previous usable stored observations and their dates.

## 6. Rules and formulas

Existing market value: units/1e8 × priceMicro/1e6 × EUR-per-currency-rateMicro/1e6, converted to cents at the existing position/day boundary. Keep existing rounding for current figures; do not silently change historical values. Cash conversion uses dated on-or-before EUR-per-unit FX; only EUR→EUR is exactly one. Preserve latest approved quote/trade fallback order and split barriers. Adapters require safe integers, valid positive rates and explicit scale: YNAB milliunits must be divisible by 10 for lossless cents; PP 1e8 quotes fit micro-prices only when divisible by 100. A nondivisible input is rejected or goes to explicit operator rounding review, never silently truncated.

Conditional transfer proposal: two linked principal legs retain their own signed native amounts/currencies; an executed rate is the positive ratio `destinationNative/sourceNative`, with orientation stated. Same-currency legs still sum to zero. At reporting-day reference FX, any source/destination EUR value difference is a disclosed FX execution/spread effect, not a second synthetic cash fee. A separately paid charge is an actual separate fee booking in the same audit group. Internal total-scope flows remain neutral; economic spread remains in total value change. This policy needs explicit approval because it changes transfer/report semantics and cannot be inferred from a date-specific ECB rate.

## 7. Examples and edges

CASE-012 totals 114.00 EUR from USD value 120.00 at .95; attribution is an explanatory synthetic case, not a new FX gain report. CASE-013 leaves EUR unavailable. PP quote 1.23456789 cannot fit six decimals losslessly; quote 1.23456700 can. Conditional transfer: USD principal 100.00 → EUR 90.00, executed .90 EUR/USD; reference .95 values source at 95.00 EUR and destination at 90.00, giving a 5.00 execution spread. Do not also debit 5.00 EUR cash. Separate USD 2.00 paid fee is an additional real event. Test weekends, pre-first FX, zero native balance, stale quote, intervening split, negative cash and closed/mismatched accounts.

## 8. Model and migrations

No new tables in WP-003; reuse existing per-account/position incomplete details. Version any new adapter rounding policy in operator reports. Conditional WP-011 requires additive transfer metadata for leg currencies/amounts, executed-rate orientation/provenance and reviewed spread attribution; existing transfer rows remain same-currency and unchanged. Do not add a parallel ledger. Native trade original-value enrichment is outside this slice.

## 9. Interfaces and integrations

Use existing market/portfolio read APIs and existing operator staging validation. Reuse SPEC-007 result identity. Any future transfer endpoint extends the current audited repository path; body includes both explicit native principal amounts and source provenance, not a guessed ECB amount. API preflight must reject unsupported fee embedding, absent rate orientation or invalid account roles. Bank automation remains disabled for that new variant until separately specified.

## 10. Navigation and design

Konten retains native balance and EUR valuation detail; Vermögen/Reports reuse the same quality explanation. Follow existing detail URLs and warning patterns; color alone is insufficient. Current actionable missing-data state differs from quiet historical negative values. Phone shows short reason with expandable sources, not a new side panel.

## 11. Privacy, security and performance

Authenticated no-store reads, sanitized provider errors, no credential/URL parameter disclosure. Batch quote/FX lookups once per request and reuse current memoized valuation; no per-day network fetch during reports. Conditional transfers require atomicity, locks, idempotency and grouped undo. Exact integer intermediates must be checked for overflow; do not derive book amounts from rendered percentages.

## 12. Dependencies

SPEC-001 ledger boundaries; SPEC-007 identity; existing allocation quality guard. WP-003 is part of first increment. WP-011 depends on accepted posting/rounding policy, WP-008 source review and private migration implications; it cannot start merely because the matrix says a variant is missing.

## 13. Acceptance criteria

- **AC-008-01:** Same existing valuation inputs produce unchanged amounts and correct source/as-of/FX/quality information across consumers.
- **AC-008-02:** Missing FX/price, stale/estimated data and approved look-ahead fallback remain distinguishable; no false complete EUR total or parity fallback.
- **AC-008-03:** Milliunit/quote scale cases accept only lossless conversion unless explicit operator review records the rounding; overflow fails safely.
- **AC-008-04:** Conditional cross-currency design records two native principals, execution orientation, reference-valuation spread and separate real charges without double counting; existing transfer rejection remains until approved and independently tested.

## 14. Tests and validation

Extend current `portfolio-missing-quotes`, `portfolio-series`, `allocation-quality` and adapter tests only for uncovered literal cases. No future FX fill; verify price fallback/split barriers and nullable totals. API/phone tests check native availability, quality source dates, privacy and repeated consumer equality. Conditional transfer tests must include second-leg failure rollback, linked locks, undo and bank-source exclusion; these are future tests, not research executions.

## 15. Open decisions and recommendations

Proceed with existing-quality disclosure and precision assurance. Recommend the conditional manual transfer proposal only after owner approval of spread classification, signed rounding and mixed-source fee handling; unsupported embedded-fee statements remain manual review. Preserve current math/defaults meanwhile. A future policy change must be versioned and must not silently revalue historical bookings or close private parity gates.
