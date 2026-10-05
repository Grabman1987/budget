---
name: Finanz-App
description: Haushaltsfinanzen als Konstruktionsblatt, Blaupause in der Haltung, nicht in der Tapete.
colors:
  primary: "#1747a6"
  primary-hover: "#0f3a8f"
  on-primary: "#ffffff"
  line: "#1747a6"
  line-2: "#8fa9d6"
  ground: "#f2f5f9"
  ground-2: "#eef3fa"
  raised: "#ffffff"
  surface: "#ffffff"
  surface-2: "#f6f8fb"
  ink: "#0b1b33"
  ink-2: "#3a4e6e"
  ink-3: "#586e90"
  rule: "#d6dfed"
  rule-strong: "#b6c6df"
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
  dark-ground: "#0b3152"
  dark-ground-2: "#092a47"
  dark-raised: "#0f3b60"
  dark-surface: "#0f3b60"
  dark-surface-2: "#0d3657"
  dark-ink: "#eef6fc"
  dark-ink-2: "#b9d0e3"
  dark-ink-3: "#8fb0cb"
  dark-line: "#d2ecff"
  dark-line-2: "#6f9dc2"
  dark-rule: "#25557a"
  dark-rule-strong: "#386a91"
  dark-graticule: "#15406a"
  dark-primary: "#eef6fc"
  dark-on-primary: "#0b3152"
  dark-red: "#ff8b7b"
  dark-good: "#1f6a40"
  dark-good-hover: "#247a4a"
  dark-on-good: "#ffffff"
  dark-good-soft: "#18493d"
  dark-on-good-soft: "#a8e6c0"
  dark-quiet-soft: "#164368"
  dark-need: "#e4f2ff"
  dark-want: "#7cc0f5"
  dark-future: "#6fd8d2"
typography:
  dimension:
    fontFamily: "Archivo, Segoe UI, system-ui, sans-serif"
    fontSize: "68px"
    fontWeight: 640
    lineHeight: 1
    letterSpacing: "-0.03em"
    fontVariation: "'wdth' 96"
    fontFeature: "'tnum'"
  display:
    fontFamily: "Archivo, Segoe UI, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 650
    lineHeight: 1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Archivo, Segoe UI, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 620
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Archivo, Segoe UI, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 620
    lineHeight: 1.3
    letterSpacing: "-0.005em"
  figure:
    fontFamily: "Archivo, Segoe UI, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 640
    lineHeight: 1.1
    letterSpacing: "-0.02em"
    fontFeature: "'tnum'"
  body:
    fontFamily: "Archivo, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "'tnum'"
  label:
    fontFamily: "Barlow Semi Condensed, Archivo, system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.06em"
  chart-label:
    fontFamily: "Barlow Semi Condensed, Archivo, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    letterSpacing: "0.05em"
rounded:
  titleblock: "2px"
  xs: "4px"
  sm: "6px"
  md: "8px"
  sheet: "12px"
  sheet-mobile: "16px"
  pill: "999px"
  round: "50%"
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
    rounded: "5px"
    padding: "0 12px"
    height: "28px"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
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

# Design System: Finanz-App

## Overview

**Creative North Star: "Das Konstruktionsblatt"**

Die Finanz-App ist ein technisches Zeichenblatt, keine Kachelwand. Jede Zahl ist ein Maß: Sie sitzt als Maßtext auf einer Maßlinie mit Schrägstrich-Maßbegrenzung und lässt sich in ihre Maßkette zerlegen, bis hinunter zur einzelnen Buchung. Die Blaupause steckt in der Haltung (Linienarten, Schriftfeld, Planliste, Revisionstabelle, Detailausschnitte), nicht in der Tapete: Ein feines Zeichenraster erscheint nur als Akzent in der rechten oberen Ecke und läuft über eine Maske in die Fläche aus.

**Präzisionsschicht (Entscheidung 02.10.2026, „Architect / Precision Fintech“):** Ein kühler Slate-Grund (`ground`), darauf weiße Karten (`surface`) mit Haarlinienrand (`card-border`) und mehrlagigem, weichem Schatten (`card-shadow`); die Seitenleiste ist ein ruhiges Eisblau (`ground-2`) mit der Kontenhierarchie unter der Planliste. Grün ist das Signal für vorhandenes Geld: die Hero-Kennzahl in Waldgrün (`good`, Schrift weiß) und positive Restbeträge als Mint-Pillen (`good-soft` mit `on-good-soft`); ausgeschöpfte Beträge sind neutralgraue Pillen (`quiet-soft`). Plan › Monat hat drei Spalten: Seitenleiste, Stückliste als Karte und rechts einen Inspektor (Monatsüberblick, 50/30/20, Wasserfall). Die Mockups in `design/screens` sind damit keine Prüfreferenz mehr; eigene Vergleichsbilder sichern den Stand.

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

