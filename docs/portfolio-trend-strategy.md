# Portfolio trend strategy — owner brief, issue #762

Status: new feature contract, not a live strategy. The first delivery slice is a
pure trend calculation; it does not activate a strategy, change target records,
create trades, or implement the complete savings preview described below.

This owner-requested optional strategy supplements the existing investment
features. Reuse the explicit account universe, dated asset-class exposures and
targets, EUR valuation/quality, savings plans and audited trade execution. Do not
replace existing wealth-stage policies or activate new settings for existing
portfolios automatically. Existing positions and bookings remain intact.

## Target allocation

The owner-configured strategy has these target weights, not mandatory actual
weights between adjustments:

| Category | Weak | Mixed | Strong |
| --- | ---: | ---: | ---: |
| Global equities | 50% | 50% | 50% |
| Unlevered gold | 10% | 10% | 10% |
| Nasdaq-100, daily 2× leverage | 5% | 15% | 30% |
| Short-duration EUR government bonds | 35% | 25% | 10% |

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
The precise cost and allocation contract belongs in the contribution delivery
slice, with independently derived cent-level examples.

Rebalancing is a separate proposal: a changed monthly regime targets the whole
portfolio; an unchanged regime permits a full rebalance only at quarter end
(March, June, September, December). Avoid duplicate triggers when both coincide.
Between these events use contributions to reduce underweights. Show sales and
purchases separately from the savings contribution, including configured costs
and the possibility of Austrian tax effects without inventing tax amounts.
Only confirmed execution changes holdings through the existing audited paths.
Automatic broker orders are outside scope.

## Requested view

Lead: **Dein nächster Sparplan: 15. [Monat] – [Rate] €**, showing an adjusted
execution date when applicable. Display binding regime and decision date, daily
preview and data timestamp, next binding decision, portfolio value and free cash.

The table contains category, actual EUR value, actual weight, target weight,
deviation and planned purchase. Expand rows into the configured securities and
provide short, factual reasons for the allocation. Keep due rebalancing proposals
visually separate. Preserve keyboard access and usable mobile tables; screenshot
review and actual browser behavior are distinct acceptance checks.

## Delivery limits

The owner's follow-up decisions are recorded above: optional cash addition and
no mandatory broker selection. The contribution slice must still document the
valuation denominator, treatment of unmapped holdings and exact cost/whole-unit
examples before it supplies executable recommendations.

Remaining delivery includes a verified index/calendar adapter, monthly decision
persistence, constrained contribution and rebalancing projections, settings and
UI, independent finance review, required CI and serial live delivery. Adjacent
#544/#548 own existing portfolio navigation and savings history; #550/#551 own
net-worth composition. This feature must not duplicate or overwrite that work.
