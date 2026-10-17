---
name: Finanz-App
description: Haushaltsfinanzen als Konstruktionsblatt, Blaupause in der Haltung, nicht in der Tapete.
colors:
  primary: "#1747a6"
  primary-hover: "#0f3a8f"
  on-primary: "#ffffff"
  line: "#1747a6"
  line-2: "#6786ac"
  ground: "#f2f5f9"
  ground-2: "#eef3fa"
  raised: "#ffffff"
  surface: "#ffffff"
  surface-2: "#f6f8fb"
  ink: "#0b1b33"
  ink-2: "#3a4e6e"
  ink-3: "#4d6a89"
  rule: "#d6dfed"
  rule-strong: "#6786ac"
  graticule: "#e9eef6"
  red: "#c42a1f"
  good: "#1d5a35"
  good-hover: "#164a2b"
  on-good: "#ffffff"
  good-soft: "#dcefe1"
  on-good-soft: "#1b5632"
  quiet-soft: "#eef1f5"
  need: "#1747a6"
  want: "#3d86e0"
  future: "#0c7a86"
  plus-ink: "#0b7285"
  minus-ink: "#b8380a"
  dark-ground: "#0b3152"
  dark-ground-2: "#092a47"
  dark-raised: "#0f3b60"
  dark-surface: "#0f3b60"
  dark-surface-2: "#0d3657"
  dark-ink: "#eef6fc"
  dark-ink-2: "#b9d0e3"
  dark-ink-3: "#8fb4d1"
  dark-line: "#d2ecff"
  dark-line-2: "#6f9dc2"
  dark-rule: "#25557a"
  dark-rule-strong: "#4987bc"
  dark-graticule: "#15406a"
  dark-primary: "#d0f4ff"
  dark-on-primary: "#0b3152"
  dark-red: "#ff8b7b"
  dark-good: "#8fd6a8"
  dark-good-hover: "#a8e6c0"
  dark-on-good: "#0b3152"
  dark-good-soft: "#18493d"
  dark-on-good-soft: "#a8e6c0"
  dark-quiet-soft: "#164368"
  dark-need: "#e4f2ff"
  dark-want: "#7cc0f5"
  dark-future: "#6fd8d2"
  dark-plus-ink: "#4fe3d0"
  dark-minus-ink: "#ff9d7a"
typography:
  dimension:
    fontFamily: "Archivo, Segoe UI, system-ui, sans-serif"
    fontSize: "56px"
    fontSizeMobile: "40px"
    fontWeight: 640
    lineHeight: "56px"
    lineHeightMobile: "44px"
    fontFeature: "'tnum'"
  display:
    fontFamily: "Archivo, Segoe UI, system-ui, sans-serif"
    fontSize: "28px"
    fontSizeMobile: "24px"
    fontWeight: 650
    lineHeight: "32px"
    lineHeightMobile: "28px"
  headline:
    fontFamily: "Archivo, Segoe UI, system-ui, sans-serif"
    fontSize: "20px"
    fontSizeMobile: "18px"
    fontWeight: 620
    lineHeight: "26px"
    lineHeightMobile: "24px"
  title:
    fontFamily: "Archivo, Segoe UI, system-ui, sans-serif"
    fontSize: "16px"
    fontSizeMobile: "17px"
    fontWeight: 620
    lineHeight: "22px"
    lineHeightMobile: "24px"
  figure:
    fontFamily: "Archivo, Segoe UI, system-ui, sans-serif"
    fontSize: "24px"
    fontSizeMobile: "22px"
    fontWeight: 640
    lineHeight: "28px"
    lineHeightMobile: "26px"
    fontFeature: "'tnum'"
  body:
    fontFamily: "Archivo, Segoe UI, system-ui, sans-serif"
    fontSize: "15px"
    fontSizeMobile: "16px"
    fontWeight: 400
    lineHeight: "22px"
    lineHeightMobile: "24px"
  table:
    fontFamily: "Archivo, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    fontSizeMobile: "15px"
    fontWeight: 400
    lineHeight: "20px"
    lineHeightMobile: "22px"
    fontFeature: "'tnum'"
  meta:
    fontFamily: "Archivo, Segoe UI, system-ui, sans-serif"
    fontSize: "13px"
    fontSizeMobile: "13px"
    fontWeight: 400
    lineHeight: "18px"
    lineHeightMobile: "18px"
  label:
    fontFamily: "Barlow Semi Condensed, Archivo, system-ui, sans-serif"
    fontSize: "12px"
    fontSizeMobile: "12px"
    fontWeight: 500
    lineHeight: "16px"
    lineHeightMobile: "16px"
    letterSpacing: "0.06em"
  chart-label:
    fontFamily: "Barlow Semi Condensed, Archivo, system-ui, sans-serif"
    fontSize: "12px"
    fontSizeMobile: "12px"
    fontWeight: 500
    lineHeight: "16px"
    lineHeightMobile: "16px"
    letterSpacing: "0.06em"
    fontFeature: "'tnum'"
  measure:
    fontFamily: "Barlow Semi Condensed, Archivo, system-ui, sans-serif"
    fontSize: "14px"
    fontSizeMobile: "14px"
    fontWeight: 600
    lineHeight: "18px"
    lineHeightMobile: "18px"
    letterSpacing: "0.06em"
    fontFeature: "'tnum'"
  revision:
    fontFamily: "Barlow Semi Condensed, Archivo, system-ui, sans-serif"
    fontSize: "11px"
    fontSizeMobile: "11px"
    fontWeight: 500
    lineHeight: "14px"
    lineHeightMobile: "14px"
    letterSpacing: "0.06em"
rounded:
  titleblock: "2px"
  stamp: "3px"
  xs: "4px"
  sm: "8px"
  md: "8px"
  sheet: "12px"
  sheet-mobile: "12px"
  pill: "999px"
  round: "50%"
strokes:
  hairline: "1px"
  measure: "1.5px"
  plan: "1px"
  active: "2px"
  focus: "2px"
bars:
  progress: "4px"
  progress-small: "3px"
  stacked: "10px"
  tint: "0.5"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  gutter: "32px"
  section: "44px"
  touch: "44px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  button-alert:
    backgroundColor: "{colors.red}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "34px"
  input:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "44px"
  segmented-active:
    backgroundColor: "{colors.line}"
    textColor: "{colors.ground}"
    rounded: "{rounded.xs}"
    padding: "0 12px"
    height: "28px"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "36px"
  chip-selected:
    backgroundColor: "{colors.tint-2}"
    textColor: "{colors.ink}"
  sheetlist-item:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "42px"
  sheetlist-item-active:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
  count:
    backgroundColor: "{colors.line}"
    textColor: "{colors.ground}"
    typography: "{typography.label}"
    rounded: "{rounded.xs}"
    height: "20px"
  amount-field:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "60px"
---