### Named Rules
**The Signal Rule.** Grün sagt „das Geld ist da“ (Hero, Mint-Pillen, erfüllt), Rot sagt „handeln“; beide erscheinen nie ohne Zahl, Vorzeichen oder Symbol.

**The Rotstift Rule.** Rot bedeutet Handlungsbedarf. Ein verletzter Finanz-Check-Wert ohne akute Aktion steht in Tinte mit Warnsymbol, nicht in Rot. Rot und jeder Status erscheinen nie ohne Vorzeichen oder Symbol.

**The Only Blue Rule.** Alle Tinten außer dem Rotstift sind Blautöne, von Preußisch bis Petrol. Grün als Erfolgsfarbe gibt es nicht; „erfüllt“ und positive Deltas stehen in Tusche mit Häkchen oder Pfeil.

## Typography

**Display Font:** Archivo (variabel, selbst gehostet, mit Segoe UI, system-ui)
**Body Font:** Archivo
**Label/Mono Font:** Barlow Semi Condensed 400/500/600 (selbst gehostet, Fallback Archivo)

**Character:** Archivo ist die Werkhorst-Grotesk des Blatts: breite, ruhige Ziffern, im ganzen Dokument mit `tabular-nums`. Barlow Semi Condensed ist die technische Normschrift für Beschriftungen, Blattnummern, Achsen und Maßtexte in Diagrammen.

### Hierarchy
- **Dimension** (640, 68 px desktop / 40 px mobil, Breite 96 %): Der Leitmaßwert, gesetzt als Maßtext über der Maßlinie. Cent in halber Größe und `ink-3`.
- **Display** (650, 30 px, Zeilenhöhe 1): Monatstitel im Schriftfeld („September 2026“), mobil 24 px im Kopf.
- **Headline** (620, 20 px): Titel des Leitmaß-Abschnitts; mobil 18 px.
- **Title** (620, 17 px): Abschnittsköpfe, Panel-Titel.
- **Figure** (640, 24 px; mobil 21 px): Kennzahlen in Abschnitten. Große Solitärwerte stufen sich auf 34 px (Nettovermögen), 36 px (Panel) und 44 px (Buchungsdisplay, mobil 36 px), alle 650 mit −0,03 em.
- **Body** (400, 14 px, 1,45; mobil 15 px): Fließtext, Zeilen; Zeilentitel 580, Beträge 620–640. Erklärtext maximal 38 ch.
- **Label** (Barlow SC 500, 11,5 px, 0,06 em, Versalien, `ink-3`): Feldbeschriftungen im Schriftfeld, Tabellenköpfe, Planliste, Klassen-Tags (11 px, 0,07 em).
- **Chart label** (Barlow SC 500, 12 px, 0,05 em): Achsen; hervorgehobene Maßtexte 13 px in 600 (`ink`), 500 (Tusche) oder 600 (Rotstift).

### Named Rules
**The Tabular Rule.** Jede Ziffer steht in Tabellenziffern, damit Beträge in Spalten fluchten.

**The Lettering Rule.** Die technische Versalbeschriftung beschriftet Felder, Spalten, Achsen, Blätter und Klassen. Sie steht nie als Dachzeile über einer Überschrift.

## Layout

**Owner-Entscheidung 05.10.2026 „Volle Breite“:** Seiten nutzen die ganze Bildschirmbreite neben der Seitenleiste; nur Fließtext, Formulare, Dialoge und Druckseiten behalten eine eigene Breite.

Das Blatt ist ein 12-Spalten-Raster mit 32 px Spaltenabstand ohne maximale Seitenbreite (`--page-max: none`), Innenrand 28 / 40 / 72 px, Abschnittsabstand 44 px. Desktop: Seitenleiste 236 px (eingeklappt 72 px), klebende Kopfleiste 64 px mit Suche (max. 460 px), Posteingang und Buchung. Kartenraster gewinnen über `auto-fit/minmax` Spalten; ab etwa 1440 px stehen Diagramme und ihre Tabellen nebeneinander. Fließtext bleibt höchstens 72 ch breit, SVG-Beschriftungen behalten ihre Pixelgröße und Diagrammhöhen bleiben begrenzt. One-Pager und Jahresreport behalten ihre A4-Blätter.

