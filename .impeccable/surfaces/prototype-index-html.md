---
version: 1
slug: "prototype-index-html"
primary_target: "design/prototype/index.html"
related_targets: []
---

# App-Rahmen + Heute

Scope: app shell (desktop sidebar + top bar, mobile tab bar + round add key) and the page "Heute", plus the booking sheet (amount field with inline arithmetic, YNAB style; no keypad). Static prototype in `design/prototype/` as design reference for the P1 repo. Visitor mode: Operate.

Audience and job: the single household user. Phone: 5-second glance (does the month hold, is anything to do now?). Desktop: entry point of the evening steering session. Heute answers, then offers the next 1–3 steps; it is not a dashboard of equal tiles.

Constraints: de-AT formats, glossary terms from PRODUCT.md, synthetic sample data labelled as such, no real person or provider names, 44 px touch targets, red and green never without sign or icon, full dark mode, reduced motion respected.

Order of next steps: cover overspending → distribute salary → inbox → stale values.

Open: app name (O10) shows as "Finanz-App"; production stack is React/Vite, this prototype is static HTML/CSS/JS.

## Direction contract

THESIS: Heute is a construction sheet. Every figure is a dimension, and every dimension unfolds into its dimension chain down to the booking. Refuses the category default of eight equal white tiles with pill badges and a hero metric.

OWN-WORLD: Blueprint in stance, not wallpaper. Dark = classic blueprint, light and white linework on smooth Prussian blue; light = blue ink on smooth white drafting film. No visible millimetre grid as ground; a faint graticule only behind charts. ISO 128 line types carry meaning (solid = actual, dashed = plan and forecast, dash-dot = previous month). Dimension lines with ticks, a title block as page head, sheet list as navigation, technical lettering for labels, a workhorse grotesk with tabular figures. Only blues; red pencil is the single non-blue ink and means action needed. Hatching only inside bars and chart areas (committed money, the three classes). Elevation marks only in charts and dimensions; elsewhere classic finance symbols and Lucide icons. At most one drafting device visible per region.

STORY: The user sees in one look how much is free until payday and whether the month is on plan, trusts it because each number opens into its sum, and acts on the one to three revisions listed.

FIRST VIEWPORT: Desktop 1440: sheet list sidebar left; top bar with search, inbox count, add booking in ink. Title block across the top of the sheet (current month, Stand, period switch; no verdict sentence, no sheet number). Below it, full width: the free-until-payday figure set large as the dimension text on a dimension line that spans the balance chart from today to payday, elevation mark at the forecast low. Then pace chart (7 cols) beside the revision table of next steps (5 cols), detail extracts one to five below the fold. Mobile 390: same order, dimension line full width, revisions as thumb-sized rows, bottom sheet list bar with round ink add key.

FORM: Blueprint, user-pinned on 28.09.2026 over the roll (seed key 65a833c0, which assigned security printing; the user first chose the precision-calculator pick, then replaced it with the blueprint pin). Signature interaction: tapping a figure unfolds its dimension chain, drawn like a plotter.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
