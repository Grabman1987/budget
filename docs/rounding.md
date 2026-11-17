# Rounding policy for derived money and units

Epic #1225, package F7. Binding text: SPEC section "Rounding". This file holds the inventory and the evidence.

## Policy

- **Half away from zero**, symmetric for negatives: `+0.5` becomes `+1`, `-0.5` becomes `-1`, `-2.5` becomes `-3`. A refund of x and a charge of x never round differently.
- **Exact BigInt intermediate**: the product `a * b` is formed in BigInt, so values beyond 2^53 (for example 90 trillion cents times 10 000 basis points) do not lose precision. One integer division at the end, one rounding step per derived value.
- Helpers (`packages/domain/src/wealth/int.ts`, exported from `@budget/domain`):
  - `mulDivRound(a, b, d)`: `a * b / d`, `d > 0`.
  - `roundDivCents(n, d)`: `n / d`, `d > 0` (= `mulDivRound(n, 1, d)`).
  - `ratioBp(value, total)`, `shareBps(values, total)`: basis points; the second adds up to exactly 10 000.
- Never produces `-0`.
- Floor and ceil stay for **allocation** (largest-remainder splits that must add up exactly) and for **counts** (days, weeks, chunks). Those are not rounding of money.
- `Math.round` stays only for display-only ratios, index maths and time. In `packages/domain/src` and `packages/db/src` an eslint rule (`no-restricted-properties`, `eslint.config.js`) forbids it outside the allow-list `MATH_ROUND_ALLOWED` in the same file. New money code must use the helpers; extending the allow-list needs a reason in review.
- Old behaviour for comparison: `Math.round` rounds ties towards +Infinity (`-0.5` becomes `-0`), and `Math.floor((2a + b) / (2b))` does the same for negative `a`. The helpers differ from them only for negative exact ties and where a floating-point intermediate lost precision.

## Inventory (non-test product code, 2026-11-17)

Counts are source lines containing `Math.round`, `Math.floor`, `Math.ceil`, `Math.trunc` or `toFixed` (300 in total).

| Area | round | floor | ceil | trunc | toFixed | Class | Treatment |
| --- | --: | --: | --: | --: | --: | --- | --- |
| `packages/domain` | 24 (was 57) | 29 | 5 | 8 | 3 | mostly (a) before, now (b)/(c) | 33 `Math.round` sites and 4 local half-up dividers migrated, remaining `Math.round` are allow-listed (see below) |
| `packages/db` | 4 (was 9) | 2 | 2 | 0 | 1 | (a) migrated; (b)/(c) allow-listed | 5 sites migrated |
| `packages/market` | 5 | 1 | 0 | 0 | 0 | (b) index maths, (c) time | left (VPI index in micro-units, see follow-up) |
| `packages/import-pp` | 1 | 0 | 0 | 0 | 0 | (a) 5 % match tolerance | left, tolerance only |
| `packages/fixtures` | 30 | 7 | 0 | 0 | 0 | (c) synthetic data generators | out of scope |
| `packages/ui` | 0 | 2 | 0 | 0 | 0 | (c) layout | out of scope |
| `apps/server` | 1 | 2 | 4 | 0 | 7 | (c) time, timeouts, log text; one (a) in `migrate-pp-cli.ts` | left |
| `apps/web` | 48 | 19 | 41 | 7 | 10 | (b) display, (c) layout, six (a) inputs/ratios | left, see follow-up |

### Class (a) migrated in domain and db (43 call sites incl. 5 local copies of a half-up divider)

| File | Value | Now |
| --- | --- | --- |
| `domain/forecast/liquidity.ts` | daily spread of a monthly amount | `roundDivCents` (local copy removed) |
| `domain/forecast/report.ts` | lever percentages | `mulDivRound` |
| `domain/goals/goals.ts` | average monthly rate | `roundDivCents` |
| `domain/heute/daily-budget.ts` | free money per day | `roundDivCents` |
| `domain/heute/net-worth.ts` | change in bp | `mulDivRound` |
| `domain/heute/pace-forecast.ts`, `domain/kpi/pace.ts` | pace curve, remaining variable spend | `roundDivCents`, `mulDivRound` (local copies removed) |
| `domain/invest/cost.ts` | partial amount/fee/tax of a trade (was `x * (taken / requested)` in floating point), extra units, cost rate bp | `mulDivRound` |
| `domain/invest/invest.ts` | cost of units sold (average, FIFO), split units, fund cost (TER) | `mulDivRound` |
| `domain/kpi/ratios.ts` | ratio bp, reserve tenths of months, average need | `mulDivRound`, `roundDivCents` |
| `domain/kpi/rules.ts` | windfall enjoy share | `mulDivRound` |
| `domain/kpi/stage.ts` | stage progress bp | `mulDivRound` |
| `domain/ledger/alloc.ts` | 50/30/20 twelfths to cents, overflow bp | `roundDivCents`, `mulDivRound` |
| `domain/ledger/networth-structure.ts` | asset share bp | `mulDivRound` |
| `domain/overview/explorer.ts` | average per month | `roundDivCents` |
| `domain/overview/year-report.ts` | year change bp | `mulDivRound` |
| `domain/report-tables/income-expense.ts` | average per month | `roundDivCents` |
| `domain/reports/month.ts`, `domain/schedule/occurrences.ts` | local half-away dividers | `roundDivCents` |
| `domain/reports/planning-accuracy.ts` | deviation bp, mean absolute bp | `mulDivRound`, `roundDivCents` |
| `domain/rules/evaluate.ts` | monthly overshoot in euros, windfall allowance | `mulDivRound` |
| `domain/schedule/payments-preview.ts` | yearly average of base/upper | `roundDivCents` |
| `db/repos/bookings.ts` | FX conversion of the original amount | `mulDivRound` |
| `db/repos/contracts-report.ts` | net income per month | `roundDivCents` |
| `db/repos/portfolio-costs.ts`, `db/repos/portfolio-summary.ts` | cost rate bp, class share bp | `mulDivRound` |