Reihenfolge auf „Heute“: Schriftfeld über die volle Breite, darunter das Leitmaß über die volle Breite (Diagramm 330 px hoch, Erklärtext links oben überlagert, max. 34 %), dann Pace (7 Spalten) neben Revisionstabelle (5 Spalten), dann Detailausschnitte in drei Spalten (Nettovermögen über zwei).

Umbrüche: unter 1180 px zwei Detailspalten; unter 980 px Pace und Revisionen gestapelt; unter 768 px eine Spalte, Innenrand 16 px, Abschnittsabstand 36 px, Seitenleiste wird zur Tab-Leiste (64 px plus Safe Area) mit rundem Tusche-Knopf „Buchung“, die dringendste Revision rückt direkt unter das Leitmaß. Der Buchungsdialog ist einspaltig, 540 px breit, mobil ein Blatt von unten.

Berührflächen mindestens 44 px auf Mobilgeräten.

## Elevation & Depth

Drei Ebenen: Grund (`ground`), Karte (`surface` mit `card-border` und dem weichen `card-shadow`) und schwebende Ebenen. Innerhalb einer Karte gliedern Haarlinien, nie verschachtelte Karten. Der Schwebeschatten gehört nur schwebenden Ebenen: Seitenpanel, Buchungsdialog, Combobox-Liste, Toast und rundem Buchungsknopf. Kopf- und Tab-Leiste sind leicht durchscheinend (88 % bzw. 92 % Grund, Weichzeichner 10–12 px).

### Shadow Vocabulary
- **Schwebeebene** (`box-shadow: 0 10px 22px -10px rgba(11, 27, 51, 0.30), 0 2px 5px rgba(11, 27, 51, 0.08)`, dunkel `0 12px 24px -10px rgba(2, 10, 26, 0.7), 0 2px 6px rgba(2, 10, 26, 0.4)`): nur für Ebenen über dem Blatt.

### Named Rules
**The One Card Rule.** Eine Arbeitsfläche ist eine Karte; in ihr gliedern Linien. Karten in Karten gibt es nicht, Kachelwände aus gleichwertigen Karten auch nicht.

## Shapes

Die Formsprache ist die des Plans: Haarlinien in 1 px, fast scharfe Ecken. Das Schriftfeld hat 2 px, Zählmarken und Tastenkürzel 4 px, Zeilen und Listenfelder 6 px, Schaltflächen, Felder und Tasten 8 px, der Buchungsdialog 12 px (mobil als Blatt von unten 16 px, Seitenpanel mobil 14 px). Rund sind nur Kreisnummern, Avatar und der Buchungsknopf; Kategorie-Chips im Buchungsdialog sind Pillen.

Zeichenmittel: Maßlinien mit Schrägstrich-Begrenzung (Strich 1,25–1,6), gepunktete Maßhilfslinien (`2 3`), die Höhenkote als offenes, nach unten zeigendes Dreieck mit Bezugslinie, Revisionsdreiecke mit Buchstabe, Kreisnummern 22 px. Linienarten: Ist durchgezogen 2 px; Plan gestrichelt `7 5` in blasser Tusche 1,5 px; Prognose gestrichelt `7 5` in Tusche 1,75 px; Vormonat strichpunktiert `12 4 2 4` in `ink-3`; Heute-Linie gepunktet `1 3`.

Schraffuren: Bedarf Vollfläche, Wunsch 135°-Schraffur (2 px Strich, 5 px Rapport), Zukunft Kreuzschraffur (45° und 135°, 1,5 px), gebunden 135°-Schraffur in blasser Tusche. Schulden in Ketten: gestrichelte Kontur `5 3`, ohne Füllung.

### Shared chart inspection
All chart forms share one raised, hairline-bordered tooltip with tabular exact values, a legend-colour swatch and series name per visible layer, and the date/month at the bottom. Time charts snap a vertical dotted crosshair to the nearest stored point; ranked bars, sectors and Sankey nodes/links use their actual hit target (Sankey includes amount and share of the income pool). Focus plus left/right explores points, Escape hides, touch taps select and an outside tap hides. Amount privacy also masks these values. Negative bars use the opaque `red` token in both themes; signs and position around zero carry meaning alongside colour.

