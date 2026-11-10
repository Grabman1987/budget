# Portfolio trend strategy — owner brief, issue #762

Status: draft implementation for #762, not a live or fully integrated strategy.
The redesign savings page includes optional settings, daily/monthly projections,
constrained contribution routing and separate rebalancing confirmation. Pure
calculations and persistence are exercised with synthetic evidence. The server
reads the signal index from stored closes (see "Signal series" below); without a
complete, current, correctly identified series it returns an explicit unavailable
state, never synthetic sessions or an inferred signal.

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
timestamps and full verified monthly calendars. `storedStrategyEvidence`
(`packages/db/src/repos/strategy-signal-evidence.ts`) does this from stored
closes; production signals and initial binding allocations therefore
remain unavailable until the series is captured. The execution calendar is separately optional, and its absent
or exhausted coverage leaves the planning date visible and provisional.

Remaining full-feature delivery includes selecting/connecting that trusted
provider and arranging monthly decision capture, required CI, serial integration,
live verification and owner/device acceptance. Do not call the feature complete
based on the synthetic provider tests. Adjacent
#544/#548 own existing portfolio navigation and savings history; #550/#551 own
net-worth composition. This feature must not duplicate or overwrite that work.

## Signal series (evidence provider, #762)

Owner decision 10.11.2026: Ariva is the primary source of the unlevered Nasdaq-100
USD price index, Yahoo the fallback. No schema change: the series is a system
`security` row (`signal-ndx-usd-price-index`, kind `other`, currency `USD`, excluded
from allocations) with ordinary `price` rows, captured by the nightly market run
(02:30 Vienna) through the existing Ariva and Yahoo adapters. Each stored close
names its source (`price.source`); the time it was first stored is the first
`price_audit` row and becomes `observedAt`. Nothing is created or fetched until the
strategy configuration is saved with `enabled: true`; the first run then backfills
430 days (about 290 sessions). A failed source falls through to the next one; when
all fail, the usual run-protocol entry and `stale_value` inbox item appear.

Identifiers (checked read-only on 10.11.2026):

| Source | Identifier | Notes |
| --- | --- | --- |
| Ariva | `https://www.ariva.de/us-tech-100-index/kurse/historische-kurse`, `boerse_id=72` ("Indizes Nasdaq") | Ariva's page for ISIN US6311011026, header "Schluss (Pkt)". The default exchange of that page (216, "Ariva Indikation") is a different, slightly deviating series; the adapter therefore verifies the selected exchange and fails on a mismatch. The similarly named Ariva product with ISIN DE000A4AJC49 is not the index. |
| Yahoo | `^NDX` | `meta.currency` USD, `instrumentType` INDEX, exchange "Nasdaq GIDS"; unadjusted close. |

Verification: for the sessions 03.11.-09.11.2026 the closes of Ariva exchange 72
equal Yahoo `^NDX` to the cent (e.g. 09.11.: 27907.63); Ariva exchange 216 differed by
about 0.03 %. The Ariva page shows points without a currency, so USD is pinned by the
configured instrument and the verified exchange, not read from the page. The
provider rejects the evidence if symbol, currency, quote page, exchange, leverage,
kind or allocation flag of the row differ from these constants, and rejects
manual/imported closes, closes in another currency, and closes without a recorded
observation time or observed before the session ended.

Sessions and calendar:

- Session dates are the dates of stored completed closes, never a weekday guess.
  `completedAt` is the regular 16:00 America/New_York close (early closes at 13:00
  are not modelled; the later time is the conservative bound).
- A published holiday table (`us-equity-calendar.ts`; 2026-2028 from the official NYSE
  page, 2025 by rule plus the 09.01.2025 closing) is used only as a veto and for
  the unobserved rest of the running month: stored sessions must equal the
  scheduled ones from the first stored month start to the newest session (a missing
  scheduled day is a gap, an unscheduled day is rejected), and the next
  monthly signal dates (penultimate/last session) come from the table because they
  lie in the future. Years outside the table yield "unavailable" instead of a guess;
  the table needs a yearly update.
- At least 220 sessions are needed; the newest scheduled session must be stored
  within 30 hours after its close, else the state is `stale`. Rows completed or
  first observed after the as-of time are ignored (no look-ahead).
- `sourceId` shows who delivered the latest 220 closes (`ariva:72`, `yfinance:^NDX`
  or both joined by `+`); `observedAt` per close is the data timestamp.

Capture integrity (signal series only):

- A session that is not completed at the run clock is never stored (no partial bar).
- Every run refetches the evidence window (about the last 260 stored sessions); identical
  closes are skipped without audit noise, so omitted days are backfilled.
- A close first stored before its session ended is a poisoned capture and is replaced.
- Any other differing refetched value is a conflict: the stored close is kept, one audit
  row records it, the run protocol counts it (`conflict`, run `partial`) and the evidence
  is `close_changed_after_capture` until an operator corrects the stored close. Row checks
  (source, currency, observation time) apply only to the evidence window.
- The series is hidden from the user-facing security list (`listSecurities`); exports and
  price reads still contain it.

Not covered: a cross-check between the two sources at runtime, early-close times,
and an automatic first capture directly when the strategy is saved (it happens in the
next nightly or manual market run).

