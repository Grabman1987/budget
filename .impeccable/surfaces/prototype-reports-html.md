---
version: 1
slug: "prototype-reports-html"
primary_target: "design/prototype/reports.html"
related_targets: []
---

# Reports

Scope: page "Reports" with a catalog and 30 reports (since 29.09.2026 feedback round; originally 25), desktop and mobile, inside the established blueprint world (DESIGN.md). Static prototype `design/prototype/reports.html` (+ reports-core.js, reports.js). Visitor mode: Read/Operate mix: each report answers one question and unfolds to detail.

Reports (user-confirmed 29.09.2026, extended the same day):
- Monat und Einkommen: Monats-One-Pager, Gehaltsreport, Einnahmen, Geldfluss, Jahresansicht, Kategorieübersicht, Sparquote und Geldalter (1.7), Gesamttabelle (1.8), Projekte und Nebeneinkünfte (1.9).
- Ausgaben und Plan: Ausgabenanalyse, Budgettreue (incl. 50/30/20), Verträge und Abos, Persönliche Inflation, Empfänger-Analyse, Bank- und Zinskosten.
- Zukunft und Vermögen: Liquiditätsprognose (with planned events, levers, verdict), Cashflow-Verlauf, Vermögensverläufe, Jahresvorschau Zahlungen, Sparziele.
- Portfolio (own group): Depots im Vergleich, Allocation, Einzahlungen und Wert, Rendite und Kennzahlen, Kosten/Steuern/Erträge. Vermögen keeps the decisions; Reports show the outcome.
- Überblick: Jahresreport, Finanz-Check-Verlauf (with book-based stage model), Explorer, Kontakte-Abrechnung (one ledger per person), Zeitraumvergleich.

Constraints: one shared sample data model (36 months Oct 2023 to Sep 2026, Sep partial to the 17th) so all reports agree; chart grammar from concept 9.2/9.3 and DESIGN.md (line = level, bars around zero = change, bullet = plan vs actual, heatmap = category × month, Sankey for flows, no dual y-axes, colours by meaning, red only for action needed; pastel green/red allowed for heatmaps and signed changes since 29.09.2026); every figure traceable; printable One-Pager and Jahresreport; no real names, employers or providers.

Decision note: the user chose "alle auf einmal"; no structural concept round.

## Direction contract

THESIS: Reports is the drawing register of the household: a parts list of 25 drawings, each answering one question with one fixed chart form, all reading from one ledger. Refuses the dashboard-widget wall and the chart zoo with a different style per report.

OWN-WORLD: DESIGN.md blueprint unchanged: title block, registers per report group, dimension chains for headline sums, ISO line types, bullet bars, hatch only for classes and committed money, revision table for findings, parts-list tables. New here: heatmap cells as ink density, a Sankey drawn as ink bands, a print sheet (A4 frame with title block) for One-Pager and Jahresreport.

STORY: The user opens the catalog, picks a question, reads the answer in the headline dimension, checks the chart, and drills into categories, months or payees; at month and year end prints the One-Pager or Jahresreport.

FIRST VIEWPORT: Desktop 1440: title block (Reports, Stand, number of reports); registers (Katalog, Monat, Ausgaben, Zukunft, Überblick); catalog as a parts list grouped by theme, each row with position, name, question and chart form. A report: title block row with its own controls (month, year or period), headline figure with chain, main chart, supporting table. Mobile 390: same order as lists; wide tables scroll horizontally with a sticky first column.

FORM: Parts-list and dimension-chain grammar carried over; no roll. Signature: the Monats-One-Pager as a printable drawing sheet.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