## Components

### Buttons
Sachlich und dicht, wie Tuschfelder.
- **Shape:** 8 px Radius, Höhe 40 px (klein 34 px, im Dialog und mobil 44–46 px).
- **Primary:** Tusche-Fläche mit weißer Schrift (dunkel: Lichtpausweiß mit preußischblauer Schrift), 600, Innenabstand 16 px.
- **Hover / Focus:** Hover vertieft die Tusche; Fokus ist ein 2-px-Tuscherahmen mit 2 px Abstand; beim Drücken 1 px nach unten.
- **Ghost:** transparent mit kräftiger Haarlinie; Hover mit blasser Tusche und Tönung.
- **Alert:** Rotstift-Fläche, nur für die eine dringende Aktion einer Revision.

### Chips
- **Style:** Pille 36 px, kräftige Haarlinie, 13,5 px / 520, mit Klassen-Farbfeld (10 px, Schraffur der Klasse).
- **State:** gewählt = Tusche-Fläche mit Grundfarbe als Schrift; „leise“ Variante mit gestrichelter Kontur. Mobil horizontal scrollend.

### Cards / Containers
Arbeitsflächen sind Karten: `surface`, 12 px Radius, Rand `card-border`, Schatten `card-shadow`; Tabellenköpfe und Baugruppenzeilen auf `surface-2`. Innerhalb der Karte bestehen Abschnitte aus einem Kopf (Titel, rechts Link in `ink-2`, darunter Haarlinie) und Zeilen mit Haarlinientrennern. Zeilen sind ganzflächige Schaltflächen mit 6 px Radius und Tönung beim Hover.

### Inputs / Fields
- **Style:** 44 px hoch (Suche 40 px), kräftige Haarlinie, `raised`-Grund, 8 px Radius, Label 13 px / 560 in `ink-2` darüber.
- **Focus:** Rahmen wird Tusche plus 3-px-Tönungsring (`--tint-2`).
- **Error:** Rotstift-Text 12,5 px / 560 unter dem Feld.
- **Combobox:** eigene Liste auf `raised` mit Schwebeschatten; ausgewählte Zeile getönt.

### Navigation
- **Planliste (Desktop):** Beschriftung „Planliste“, Zeilen 42 px mit Lucide-Symbol, Name und Blattnummer 01–05 in Barlow SC. Aktiv: `raised`-Grund, kräftige Haarlinie, 600, Blattnummer in Tusche. Eingeklappt nur Symbole.
- **Kontenhierarchie (Seitenleiste):** Gruppen in YNAB-Reihenfolge, einklappbar; negative Beträge (Konto und Gruppensumme) als rote Pille (`red-soft`, `red`), positive als schlichter Text. Unten Profil-Block mit Kürzel im Kreis und Namen aus Einstellungen › Profil (ohne Eintrag generisch „Profil“ / „NU“).
- **Tab-Leiste (mobil):** fünf Einträge, 22-px-Symbole, 11,5 px Text; aktiv in Tusche mit 2-px-Strich an der Oberkante.
- **Einstellungen (gruppiert):** elf Seiten passen nicht in eine Registerleiste. Desktop: senkrechte Liste links neben der Seite (208 px) mit Gruppenköpfen Daten · Automatik · System in Barlow SC, Zeilen 40 px, aktiv wie in der Planliste (`raised`-Grund, kräftige Haarlinie, 600, `aria-current="page"`). Handy: `/einstellungen` ist die Übersicht mit denselben Gruppen als ganzbreite 44-px-Zeilen mit Pfeil; jede Seite zeigt darüber einen Rücksprung „‹ Einstellungen“ und ihren Namen. Alle Adressen bleiben.
- **Segmentschalter:** Rahmen 8 px mit 4 px Innenabstand; aktives Segment als Tusche-Fläche.

### Schriftfeld
Der Seitenkopf als Schriftfeld: 1-px-Rahmen in blasser Tusche, 2 px Radius, Zellen durch senkrechte Linien getrennt. Titelzelle mit dem aktuellen Monat („September 2026“), dann Felder mit Versalbeschriftung: Stand, Zeitraum (Segmentschalter). Kein Urteilssatz („Ja, der Monat hält“), die Leitzahl ist die Antwort. Keine Blattnummer. Mobil wandert der Monat in den Kopf; das Schriftfeld behält Stand und Zeitraum in einer Zeile ohne Beschriftung.

