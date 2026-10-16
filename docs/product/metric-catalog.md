# Metric and rule catalog

The 27 original KPIs from concept chapter 8 are reconciled below with later
SPEC directives. These IDs identify product meaning, not new formulas. A listed
module is a starting point; shared repository read models supply its actual inputs.
No completeness/financial acceptance is inferred from a symbol or test count.

| ID | Metric / primary surface | Calculation meaning | Starting source | Missing-data / override contract |
| --- | --- | --- | --- | --- |
| M01 | Free until payday / Heute | Need + want envelope availability minus unpaid qualifying outflows before the active boundary | [Source](../../packages/domain/src/kpi/free-until-payday.ts) | Explain included commitments and period; no imagined actual salary |
| M02 | Forecast low point / Heute / account forecast | Minimum shared daily projected account cash over the active Monat/Bis Gehalt window | [Source](../../packages/domain/src/heute/balance-forecast.ts) | Latest period-bound horizon supersedes the original generic 90-day label |
| M03 | Pace / Heute / Plan | Actual spending versus scheduled fixed costs and linear variable plan-to-date | [Source](../../packages/domain/src/kpi/pace.ts) | Do not mix spend/plan/assignment; provisional forecast through day 6 |
| M04 | Month-end projection / Heute | Shared current spend/projection/limit model, labeled with active month and basis | [Source](../../packages/domain/src/heute/pace-forecast.ts) | Distinguish projected expense from actual month result; insufficient history explicit |
| M05 | Net cash flow / Reports | Shared household cash-date income minus relevant outflows, with classification explained | [Source](../../packages/db/src/repos/report-ledger.ts) | Openings/internal transfers not earnings; household totals contract owns classification |
| M06 | Savings rate / Reports | (household income minus consumption) / household income | [Source](../../packages/domain/src/kpi/ratios.ts) | Nonpositive income gives unavailable ratio; negative saving remains visible |
| M07 | 50/30/20 allocation / Plan / Reports | Assigned-money class shares, periodic/special amounts as twelfths under existing alloc contract | [Source](../../packages/domain/src/ledger/alloc.ts) | Original expense-only concept superseded; rounding conserves displayed total |
| M08 | Fixed-cost ratio / Reports / rules | (monthly fixed * 12 + annual periodic) / (monthly net income * 12) | [Source](../../packages/domain/src/kpi/ratios.ts) | Nonpositive denominator unavailable; stored rule thresholds configurable |
| M09 | Age of money / Reports | Documented FIFO spending-age calculation over supported actual money events | [Source](../../packages/domain/src/kpi/age-of-money.ts) | No fabricated age before tracked inflows; internal transfers neutral |
| M10 | To assign / Plan | Shared toBeAssigned flow / envelope engine for selected budget month | [Source](../../packages/domain/src/ledger/budget.ts) | Actual cash versus deferred budget month distinct; not projected salary |
| M11 | Target coverage / Plan | Effective target cadence compared with assigned/available basis specified by target type | [Source](../../packages/domain/src/ledger/targets.ts) | No generic percentage when target absent/zero; actual target model authoritative |
| M12 | Overspending / Plan | Count and exact amount of negative applicable envelopes | [Source](../../packages/domain/src/ledger/budget.ts) | Cash/card semantics preserved; a count does not identify enough source funds |
| M13 | Plan deviation / Reports | Displayed actual minus its explicitly identified plan basis for the chosen period | [Source](../../docs/report-correctness.md) | Category/report carry and assignment scope labeled; no cross-scope comparison |
| M14 | Net worth / Vermögen | Shared as-of cash/manual/product valuation in EUR | [Source](../../apps/server/src/api/wealth.ts) | Exclude derived contact receivables; missing FX and quality explicit |
| M15 | Own contribution / market / Vermögen / Reports | Shared net-worth movement bridge under the household/portfolio flow definitions | [Source](../../packages/domain/src/ledger/networth-window.ts) | Transfer between owned accounts is not external contribution; explain residual coverage |
| M16 | Emergency coverage / Vermögen / rules | Nonnegative reserve / mean tracked need spending over supported closed-month window | [Source](../../packages/domain/src/kpi/ratios.ts) | Short history labeled; no positive meaningful ratio without spending basis |
| M17 | Freedom progress / Vermögen | Invested wealth / (annualized supported consumption * configured multiple) | [Source](../../packages/domain/src/wealth/freedom.ts) | Default multiple 25; distinguish target, progress and current saving projection |
| M18 | TTWROR / Reports / portfolio summary | Shared chained flow-adjusted daily/window return | [Source](../../packages/domain/src/invest/performance.ts) | No meaningful return without capital; effective dates and external flows disclosed |
| M19 | Money-weighted return / Reports | Existing XIRR/Modified Dietz conventions as labeled by the selected read model | [Source](../../packages/domain/src/invest/performance.ts) | Never label an approximation XIRR; matching private methodology still required |
| M20 | Allocation deviation / Portfolio | Dated actual minus managed target with explicit universe/denominator | [Source](../../packages/domain/src/wealth/allocation.ts) | Stored class bands override defaults; leverage-risk denominator is a separate measure |
| M21 | Portfolio costs / Reports / R22 | Documented known-TER weighted funds plus separately identified actual fees/cost series | [Source](../../packages/domain/src/rules/books.ts) | Unknown TER/coverage matters; do not mix R22 TER and another all-in ratio |
| M22 | Distributions / Reports | Actual recorded dividend/interest flows in the stated period and universe | [Source](../../packages/db/src/repos/portfolio-costs.ts) | Do not infer missing distributions from a price-return benchmark |
| M23 | Debt service ratio / Schulden / rules | Monthly loan payments including interest / monthly net income | [Source](../../packages/domain/src/kpi/ratios.ts) | Missing terms/income unavailable; no invented installment |
| M24 | Debt-free date / Schulden | Shared monthly payoff simulation using complete supported contractual terms | [Source](../../packages/domain/src/debt/payoff.ts) | Unpaid/unreachable outcome and variable-rate limitations explicit |
| M25 | Card utilization / Schulden | Documented signed card debt relative to positive explicit limit | [Source](../../packages/domain/src/debt/overview.ts) | Without valid limit no invented ratio; direction/sign labeled |
| M26 | Source freshness / Settings / Heute | Elapsed time since each source last succeeded, with coverage separately identified | [Source](../../apps/server/src/api/read-source.ts) | Never use last attempted fetch as last success; stale threshold follows source contract |
| M27 | Open inbox work / Heute / inbox | Current actionable queue/read-model count under the active visibility policy | [Source](../../packages/db/src/repos/inbox.ts) | Acknowledged warnings, filtered counts and duplicate source tasks distinguished |

