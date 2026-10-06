# Report verdict sentences (E1)

Every catalog report has one German verdict below its title block. Heute uses the
same line below its quick figures, and the One-Pager repeats it in the printable
header. The Gesamtübersicht also uses this engine. No extra request, persistence,
dependency, ledger calculation or booking is introduced.

`packages/domain/src/reports/verdicts.ts` accepts typed `VerdictFacts`. Report
components pass their existing read-model values; shared table, One-Pager, Heute
and Gesamtübersicht mappings live in `apps/web/src/reports/verdict-facts.ts`.
Money is integer cents; rates are basis points. A report's date range is rendered
as “Zeitraum”, never as a month that would mislabel a multi-month total.

## Facts and priority

Each pure detector returns candidates with a strength. The strongest wins; equal
strength preserves detector and input order. Comparisons describe direction,
without assuming that higher spending or inflation is better. Inflation remains
a neutral numerical summary, following its existing interpretation contract.

| Fact types | Required evidence | Strength |
| --- | --- | --- |
| `unavailable` | Missing, invalid or explicitly unusable primary values | 100 |
| `rule-bad`, `rule-warn`, `rule-ok` | Existing evaluated rule counts | 95 / 80 / 50 |
| `threshold-wealth` | Two observed net-worth values cross a positive round mark | 92 |
| `effort` | Own contribution exceeds the absolute negative market effect | 90 |
| `record-low`, `record-high` | Strict worst/best/top-three rank in at least three consecutive full months | 89 / 88 / 60 |
| `milestone` | First month without overspending in a complete history | 87 |
| `threshold-emergency` | Two supplied coverage values cross a whole month of needs | 86 |
| `negative` | Negative primary value whose desired direction is higher | 85 |
| `streak-savings`, `streak-budget`, `streak-wealth` | At least three consecutive months above the configured savings target, within plan, or with positive wealth change | 72 + length, capped at 84 |
| `debt-down` | Two nonnegative observed debt balances decrease | 76 |
| `category-streak` | At least three consecutive category margins within plan | 70 |
| `market-up`, `market-down` | Existing signed market attribution | 65 |
| `comparison-up`, `comparison-down` | Supplied prior-month/year, average or plan reference | 45 |
| `equivalent` | Positive savings and a supplied cost from an owner's actual category | 40 |
| `summary`, `neutral` | Primary number, or a neutral sentence without strong evidence | 0 |

Records distinguish complete history from an observed window; a twelve-month
window is also checked when the history is longer. Ties do not earn records.
Histories must end at the selected period and contain no missing, duplicate or
invalid months. Partial months and estimated valuations cannot earn records,
streaks, comparisons or milestones. They carry “laufend” / “vorläufig”. Rule
findings and existing market attribution remain available with that caveat.

Availability is intentionally conservative. A detector without supplied
evidence stays silent: no invented emergency-fund history, price for a tank
filling, inferred debt repayment, or guessed prior-year figure. Other reports
use their selected-period primary figure and available comparison.

| Fact family | Fed by | Status |
| --- | --- | --- |
| `history` (records) | monthly tables (Konsum, Sparquote) | fed |
| `savingsRates` | monthly tables, Sparquote | fed |
| `budgetMargins` | monthly tables: minus the overspending of every planned category, `0` = nothing over | fed |
| `categoryStreaks` | monthly tables, planned categories | fed |
| `comparisons` | monthly tables (Vormonat) | fed |
| `wealthChanges` | Vermögensverläufe (month-end changes of the daily series), Vermögen & Schulden (month ends), Gesamtübersicht (monthly rows) | fed |
| `debt` | Vermögen & Schulden: open debts of the last two month ends | fed |
| `netWorth`, `marketCents`, `ownCents` | One-Pager, Vermögensverläufe, Gesamtübersicht | fed |
| `rules` | Finanzcheck | fed |
| `equivalents` | One-Pager (top category, own observed cost only) | fed |
| `emergency` | none | **noch nicht gespeist**: no read model keeps a month-by-month Notgroschen reach in months; Heute's `nearestGoal` has no previous value. Its 10 `threshold-emergency` templates stay in the catalogue until a read model supplies `{months, previousMonths}`. |

