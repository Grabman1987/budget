# Portfolio trend strategy — owner brief, issue #762

Status: draft implementation for #762, not a live or fully integrated strategy.
The redesign savings page includes optional settings, daily/monthly projections,
constrained contribution routing and separate rebalancing confirmation. Pure
calculations and persistence are exercised with synthetic evidence. A trusted
production index/calendar adapter is still required: the default provider returns
an explicit unavailable state, never synthetic sessions or an inferred signal.

This owner-requested optional strategy supplements the existing investment
features. Reuse the explicit account universe, dated asset-class exposures and
targets, EUR valuation/quality, savings plans and audited trade execution. Do not
replace existing wealth-stage policies or activate new settings for existing
portfolios automatically. Existing positions and bookings remain intact.

## Target allocation

The owner-configured strategy has these target weights, not mandatory actual
weights between adjustments:

| Category                            | Weak | Mixed | Strong |
| ----------------------------------- | ---: | ----: | -----: |
| Global equities                     |  50% |   50% |    50% |
| Unlevered gold                      |  10% |   10% |    10% |
| Nasdaq-100, daily 2× leverage       |   5% |   15% |    30% |
| Short-duration EUR government bonds |  35% |   25% |    10% |

No portfolio-value threshold reduces risk within this strategy. The Nasdaq
purchase instrument must have daily **2×** leverage; a daily 3× instrument is not
an equivalent substitute. Product selection is explicit, not guessed from a
name. The signal index is separate from the purchased instrument.

One class may contain several securities. All held positions count in its EUR
valuation, including securities no longer receiving contributions. Separately
configure which security receives new funds or internal weights for several
eligible securities. Buy routing must not change economic exposure mappings.
Overlapping global-equity funds are not automatically described as additional
diversification.

## Signal contract

Use the **unlevered Nasdaq-100 USD price index**, not an ETF, leveraged product,
EUR-converted series or total-return series. The provider/index identity and data
timestamps must be visible and validated by the eventual data adapter.

Use only verified completed US trading sessions. Let `current` be the SMA of the
latest 200 closes and `previous` the SMA ending 20 trading sessions earlier.
This requires 220 consecutive valid session observations. Compare exact sums
rather than rounded display averages:

- Strong: latest close > current SMA and current SMA > previous SMA.
- Weak: latest close <= current SMA and current SMA <= previous SMA.
- Mixed: the other two combinations.

Missing sessions, incomplete history, incompatible series or future observations
must not manufacture a signal. A calendar supplied to the pure function is a
verified input contract, not proof that a market-data adapter exists. In
particular, the latest completed session must come from the calendar, not from
the most recent available quote. Source timestamps support reproducible as-of
evaluation without looking ahead.

## Binding decisions versus daily preview

The binding monthly decision uses the penultimate US trading-session close and
becomes effective on the month's last US trading day. Retain dated decisions;
daily previews must not rewrite historical binding allocations.

The daily preview uses the latest completed US session. The next savings preview
uses the currently valid binding targets and current available EUR valuations.
If another monthly decision precedes execution, label the preview provisional.
When required evidence is unavailable, expose that state; never substitute a
guessed regime. An existing valid decision keeps its original provenance.

The nominal contribution date is the 15th. The feature is broker-independent;
broker selection is not required. An optional verified execution calendar can
adjust it to the next execution day. Without such a calendar, an adjusted date
is provisional, never a guaranteed broker/exchange execution date. The execution
calendar and the US signal calendar are separate inputs. Prior month-end-
contribution backtests are not exact results for this mid-month schedule.

## Contribution and rebalancing projections

The user supplies the contribution; no fixed rate is seeded. By the owner's
follow-up decision, invest only that contribution by default. Display existing
free investment cash separately; add it to the funding only on explicit opt-in.
For category `i`,
portfolio value `V`, contribution `S` and target fraction `w_i`:

```text
deficit_i = max(0, w_i * (V + S) - current_category_value_i)
category_purchase_i = S * deficit_i / sum(deficits)
```

Use integer-cent outputs and exact intermediate arithmetic. Overweight classes
can receive zero without selling their positions. Apply the chosen eligible
security routing within each class, preferring internal underweights where
internal targets are configured. Keep zero-deficit and invalid/incomplete-input
cases explicit rather than dividing by zero or silently dropping holdings.

