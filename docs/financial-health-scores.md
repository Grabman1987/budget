# Financial Health Scores — method v1

Issue #814, owner decision 2026-10-28. This is a current, deterministic assessment
inside Finanz-Check. It adds no booking rules, writes, score history, recommendations
engine, personal-data requirement or pension-gap category.

## Interpretation and aggregation

Scores are integers from 0 to 100; higher means closer to the stated criteria.
Weights are a chosen orientation model, not an objective financial law. They are
versioned as `budget-health-v1`; changing eligibility, thresholds, weights or
aggregation requires a new method version and literal regression examples.

The category weights are cashflow/reserves 40, debt/service resilience 30 and
portfolio structure/concentration 30. Cashflow/reserves has the largest weight
because it measures ongoing household capacity and its immediate buffer. The
other two receive equal weight; neither debt size nor investment wealth alone is
a judgment of the household.

Within cashflow/reserves, saving capacity and reserve coverage each weigh 50.
The equal split makes ongoing capacity and the existing buffer equally visible.
Debt uses the existing R08 debt-service assessment, subject to the completeness
checks below. Portfolio uses R13 structure (40), R14 concentration (40) and R15
speculative exposure (20). Existing rule statuses map to 100 (`ok`), 50 (`warn`)
and 0 (`bad`). The rule engine, risk denominators, leverage classification,
configured limits and dated allocation targets are unchanged.
Structure and concentration receive equal emphasis; speculative exposure has a
smaller extra weight because it also influences structure and concentration.
These fixed metrics use stored rule parameters even when the source rule is
disabled; changing rule participation never silently removes a scoring criterion.

The weighted category average is rounded to the nearest integer, halves upward.
It uses the category values shown on screen. A verified absent portfolio is not
applicable: its 30 weight is excluded, rather than awarded 100 or treated as 0.
All remaining weights are displayed. Missing applicable metrics are never
excluded or reweighted: their category and the overall score are unavailable.
Known metric results remain visible, with evaluable weight shown separately as
data coverage. Zero evaluable categories yields no overall score, never 0 or 100.
Overall coverage is the weighted evaluable metric weight divided by applicable
category weight. For example, half-known cashflow and complete debt/portfolio
give `0.5×40 + 30 + 30 = 80%` coverage, with no overall score.

## Sources, windows and scoring

Every source is read in one read-only database transaction at one explicit
`asOf` day supplied by the server. No current assessment is mixed with a future
forecast or a selected historical report month. Source windows are named in the
response and UI. Shared `referenceMonth` counts the current month on its final
day; otherwise it ends with the preceding month. Earlier running months are not
counted as complete. Sum income and consumption first, then call shared
`savingsRate`; never average monthly percentages. Use the shared rounded basis
points/tenths, round each metric, round the category, then aggregate the displayed
category scores.

| Metric | Shared source and direction | v1 criterion |
| --- | --- | --- |
| Saving capacity | Finanz-Check monthly income/consumption facts, last up to 12 completed months. R11's net-income convention includes the existing annual-income twelfths; spending is Bedarf plus Wunsch. Shared `savingsRate`; higher is better. | 0 points at zero/negative saving capacity; 100 at the stored R01 Zukunft-share target; linear, rounded and capped between. A zero target gives 100 only for nonnegative capacity. No positive income means unavailable. |
| Emergency reserves | Existing R02 `emergencyCoverage`: reserve-role balances at the assessment day divided by average Bedarf over the existing up-to-12-completed-month window. Higher is better. | 0 points at zero coverage, 100 at stored R02 target months, linear, rounded and capped between. Nonpositive/unusable target or no positive Bedarf denominator means unavailable. Negative reserve balances retain the existing zero-coverage convention. |
| Debt/service | Existing current debt inventory and R08 numerator/reference-month income and thresholds. Lower service burden is better. | Existing R08 status mapping. Known absence of liabilities gives 100 only after the inventory is evaluable. Funded cards retain the existing monthly-settlement convention. Missing liability valuation, missing service coverage or unusable income is unavailable; a partial repayment lower bound cannot earn healthy points. |
| Portfolio structure | Existing R13 result, stored policy and dated complete class targets. | Existing status mapping. Missing targets or classification is unavailable, not an unmanaged healthy portfolio. |
| Portfolio concentration | Existing R14 single-product and crypto/P2P-platform exposure, including leverage. | Existing status mapping. A missing required platform identity is unavailable. |
| Speculative exposure | Existing R15 classification, gross exposure, denominator and configured limit. | Existing status mapping. |

A short ledger history is explicitly labelled with its actual completed-month
window. Missing months inside that window are unavailable and are never filled
with zero. Source cents remain safe integers; unsafe/non-finite values and unsafe
sums (including intermediate signed sums before cancellation) are unusable,
not rounded into a plausible assessment.

## Completeness and special cases

- An empty/unreadable ledger does not prove an absence of debt or investments.
- A true zero amount is retained as zero. A source error/unknown amount is not.
- A known debt-free inventory receives 100 debt points, even when the cashflow
  category cannot yet be evaluated. This never makes a partial overall score.
- An existing portfolio without a usable positive denominator is unavailable.
  A verified empty explicit allocation scope/zero scoped holdings with complete
  values is not applicable; this does not claim there are no investments outside
  that scope. Missing quotes/FX, estimated/stale valuations, unclassified exposure
  or missing required platform identity never silently improve a result.
- Debt-service eligibility must cover every liability. Loan installments must be
  known and covered by the existing R08 numerator. An unfunded card or another
  liability without a proven service basis is unavailable. No repayment schedule
  or healthy service ratio is invented from an incomplete lower bound.
- Reserve valuation quality is checked for the actual reserve accounts. Existing
  fallback valuations are not accepted as a known emergency buffer.
- A shared source read that cannot be evaluated is labelled with its reason;
  unexpected request failures use the report's error/retry state. Cached results
  are labelled stale/offline and never presented as a fresh assessment.

## Explicit personal context

V1 does not infer risk tolerance or family status. #812/#813 have no implemented
explicit scoring input in this increment. Household size, name, birth date and
family status neither change points nor gate known financial facts. The stored
rule parameters and dated allocation targets remain explicit owner inputs; this
layer neither changes them nor silently selects different targets.

## Independent literal reference cases

These examples define the method independently of its implementation:

1. Cashflow income 100000 cents and consumption 90000 cents gives 10% capacity.
   With a 20% target that is 50 capacity points. Reserve coverage of 3.0 months
   against a 6-month target gives 50 reserve points, hence cashflow score 50.
   R08 `ok` gives debt 100. Portfolio R13 `warn`, R14 `ok`, R15 `bad` gives
   `50×0.4 + 100×0.4 + 0×0.2 = 60`. Overall is
   `50×0.4 + 100×0.3 + 60×0.3 = 68`.
2. The same cashflow/debt facts with a verified absent portfolio yield
   `(50×40 + 100×30) / 70 = 71.428…`, displayed as 71. There are two applicable
   categories and complete data coverage; portfolio is explicitly not applicable.
3. A missing reserve with known capacity points leaves the cashflow score and
   overall score unavailable. Cashflow data coverage is 50%, not 100%.
4. Known zero saving capacity and known zero reserve coverage yield cashflow 0.
   This differs from missing income or a missing reserve valuation.
5. No evaluable source categories yields no overall score and 0% data coverage.

The domain, read-model/API and report tests cover the anchors and adjacent
boundaries, weights and rounding, missing/partial/not-applicable cases, unknown
valuation and liability data, repeatability, authenticated read-only access,
privacy masking, source links, both themes and desktop/390px/WebKit iPhone.