Heute supplies a single running month, so it can only show the primary figure
(`summary` / `negative`); streaks, comparisons and thresholds need history that
Heute does not load. The running month of a wealth series counts as an interim
reading (the report period stays unchanged), it is not marked “laufend”.

Where a sentence cannot name every figure, `details` are appended after it
(` · Gespart +1.120 € · Nettovermögen +780 €`); the Gesamtübersicht uses them to
keep “gespart, Markt, Nettovermögen” without a second sentence. A detail is
skipped when the winning fact already names that figure.

## Templates, selection and formatting

`verdict-templates.ts` contains **230 distinct German sentences**: ten per fact
type, with factual, appreciative, dryly humorous and warning tones. The tone is assigned per
line by content (not by position); few lines are dry, none follow a negative fact. Negative
months name the result and a useful next step. Tone never changes a fact. One voice
(“dein”), every sentence has a verb. Comparisons read “{label} {current}, {amount} mehr als
{reference}”. Record lines never claim a peak for rank two or three (they name the real rank);
lower-is-better metrics (Konsum) say “teuerste Monat” / “sparsamsten Monaten” instead of
“schwächste” / “stärksten”.

Selection hashes report ID and period. Odd and even calendar months use disjoint
template banks, preventing adjacent-month repeats even when values change the
set of sentences that fit. A caller can additionally supply `previousTemplateId`
for other period boundaries. No reload state or storage is needed. Length
eligibility considers both visible and masked versions, so privacy preserves the
template. The resulting line, including caveats, is at most 140 characters.

Formatting reuses `formatEuro` (de-AT, whole euros from EUR 100, otherwise cents,
real minus), `formatPercent` and the shared `monthNameOnly`. Percentages and
equivalents have one decimal place; rate differences use percentage points.
A multi-month period has no month to name, so a leading `{month}: ` is dropped
instead of printing “Zeitraum:”. Every number, including round wealth marks, is masked in privacy mode. If no template of the
winning type fits the length limit, the shortest of that type is used. Invalid numbers produce an unavailable
verdict; zero never becomes “−0”. Amount privacy masks numbers, counts and ranks
without storing or exposing unmasked numbers in HTML attributes.

## Adding templates or report facts

1. Add a complete German sentence to the appropriate bank. **Append** it so
   existing IDs remain stable. Keep several short options in each parity bank.
2. Use the supported placeholders: `month`, `label`, `amount`, `n`, `months`,
   `rules`, `verb`, `rank`, `scope`, `threshold`, `reference`, `category`,
   `equivalent`, `equivalentUnit` (dative), `equivalentUnitNom` (nominative/accusative),
   `current` (the figure next to a comparison difference), `strongest` and `worst` (better-aware).
   Plurals use the displayed equivalent or candidate count; ranks include
   “beste”, “zweitbeste” and “drittbeste”. Unknown placeholders fail immediately.
3. Supply only existing typed read-model values. Mark missing, partial and
   estimated inputs explicitly. Never estimate a missing month or copy a formula
   into a component. Only observed own-category costs qualify as equivalents.
4. Add a failing synthetic case before changing a detector or adapter. Run
   `npx vitest run packages/domain/src/reports/verdicts.test.ts
   apps/web/src/reports/verdict-facts.test.ts apps/web/src/reports/verdict-line.test.tsx`.
5. Run `npm run check`, production build and `e2e/verdicts.spec.ts` before delivery.
   The tests render every template and placeholder, preserve a sample snapshot,
   check determinism/non-repetition, edge values, gaps and privacy. Browser tests
   cover all five report groups, Heute, print header, desktop/mobile, light/dark,
   accessibility and overflow. Owner language/device acceptance remains separate.

Synthetic desktop/phone review captures: [screenshots](screenshots/verdicts/README.md).