### Class (b)/(c) still using `Math.round` (allow-listed)

| File | Why it is not money |
| --- | --- |
| `domain/date/date.ts` | whole days between dates (time) |
| `db/repos/portfolio-report-fixture.ts` | synthetic price series (test data) |
| `domain/kpi/age-of-money.ts`, `domain/report-tables/tables.ts` (2) | age of money in days, CSV percent with one decimal |
| `domain/reports/verdicts.ts`, `domain/rules/health.ts` | display text and 0..100 scores |
| `domain/spending/coicop.ts`, `domain/spending/inflation.ts`, `db/repos/inflation-report.ts` | price indices and index changes (floating-point index values; money in that module already uses `mulDivRound`) |
| `domain/wealth/allocation-report.ts`, `db/repos/strategy-signal-evidence.ts` | micro-unit weights and index closes |

### Left for later (class a, not changed here)

- `domain/ledger/alloc.ts:115`: `specialIncomeAnnualCents * windfallShare` with a floating-point share; needs the share as basis points.
- `db/repos/rule-inputs.ts:322` `Math.round(annualIncomeCents / 12)` and `db/repos/heute.ts:253` local `roundDiv` (half up, negatives differ): files owned by parallel work, replace with `roundDivCents`.
- `packages/market/src/vpi.ts` (index micro-units), `packages/import-pp/src/statement.ts:196`, `apps/server/src/imports/migrate-pp-cli.ts:356` (`Math.round(Number(x) * 100)` parses a typed euro amount).
- `apps/web`: stored/compared values `ledger/account-form.tsx:88` (typed euro to cents), `pages/inflation-basket-settings.tsx:304`, `assignment/rule-editor.tsx:524` (typed percent to bp), `reports/compare-report.tsx:41`, `reports/table-grid.tsx:122`, `reports/category-report.tsx:371` (bp ratios; should call `mulDivRound` through the domain). The other web sites format numbers for display.
- Files of the payroll report, contacts and `read-source*` were not touched (parallel work); any `Math.round` there is left for later.

## Conformance values

Literal values in `packages/domain/src/wealth/int.test.ts` (`roundDivCents` table with negative ties, no `-0`, divisor check, products beyond 2^53) and `packages/domain/src/rounding-policy.test.ts` (call sites: average rate, change bp, ratio bp, TER cost, average cost with 9.0e15 cents times 2.0e12 units).

| n / d | result |
| --- | --: |
| 1 / 2, 3 / 2 | 1, 2 |
| -1 / 2, -3 / 2 | -1, -2 |
| 5 / 10, -5 / 10 | 1, -1 |
| 9 007 199 254 740 991 × 5 000 / 10 000 (= …495,5) | 4 503 599 627 370 496 |
| -9 007 199 254 740 991 × 5 000 / 10 000 | -4 503 599 627 370 496 |
| 9 007 199 254 740 990 × 2e12 / 3e12 | 6 004 799 503 160 660 |

## Behaviour changes

- Negative exact ties now round away from zero (were towards +Infinity): `averageRateCents`, `changeBp`, `terCostCents`, 50/30/20 twelfths, averages per month, year change bp, planning deviation bp, FX conversion, and the pace and liquidity dividers when the numerator is negative.
- Partial trade amounts/fees/taxes in `invest/cost.ts` used `value * (taken / requested)` in floating point; they are now exact, so a result can differ by 1 cent where the old product landed just below or above a tie.
- Products beyond 2^53 (very large units times cost) are now exact instead of rounded to the nearest double.