Configured minimums, fees and whole-unit/fractional-unit constraints must be
included before calling a proposal executable. Report residual uninvested cash
separately and reconcile the complete funding identity; no hidden excess spend.
The denominator is the existing explicitly included allocation universe: every
classified EUR holding plus signed investment cash. Category percentages divide
by this same total; positive cash therefore leaves category shares below 100%.
Opting cash into purchases increases funding, but does not add that cash to the
denominator a second time. Only the new contribution increases the denominator.
Unclassified/incompatible holdings, missing valuations or provisional quality
block purchases rather than disappearing from the calculation. Out-of-scope
accounts and instruments follow the existing allocation membership settings.

Category and internal product budgets use exact integer/BigInt deficits and
largest remainders in stable category/configuration order. Non-buy holdings
remain in the class value. Fees consume each product budget: fixed cents plus
the upward-rounded basis-point fee on gross consideration. Minimums apply to
gross consideration; no executed purchase means no charged fee. Whole/fixed
unit steps use exact stored price and FX, rounding consideration upward to cents.
Unknown constraints retain the complete budget as residual. Amount-based
fractional purchases allocate cents without inventing a unit count.

Literal synthetic examples (all money in cents):

- Mixed targets, holdings `[60000, 10000, 10000, 20000]`, no cash and rate
  `10000`: budgets `[0, 667, 4333, 5000]`.
- Holdings `[45000, 9000, 13500, 22500]`, cash `10000`, rate `10000`: denominator
  after the contribution `110000`; default purchase funding `10000`, cash opt-in
  funding `20000`, with no second increase to the denominator.
- Budget `1000`, fixed fee `100` and variable fee `100 bp`: gross `891`, fee
  `109`, residual `0`. A minimum gross of `900` instead retains all `1000`.
- Budget `10000`, whole units priced at `2500` each, fixed fee `100`: three
  units, gross `7500`, fee `100`, residual `2400`.

Rebalancing is a separate proposal: a changed monthly regime targets the whole
portfolio; an unchanged regime permits a full rebalance only at quarter end
(March, June, September, December). Avoid duplicate triggers when both coincide.
Between these events use contributions to reduce underweights. Show sales and
purchases separately from the savings contribution, including configured costs
and the possibility of Austrian tax effects without inventing tax amounts.
Only confirmed execution changes holdings through the existing audited paths.
Automatic broker orders are outside scope.

Completion is a separate explicit owner attestation linked to existing buy/sell
trades since the binding event. Savings-plan executions are excluded. It does not
assert that live market drift exactly equals an earlier proposal, infer taxes, or
create trades. Completion suppresses repeated suggestions for that monthly event.
Its setting is audited, conflict-checked and undoable; changed/deleted linked
trades invalidate it and reopen review. Original monthly decision fingerprints
are checked against retained audit history even after Undo removes a setting.

## Requested view

Lead: **Dein nächster Sparplan: 15. [Monat] – [Rate] €**, showing an adjusted
execution date when applicable. Display binding regime and decision date, daily
preview and data timestamp, next binding decision, portfolio value and free cash.

The table contains category, actual EUR value, actual weight, target weight,
deviation and planned purchase. Expand rows into the configured securities and
provide short, factual reasons for the allocation. Keep due rebalancing proposals
visually separate. Preserve keyboard access and usable mobile tables; screenshot
review and actual browser behavior are distinct acceptance checks.

## Integration and remaining delivery

Strategy configuration, append-only monthly decisions and execution attestations
use audited `app_setting` records; there is no migration. Settings do not alter
existing class targets, tiers, schedules, prices or trades. Monthly decisions are
explicit writes during the penultimate-close/last-session evidence window; GET
requests only project data. An unavailable daily feed does not rewrite a retained
binding decision. Signal evidence is accepted only from the injected server
provider, never from an HTTP payload or browser. The provider must establish the
canonical unlevered Nasdaq-100 USD price-index identity, completed session
timestamps and full verified monthly calendars. No such adapter exists in the
current repository; production signals and initial binding allocations therefore
remain unavailable. The execution calendar is separately optional, and its absent
or exhausted coverage leaves the planning date visible and provisional.

Remaining full-feature delivery includes selecting/connecting that trusted
provider and arranging monthly decision capture, required CI, serial integration,
live verification and owner/device acceptance. Do not call the feature complete
based on the synthetic provider tests. Adjacent
#544/#548 own existing portfolio navigation and savings history; #550/#551 own
net-worth composition. This feature must not duplicate or overwrite that work.
