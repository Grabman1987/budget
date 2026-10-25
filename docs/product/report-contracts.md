# Report contracts — current catalog

Source inventory: `nav/reports-catalog.ts` and current `pages/reports-pages.tsx`
at `01a10de8`, 2026-10-15. `REP-<slug>` is a stable documentation ID; catalog
position and Figma R-number are different identifiers. Do not join them by number.

Each row states the acceptance requirement for that report. A current component
entry point proves routing, not verified financial correctness or owner acceptance.
The linked component/read model and feature contract retain detailed formulas.

All reports need loading/empty/error/partial-data states, active scope/date labels,
privacy, accessible chart/table alternatives and source explanation. Period controls
are the registered catalog controls: fixed/month/year/period/print, not a promise
of arbitrary controls on every report. Use AC12/13/19 plus report-specific examples.

## Monat und Einkommen

| ID / route slug | Question / form / controls | Specific acceptance contract | Component source |
| --- | --- | --- | --- |
| REP-onepager | Monats-One-Pager: Wie lief der Monat, auf einem Blatt? / Druckblatt A4 / month, print | Reconcile household income, consumption, saving, cash and month context; printed sheet uses the same figures. | [OnePagerReport](../../apps/web/src/reports/onepager-report.tsx) |
| REP-gehalt | Gehaltsreport: Was bleibt vom Brutto, und wie hat es sich entwickelt? / Maßkette Brutto → Netto, Stufenlinie / month | Separate gross, deductions, special pay, reimbursements and actual payout; missing payslips do not imply zero salary. | [PayrollReport](../../apps/web/src/reports/payroll-report.tsx) |
| REP-einnahmen | Einnahmen: Woher kommt das Geld, kam alles Erwartete? / Gestapelte Säulen, Soll/Ist-Liste / month | Expected versus received income uses actual matching; capital earnings and reimbursements are separately classified. | [IncomeReport](../../apps/web/src/reports/income-report.tsx) |
| REP-geldfluss | Geldfluss: Wohin fließt das Geld? / Sankey / month | One income pool; transfer neutrality and class flows reconcile to household totals; no duplicate source stream. | [FlowReport](../../apps/web/src/reports/flow-report.tsx) |
| REP-jahresansicht | Jahresansicht: Wie verteilt sich ein Jahr über die Monate? / Heatmap Kategorie × Monat / year | Category/month cells reconcile to shared actuals; incomplete/current months and previous-year coverage are explicit. | [YearReport](../../apps/web/src/reports/year-report.tsx) |
| REP-kategorien | Kategorieübersicht: Wie verhält sich jede Kategorie? / Liste mit Verlaufslinie / period | Category totals, refunds, period and history align with linked booking rows; missing history stays distinguishable. | [CategoryReport](../../apps/web/src/reports/category-report.tsx) |
| REP-sparquote | Sparquote und Geldalter: Wie viel bleibt, und wie alt ist das ausgegebene Geld? / Zwei Linien mit Zielmarke / period | Use household income/consumption and documented FIFO money age; no ratio from a nonpositive denominator. | [SavingsReport](../../apps/web/src/reports/savings-report.tsx) |
| REP-gesamttabelle | Gesamttabelle: Alle Zahlen, alle Monate, in einer Tabelle. / Tabelle, 36 Monate / fixed | All displayed months/columns reconcile to shared tables; CSV includes the documented displayed scope, not auth/raw data. | [TotalTableReport](../../apps/web/src/reports/total-table-report.tsx) |
| REP-projekte | Projekte und Nebeneinkünfte: Was bringen die Nebenprojekte unterm Strich? / Gewinn und Verlust je Projekt / period | Project attribution follows actual booking splits; income, costs and resulting balance reconcile without transfer inflation. | [ProjectsReport](../../apps/web/src/reports/projects-report.tsx) |
| REP-einnahmen-ausgaben | Einnahmen und Ausgaben: Was bleibt nach den Ausgaben? / Monatstabelle, Säulen und Nettolinie / period | Actual household table/CSV uses cash date; capital income, reimbursements, reserve treatment and refunds follow shared classification. | [IncomeExpenseReport](../../apps/web/src/reports/income-expense-report.tsx) |
| REP-planungstreue | Prognosegenauigkeit: Wie treffsicher ist die Hochrechnung am 15.? / Monatliche Abweichungsbalken, Prognose/Ist-Tabelle / month | Compare actual forecast/plan evidence under its documented basis; unavailable prior observation is not a fabricated accurate forecast. | [PlanningAccuracyReportPage](../../apps/web/src/reports/planning-accuracy-report.tsx) |