### Maßkette (Signature)
Eine einzige Komponente (`drawChain`) für jede Maßkette. Oben die Teilmaße als Maßlinien mit Schrägstrichbegrenzung und Maßtext, darunter ein 14-px-Balken aus Segmenten in Klassenfüllung mit Tuschekontur, darunter der abgezogene Teil (gebunden = Schraffur; Schulden = gestrichelte Kontur), unten das Ergebnismaß „= …“. Jedes Segment ist tastaturbedienbar und öffnet seine Einzelposten im Seitenpanel. Linien werden wie ein Plotter gezogen (900 ms, `cubic-bezier(0.16, 1, 0.3, 1)`); die Kette klappt in 240 ms auf. Bei reduzierter Bewegung erscheint alles sofort.

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
- **Drei Spalten (02.10.2026):** Mitte die Hero-Kennzahl „Zu verteilen“ (Waldgrün bei Geld, Rotstift-Fläche bei zu viel zugewiesen, ruhige Karte bei 0) mit Maßkette und „Geld verteilen“, darunter Revisionen und die Stückliste als Karte; rechts der klebende Inspektor mit Monatsüberblick (Statuszeile, Übertrag, Einnahmen, Zugewiesen, Aktivität, Verfügbar als Pille), 50/30/20 und der Wasserfall-Leiste. Unter 1280 px rutscht der Inspektor unter die Stückliste, auf dem Handy einspaltig. Verfügbar steht als Pille: Mint positiv, neutral bei 0, Rotstift bei Bargeld-Überziehung, gestrichelt bei neuer Kartenschuld.
- **Zu verteilen:** Leitwert (56 px, mobil 44 px) mit Maßkette als Termzeile unter einer Maßlinie mit Schrägstrichbegrenzung: Übertrag + Einnahmen (− Ungedeckt Vormonat) − Zugewiesen = Zu verteilen. Beschriftungen brechen nie um; jedes Rechenzeichen bleibt mit dem folgenden Term zusammen (`.ct-pair`); anklickbare Terme mit punktierter Unterstreichung öffnen ihre Posten.
- **Leiste links folgt der Gliederung:** Wasserfall (neun Stufen mit Flusslinie und Wasserstand), Zeit, Gruppen, Klassen oder Triage; außerhalb des Wasserfalls ohne Flusslinie, Nummern als eckige Marken. Keine Überschrift über der Leiste.
- **Stufenleiste (Wasserfall):** neun Stufen als Kreisnummern (28 px) an einer Flusslinie mit Pfeilspitzen, darunter Name, 6-px-Füllbalken in Tusche und Status („gedeckt“ / „fehlt …“). Voll = gefüllter Kreis, teilweise = Tuschekontur. Oben Zufluss (und Ungedeckt Vormonat), unten „Noch frei“; die Leiste geht immer auf. Der **Wasserstand** (▽ plus gestrichelte Tuschelinie plus „Wasserstand“ am Zeilenende) markiert einmal die Grenze, an der das Geld endet. Mobil: waagrechter Streifen aus Stufenkarten ohne Wasserstand.
- **Stückliste:** Tabelle mit Pos. (1.1, 1.2 … in Barlow SC) · Kategorie · Zugewiesen · Aktivität · Verfügbar. Stufen, Gruppen oder Klassen sind Baugruppenzeilen (Grund `ground-2`, Kreisnummer, Summen in denselben Spalten, einklappbar). Unter jeder Kategorie der 6-px-Zeilenbalken: Füllung = ausgegeben in Klassenfüllung, schwarzer Strich = Pace-Soll heute, Tuschestrich am Ende = Sparziel; darunter eine Metazeile. Ziel und Pace sind nie eigene Spalten.
- **Zuweisen inline:** „Zugewiesen“ ist eine Schaltfläche; Klick macht sie zum Rechenfeld (Enter übernimmt, Esc bricht ab, „+50“ addiert). Im Seitenpanel dasselbe Betragsfeld wie bei der Buchung mit Operator-Knöpfen und Ergebniszeile.
- **Geld verteilen:** Vorschläge als gestrichelt umrandete Tuschewerte („+890,00“) unter „Zugewiesen“, Spalte leicht getönt; je Baugruppe „Stufe übernehmen“, oben „Alle übernehmen“. Befüllt wird strikt von oben nach unten; ein Rest ohne Ziel fließt in Stufe 8.
- **Gliederungen (Segmentschalter):** Wasserfall · Zeit · Gruppen · Klassen · Triage. **Zeit** ordnet nach nächstem Zahlungstermin: nächste 14 Tage, bis Ende nächsten Monats, später mit Termin, ohne festen Termin, zuletzt „Laufend“ (variable Monatsbudgets); bezahlte Fixkosten zeigen „nächste am …“. **Triage** (Wunsch des Nutzers, 28.09.2026) gruppiert Überzogen · Fällig, nicht gedeckt · Fehlt zum Ziel; das rote Zählabzeichen zählt nur die ersten beiden, „Fehlt zum Ziel“ ist normale Verteilarbeit in Tusche.
- **Triage-Leiste:** zusätzlich zur Triage-Ansicht ein Zustand über der Tabelle. Erscheint nur bei Überziehung oder negativem „Zu verteilen“ als Revisionstabelle in 1-px-Rotstiftrahmen (Rev. · Änderung · Aus Envelope · Aktion) über der unveränderten Tabelle; betroffene Zeilen bekommen Rotstift-Tönung und Revisionsdreieck. Hinweis „Erst decken, dann verteilen“, wenn beides offen ist.
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
Je Konto: Quelle (Bank-Sync PSD2, API nur lesen, Datei-Import, manuell), Schalter „Automatisch“, Rhythmus (2× / 1× täglich), Einwilligung bis (mit „Erneuern“ unter 14 Tagen), letzter Stand und Status als Quellstempel. Darunter Nachtlauf, Kursabruf, Ersatzquelle, EZB-Kurse als Schalter und die Veraltet-Schwelle für manuelle Werte. **Schalter:** 40 × 22 px, Spur mit 1,5-px-Kontur; an = Tuschefläche mit Grundfarbe-Knopf.

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
- **Heatmap als Tuschedichte:** `--h` 0–1 je Zelle, Tönung `color-mix(var(--line) h × --heat-max)`, hell 44 %, dunkel 34 %, damit die Zahl lesbar bleibt; Dichte immer je Zeile normiert. Verlustmonate: gestrichelte Kontur statt Tönung.
- **Sankey als Tuschebänder:** Einnahmenarten → Klassen → Gruppen, Bänder 20 % deckend in Klassenfarbe, Knoten 10 px; „Übrig“ und „Aus Guthaben“ als gestrichelte Knoten; Gruppen unter 3,5 % gehen in „Weitere“. Unter 600 px nur zwei Stufen, die Gruppen stehen in der Stückliste darunter.
- **Nicht-Klassen-Reihen** (Kontotypen, Einnahmearten, Kostenarten) laufen in Tuschestufen 100 · 60 · 38 %, blasse Tusche, Tönung mit Kontur. Schraffur bleibt Klassen und gebundenem Geld (Rücklagen) vorbehalten.
- **Druckblatt (Signature):** A4-Rahmen mit Zonenmarken 1–6 / A–F, Innenrand, Abschnitte A–F mit Buchstabenmarke, Schriftfeld unten rechts bündig am Innenrand (Benennung, Monat/Jahr, Stand, Zeichnungs-Nr. `FA-R1.1-2608`, Einheit €, Blatt n/m). Monats-One-Pager 1 Blatt, Jahresreport 2 Blätter. `@media print` blendet die App-Hülle aus und erzwingt helle Tokens; mobil fällt der Rahmen weg.
- **Rotstift in Reports** nur für Handlungsbedarf jetzt: überzogene Kategorie im laufenden Monat, negativer Tiefpunkt, verletzte Regel. Vergangene Überschreitungen sind Tusche mit Vorzeichen.
- **Richtungsfarben (Entscheidung 29.09.2026):** Pastelliges Grün (`--heat-green` #a9dbb8) und Rot (`--heat-red` #f3b3a9) nur für Heatmaps und für Veränderungen mit Vorzeichen (besser/schlechter, `--good-ink`/`--bad-ink` für Text). Heatmap-Zellen färben je Zeile gegen den Zeilendurchschnitt (Ausgaben: teurer = rot; Einnahmen, Zukunft, Rendite: höher = grün; Projekte gegen 0); Abweichungen unter 8 % bleiben neutral. `--red` bleibt dem Handlungsbedarf vorbehalten.
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
