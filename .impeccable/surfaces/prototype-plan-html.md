---
version: 1
slug: "prototype-plan-html"
primary_target: "design/prototype/plan.html"
related_targets: []
---

# Plan › Monat

Scope: page "Plan", register "Monat", desktop and mobile, inside the established blueprint world (DESIGN.md). Registers Jahr, Erwartet, Sparziele are visible but not built. Static prototype `design/prototype/plan.html`. Visitor mode: Operate.

Audience and job: the single household user. Primary: on payday bring "Zu verteilen" to 0 by filling the waterfall stages top-down. Secondary: during the month, cover overspent envelopes. Desktop first, same logic as a list on the phone.

Content: 9-stage waterfall (PRODUCT.md): 1 Fixkosten & Mindestraten, 2 Laufender Monat, 3 Liquiditätspuffer, 4 Periodische Rücklagen, 5 Notgroschen Minimum, 6 Teure Schulden, 7 Notgroschen Ziel & Sparziele, 8 Investieren, 9 Günstige Schulden oder Investment. About 30 sample categories. Two sample months: September 2026 at 17.09. (all distributed, one overspent envelope) and Oktober 2026 on payday (4.612,00 € to distribute).

Constraints: columns Zugewiesen · Aktivität · Verfügbar only; goal and pace live in a thin bar under each row, never as columns. Assign inline with the same arithmetic amount input as the booking field. Triage is a state (a band above an unchanged table), never a re-sorted mode. Toggle Wasserfall | Gruppen | Klassen, default Wasserfall. Red only for action needed (overspent, over-assigned).

## Direction contract

THESIS: The month is a parts list ordered by the money waterfall. Every stage is an assembly with a summed dimension; money fills stages from the top until it runs out, and the page shows exactly where it stopped. Refuses YNAB's flat group list with pill badges and a separate goals column.

OWN-WORLD: DESIGN.md blueprint unchanged: drafting film / Prussian blue, ink lines, Archivo with tabular figures, Barlow Semi Condensed lettering, title block, dimension chains, revision marks. New here: the stage rail as a flow schematic (stage boxes joined by one flow line with arrowheads, fill level as solid ink tint), position numbers 1.1, 1.2 in lettering, ghost suggestions as dashed-outline values.

STORY: The user sees how much is left to distribute and which stage is next, accepts the waterfall's suggestion stage by stage or all at once, fixes any overspending first, and trusts every figure because it unfolds into its sum.

FIRST VIEWPORT: Desktop 1440: title block with month switcher ‹ September 2026 › and Stand; register tabs; the "Zu verteilen" figure with its dimension chain (Übertrag + Einnahmen − Zugewiesen) beside the 50/30/20 band; when overspent, the triage band (Rev. A · Treibstoff −12,40 € · Decken) directly under it; then the stage rail (3 cols, sticky) left of the parts-list table (9 cols) with toolbar (Wasserfall | Gruppen | Klassen · Überzogen · Geld verteilen). Mobile 390: figure and chain, triage band, horizontal stage strip, list rows with bar; tap opens a bottom sheet with the assign field.

FORM: Surface roll seed key 7a668b26 dealt 6 Stückliste (lead), 4 Wasserfall-Ordnung, 3 Triage zuerst. The user chose Wasserfall-Ordnung as structure, kept the Stückliste as table grammar and Triage as a conditional state. Signature interaction: "Geld verteilen" shows ghost suggestions per row and fills stages one by one while "Zu verteilen" counts down.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
