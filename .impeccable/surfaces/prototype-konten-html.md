---
version: 1
slug: "prototype-konten-html"
primary_target: "design/prototype/konten.html"
related_targets: []
---

# Konten

Scope: page "Konten" with registers Übersicht, Alle Buchungen, Posteingang (Kontakte visible, not built), plus the single-account view (Girokonto) reached from the overview. Desktop and mobile, inside the established blueprint world (DESIGN.md). Static prototype `design/prototype/konten.html`. Visitor mode: Operate.

Audience and job: the single household user. "Was ist passiert?" Check balances and sync health at a glance, find and fix bookings, clear the inbox weekly (about 10 minutes), confirm balances against the bank at month end ("Kontostand prüfen").

Content: accounts grouped Budget-Konten, Sparen, Investment, Schulden, Forderungen with the same sample figures as Heute (net worth 84.730 €). Around 25 sample bookings in September. Inbox with uncategorized bookings, a possible transfer, a deviating expected payment, a stale manual value, an expiring bank consent and the overspending link to Plan.

Constraints: glossary terms (Bestätigt, Kontostand prüfen, vorgemerkt/bestätigt/geprüft); no real names or IBANs; red only for action needed; tabular figures; one drafting device per region; mobile lists instead of tables.

Decision note: no structural concept round was run for this surface; the user asked to continue directly. Structure follows concept chapter 7.3 in the established world.

## Direction contract

THESIS: Konten is the parts list of everything the household owns and owes. Each account is a position with its balance as a dimension and its data source as a stamp; the net worth unfolds from the groups. Refuses the bank-app card stack with logos and balance tiles.

OWN-WORLD: DESIGN.md blueprint unchanged: title block, registers, dimension chain, parts-list table with assemblies, ISO line types in charts, elevation mark only in the balance chart, revision table for the inbox. New here: a source stamp per account (Bank-Sync time, Import, manuell) and a status column for bookings (vorgemerkt clock, bestätigt check, geprüft double check).

STORY: The user sees net worth and which data is stale, opens an account to read its bookings with running balance, confirms the balance against the bank, and clears the inbox with one click per item.

FIRST VIEWPORT: Desktop 1440: title block (Konten, Stand, Bank-Sync status); registers; net worth figure with its chain (Budget-Konten + Sparen + Investment − Schulden + Forderungen); the account parts list with group sums, a 30-day balance line and source stamp per row. Single account: balance line over 90 days with the forecast-free history, elevation mark at the low, dashed zero line; booking list with running balance; "Kontostand prüfen" as a panel. Mobile 390: same order as lists.

FORM: Parts list (Stückliste) grammar carried over from Plan › Monat, no new roll. Signature interaction: "Kontostand prüfen" compares app and bank balance as a dimension (difference must reach 0,00 €) and stamps the bookings as geprüft.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