## Ausgaben und Plan

| ID / route slug | Question / form / controls | Specific acceptance contract | Component source |
| --- | --- | --- | --- |
| REP-ausgaben | Ausgabenanalyse: Wofür geben wir Geld aus? / Balken sortiert, Klassenbalken, Heatmap / period | Net consumption/category drill-down respects refunds, class scope and active period; internal transfers excluded. | [SpendingAnalysisReport](../../apps/web/src/reports/spending-analysis-report.tsx) |
| REP-budgettreue | Budgettreue: Halten wir den Plan, stimmt 50/30/20? / Bullet-Balken, 100-%-Balken / month | Separate assigned money, spending and target coverage; 50/30/20 follows assignment/twelfths overrides. | [BudgetAdherenceReportPage](../../apps/web/src/reports/budget-adherence-report.tsx) |
| REP-abos | Verträge und Abos: Welche Verträge binden uns, und was lässt sich kündigen? / Stückliste mit Fristen, Fremdwährung / fixed | Versioned contract amounts, due/notice dates and currencies remain visible; monthly equivalent is not an actual monthly debit. | [ContractsReportPage](../../apps/web/src/reports/contracts-report.tsx) |
| REP-inflation | Persönliche Inflation: Wie stark steigen unsere Preise? / Indexlinie gegen VPI / fixed | Price/basket changes require comparable stored observations; changing quantities/categories is not silently pure price inflation. | [PersonalInflationReport](../../apps/web/src/reports/personal-inflation-report.tsx) |
| REP-empfaenger | Empfänger-Analyse: Bei wem lassen wir das meiste Geld? / Balken sortiert, Bon-Statistik / period | Payee totals use shared net spending and normalized attribution; underlying bookings explain each total. | [PayeeAnalysisReport](../../apps/web/src/pages/payee-analysis-report.tsx) |
| REP-kosten | Bank- und Zinskosten: Was kostet uns das Geld selbst? / Segmentierte Balken je Jahr / fixed | Bank/interest fees depend on explicit account terms and source coverage; unknown cost is not zero saving. | [BankCostsReportPage](../../apps/web/src/reports/bank-costs-report.tsx) |

## Zukunft und Vermögen

| ID / route slug | Question / form / controls | Specific acceptance contract | Component source |
| --- | --- | --- | --- |
| REP-liquiditaet | Liquiditätsprognose: Geht sich das aus, auch mit geplanten Ereignissen? / Linie mit Band, Ereignisse, Urteil / fixed | Daily actual/forecast split, scenario assumptions, events and gaps explicit; scenarios do not post cash. | [LiquidityReportPage](../../apps/web/src/reports/liquidity-report.tsx) |
| REP-cashflow | Cashflow-Verlauf: Verdienen wir mehr, als wir ausgeben? / Säulen, Linie, Balken um Null / period | Household cash-date series reconciles to shared totals with capital memo information separate. | [CashflowReportPage](../../apps/web/src/reports/cashflow-report.tsx) |
| REP-vermoegen | Vermögensverläufe: Woraus besteht das Vermögen über die Zeit? / Gestapelte Fläche nach Kontotyp / period | Shared valuation/own-contribution/market bridge, period and missing FX/history explain the change. | [WealthHistoryReport](../../apps/web/src/reports/wealth-history-report.tsx) |
| REP-vorschau | Jahresvorschau Zahlungen: Welche Zahlungen kommen in den nächsten 12 Monaten? / Zahlungskalender / fixed | Versioned occurrences and event dates follow calendar/shift rules; expected is distinct from received. | [PaymentsPreviewReport](../../apps/web/src/pages/payments-preview-report.tsx) |
| REP-sparziele | Sparziele-Fortschritt: Liegen die Sparziele im Plan? / Fortschrittsbalken mit Soll-Marke / fixed | Progress uses the goal backing and actual funds; future target is not another asset. | [GoalsProgressReport](../../apps/web/src/pages/goals-progress-report.tsx) |
| REP-vermoegen-schulden | Vermögen & Schulden: Was besitzen wir, was schulden wir, und wie entwickelt sich der Saldo? / Balken je Monatsende, Linie Nettovermögen / period | Assets/liabilities use the same date/universe and explain debt sign; no duplicate portfolio cash. | [AssetsDebtsReport](../../apps/web/src/reports/assets-debts-report.tsx) |

## Portfolio