Owner Q2 directive (2026-10-15, #465): historical report negatives use quiet ink while retaining their signs and zero geometry; historical debt bars use a dashed outline. Current action-needed warnings, negative sidebar balances and specified signed heatmaps retain their existing semantics. The inbox overview shows one urgent overspent summary with category count, exact total deficit and a secondary link to Plan triage. Individual entries, raw counts and detail views remain; the filtered full summary is computed before pagination. This read-only presentation never covers categories or changes bookings by itself.

# Design System: Finanz-App

Owner direct payroll review directive (2026-10-15, #499): a manually uploaded PDF opens its result immediately in the wide upload/review dialog; the retained inbox task remains a recovery entry. Known wage codes are parsed automatically. Unknown numeric wage codes can be assigned at the review to the existing earning, deduction, reimbursement, tax-adjustment or social-insurance-adjustment sections and reparsed; this neither adds database columns nor changes payroll formulas. Saving the mapping, parsed result and inbox urgency is one audited group, guarded against concurrent changes. New payout confirmation exposes account, explicit payout date, sender and an eligible unbooked salary expectation. A printed date or the selected expectation can propose the date; no missing date silently becomes month end. Confirmation links the expectation and creates or links the payout atomically with the payslip and receipt. Existing matched booking dates, senders and manually corrected records remain unchanged. Desktop PDF/download/confirm/reject/reanalyse actions share one row; phone layout preserves readable fields and touch targets. Upload alone never books money.

Owner payslip directive (2026-10-15, #499): review preselects the configured salary account and permits another active EUR payout account. Confirmation links an existing matching booking or creates a pending payout (cash: confirmed), with salary/special income and reimbursements kept separate. Payslip, payout, receipt and inbox decision are atomic and undoable. Upload alone never books money. The PDF drop alternative preserves the native chooser; Linux browser evidence does not establish a fix for the reported Windows Chrome chooser hang.

Owner account-properties directive (2026-10-15, #499): account type keeps its existing meaning; cash uses `cash`, the salary account is selected in Datenquellen, and a depot with separate settlement cash uses the existing optional `referenceAccountId`. Integrated depot cash needs no separate link. Create/edit forms expose this distinction without a new purpose column, migration or historical rewrite. New links require an open checking/cash/savings account in the same currency; incompatible type or currency changes must first explicitly release linked depots. Existing historical references remain visible and unrelated edits preserve them. Account metadata changes retain the audited write and undo path; credit-card behavior is unchanged.

Owner contact-history directive (2026-10-15, #499): contact name and balance open the same retained detail. A persisted repayment that fully clears both open outlays and credit defines the latest history boundary; inferred legacy receipts never invent a recorded settlement. Older completed movements remain available in a disclosure, current-month movements are itemized against the statement as-of month with saved allocations and credit, and older open outlays remain visible. Same-day order and all stored financial data, write paths, locks and undo remain unchanged.

Owner cash directive (2026-10-15, #499): new cash capture shows a fixed Bestätigt status. Bank capture retains its pending default and manual confirmation. Preserve the status label and touch target, existing stored bookings and reconciliation locks.

Owner booking-line directive (2026-10-14, #463): the capture head shows amount, payee, account/status and date/repetition before category/contact lines on desktop and phone. Date/repetition use 2:1 columns; direct date entry and the calendar remain. One category row can represent a category, a whole contact outlay, or a category with percentage/fixed contact shares; additional gross lines show a cent-exact rest and block saving until it is zero. Slim suggestions share one row. Date chips, the separate outlay field and Split mode button are removed. Tab follows head → lines → actions; Enter saves valid input and Escape retains its guard. Map to the existing ledger splits with largest-remainder cents, preserving stored metadata, audited writes, locks and undo.

**Owner Q3 decision (2026-10-14, #466, 3B):** Heute keeps the month switch and Monat / Bis Gehalt. One nonempty Zu tun section contains at most four compact source rows, ordered Plan, rules, inbox/bookings, account checks; secondary routine actions share their source row. A single nonempty Fällig 14 Tage list replaces Was steht an / Danach. Finanz-Check is a compact tile with counts and source links, without a duplicate findings list. In other months the former explanatory box becomes Ansicht: <month> – Zum aktuellen Monat; current-only sections carry Stand heute. Existing precision-layer tokens and 44px touch targets apply. This supersedes the separate Nächste Schritte revision table on Heute.

Owner UX V1 directive (2026-10-14, #480): Vermögen shows a compact performance summary before decisions: value, unrealised gain in EUR/percent, annualised time-weighted return and a chart using the Reports calculation. Detailed benchmark and performance analysis stays in Reports. Period controls sit beside the chart and are absent from non-chart details. Schulden starts with total debt and actual history; payoff dates require complete calculable terms, and repayment scenarios/terms explanations are disclosures. Freiheit starts with an editable average of up to six closed Zukunft months; expense sources are collapsed. Savings details show the next version-aware planned date, recorded gross buys since the first version in the selected instrument/account (including manual buys), and collapsed rate versions. No write, booking, bank-order or undo semantics change.

Owner wealth-detail directive (2026-10-15, #499): signed account bars meet at one proportional zero line; positive values extend right and debts left. The daily Portfolio line uses real valuation-date spacing and a 100 index basis, with visible gaps where a daily return cannot be calculated. Responsive SVGs keep chart labels at their token font size, and portfolio actions sit after the chart. Explain stored valuation dates and carried quotes in nearby text; do not imply fresh daily market quotes.


**Owner search decision (2026-10-14, #484):** search is a native modal palette on desktop and a full-screen sheet on phones, with the search field above its scrolling results. Actions lead; results group into pages, accounts/categories and bookings. Empty search shows actions and validated session recents. Escape restores the opener and source context. `/suche` stays the all-results page with type filtering. This search-only exception supersedes the forms-only dialog rule below; use existing precision tokens.

**Owner Z4 decision (2026-10-13, #451):** the left account list follows the
Zerosum arrangement: navigation icons without 01–05 numbers, a KONTEN heading
with create/settings actions, uppercase groups with chevron/icon/total and no
subtitle, typed account rows with right-aligned balances. Every negative sidebar
balance uses `--red`; selected accounts share the active navigation treatment.
The precision-layer light and Prussian-blue dark tokens and sidebar footer stay.

**Owner decision 2026-10-12 — Plan inspector (#446).** Plan › Monat uses grid | 320px sticky inspector from 1180px, with native keyboard disclosures and only Monatsüberblick initially open. Selected categories expose the existing money forms and category actions. Under 1180px the inspector stays collapsible below the grid for package 2. Precision tokens, compact grid density and the other Plan registers stay unchanged. This Plan-month exception supersedes the earlier ban on inspector columns below.

**Owner-Entscheidung 05.10.2026 — Unterseiten statt Seitenpanels.** Keine
Seitenpanels, Drawer, rechten Side Sheets oder dauerhaften seitlichen Karten-Spalten
für Inhalte. Details und sekundäre Informationen öffnen als Unterseiten mit eigener
URL, Brotkrumen und Rücksprung; Browser-Zurück funktioniert, direkte Links ebenso.
Zusammenfassungen stehen ganzbreit oberhalb oder unterhalb des Hauptinhalts oder
verlinken aus einer einzeiligen Zusammenfassung auf eine Unterseite. Modale Dialoge
sind ausschließlich für Eingabeformulare (neu/bearbeiten, Buchung, Umbuchung,
Decken, Abrechnen, Bestätigen). Auf dem Handy gelten dieselben Routen; Bottom Sheets
bleiben nur für Eingabeformulare und Filter erlaubt. Die linke App-Navigation bleibt.
Diese Entscheidung ersetzt die früheren Panel- und Inspektor-Vorgaben in diesem
Dokument und im Prototyp. [Inventar und Umsetzungsstand](docs/no-side-panels-1005.md).

## Overview

**Creative North Star: "Das Konstruktionsblatt"**

Die Finanz-App ist ein technisches Zeichenblatt, keine Kachelwand. Jede Zahl ist ein Maß: Sie sitzt als Maßtext auf einer Maßlinie mit Schrägstrich-Maßbegrenzung und lässt sich in ihre Maßkette zerlegen, bis hinunter zur einzelnen Buchung. Die Blaupause steckt in der Haltung (Linienarten, Schriftfeld, Planliste, Revisionstabelle, Detailausschnitte), nicht in der Tapete: Ein feines Zeichenraster erscheint nur als Akzent in der rechten oberen Ecke und läuft über eine Maske in die Fläche aus.

**Präzisionsschicht (Entscheidung 02.10.2026, „Architect / Precision Fintech“):** Ein kühler Slate-Grund (`ground`), darauf weiße Karten (`surface`) mit Haarlinienrand (`card-border`) und einlagigem, weichem Schatten (`card-shadow`); die Seitenleiste ist ein ruhiges Eisblau (`ground-2`) mit der Kontenhierarchie unter der Planliste. Grün ist das Signal für vorhandenes Geld: die Hero-Kennzahl in Waldgrün (`good`, Schrift weiß) und positive Restbeträge als Mint-Pillen (`good-soft` mit `on-good-soft`); ausgeschöpfte Beträge sind neutralgraue Pillen (`quiet-soft`). Plan › Monat hat drei Spalten: Seitenleiste, Stückliste als Karte und rechts einen Inspektor (Monatsüberblick, 50/30/20, Wasserfall). Die Mockups in `design/screens` sind damit keine Prüfreferenz mehr; eigene Vergleichsbilder sichern den Stand.

Hell ist blaue Tusche auf weißem Zeichenfilm, dunkel die klassische Blaupause, helle Linien auf Preußischblau. Beide Modi sind vollwertig und teilen dieselben Rollen. Die Farbwelt ist blau; dazu kommen genau zwei Signaltinten: Rotstift für Handlungsbedarf und Grün für vorhandenes Geld. Die Dichte ist die eines Arbeitsblatts für die abendliche Steuerungssitzung: wenige ruhige Karten als Arbeitsflächen, darin Zeilen mit Haarlinien statt Kacheln, Tabellenziffern überall.

Pro Region ist höchstens ein Zeichenmittel sichtbar. Die Entwürfe in `03_Mockups/` und Kapitel 10 des Konzepts (Manrope, Akzent #0E6E66, weiße Kacheln) sind überholt und keine Vorlage.

**Key Characteristics:**
- Jede Zahl ist ein Maß; die Maßkette entfaltet Summen bis zur Buchung.
- Linienarten nach ISO 128 tragen Bedeutung: durchgezogen = Ist, gestrichelt = Plan und Prognose, strichpunktiert = Vormonat.
- Nur Blau, plus Rotstift für Handlungsbedarf.
- Seitenkopf als Schriftfeld, Navigation als Planliste mit Blattnummern, nächste Schritte als Revisionstabelle, Detailausschnitte mit Kreisnummern.
- Flach und haarlinig; Schatten nur für schwebende Ebenen.
- Werkhorst-Grotesk (Archivo) mit Tabellenziffern, technische Beschriftung (Barlow Semi Condensed) für Labels.

## Colors

Eine einzige Tuschfamilie in Blau auf glattem Grund, mit genau einer Fremdtinte: dem Rotstift. Die Frontmatter führt den hellen Modus unter den CSS-Rollennamen und den dunklen Modus mit Präfix `dark-`; im Code sind es dieselben Custom Properties (`--line`, `--ink` usw.), die unter `prefers-color-scheme: dark` oder `data-theme="dark"` umgeschaltet werden.

### Primary
- **Preußische Tusche** (`line` / `primary`, hell): Die Zeichenlinie. Ist-Linien, Maßlinien, Maßbegrenzungen, Höhenkote, Kreisnummern, aktive Blattnummer, Fokusring, Primärschaltfläche. Im dunklen Modus wird die Linie zu **Lichtpausweiß** (`dark-line`) und die Primärschaltfläche zu `dark-primary` mit preußischblauer Schrift.
- **Tusche vertieft** (`primary-hover`): nur Hover der Primärschaltfläche und gedrückte Gleichheitstaste.
- **Blasse Tusche** (`line-2`): Plan-Linie, Hilfslinien (Maßhilfslinien gepunktet), Schraffur „gebunden“, Rahmen des Schriftfelds und des Betragsdisplays.

### Secondary
- **Klassenblau Bedarf** (`need`): Vollfläche, identisch mit der Tusche; Klasse Bedarf in Balken, Ketten und Farbfeldern.
- **Klassenblau Wunsch** (`want`): helleres Himmelblau, immer als 135°-Schraffur mit Konturlinie, nie als Vollfläche.
- **Petrol Zukunft** (`future`): der äußerste Rand der Blaufamilie, immer als Kreuzschraffur mit Konturlinie.

### Tertiary
- **Rotstift** (`red`, dunkel `dark-red`): Handlungsbedarf und nichts sonst. Überzogene Envelopes (Betrag und Balken), die dringende Revision (Dreieck, Titel, Schaltfläche „Decken“), Feldfehler, ein negativer Leitmaß-Wert. Hintergrundtönung `--red-soft` nur im Revisionsdreieck.

### Neutral
- **Zeichenfilm** (`ground`, kühles Slate) / **Preußischblau** (`dark-ground`): App-Grund unter den Karten; das Zeichenraster nur als ausgeblendeter Akzent oben rechts (`grid-line`).
- **Karte** (`surface`, dunkel `dark-surface`) mit **Kartenkopf** (`surface-2`): Arbeitsflächen (Schriftfeld, Stückliste, Revisionen, Inspektor), Rand `card-border`, Schatten `card-shadow`.
- **Waldgrün** (`good`, dunkel `dark-good`) mit `on-good`: nur die Hero-Kennzahl „Zu verteilen“, wenn Geld auf einen Job wartet. **Mint** (`good-soft` / `on-good-soft`): positive Restbeträge und erfüllte Zustände als Pille oder Statuszeile. **Neutral** (`quiet-soft`): ausgeschöpfte Beträge.
- **Planschrank** (`ground-2`): Seitenleiste und mobile Tab-Leiste.
- **Aufgelegt** (`raised`): Eingabefelder, Tasten, aktive Planlisten-Zeile, Combobox-Liste.
- **Tinte** (`ink`), **Tinte 2** (`ink-2`), **Tinte 3** (`ink-3`): Text in drei Stufen: Werte und Titel, Erklärtext, Metadaten und Achsbeschriftung.
- **Haarlinie** (`rule`) und **Haarlinie kräftig** (`rule-strong`): Zeilentrenner, Kopflinien, Feld- und Tastenkonturen.
- **Gradnetz** (`graticule`): die schwachen Rasterlinien hinter Diagrammen und im Kopfdetail des Seitenpanels, sonst nirgends.
- Transparente Tönungen `--tint` (6 %/7 %) und `--tint-2` (11 %/13 %) der Tusche für Hover, Auswahl und Balkenträger; `--overlay` für den Scrim.

Owner UX Q1 (2026-10-14, #464): control boundaries and meaningful secondary lines reach at least 3:1 against their normal surfaces; text reaches 4.5:1. Selected/hovered rows and selected controls use `ink-2` for metadata otherwise painted in `ink-3`. Dark positive fills use a lighter green with dark `on-good` text, so both the fill and its text remain distinguishable. For signed values, see [Farbrollen v2 (DS1, #472)](#farbrollen-v2-ds1-472).

### Farbrollen v2 (DS1, #472)

Owner decision 1A (2026-10-14): signed amounts and direction series use `--plus-ink` (teal: light `#0b7285`, dark `#4fe3d0`) and `--minus-ink` (orange: light `#b8380a`, dark `#ff9d7a`). Keep signs, arrows and zero geometry as a second channel; colour never carries direction alone. Legacy `--good-ink` / `--bad-ink` alias these roles. Text reaches 4.5:1 on normal surfaces. Plus means the favourable direction of the shown figure: for spending, "less spent" is plus (teal) and "more spent" is minus (orange). Colour-vision guard: Machado severity 1.0, CIE Delta E 1976 ≥ 25 between plus and minus (measured light 74.08 / 58.92, dark 43.31 / 29.12 for deuteranopia / protanopia; the retired red/green reached 7–18).

Red (`--red`, `--red-soft`, `--on-red`) remains exclusively for act-now states: current overspending, errors and destructive actions. Green `--good`, `--good-hover`, `--good-soft`, `--on-good` and `--on-good-soft` retain available-money and OK-status semantics. Primary blue remains structure/actions; neutral ink remains context. Historical quiet negatives and dashed debt outlines retain the Q2 exception.

Charts use at most four series with direct labels. Heatmaps use single-hue density with direction markers. This token-only slice leaves the existing signed heatmap fills and chart structure unchanged; their markers, density scale and series-label migration require a separate UI slice.

### Named Rules
**The Signal Rule.** Grün sagt „das Geld ist da“ (Hero, Mint-Pillen, erfüllt), Rot sagt „handeln“; beide erscheinen nie ohne Zahl, Vorzeichen oder Symbol.

**The Rotstift Rule.** Rot bedeutet Handlungsbedarf. Ein verletzter Finanz-Check-Wert ohne akute Aktion steht in Tinte mit Warnsymbol, nicht in Rot. Rot und jeder Status erscheinen nie ohne Vorzeichen oder Symbol.

**Owner-Entscheidung 05.10.2026 — Decken nur aus freiem Geld; Dispo ist Kredit.** Quellen schützen künftige vorgemerkte Ausgaben und noch nicht gebuchte wiederkehrende Zahlungen bis zum nächsten Gehalt; Einzel- und Sammeldeckung begrenzen auf frei und nennen den offenen Rest. Budget-Kontosalden und genutzter Kredit stehen getrennt, Details per Hover/Tap. Fehlendes Geld braucht Einnahmen oder Geld von außerhalb des Budgets; der Folgemonat bleibt eine ausdrückliche Option ohne Umbuchungs-Schaltfläche.

**Owner-Entscheidung 05.10.2026 — Alarmsemantik.** Jede Überziehung bleibt Rotstift, erscheint aber je Seite nur einmal als Warnung: auf Heute im einzigen Aufmerksamkeitsblock (Top 2, „weitere N“), im Plan als Einzelbetrag mit Symbolaktion. Angepinnte Envelopes wiederholen keinen Warntext; Nächste Schritte enthält keine Überziehungen. Kreditkarten- und Kreditsalden in der Seitenleiste stehen mit Minus in Tinte, ohne rote Pille. Normale Ziel-Finanzierung bleibt Tinte.

**Owner-Entscheidung 05.10.2026 — Wortwahl.** Maßkette, Stückliste, Revision und Wasserstand bleiben in Grafiken. Schaltflächen und Links in Heute und Plan verwenden einfache Handlungswörter („Herleitung zeigen“).

**The Only Blue Rule.** Alle Tinten außer dem Rotstift sind Blautöne, von Preußisch bis Petrol. Grün als Erfolgsfarbe gibt es nicht; „erfüllt“ und positive Deltas stehen in Tusche mit Häkchen oder Pfeil.

## Typography

**Display Font:** Archivo (variabel, selbst gehostet, mit Segoe UI, system-ui)
**Body Font:** Archivo
**Label/Mono Font:** Barlow Semi Condensed 400/500/600 (selbst gehostet, Fallback Archivo)

**Character:** Archivo ist die Werkhorst-Grotesk des Blatts: breite, ruhige Ziffern, im ganzen Dokument mit `tabular-nums`. Barlow Semi Condensed ist die technische Normschrift für Beschriftungen, Blattnummern, Achsen und Maßtexte in Diagrammen.

### Typo-Skala v2 (DS2, #473)

Owner decision 2B (2026-10-14): one binding scale, generated from the typography frontmatter. Pixel sizes and line heights apply on desktop and iPhone (below 768 px).

| Step | Size / line-height tokens | Role | Font / weight | Desktop px/LH | iPhone px/LH |
| --- | --- | --- | --- | --- | --- |
| T1 | `--fs-dimension` / `--lh-dimension` | Leitmaß | Archivo 640, tnum | 56/56 | 40/44 |
| T2 | `--fs-display` / `--lh-display` | Seitentitel | Archivo 650 | 28/32 | 24/28 |
| T3 | `--fs-headline` / `--lh-headline` | Abschnitt | Archivo 620 | 20/26 | 18/24 |
| T4 | `--fs-title` / `--lh-title` | Kartenkopf | Archivo 620 | 16/22 | 17/24 |
| T5 | `--fs-figure` / `--lh-figure` | Kennzahl in Karte | Archivo 640, tnum | 24/28 | 22/26 |
| T6 | `--fs-body` / `--lh-body` | Fließtext | Archivo 400 | 15/22 | 16/24 |
| T7 | `--fs-table` / `--lh-table` | Tabelle, Beträge | Archivo 400, tnum | 14/20 | 15/22 |
| T8 | `--fs-meta` / `--lh-meta` | Hinweis, Meta (ink-3) | Archivo 400 | 13/18 | 13/18 |
| T9 | `--fs-label` / `--lh-label` | Tabellenkopf, Label (Versalien) | Barlow SC 500 | 12/16 | 12/16 |
| T10 | `--fs-chart-label` / `--lh-chart-label` | Achsen, Legende | Barlow SC 500, tnum | 12/16 | 12/16 |
| T11 | `--fs-measure` / `--lh-measure` | Maßtext, Positionsnummer | Barlow SC 600, tnum | 14/18 | 14/18 |
| T12 | `--fs-revision` / `--lh-revision` | Blatt/Rev-Zeile (Versalien) | Barlow SC 500 | 11/14 | 11/14 |

Numbers in lead measures, KPIs, tables and chart values use Archivo with `tabular-nums`. Barlow Semi Condensed is reserved for small uppercase labels, table heads, axes/legends and dimension lettering (Maßtext / positions). T9 uses +0.06 em tracking.

The minimum is 12 px. T12 has its own `--fs-revision` token and is allowed only for Blatt/Rev lettering on a dark surface with measured contrast ≥ 5.5:1. Reserved allowed selectors: `:root[data-theme='dark'] .tb-revision` and `:root[data-theme='dark'] .ps-revision`; neither is currently used. Existing title-block metadata, including `.ps-tb-cell .tech`, stays T9 in both themes; print also stays at least 12 px.

No literal CSS font sizes. Former names (`class-tag`, `chart-label-strong`, `figure-large`, `panel`, `amount`, `small`) are retired; every stylesheet, wealth included, uses T1–T12.

### Named Rules
**The Tabular Rule.** Jede Ziffer steht in Tabellenziffern, damit Beträge in Spalten fluchten.

**The Lettering Rule.** Die technische Versalbeschriftung beschriftet Felder, Spalten, Achsen, Blätter und Klassen. Sie steht nie als Dachzeile über einer Überschrift.

## Layout

**Owner-Entscheidung 05.10.2026 „Volle Breite“:** Seiten nutzen die ganze Bildschirmbreite neben der Seitenleiste; nur Fließtext, Formulare, Dialoge und Druckseiten behalten eine eigene Breite.

Das Blatt ist ein 12-Spalten-Raster mit 32 px Spaltenabstand ohne maximale Seitenbreite (`--page-max: none`), Innenrand 28 / 40 / 72 px, Abschnittsabstand 44 px. Desktop: Seitenleiste 236 px (eingeklappt 72 px), klebende Kopfleiste 64 px mit Suche (max. 460 px), Posteingang und Buchung. Kartenraster gewinnen über `auto-fit/minmax` Spalten; ab etwa 1440 px stehen Diagramme und ihre Tabellen nebeneinander. Fließtext bleibt höchstens 72 ch breit, SVG-Beschriftungen behalten ihre Pixelgröße und Diagrammhöhen bleiben begrenzt. One-Pager und Jahresreport behalten ihre A4-Blätter.

Reihenfolge auf „Heute“ (Owner 05.10.2026): Leitfrage „Wie viel darf ich bis zum Gehalt noch ausgeben?“ mit gemeinsamer 35-Tage-Prognose, „Was steht an?“ (nächste sieben Tage), ein Aufmerksamkeitsblock, kompakte Gesamtvermögenszeile (zwölf Monate, heute, Veränderungen seit Monatsbeginn und vor zwölf Monaten). Darunter „Mehr zum Monat“ mit Pace und den übrigen Zahlen; am Handy geschlossen, am Desktop offen, pro Gerät gespeichert. Keine mobile Doppelung einer dringenden Revision. Bestehende Präzisionsschicht, grafische Linienarten und Kennzahlberechnungen bleiben erhalten.

Umbrüche: unter 1180 px zwei Detailspalten; unter 980 px Pace und Revisionen gestapelt; unter 768 px eine Spalte, Innenrand 16 px, Seitenleiste wird zur Tab-Leiste (64 px plus Safe Area) mit rundem Tusche-Knopf „Buchung“. Der Buchungsdialog ist einspaltig, 540 px breit, mobil ein Blatt von unten.

Heute › Pace (Owner 06.10.2026): follows Kontoprognose; chart hierarchy is Ist solid ink (1.5 px) › Hochrechnung dashed accent (1 px, Mint/Waldgrün through Deckel, Rot above) › Deckel muted solid rule (1 px, sole right-end label); Plan bis heute is a dot on today with its label above the plot, context lines Einnahmen/Vormonat are off by default.

Berührflächen mindestens 44 px auf Mobilgeräten.

## Elevation & Depth

Drei Ebenen: Grund (`ground`), Karte (`surface` mit `card-border` und dem weichen `card-shadow`) und schwebende Ebenen. Innerhalb einer Karte gliedern Haarlinien, nie verschachtelte Karten. Der Schwebeschatten gehört nur schwebenden Ebenen: Seitenpanel, Buchungsdialog, Combobox-Liste, Toast und rundem Buchungsknopf. Kopf- und Tab-Leiste sind leicht durchscheinend (88 % bzw. 92 % Grund, Weichzeichner 10–12 px).

### Shadow Vocabulary
- **Schwebeebene** (`box-shadow: 0 10px 22px -10px rgba(11, 27, 51, 0.30), 0 2px 5px rgba(11, 27, 51, 0.08)`, dunkel `0 12px 24px -10px rgba(2, 10, 26, 0.7), 0 2px 6px rgba(2, 10, 26, 0.4)`): nur für Ebenen über dem Blatt.

### Named Rules
**The One Card Rule.** Eine Arbeitsfläche ist eine Karte; in ihr gliedern Linien. Karten in Karten gibt es nicht, Kachelwände aus gleichwertigen Karten auch nicht.

Owner navigation decision 16.10.2026 (#468, part B1): the desktop header keeps search, amount privacy, exactly one linked status pill `Prüfen · N` (zero: `Prüfen`) and `+ Buchung`. Overspending has no desktop header chip. The phone header has title, search and avatar; a separate neutral linked line below shows nonzero review/overspent counts. Offline writes use their own neutral `N offline gespeichert` chip, never a navigation counter. Search clears the area selection and names the phone header `Suchen` while the palette or results page is open. Existing amount masking remains unchanged.

## Shapes

Die Formsprache ist die des Plans: Haarlinien in 1 px, fast scharfe Ecken. Das Schriftfeld hat 2 px, Zählmarken und Tastenkürzel 4 px, Zeilen und Listenfelder 8 px, Schaltflächen, Felder und Tasten 8 px, der Buchungsdialog 12 px (mobil als Blatt von unten und Seitenpanel mobil ebenfalls 12 px). Rund sind nur Kreisnummern, Avatar und der Buchungsknopf; Pillen sind Statusanzeigen vorbehalten; Kategorie-Chips haben 8 px Radius.

Zeichenmittel: Maßlinien mit Schrägstrich-Begrenzung (Strich 1,5 px), gepunktete Maßhilfslinien (`2 3`), die Höhenkote als offenes, nach unten zeigendes Dreieck mit Bezugslinie, Revisionsdreiecke mit Buchstabe, Kreisnummern 22 px. Linienarten: Ist durchgezogen 1,5 px; Plan gestrichelt `7 5` in blasser Tusche 1 px; Prognose gestrichelt `7 5` in Tusche 1 px; Vormonat strichpunktiert `12 4 2 4` in `ink-3`; Heute-Linie gepunktet `1 3`.

Schraffuren: Bedarf Vollfläche, Wunsch 135°-Schraffur (2 px Strich, 5 px Rapport), Zukunft Kreuzschraffur (45° und 135°, 1,5 px), gebunden 135°-Schraffur in blasser Tusche. Schulden in Ketten: gestrichelte Kontur `5 3`, ohne Füllung.

### Linienleiter (DS3, #474)

| Rolle | Token | Stärke / Verwendung |
| --- | --- | --- |
| Haarlinie | `--stroke-hairline` | 1 px: Struktur und Feldrahmen (Felder mindestens 3:1) |
| Maß | `--stroke-measure` | 1,5 px: ausschließlich Ist-Linien und Summen |
| Plan | `--stroke-plan` | 1 px, gestrichelt (`7 5`), auch Prognose |
| Aktiv | `--stroke-active` | 2 px: ausschließlich aktiver Register-Unterstrich |
| Fokus | `--stroke-focus` | 2 px: Tastatur-Fokusrahmen |

Route-change headings with `tabindex="-1"` announce the detail without an outline,
including browsers that inherit `:focus-visible` during programmatic focus. They are
not Tab stops. Interactive keyboard targets retain the 2 px `:focus-visible` ring.

2-px-Unterstriche sind auf `.registers a[aria-current='page']`,
`.registers button[aria-pressed='true']`, `.depot-tabs a[aria-current]` und
`.close-stepper button[aria-current='step']` beschränkt. Inaktive Register bleiben
haarlinig; Fokusrahmen behalten 2 px.

Fortschrittsbalken sind 3–4 px (`--bar-progress-small`, `--bar-progress`),
Stapelbalken höchstens 10 px (`--bar-stacked`) mit 38–60 % Tönung
(`--bar-tint`: 50 %). Die dünne Zeichnung verkleinert keine 44-px-Trefffläche. Säulen in Diagrammen sind Datenmarken mit Hover-/Tippziel und behalten ihre Breite; die 3–4-px-Regel gilt nur für Fortschritts-, Plan- und Budgetbalken.
Die Radienleiter ist 4 · 8 · 12 px, Pille nur für Status und 50 % für runde
Elemente. Ausnahmen: Diagrammmarken 1 px, Schriftfeld 2 px, Quellstempel 3 px.
Karten haben eine Schattenlage (hell `0 1px 2px rgba(15, 34, 64, 0.04)`,
dunkel `0 1px 2px rgba(2, 10, 26, 0.35)`) oder nur eine Haarlinie.
Der bestehende Schwebeschatten bleibt Panels, Dialogen, Combobox-Listen,
Toasts und dem FAB vorbehalten.

### Shared chart inspection
All chart forms share one raised, hairline-bordered tooltip with tabular exact values, a legend-colour swatch and series name per visible layer, and the date/month at the bottom. Time charts snap a vertical dotted crosshair to the nearest stored point; ranked bars, sectors and Sankey nodes/links use their actual hit target (Sankey includes amount and share of the income pool). Focus plus left/right explores points, Escape hides, touch taps select and an outside tap hides. Amount privacy also masks these values. Signed bars use `plus-ink` / `minus-ink`; Q2 historical quiet negatives and dashed debt outlines remain. Signs and position around zero carry meaning alongside colour.

## Components

### Buttons
Sachlich und dicht, wie Tuschfelder.
- **Shape:** 8 px Radius, Höhe 40 px (klein 34 px, im Dialog und mobil 44–46 px).
- **Primary:** Tusche-Fläche mit weißer Schrift (dunkel: Lichtpausweiß mit preußischblauer Schrift), 600, Innenabstand 16 px.
- **Hover / Focus:** Hover vertieft die Tusche; Fokus ist ein 2-px-Tuscherahmen mit 2 px Abstand; beim Drücken 1 px nach unten.
- **Ghost:** transparent mit Haarlinie; innerhalb von Karten als Textbutton mit vorhandenem Icon ohne sichtbaren Rahmen. Transparente Randgeometrie erhält Höhe und Trefffläche; Fokus bleibt 2 px.
- **Alert:** Rotstift-Fläche, nur für die eine dringende Aktion einer Revision.

### Chips
- **Style:** 8 px Radius, Höhe 36 px, kräftige Haarlinie, 13,5 px / 520, mit Klassen-Farbfeld (10 px, Schraffur der Klasse).
- **State:** gewählt = Tusche-Fläche mit Grundfarbe als Schrift; „leise“ Variante mit gestrichelter Kontur. Mobil horizontal scrollend.

### Cards / Containers
Arbeitsflächen sind Karten: `surface`, 12 px Radius, Rand `card-border`, Schatten `card-shadow`; Tabellenköpfe und Baugruppenzeilen auf `surface-2`. Innerhalb der Karte bestehen Abschnitte aus einem Kopf (Titel, rechts Link in `ink-2`, darunter Haarlinie) und Zeilen mit Haarlinientrennern. Zeilen sind ganzflächige Schaltflächen mit 8 px Radius und Tönung beim Hover.

### Inputs / Fields
- **Style:** 44 px hoch (Suche 40 px), kräftige Haarlinie, `raised`-Grund, 8 px Radius, Label 13 px / 560 in `ink-2` darüber.
- **Focus:** Rahmen wird Tusche plus 3-px-Tönungsring (`--tint-2`).
- **Error:** Rotstift-Text 12,5 px / 560 unter dem Feld.
- **Combobox:** eigene Liste auf `raised` mit Schwebeschatten; ausgewählte Zeile getönt.

### Navigation
- **Planliste (Desktop):** Beschriftung „Planliste“, Zeilen 42 px mit Lucide-Symbol, Name und Blattnummer 01–05 in Barlow SC. Aktiv: `raised`-Grund, kräftige Haarlinie, 600, Blattnummer in Tusche. Eingeklappt nur Symbole.
- **Kontenhierarchie (Seitenleiste):** Gruppen in YNAB-Reihenfolge, einklappbar; negative Budget-/Investmentbeträge (Konto und Gruppensumme) als rote Pille (`red-soft`, `red`); Kreditkarten und Kredite mit Minus in Tinte, positive Beträge als schlichter Text. Unten Profil-Block mit Kürzel im Kreis und Namen aus Einstellungen › Profil (ohne Eintrag generisch „Profil“ / „NU“).
- **Tab-Leiste (mobil):** fünf Einträge, 22-px-Symbole, 11,5 px Text; aktiv in Tusche mit 2-px-Strich an der Oberkante.
- **Einstellungen (gruppiert):** elf Seiten passen nicht in eine Registerleiste. Desktop: senkrechte Liste links neben der Seite (208 px) mit Gruppenköpfen Daten · Automatik · System in Barlow SC, Zeilen 40 px, aktiv wie in der Planliste (`raised`-Grund, kräftige Haarlinie, 600, `aria-current="page"`). Handy: `/einstellungen` ist die Übersicht mit denselben Gruppen als ganzbreite 44-px-Zeilen mit Pfeil; jede Seite zeigt darüber einen Rücksprung „‹ Einstellungen“ und ihren Namen. Alle Adressen bleiben.
- **Segmentschalter:** Rahmen 8 px mit 4 px Innenabstand; aktives Segment als Tusche-Fläche.

### Schriftfeld
Der Seitenkopf als Schriftfeld: 1-px-Rahmen in blasser Tusche, 2 px Radius, Zellen durch senkrechte Linien getrennt. Titelzelle mit dem aktuellen Monat („September 2026“), dann Felder mit Versalbeschriftung: Stand, Zeitraum (Segmentschalter). Kein Urteilssatz („Ja, der Monat hält“), die Leitzahl ist die Antwort. Keine Blattnummer. Mobil wandert der Monat in den Kopf; das Schriftfeld behält Stand und Zeitraum in einer Zeile ohne Beschriftung.

### Maßkette (Signature)
Eine einzige Komponente (`drawChain`) für jede Maßkette. Oben die Teilmaße als Maßlinien mit Schrägstrichbegrenzung und Maßtext, darunter ein höchstens 10-px-Stapelbalken mit 50 % Tönung aus Segmenten in Klassenfüllung mit Tuschekontur, darunter der abgezogene Teil (gebunden = Schraffur; Schulden = gestrichelte Kontur), unten das Ergebnismaß „= …“. Jedes Segment ist tastaturbedienbar und öffnet seine Einzelposten im Seitenpanel. Nur das erste Diagramm je Seite wird beim ersten Besuch der Sitzung wie ein Plotter gezogen (sessionStorage, bei gesperrtem Speicher sofort sichtbar; 900 ms, `cubic-bezier(0.16, 1, 0.3, 1)`); die Kette klappt in 240 ms auf. Bei reduzierter Bewegung erscheint alles sofort.

### Leitmaß
Der Leitwert steht als Maßtext über einer Maßlinie, die im Saldodiagramm von heute bis zum Gehaltstag reicht; darunter die Restlaufzeit als Maßtext. Ist durchgezogen bis heute, Prognose gestrichelt danach, Gehaltssprung als gestrichelte Senkrechte mit Pfeil, Höhenkote am prognostizierten Tiefpunkt. Antippen des Werts entfaltet die Maßkette.

### Revisionstabelle
„Nächste Schritte“ als Tabelle mit Kopf „Rev. · Änderung · Aktion“. Jede Zeile trägt ein Revisionsdreieck mit Buchstabe (A, B, C); die dringende Zeile ist Rotstift (Dreieck mit Tönung, Titel, Schaltfläche). Erledigte Zeilen gleiten 12 px nach rechts aus; Rückgängig über Toast.

### Detailausschnitt
Jeder Detailabschnitt trägt eine Kreisnummer (1–5, 22 px, Tuschekontur, Barlow SC 600) vor dem Titel.

### Buchungsdialog mit Betragsfeld
Kein eigener Ziffernblock. Das Betragsfeld (60 px, blasse Tuschekontur, Fokus in Tusche) nimmt Grundrechenarten direkt als Eingabe an („12,50+8,20“, auch × ÷ x :), links sitzen vier kleine Operator-Knöpfe (+ − × ÷, 22 px, Barlow SC in Tusche) wie bei YNAB, die das Zeichen an der Schreibmarke einfügen. Darunter zeigt die Hinweiszeile das Zwischenergebnis („= 20,70 €“ in Tusche); Enter oder Verlassen des Felds übernimmt es. Vorzeichen links im Feld: „−“ Ausgabe, „+“ Einnahme, keins bei Umbuchung. Betrag 30 px (mobil 26 px) rechtsbündig.
Ausgabe: Empfänger, Kategorie Pflicht. Einnahme: Zahler, Kategorie optional mit Vorauswahl „Zu verteilen“ (offenes Quadrat), ein Envelope ist wählbar (z. B. Geldgeschenk für Reisen). Umbuchung: kein Empfänger, sondern „Von Konto“ → „Nach Konto“; Kategorie nur bei Tracking-Zielkonten (z. B. Investieren), sonst budgetneutral mit Hinweis.
Kategorie-Chips: ausgewählt als Tönung mit Tuschekontur, Häkchen und sichtbarem Klassen-Quadrat (nie vollflächig, sonst verschwindet das Quadrat).

### Plan › Monat (Stückliste nach Wasserfall)
- **Z1 override (owner 13.10.2026, #448):** separated group blocks with rounded `surface-2` header bands and 10px gaps; selection and inline + controls in table/group headers. Category status sits right of the name on desktop and below it on phones; `good` bars use a 135° hatch for net spending and solid remaining money, entirely `red` when overspent. Class swatches leave category rows. Keep the existing Präzisionsschicht/Prussian-blue tokens and available pills; desktop rows ≤44px, phone rows ≤76px with 44px name/pill/checkbox-label targets. Phone chips remain a single horizontally scrolling sticky line; native checkbox input sizing belongs to the separate global fix. This overrides the older row-bar/class-swatch description below.
- **Drei Spalten (02.10.2026):** Mitte die Hero-Kennzahl „Zu verteilen“ (Waldgrün bei Geld, Rotstift-Fläche bei zu viel zugewiesen, ruhige Karte bei 0) mit Maßkette und „Geld verteilen“, darunter Revisionen und die Stückliste als Karte; rechts der klebende Inspektor mit Monatsüberblick (Statuszeile, Übertrag, Einnahmen, Zugewiesen, Aktivität, Verfügbar als Pille), 50/30/20 und der Wasserfall-Leiste. Unter 1280 px rutscht der Inspektor unter die Stückliste, auf dem Handy einspaltig. Verfügbar steht als Pille: Mint positiv, neutral bei 0, Rotstift bei Bargeld-Überziehung, gestrichelt bei neuer Kartenschuld.
- **Zu verteilen:** Leitwert (56 px, mobil 44 px) mit Maßkette als Termzeile unter einer Maßlinie mit Schrägstrichbegrenzung: Übertrag + Einnahmen (− Ungedeckt Vormonat) − Zugewiesen = Zu verteilen. Beschriftungen brechen nie um; jedes Rechenzeichen bleibt mit dem folgenden Term zusammen (`.ct-pair`); anklickbare Terme mit punktierter Unterstreichung öffnen ihre Posten.
- **Leiste links folgt der Gliederung:** Wasserfall (neun Stufen mit Flusslinie und Wasserstand), Zeit, Gruppen, Klassen oder Triage; außerhalb des Wasserfalls ohne Flusslinie, Nummern als eckige Marken. Keine Überschrift über der Leiste.
- **Stufenleiste (Wasserfall):** neun Stufen als Kreisnummern (28 px) an einer Flusslinie mit Pfeilspitzen, darunter Name, 6-px-Füllbalken in Tusche und Status („gedeckt“ / „fehlt …“). Voll = gefüllter Kreis, teilweise = Tuschekontur. Oben Zufluss (und Ungedeckt Vormonat), unten „Noch frei“; die Leiste geht immer auf. Der **Wasserstand** (▽ plus gestrichelte Tuschelinie plus „Wasserstand“ am Zeilenende) markiert einmal die Grenze, an der das Geld endet. Mobil: waagrechter Streifen aus Stufenkarten ohne Wasserstand.
- **Stückliste:** Tabelle mit Pos. (1.1, 1.2 … in Barlow SC) · Kategorie · Zugewiesen · Aktivität · Verfügbar. Stufen, Gruppen oder Klassen sind Baugruppenzeilen (Grund `ground-2`, Kreisnummer, Summen in denselben Spalten, einklappbar). Unter jeder Kategorie der 6-px-Zeilenbalken: Füllung = ausgegeben in Klassenfüllung, schwarzer Strich = Pace-Soll heute, Tuschestrich am Ende = Sparziel; darunter eine Metazeile. Ziel und Pace sind nie eigene Spalten.
- **Zuweisen inline:** „Zugewiesen“ ist eine Schaltfläche; Klick macht sie zum Rechenfeld (Enter übernimmt, Esc bricht ab, „+50“ addiert). Im Seitenpanel dasselbe Betragsfeld wie bei der Buchung mit Operator-Knöpfen und Ergebniszeile.
- **Geld verteilen:** Vorschläge als gestrichelt umrandete Tuschewerte („+890,00“) unter „Zugewiesen“, Spalte leicht getönt; je Baugruppe „Stufe übernehmen“, oben „Alle übernehmen“. Befüllt wird strikt von oben nach unten; ein Rest ohne Ziel fließt in Stufe 8.
- **Gliederungen (Segmentschalter):** Wasserfall · Zeit · Gruppen · Klassen · Triage. **Zeit** ordnet nach nächstem Zahlungstermin: nächste 14 Tage, bis Ende nächsten Monats, später mit Termin, ohne festen Termin, zuletzt „Laufend“ (variable Monatsbudgets); bezahlte Fixkosten zeigen „nächste am …“. **Triage** (Wunsch des Nutzers, 28.09.2026) gruppiert Überzogen · Fällig, nicht gedeckt · Fehlt zum Ziel; das rote Zählabzeichen zählt nur die ersten beiden, „Fehlt zum Ziel“ ist normale Verteilarbeit in Tusche.
- **Triage-Leiste (Owner 05.10.2026):** eine rote Summenzeile über der Tabelle, Quellwahl und „Alle aus … decken“; Einzelaktionen als 44-px-Symbol neben dem Betrag öffnen das vorhandene Panel. Quelle zeigt den Rest nach der Deckung; Quellen zeigen Verfügbar, fest verplant und frei; Teildeckungen sind auf frei begrenzt. Sammeldeckung nutzt vorhandenes Geld in Wasserfall-Reihenfolge und eine Audit-Gruppe/Rücknahme.
- **Frühere Triage-Leiste (ersetzt):** zusätzlich zur Triage-Ansicht ein Zustand über der Tabelle. Erscheint nur bei Überziehung oder negativem „Zu verteilen“ als Revisionstabelle in 1-px-Rotstiftrahmen (Rev. · Änderung · Aus Envelope · Aktion) über der unveränderten Tabelle; betroffene Zeilen bekommen Rotstift-Tönung und Revisionsdreieck. Hinweis „Erst decken, dann verteilen“, wenn beides offen ist.
- **50/30/20-Band:** 18-px-Balken in Tuschekontur mit Klassenfüllungen, Soll-Marken bei 50 und 80 als schwarze Striche, Skala in Barlow SC, Legende nur mit den Ist-Anteilen (das Soll steht im Band).

### Konten
- **Nettovermögen** mit Maßkette nach Kontogruppen (Budget-Konten − Kreditkarten − Kredite + Investments, Vorzeichen nach Summe); Terme springen zur Baugruppe.
- **Kontenstückliste:** Baugruppen in YNAB-Reihenfolge Budget-Konten · Kreditkarten · Kredite · Investments mit Summen (Seitenleiste, Maßkette und Konto-Auswahlen nutzen dieselbe Gruppierung; innerhalb einer Gruppe gilt die Sortierung des Besitzers; geschlossene Konten stehen nur eingeklappt unter „Geschlossen“); je Konto Pos., Name, Institut und 90-Tage-Linie mit Differenz, rechts der Saldo. Kein Kontotyp-Etikett (die Baugruppe sagt es schon, sonst stünde „Girokonto GIRO“ doppelt) und kein Sync-Status; nur Probleme (Einwilligung läuft ab, Wert veraltet) bekommen ein Warnzeichen mit Link zu Einstellungen › Datenquellen. Kreditkarten zeigen die Auslastung als Balken.
- **Quellstempel** (nur in Einstellungen › Datenquellen): gerahmte technische Beschriftung (Barlow SC, 1 px blasse Tusche, 3 px Radius): „Bank-Sync heute 06:30“, „Import 14.09.“, „manuell · 15.09.“. Veraltete Werte und ablaufende Einwilligungen haben einen gestrichelten Tintenrahmen.
- **Saldolinien kommen aus dem Buchungsjournal** (Stufenlinie, Stufe am Buchungstag), nie aus erfundenen Kurven; nur Depot und Krypto bewegen sich mit Kursen. Manuell bewertete Konten sind flach bis zur nächsten Bewertung. Der Tiefpunkt im Kontodiagramm wird aus dem Journal gelesen.
- **Einzelkonto:** Saldo, davon vorgemerkt, Monatssumme, zuletzt geprüft; 90-Tage-Stufenlinie mit gestrichelter Nulllinie („darunter beginnt der Dispo“) und Höhenkote am Tiefpunkt; Buchungsliste mit Status (vorgemerkt · bestätigt · geprüft) und laufendem Saldo.
- **Kontostand prüfen:** Seitenpanel; App-Saldo inkl. vorgemerkt, vorgemerkt herausgerechnet (+), = App-Saldo gebucht; „Saldo laut Bank“ ist aus dem Bank-Sync vorausgefüllt. Bei 0,00 € Differenz: „Festschreiben“. Sonst nennt das Panel genau einen Fall: **Doppelt** (eine Buchung mit genau dem Differenzbetrag steht zweimal in der App; Aktion „Doppelte Buchung entfernen“) oder **Es fehlt eine Ausgabe/Einnahme** über den Betrag. Immer verfügbar: „Differenz ausgleichen“ bucht eine Ausgleichsbuchung („Kontostand-Ausgleich“, Kategorie „Zu verteilen“) und schreibt fest, wie Reconcile bei YNAB.
- **Alle Buchungen:** Filterzeile (Suche, Zeitraum, Konto, Kategorie, Status, CSV), Tagesgruppen mit Tagessumme (Datum links, Summe rechts), Mehrfachauswahl mit Leiste „n ausgewählt · Kategorie setzen · Als geprüft markieren“.
- **Posteingang:** Revisionstabelle mit Kopf (Rev. · Änderung · Aktion), gruppiert nach Typ als Baugruppen mit Zähler; jede Entscheidung ein Klick, „Immer so zuordnen“ legt eine Zuordnungsregel an. Nur die Überziehung ist Rotstift.

### Einstellungen › Datenquellen
Je Konto: Quelle (Bank-Sync PSD2, API nur lesen, Datei-Import, manuell), Schalter „Automatisch“, Rhythmus (2× / 1× täglich), Einwilligung bis (mit „Erneuern“ unter 14 Tagen), letzter Stand und Status als Quellstempel. Darunter Nachtlauf, Kursabruf, Ersatzquelle, EZB-Kurse als Schalter und die Veraltet-Schwelle für manuelle Werte. **Schalter:** 40 × 22 px, Spur mit 1-px-Kontur; an = Tuschefläche mit Grundfarbe-Knopf.

### Vermögen
- **Register** Nettovermögen · Portfolio · Schulden · Freiheitszahl; Zeitraumschalter 1M · 3M · YTD · 1J · 3J · Alles im Schriftfeld (gilt für Nettovermögen und Portfolio).
- **Nettovermögen:** Leitwert mit Maßkette Anfang + Eigenleistung + Markt = jetzt; daneben „Woraus es besteht“ als sortierte Balken (Schulden gestrichelt); Verlauf als Linie, darunter je Monat zwei Balken um Null: Eigenleistung (Tusche) und Markt (blasse Tusche).
- **Portfolio:** Wert, TTWROR, IRR, Weltindex, Kosten, Ausschüttungen als Kennzahlenreihe; indexierte Linie gegen den Weltindex (Strichpunkt); **Aufteilung Soll/Ist** als Spur mit Toleranzband (getönt, gestrichelte Ränder), Soll-Marke als schwarzer Strich, Ist als Balken (Rotstift, wenn außerhalb des Bands); Rebalancing als Revisionstabelle; Positionen als Stückliste nach Anlageklasse; Plattform-Anteile.
- **Schulden:** Restschuld mit Maßkette; Sondertilgung als Rechenfeld, das Schuldenfrei-Datum, Zinsen und Ersparnis sofort neu rechnet; Restschuld-Linie: bisher durchgezogen, Plan gestrichelt blass, Szenario gestrichelt Tusche, Höhenkoten am Schuldenfrei-Monat; Zins/Tilgung je Jahr; Kartenauslastung.
- **Freiheitszahl:** Leitwert in Prozent mit Maßkette Investiert ÷ 25 Jahresausgaben; Fortschrittsbalken mit Vierteln; Annahmen (Sparrate, Rendite) als Auswahl; Prognoselinie gestrichelt bis zur Ziellinie mit Höhenkote „Ziel Jahr“.

### Reports (Zeichnungsverzeichnis)
- **Ein Hauptbuch:** Alle 25 Reports lesen `reports-core.js` (Okt 2023 bis 17.09.2026). Nettovermögen entsteht aus dem Hauptbuch (Eigenleistung = Einnahmen − Konsum + reguläre Tilgung, Markt = Depot × Monatsrendite) und ist dieselbe Reihe wie auf Heute und Vermögen. Keine Zahl darf nur in einem Report existieren.
- **Katalog als Stückliste:** Register Katalog · Monat und Einkommen · Ausgaben und Plan · Zukunft und Vermögen · Überblick; Baugruppen 1–4 mit Positionen 1.1 bis 4.5, Spalten Report · Frage · Diagrammform · Steuerung. Die ganze Zeile öffnet den Report.
- **Report-Schriftfeld:** Rücksprung zur Baugruppe, Positionsmarke (`1.1`), Titel, Frage; daneben Stand und genau eine Steuerung: Monat (Auswahl mit Vor/Zurück), Jahr (Segment) oder Zeitraum (1M · 3M · YTD · 1J · 3J · Alles). Druckblätter bekommen zusätzlich „Drucken“. Unten „Vorige/Nächste Zeichnung“.
- **Aufbau:** Leitwert + Maßkette, dann das eine Hauptdiagramm, dann die Tabelle, aus der jede Zahl stammt. Raster 7:5, breite Abschnitte über beide Spalten.
- **Diagrammgrammatik:** Stand = Linie; Veränderung je Periode = Balken um Null in eigenem Band (keine zweite y-Achse); Plan gegen Ist = Bullet (Ist-Balken, Plan als schwarzer Strich); Anteile ≤ 6 = segmentierter Balken; > 6 = sortierte Balken; Kategorie × Monat = Heatmap; Flüsse = Sankey.
- **Heatmap als Tuschedichte:** `--h` 0–1 je Zelle, pastellige Richtungstönung mit `h × --heat-max`, hell 80 %, dunkel 50 % (Owner #426, 11.10.2026). Zelltext mindestens 4,5:1 Kontrast; Dichte immer je Zeile normiert. Verlustmonate: gestrichelte Kontur statt Tönung.
- **Sankey als Tuschebänder:** Einnahmenarten → Klassen → Gruppen, Bänder 20 % deckend in Klassenfarbe, Knoten 10 px; „Übrig“ und „Aus Guthaben“ als gestrichelte Knoten; Gruppen unter 3,5 % gehen in „Weitere“. Unter 600 px nur zwei Stufen, die Gruppen stehen in der Stückliste darunter.
- **Nicht-Klassen-Reihen** (Kontotypen, Einnahmearten, Kostenarten) laufen in Tuschestufen 100 · 60 · 38 %, blasse Tusche, Tönung mit Kontur. Schraffur bleibt Klassen und gebundenem Geld (Rücklagen) vorbehalten.
- **Druckblatt (Signature):** A4-Rahmen mit Zonenmarken 1–6 / A–F, Innenrand, Abschnitte A–F mit Buchstabenmarke, Schriftfeld unten rechts bündig am Innenrand (Benennung, Monat/Jahr, Stand, Zeichnungs-Nr. `FA-R1.1-2608`, Einheit €, Blatt n/m). Monats-One-Pager 1 Blatt, Jahresreport 2 Blätter. `@media print` blendet die App-Hülle aus und erzwingt helle Tokens; mobil fällt der Rahmen weg.
- **Rotstift in Reports** nur für Handlungsbedarf jetzt: überzogene Kategorie im laufenden Monat, negativer Tiefpunkt, verletzte Regel. Vergangene Überschreitungen sind Tusche mit Vorzeichen.
- **Richtungsfarben:** Signed text and series follow [Farbrollen v2 (DS1, #472)](#farbrollen-v2-ds1-472). Existing signed heatmaps retain their row-average calculation and neutral band below 8 % until the separate single-hue UI migration; their `--heat-green` / `--heat-red` fills are not act-now roles.
- **Katalog 30 Reports, 5 Baugruppen** (Monat und Einkommen, Ausgaben und Plan, Zukunft und Vermögen, Portfolio, Überblick). Vorige/nächste Zeichnung steht oben im Report.
- **50/30/20 als zugewiesenes Geld:** `RC.alloc()` rechnet periodische Kosten, Sonderzahlungen und Windfall-Umbuchungen als Zwölftel; Balken Bedarf/Wunsch/Zukunft plus „Übrig“ (Kontur) bzw. „Aus Guthaben“ (hinter der gestrichelten 100-%-Marke); Legende mit Prozent und Euro, zusammen immer 100 %.
- **Liquiditätsprognose als Planungswerkzeug:** Urteilskasten (voller 1-px-Rahmen, keine Seitenleiste), Ereignisliste mit „+ Ereignis“, Stellschrauben als Checkboxen mit Wirkung auf den Tiefpunkt, 10-%-Puffer als Band, Monatstabelle und Bewegungen je Monat (Anfang, Bewegungen ab 250 €, Rest als eine Zeile, Ende) über denselben Horizont wie das Urteil.
- **Portfolio-Zeichnungen:** Depots nebeneinander (Rechenblock Anfang + Einzahlungen + Gewinn = Wert, Indexlinie gegen Weltindex), Sonnendiagramm innen Klasse/außen Produkt in Tuschestufen 100 · 60 · 38 % und Kontur, Produkte als Link mit Seitenpanel (Tageskurs, Käufe als Kreise). Einstand, Gewinn und TER kommen aus einer Funktion (`RC.costOf`, `RC.gainOf`, `RC.terOf`) für Reports und Vermögen.
- **Vermögen entscheidet, Reports zeigen die Wirkung:** Vermögen › Portfolio hat Soll/Ist, Rebalancing, Sparpläne mit Vorschlag; Rendite- und Index-Vergleiche stehen nur in Reports › Portfolio.
- **Gehaltszettel-Dialog:** Seitenpanel mit Segment „PDF hochladen | Werte eingeben“, Felder in Baugruppen Bezüge/Abzüge/Kontrolle, Kontrollkette Brutto − Abzüge = Auszahlung gegen „Auszahlung laut Zettel“.
- **Stufen im Regelwerk:** drei Stufen als Schriftfeld-Zellen (aktuelle Stufe getönt mit Linie oben), Nummer als Positionsmarke, keine Dachzeile.

## Do's and Don'ts

### Do:
- **Do** setze jeden Leit- und Summenwert als Maß (Maßlinie, Begrenzung, Maßtext) und mache ihn zur Maßkette auffaltbar, immer über die eine `drawChain`-Komponente.
- **Do** kodiere Datenstatus mit Linienart: durchgezogen = Ist, gestrichelt `7 5` = Plan und Prognose, strichpunktiert `12 4 2 4` = Vormonat, und zeige die Legende.
- **Do** kodiere die drei Klassen mit Füllung: Bedarf voll, Wunsch 135°-Schraffur, Zukunft Kreuzschraffur; gebunden als Schraffur in blasser Tusche.
- **Do** zeige Schulden in Ketten als gestrichelte Kontur ohne Füllung.
- **Do** verwende außerhalb von Diagrammen und Maßen klassische Finanzsymbole und Lucide-Icons (Strich 1,75, 18 px).
- **Do** zeige Emojis (z. B. an Kategorien) nur einfarbig in der Tintenfarbe: Schrift Noto Emoji (monochrom, selbst gehostet) und `font-variant-emoji: text`. Nie farbige Emojis (Entscheidung 29.09.2026).
- **Do** halte pro Region höchstens ein Zeichenmittel sichtbar.
- **Do** pflege beide Modi gleichwertig über dieselben Rollen-Properties.

### Don't:
- **Don't** lege das Zeichenraster flächig unter Inhalte; es bleibt ein ausgeblendeter Eckakzent (oben rechts, in der Hero-Kennzahl rechts) und darf nie hinter Text in voller Stärke stehen.
- **Don't** verwende Schraffur außerhalb von Balken und Diagrammflächen, und nie für Schulden.
- **Don't** setze die Höhenkote außerhalb von Diagrammen und Maßen ein.
- **Don't** verwende Rot für etwas anderes als Handlungsbedarf, Grün für etwas anderes als vorhandenes Geld oder Erfüllung, und keine weitere Signalfarbe.
- **Don't** baue Kachelwände aus gleichwertigen Karten; eine Seite hat eine Hero-Kennzahl und wenige Arbeitsflächen.
- **Don't** übernimm Manrope, den Akzent #0E6E66 oder die weißen Kacheln aus `03_Mockups/` und Kapitel 10 des Konzepts.
- **Don't** setze technische Versalbeschriftung als Dachzeile über Überschriften.