## Shared presentation acceptance

State unit/currency, scope, actual/as-of/forecast dates, source/coverage and
comparison basis. Keep stored cents and render rounding separate; dimension chains
must reconcile after rounding. No data is different from observed zero; absence
need not mean missing history if the configured scope truly has no records.
For each changed metric test a literal example, refund/negative case, zero or
missing denominator, boundary day and cross-surface comparison (AC12/13/19).

## Registered rules

Registry: `RULE_CODES` and `RULE_DEFS`. There are 22 current codes. Each exposes
enabled, applicable/evaluable, status, parameters, value and action. Stored
parameters override defaults. R17–R22 begin disabled; R23 remains deferred.

| Code | Name | Stage | Registry goal / next action |
| --- | --- | --- | --- |
| R01 | 50/30/20 | 2 | Ziel 50 / 30 / 20; Wunsch-Envelopes kürzen, bis die Anteile wieder passen. |
| R02 | Notgroschen | 2 | min. 3, Ziel 6 Monate; Notgroschen-Rate erhöhen, bis 3 Monate Bedarf erreicht sind. |
| R03 | Vom Vormonat leben | 2 | Ziel ≥ 30 Tage; Puffer im Budget-Konto aufbauen, Überschüsse erst ab 30 Tagen Geldalter abziehen. |
| R04 | Pay yourself first | 1 | Zukunft zuerst; Zukunft-Envelopes am Gehaltstag zuerst füllen. |
| R05 | Sinking Funds | 2 | alle bei Fälligkeit; Rücklagen für periodische Ausgaben aufstocken. |
| R06 | Kreditkarte | 1 | immer gedeckt; Kartenzahlung aufstocken, bis der Saldo gedeckt ist. |
| R07 | Dispo | 1 | ≥ 0 € in 35 Tagen; Zahlungen verschieben oder Geld auf das Budget-Konto übertragen. |
| R08 | Schuldenquote | 2 | ≤ 30 %; Kreditraten prüfen: Laufzeit oder Umschuldung. |
| R09 | Tilgungsreihenfolge | 2 | Zins > 5 %: tilgen; Sondertilgung für Kredite über 5 % Zins vor dem Investieren einplanen. |
| R10 | Fixkostenquote | 2 | ≤ 55 %; Verträge und Fixkosten prüfen. |
| R11 | Lifestyle-Inflation | 3 | Ausgaben ≤ Einkommen; Neue Ausgaben nur aus dem Einkommenszuwachs finanzieren. |
| R12 | Windfall | 2 | 10 % Genuss; Sonderzahlung verteilen: 10 % Genuss, der Rest nach Wasserfall. |
| R13 | Asset Allocation | 3 | Standardband: der kleinere Wert aus ±5 Prozentpunkten und ±25 % des Sollgewichts. Gespeicherte individuelle Bänder haben Vorrang.; Nächste Sparrate in die untergewichtete Klasse lenken. |
| R14 | Klumpenrisiko | 2 | Einzeltitel ≤ 10 %; Große Einzelpositionen nicht weiter aufstocken. |
| R15 | Spekulativer Anteil | 2 | ≤ 10 %; Spekulative Produkte einschließlich gehebelter ETF nicht weiter aufstocken. |
| R16 | Freiheitszahl | 3 | Fortschritt steigt; Sparrate prüfen: der Fortschritt zur Freiheitszahl ist gesunken. |
| R17 | Investitionsquote vom Brutto | 2 | Ziel 25 %, mindestens 15 %; Sparplan bis zum Bruttoziel erhöhen. |
| R18 | Vermögensindex | 2 | Richtwert Index 1,0; nur Warnung; Abstand zum Richtwert prüfen. |
| R19 | Grenz-Sparquote | 3 | Mindestens 50 % des Zuwachses sparen; Mehr vom Einkommenszuwachs für Zukunft zuweisen. |
| R20 | Regelmäßig investieren | 2 | 11 von 12 Monaten; Sparplan und vollständige Tradehistorie prüfen. |
| R21 | Hebel und Fremdkapital | 2 | Hebel ≤ 10 %, kein Plattform-Minus; Hebelanteil und Verrechnungskonten prüfen. |
| R22 | Fondskosten | 3 | Kostenquote ≤ 0,30 %; TER prüfen und günstigere Fonds erwägen. |

Registry goal strings are interface defaults, not an independent calculation
contract. In particular R07's older “35 Tage” registry label is subject to the
newer shared active horizon; class bands/risk follow the stored risk policy.
For exact thresholds/evaluability use [book rules](../concept/book-rules.md),
[risk policy](../portfolio-risk-policy.md), [horizon](../heute-horizon-1005.md),
`rules/params.ts`, `rules/evaluate.ts` and their shared input read models.

Historical evaluation uses dated financial inputs, dated exposures/targets and
current maintained metadata/parameters according to those contracts; do not
pretend all rule parameters are historically versioned. Disabled preview,
unavailable input and fulfilled are distinct; only enabled/evaluable results
contribute according to the documented denominator. A dismissed warning is not
a repaired financial condition.