| ID / route slug | Question / form / controls | Specific acceptance contract | Component source |
| --- | --- | --- | --- |
| REP-pdepots | Depots im Vergleich: Wie schlägt sich jedes Depot? / Depots nebeneinander / period | Comparable account/period scope includes its documented investment-account universe; external flow and price-return benchmarks labeled. | [PortfolioDepotsReport](../../apps/web/src/pages/portfolio-depots-report.tsx) |
| REP-pallocation | Allocation: Woraus besteht das Portfolio, und wie weit weg vom Soll? / Sonnendiagramm, Soll/Ist über Zeit / fixed | Dated weights/targets and signed-cash risk policy; composition denominators, unclassified share and quality explicit. | [PortfolioAllocationReport](../../apps/web/src/pages/portfolio-allocation-report.tsx) |
| REP-peinzahlungen | Einzahlungen und Wert: Was haben wir eingezahlt, was ist es wert? / Stufenlinie gegen Wertlinie / period | Daily values and contributions plus monthly reconciliation explain difference; market movement is not a deposit. | [PortfolioContributionsReport](../../apps/web/src/pages/portfolio-contributions-report.tsx) |
| REP-prendite | Rendite und Kennzahlen: Wie gut, wie riskant, gegen welchen Index? / Indexlinien, Kennzahlen, Heatmap / period | TTWROR/money-weighted conventions, effective dates, benchmark gaps and partial months explicit; no future quote backfill of benchmark start. | [PortfolioPerformanceReport](../../apps/web/src/pages/portfolio-performance-report.tsx) |
| REP-psteuern | Kosten, Steuern, Erträge: Was bleibt nach Gebühren und Steuern? / Maßkette, Stückliste je Produkt / fixed | Source taxes separate from illustrative latent tax; avoid double withholding; unknown basis/cost coverage disclosed. | [PortfolioCostsReport](../../apps/web/src/pages/portfolio-costs-report.tsx) |

## Überblick

| ID / route slug | Question / form / controls | Specific acceptance contract | Component source |
| --- | --- | --- | --- |
| REP-gesamtuebersicht | Gesamtübersicht: Was haben Sparen und Markt zum Vermögen beigetragen? / Monatsbalken und Nettovermögen / period | Saved contribution, market and net worth reconcile to shared series under the same scope. | [WholePictureReport](../../apps/web/src/reports/whole-picture-report.tsx) |
| REP-jahresreport | Jahresreport: Wie lief das Jahr? / Druckblatt A4, 2 Blätter / year, print | Printable year summary matches shared yearly totals and coverage; not a second independent ledger calculation. | [JahresreportPage](../../apps/web/src/reports/jahresreport-page.tsx) |
| REP-finanzcheck | Finanz-Check-Verlauf: Welche Regeln sind verletzt, seit wann? / Regelliste mit Statusleiste / fixed | Enabled/evaluable/status denominators and evaluation dates clear; disabled or unknown is not fulfilled. | [FinanzcheckReport](../../apps/web/src/reports/finanzcheck-report.tsx) |
| REP-explorer | Explorer: Eigene Frage, eigene Tabelle. / Pivot mit gespeicherten Ansichten / fixed | Pivot dimensions/measures/filter scope explicit; saved query stores configuration, not frozen invented financial facts. | [ExplorerReportPage](../../apps/web/src/reports/explorer-report.tsx) |
| REP-kontakte | Kontakte-Abrechnung: Wer schuldet wem wie viel? / Saldenlinie, Kontoblatt / fixed | All-time EUR retained statement and running balance preserve credit/allocations; unsupported currency unavailable, not partially summed. | [ContactReportPage](../../apps/web/src/reports/contact-report.tsx) |
| REP-vergleich | Zeitraumvergleich: Was hat sich gegenüber damals geändert? / Balken um Null / fixed | Both periods use the same definitions; unequal/incomplete coverage and zero denominators disclosed. | [CompareReport](../../apps/web/src/reports/compare-report.tsx) |

## Scope and drift checks

There are 34 current reports, not 30. The original numbered catalog is historical;
new entries include total overview, assets/debts, income/expenses and planning
accuracy. [Sitemap](sitemap.md) records exact `/reports/<slug>` URLs.

[Report correctness](../report-correctness.md), [portfolio reports](../portfolio-reports-1004.md),
[performance](../performance-report.md), [inflation](../inflation-basket.md) and
[planning accuracy](../planning-accuracy.md) own special calculation boundaries.
Older performance text is read with the newer dated exposure/valuation directives.
Private return equality still requires identical dates, external flows, universe,
benchmark convention and full history; a component or matching rounded figure is insufficient.
