# User-Stories – Reports

Alle Reports mit Nummer laut `docs/FEATURES.md` (34 Reports, 1.1 bis 5.6). Jede Nummer steht genau einmal im Feld „Verweis“. Berichte werden sonst nur mit Namen genannt.

**Gemeinsamer Einstieg (für alle Stories):** Reports im Hauptmenü öffnen (`/reports`). Dort „Alle Berichte“ nach Gruppe („Berichtsgruppen“) filtern oder mit „Name oder Frage suchen“ suchen; „Zuletzt geöffnet“ führt zurück. Im Bericht wechselt „Bericht wechseln“ (oder Alt+Shift+Pfeil links/rechts) zum Nachbarn. Zeitraumberichte haben die „Zeitraum-Schnellauswahl“ (Dieser Monat, Letzter Monat, 3 Monate, 6 Monate, 12 Monate, Dieses Jahr, Letztes Jahr, Alles, Benutzerdefiniert), „Voriger Zeitraum“/„Nächster Zeitraum“ und „Zeitraum wählen“; die Wahl steht in der Adresse (`?zeitraum=`). Monatsberichte haben „Monat“ mit „Vormonat“/„Nächster Monat“, Jahresberichte „Jahr“. Fachbegriffe mit gepunkteter Unterstreichung öffnen eine Erklärung (RP-24). „Berechnung und Einordnung“ zeigt die Rechenbasis. Die Liquiditätsprognose liegt unter Plan › Prognose, ist aber hier aufgeführt.

**Aufteilungen:** RP-05, RP-07, RP-11, RP-12, RP-13, RP-15, RP-16, RP-17, RP-18, RP-21 und RP-23 sind in a/b(/c) geteilt, weil sie unabhängige Berichte bündeln. Namen folgen dem Katalog der App: RP-05b „Einnahmen und Cashflow“ (früher „Einnahmen und Ausgaben“), RP-11a „Prognosegenauigkeit“ (in der alten Tabelle als Budgettreue geführt), RP-11b „Budgettreue“, RP-13a „Verträge und Kosten“, RP-18a „Portfolio-Auswertung“.

### RP-00 – Zeitraum zwischen Reports behalten
- **Story:** Als Nutzer möchte ich meinen Zeitraum beim Reportwechsel behalten, damit ich mehrere Berichte ohne erneute Auswahl lesen kann.
- **Ausgangslage:** Redesign aktiv; ein Report mit frei wählbarem Zeitraum ist geöffnet.
- **Ablauf:**
  1. Einen Zeitraum über Segmente, Schnellauswahl, Monatsbereich oder Vor/Zurück wählen.
  2. Über „Bericht wechseln“, den Katalog oder einen direkten Link ohne Zeitraum einen anderen Zeitraumbericht öffnen. Die Auswahl bleibt auf diesem Gerät gemerkt, auch nach erneutem Öffnen.
  3. Die aktive Auswahl am Steuerelement lesen; ein eigener Monatsbereich steht zusätzlich ausgeschrieben darunter.
  4. „Zeitraum zurücksetzen“ wählen: Die lokale Vorbelegung wird gelöscht und der bisherige Standard des aktuellen Reports angezeigt.
- **Ergebnis:** Passende Reports übernehmen denselben Zeitraum. Ein Link mit explizitem `zeitraum` hat Vorrang und wird zur nächsten Vorbelegung.
- **Abnahmekriterien:**
  - Gilt gemeinsam für die Zeitraumberichte dieser Stories sowie freie Explorer-Auswertungen und Zeitraumvorlagen aus RP-23; Monatsansichten wie Einnahmen bleiben separat.
  - Monats-, Jahres- und feste Berichte einschließlich Kontakte, Portfolio-Verteilung, Freiheit und Explorer-Jahresansicht behalten ihre bisherigen Zeitgrenzen. Gespeicherte Explorer-Ansichten behalten ihre eigene Definition.
  - Ein Reset benötigt einen Klick, erhält andere Ansichtsfilter und setzt keine Buchungen oder gespeicherten Auswertungen zurück.
  - Die Vorbelegung bleibt lokal im Browser; gesperrter Browserspeicher verhindert keine Reportanzeige. Finanzberechnungen, Audit und Rückgängig bleiben unverändert.
- **Status:** implementiert für Review (#1100); CI und Live-Abnahme offen.

### RP-00a – Read the report verdict before its details

- **Story:** As a user, I want the report's existing interpretation directly below
  its header so I can understand the result before reading tables and charts.
- **Starting point:** Open any report using the shared redesign report frame.
- **Flow:**
  1. Open the report or a retained report link (including Nettovermögen) and select
     its period or view.
  2. Read the verdict immediately below the header with calculation details closed.
  3. Open “Berechnung und Einordnung” to inspect the existing calculation inputs.
  4. Hide amounts; the verdict and calculation retain the existing privacy masking.
- **Acceptance criteria:**
  - The existing domain-generated verdict precedes tables, charts and disclosures.
  - A view without verdict facts states “Keine Bewertung möglich” and explains
    that evaluation data is missing, without guessing a financial judgement.
  - Header controls, remembered periods, explicit deep links and legacy redirects
    retain their existing behavior. No financial figure or formula changes.
  - The verdict is readable at desktop 1440 and phone 390 in light and dark themes.
    One-Pager printing retains only the sheet's own verdict.
  - Nettovermögen's full-page visual baselines include the exposed verdict; the
    existing account reconciliation, calculation-chain and period checks remain.
- **Status:** Implemented for review (#1155, PR #1169); scoped Linux visual baselines
  regenerated and independently reviewed; required CI and owner acceptance open.

### RP-01 – Monats-One-Pager
- **Story:** Als Nutzer möchte ich den Monat auf einem Blatt mit Ergebniskette und 50/30/20 sehen und drucken, damit ich am Monatsende ohne Suchen entscheide, ob der Monat gut lief und was ich im nächsten ändere.
- **Ausgangslage:** Monatsende oder laufender Monat; Buchungen und Plan des Monats sind vorhanden.
- **Ablauf:**
  1. Reports › Monats-One-Pager öffnen.
  2. Mit „Monat“, „Vormonat“ und „Nächster Monat“ den Monat wählen; bei einem laufenden Monat steht „Monat läuft noch · Beträge bisher“.
  3. „Maßkette des Monats“, 50/30/20 auf zugewiesenem Geld („Zwölftel“), Nettovermögen mit Eigenanteil und Markt, größte Ausgaben, Plan und Finanz-Check-Zellen lesen.
  4. „Drucken“ wählen; „Als PDF speichern“ geht über den Druckdialog (A4 Hochformat).
- **Ergebnis:** Ich habe Ergebnis, Verteilung und Auffälligkeiten des Monats auf einer Seite.
- **Abnahmekriterien:**
  - Einnahmen, Konsum und Gespart stimmen mit Reports Einnahmen und Cashflow und Heute für denselben Monat überein.
  - Der Druck ergibt eine saubere A4-Seite ohne App-Menü.
  - Randfall: Ohne Einnahmen im Monat steht „Ohne Einnahmen im Monat lässt sich keine Verteilung berechnen.“; ohne Ausgaben „In diesem Monat gibt es keine Ausgaben in Bedarf und Wunsch.“
  - Randfall: Kapitalerträge erscheinen nur als Hinweis, nicht in Einnahmen oder Sparquote; für einen laufenden Monat gibt es keine Quote.
- **Status:** live · **Verweis:** 1.1

### RP-02 – Gehaltsreport mit Brutto/Netto und Jahresvergleich
- **Story:** Als Nutzer möchte ich Brutto, Abzüge und Netto je Monat und im Jahresvergleich sehen, damit ich weiß, was vom Brutto bleibt, ob jede Zahlung zur Bank passt und ob das Gehalt gestiegen ist.
- **Ausgangslage:** Ein Gehaltszettel liegt vor (PDF oder Papier) und die Auszahlung ist gebucht.
- **Ablauf:**
  1. Reports › Gehaltsreport öffnen, „Monat“ wählen.
  2. Fehlt der Zettel: „Gehaltszettel hinzufügen“ (laufendes Gehalt oder Sonderzahlung, Brutto, SV-DN, Lohnsteuer, Zusatzposten, „Auszahlung laut Zettel“) oder „Gehaltszettel hochladen“ (PDF, bei Bedarf Passwort „merken“). „Kontrolle Gehaltszettel“ zeigt die rechnerische Auszahlung.
  3. Bei „Später verknüpfen“ oder bei fehlender Verknüpfung die Buchung der Auszahlung verknüpfen.
  4. „Brutto zu Netto“ lesen, im Verlauf „Auszahlung je Monat und Jahr“ und „Jahresgehälter“ mit Vorjahresvergleich ansehen; „Gehaltszettel-Historie“ listet alle Zettel.
- **Ergebnis:** Ich kenne Abzugsquote und Auszahlung je Monat und die Jahresentwicklung.
- **Abnahmekriterien:**
  - Die Auszahlung laut Zettel entspricht der verknüpften Bankbuchung; sonst steht eine Warnung zur fehlenden Verknüpfung.
  - Brutto minus Abzüge plus steuerfreie Erstattungen ergibt die Auszahlung („Kontrolle Gehaltszettel“).
  - Ein Zettel kann entfernt werden, die Buchung bleibt („Gehaltszettel entfernt.“).
  - Randfall: Ohne Zettel steht „Für diesen Monat ist noch kein Gehaltszettel erfasst.“; Monate ohne Zettel sind Lücken, nicht null.
- **Status:** live · **Verweis:** 1.2
  Fehlt noch: PDF-Ablage, kollektivvertragliche und Stufenerhöhungen (siehe RP-03).

### RP-03 – Echte Gehaltsentwicklung (geplant)
- **Story:** Als Nutzer möchte ich Grundgehalt, Sonderzahlungen und Bonus getrennt und real gegen Inflation sehen, damit ich erkenne, ob ich wirklich mehr verdiene oder nur die Preise gestiegen sind.
- **Ausgangslage:** Mehrere Gehaltszettel liegen vor; jede Lohnart ist einer von fünf Komponenten zugeordnet.
- **Ablauf:** (geplant, nach Ticket)
  1. Reports › Gehaltsreport: Lohnarten einmal den fünf Komponenten zuordnen (Grundgehalt, Sonderzahlungen, variable Bezüge, Sachbezüge, Erstattungen); nicht zugeordnete Lohnarten sind aufgelistet und sperren den betroffenen Monat für Vergleiche.
  2. Leitwert „Grundgehalt brutto pro Monat“ als Stufenlinie mit jeder Erhöhung (Datum, Betrag, Prozent).
  3. Jahresvergleich und Monatsvergleich je Komponente; Monate mit Sonderzahlung oder Bonus sind markiert; Bonus je Jahr mit Anteil am Grundgehalt.
  4. „Real gegen nominal“: Index gegen VPI und persönliche Inflation, kumuliert in Prozent und Euro.
- **Ergebnis:** Ich sehe den echten Zuwachs und Kaufkraftverlust.
- **Abnahmekriterien:**
  - Sachbezüge und Spesen verzerren die Entwicklung nicht; sie stehen getrennt.
  - Fehlende Monate sind Lücken, keine Fortschreibung.
  - Der Inflationsvergleich nutzt VPI und den vorhandenen Warenkorb (Persönliche Inflation).
  - Randfall: Eine Lohnart ohne Zuordnung blockiert nur ihren Monat und wird genannt.
- **Status:** offen · **Verweis:** #1066
  Fehlt noch: Komponentenmodell, Zuordnung der Lohnarten, Ansichten, VPI-Datenquelle.

### RP-04 – Monat mit Sonderzahlung korrekt darstellen (geplant)
- **Story:** Als Nutzer möchte ich einen Monat mit Sonderzahlung ohne erfundene Netto- oder Steueraufteilung sehen, damit der Report die Auszahlung korrekt abbildet und keine falsche Warnung zu einem fehlenden Sondergehalt erscheint.
- **Ausgangslage:** Der Zettel enthält laufendes Brutto plus Sonderzahlung; die Auszahlung deckt sich mit der Bankbuchung.
- **Ablauf:** (geplant)
  1. Reports › Gehaltsreport, Monat mit Sonderzahlung wählen.
  2. Laufende Bezüge, Sonderzahlung, Erstattungen, Nachzahlungen/Korrekturen und gemeinsame Abzüge werden getrennt geführt.
  3. Ist die Aufteilung nicht belegt, steht „Aufteilung nicht bestimmbar“ statt einer Rechnung.
  4. Bei geteilter Bankgutschrift die Einkommensart je Teil sehen und ändern.
- **Ergebnis:** Die Summe stimmt mit der Bank überein, ohne erfundene Zahlen.
- **Abnahmekriterien:**
  - Es erscheint keine Warnung, die eine erfundene Aufteilung verlangt.
  - Warnungen nennen die genaue nicht zugeordnete Originalposition.
  - Die Summe der Teile entspricht der Bankbuchung auf den Cent.
  - Randfall: Steuerfreie Posten werden nicht als Differenz der Gehaltsanteile gezeigt.
- **Status:** offen · **Verweis:** #1078
  Fehlt noch: Modell der getrennten Bestandteile, Zustand „nicht bestimmbar“, Einkommensart je Teil.

### RP-05a – Einnahmen
- **Story:** Als Nutzer möchte ich sehen, woher das Geld kommt und ob alles Erwartete eingegangen ist, damit ich ausbleibende Zahlungen früh bemerke und weiß, wovon ich lebe.
- **Ausgangslage:** Einnahmen sind gebucht, wiederkehrende Zahlungen unter Plan › Zahlungen gepflegt.
- **Ablauf:**
  1. Reports › Einnahmen öffnen, „Monat“ wählen.
  2. „Einnahmen nach Art und Monat“ (12 Monate gestapelt) und die Tabelle mit Anteil ansehen.
  3. „Erwartet gegen eingegangen“: Spalten Zahlung, Erwartet, Eingegangen, Status prüfen.
  4. Kapitalerträge („Kapitalerträge, kein Einkommen“) und „Sonstige Einnahmen · Ausgleich Kontakt“ getrennt ablesen.
- **Ergebnis:** Ich erkenne fehlende erwartete Einnahmen und die Verteilung nach Art.
- **Abnahmekriterien:**
  - Die Summe stimmt mit dem Haushaltseinkommen in Einnahmen und Cashflow überein (ohne Kapitalerträge, Erstattungen und Umbuchungen).
  - Eine nicht eingegangene erwartete Zahlung zeigt den Status offen.
  - Randfall: Keine Einnahmen im Zeitraum: „Keine Einnahmen im Zeitraum.“; ohne erwartete Einnahmen: „Für diesen Monat sind keine Einnahmen erwartet.“
  - Randfall: Noch nicht zugeordnete Vorkommen zeigen „nicht zugeordnet“.
- **Acknowledgment continuation (#1109, P-09a):** In Plan's income detail, “Bereits erhalten” removes an unlinked occurrence from open expectations without displaying a shortfall or reducing the booked monthly result. The retained amount is a “Planwert”; no extra received income is invented. Undo restores the open expectation. Expected totals remain received household income plus genuinely open remainders.
- **Continuation status:** Acknowledgment wording and presentation ready for review after local verification; optional receipt linking, combined/payslip settlement and contact compensation expectations remain open. The existing report body is unchanged and this continuation is not live-accepted.
- **Status:** live · **Verweis:** 1.3

### RP-05b – Einnahmen und Cashflow
- **Story:** Als Nutzer möchte ich Einnahmen und Ausgaben je Monat mit Ergebnis sehen und die Buchungen hinter jeder Zahl öffnen, damit ich nachvollziehe, was nach den Ausgaben bleibt und warum.
- **Ausgangslage:** Mindestens ein geschlossener Monat mit Buchungen.
- **Ablauf:**
  1. Reports › Einnahmen und Cashflow öffnen, „Zeitraum“ wählen.
  2. Monatstabelle und Diagramm lesen: Einnahmen oben, Ausgaben unten, Netto als Linie; Gruppen sind aufklappbar.
  3. Eine Zelle anklicken: „Buchungen“ listet die dahinterliegenden Buchungen.
  4. „CSV“ exportiert genau die angezeigten Zeilen und Spalten.
- **Ergebnis:** Ich sehe das Monatsergebnis und kann jede Zahl bis zur Buchung verfolgen.
- **Abnahmekriterien:**
  - Die Summe der Buchungen einer Zelle entspricht dem Zellwert.
  - Netto je Monat stimmt mit dem Cashflow-Verlauf überein.
  - Die CSV enthält dieselben Zeilen und Spalten wie die Tabelle.
  - Randfall: Eine Zelle außerhalb des Zeitraums meldet „Diese Zelle ist im Reportzeitraum nicht verfügbar.“; eine leere Zelle „Keine Buchungen in dieser Zelle.“
- **Status:** live · **Verweis:** 1.10

### RP-06 – Geldfluss
- **Story:** Als Nutzer möchte ich als Sankey sehen, wohin das verfügbare Geld fließt, damit ich erkenne, ob Bedarf, Wunsch, Zukunft und Rest im gewollten Verhältnis stehen.
- **Ausgangslage:** Einnahmen und zugewiesenes Geld im Zeitraum.
- **Ablauf:**
  1. Reports › Geldfluss öffnen, Zeitraum wählen.
  2. „Maßkette Geldfluss“ und das Diagramm lesen („Ein Topf · Bedarf, Wunsch, Zukunft und Rest“).
  3. In der „Stückliste des Flusses“ Gruppen und Kategorien mit Betrag und Anteil ansehen.
  4. Über „So wird der Geldfluss berechnet“ die Basis prüfen.
- **Ergebnis:** Anteile von Bedarf, Wunsch, Zukunft und Rest sind bekannt.
- **Abnahmekriterien:**
  - Die Summe der Gruppen entspricht dem verfügbaren Topf der Maßkette.
  - Bedarf, Wunsch, Zukunft stimmen mit Budgettreue und Ausgabenanalyse im selben Zeitraum überein.
  - Randfall: Ein Zeitraum ohne Einnahmen zeigt keinen Fluss; am Handy ist die Stückliste seitlich wischbar.
  - Umbuchungen und Kapitalerträge erscheinen nicht als Haushaltsfluss.
- **Status:** live · **Verweis:** 1.4

### RP-07a – Jahresansicht
- **Story:** Als Nutzer möchte ich ein Jahr als Heatmap Kategorie mal Monat sehen, damit ich saisonale Muster und Ausreißer erkenne und Rücklagen darauf abstimme.
- **Ausgangslage:** Mindestens ein Jahr mit Buchungen.
- **Ablauf:**
  1. Reports › Jahresansicht öffnen, „Jahr“ wählen.
  2. Mit „Detailtiefe“ zwischen Gruppen und Kategorien wechseln.
  3. Heatmap und „Maßkette des Jahres“ lesen; den Vergleich mit denselben Monaten des Vorjahres ansehen.
  4. Eine Zelle öffnen, um Buchungen zu sehen.
- **Ergebnis:** Ich sehe, in welchen Monaten welche Kategorie auffällt.
- **Abnahmekriterien:**
  - Die Summe je Kategorie entspricht der Kategorieübersicht für das ganze Jahr.
  - Erstattungen sind gegen ihre Kategorie gerechnet; Kapitalerträge stehen als Merkzeile, nie als Einkommen.
  - Randfall: Ein Jahr ohne Buchungen zeigt leere Zellen statt 0-Balken; das laufende Jahr enthält nur vorhandene Monate.
- **Status:** live · **Verweis:** 1.5

### RP-07b – Kategorieübersicht
- **Story:** Als Nutzer möchte ich jede Kategorie mit Verlauf, Summe und Änderung sehen, damit ich weiß, welche Kategorie wächst und wo ich nachsteuere.
- **Ausgangslage:** Buchungen mit Kategorien im Zeitraum.
- **Ablauf:**
  1. Reports › Kategorieübersicht, „Zeitraum“ wählen.
  2. In der Liste Verlaufslinie, Summe, Durchschnitt, Änderung zur Vorperiode und Anteil am Konsum lesen.
  3. Eine Zeile öffnen: Ist/Plan-Verlauf, „Höchster Monat“ und „Empfänger“.
  4. Über „Kategorien vergleichen“ den Kategorietrend wählen (mindestens eine Kategorie).
- **Ergebnis:** Ich erkenne Trends je Kategorie und die größten Empfänger.
- **Abnahmekriterien:**
  - Die Summe je Kategorie stimmt mit Ausgabenanalyse und Explorer für denselben Zeitraum überein.
  - Plan entspricht dem zugewiesenen Betrag.
  - Randfall: Ohne ausgewählte Kategorie steht „Wähle mindestens eine Kategorie für den Verlauf.“; Zukunft-Kategorien sind gekennzeichnet.
- **Status:** live · **Verweis:** 1.6

### RP-08 – Sparquote und Geldalter
- **Story:** Als Nutzer möchte ich Sparquote und Geldalter im Verlauf sehen, damit ich weiß, ob ich das Sparziel halte und ob das Geld, das ich ausgebe, schon lange vor mir liegt.
- **Ausgangslage:** Mehrere abgeschlossene Monate.
- **Ablauf:**
  1. Reports › Sparquote und Geldalter, „Zeitraum“ wählen.
  2. „Maßkette Sparquote“ und Verlauf gegen das Ziel aus Regel R01 lesen (monatlich und rollierend 12 Monate).
  3. „Geldalter“ gegen das Ziel aus Regel R03 lesen; „So wird das Geldalter berechnet“ öffnen.
  4. „Je Jahr“ zeigt die Jahrestabelle.
- **Ergebnis:** Ich sehe, ob ich Sparquote und Puffer halte.
- **Abnahmekriterien:**
  - Die Sparquote nutzt nur Haushaltseinkommen (ohne Kapitalerträge und Erstattungen) und entspricht dem Wert in Heute und im Finanz-Check.
  - Das Geldalter folgt FIFO nach R03 und ist je Monatsende gerechnet.
  - Randfall: Ein laufender Monat bekommt keine Quote; bei zu wenigen Monaten fehlt die rollierende Linie.
- **Status:** live · **Verweis:** 1.7

### RP-09 – Gesamttabelle
- **Story:** Als Nutzer möchte ich alle Monate seit Beginn in einer Tabelle mit Nettovermögen und CSV haben, damit ich Zahlen außerhalb der App weiterverwenden und prüfen kann.
- **Ausgangslage:** Aufzeichnungen seit 01.10.2023.
- **Ablauf:**
  1. Reports › Gesamttabelle öffnen.
  2. „Detailtiefe“ wählen und in der Tabelle seitlich in die Vergangenheit scrollen.
  3. Nettovermögen am Monatsende ablesen.
  4. „CSV“ klicken.
- **Ergebnis:** Eine Datei mit der Monatsübersicht.
- **Abnahmekriterien:**
  - Die CSV enthält genau die angezeigten Zeilen und Spalten.
  - Nettovermögen je Monatsende stimmt mit Vermögen › Nettovermögen überein.
  - Randfall: Am Handy bleibt die Tabelle scrollbar; das laufende Monat ist enthalten und als solches erkennbar.
- **Status:** live · **Verweis:** 1.8

### RP-10 – Projekte und Nebeneinkünfte
- **Story:** Als Nutzer möchte ich Gewinn und Verlust je Nebenprojekt sehen, damit ich entscheide, ob sich ein Projekt lohnt.
- **Ausgangslage:** Projekte sind unter Einstellungen › Projekte angelegt und Buchungsteile zugeordnet.
- **Ablauf:**
  1. Reports › Projekte und Nebeneinkünfte, „Zeitraum“ wählen (nur geschlossene Monate).
  2. „Projektergebnis“ und „Ergebnis je Projekt“ lesen: Einnahmen, Kosten, Differenz zur Vorperiode.
  3. „Projektverläufe und zugeordnete Buchungen“ öffnen, um die Quellbuchungen zu sehen.
  4. „Nebeneinkünfte im Haushalt“ und „Einnahmen nach Art öffnen“ für Nebeneinkünfte als eigene Einkommensart.
- **Ergebnis:** Ich kenne das Ergebnis je Projekt.
- **Abnahmekriterien:**
  - Einnahmen minus Kosten je Projekt ergibt das Ergebnis; die Summe der Quellbuchungen stimmt.
  - Nebeneinkünfte stimmen mit der Einkommensart in Einnahmen überein.
  - Randfall: „Keine geschlossenen Monate im gewählten Zeitraum.“; Erstattungen mindern die Kosten mit Vorzeichen.
- **Status:** live · **Verweis:** 1.9
  Fehlt noch: Projektstunden und Stundensätze.

### RP-11a – Prognosegenauigkeit
- **Story:** Als Nutzer möchte ich sehen, wie treffsicher die Hochrechnung am 15. war, damit ich der Prognose im laufenden Monat vertraue oder meine Planung anpasse.
- **Ausgangslage:** Die App hält jeweils am 15. den Stand fest; mindestens ein abgeschlossener Monat.
- **Ablauf:**
  1. Reports › Prognosegenauigkeit, „Monat“ wählen.
  2. „Trefferquote“ und „Prognose am 15. vs. Ist am Monatsende“ ansehen (Prognose, Ist, Abweichung € und %, Treffer).
  3. „größte Abweichungen zuerst“ je Kategorie lesen.
- **Ergebnis:** Ich sehe, welche Kategorien sich schlecht prognostizieren lassen.
- **Abnahmekriterien:**
  - Das Ist am Monatsende entspricht dem Konsum im One-Pager des Monats.
  - Die Abweichung ist Ist minus Prognose, in Cent exakt.
  - Randfall: Monate ohne festgehaltenen Stand am 15. sind als nicht bewertet markiert, nicht als Treffer.
- **Status:** live · **Verweis:** 1.11

### RP-11b – Budgettreue mit 50/30/20
- **Story:** Als Nutzer möchte ich Plan gegen Ist je Kategorie und die 50/30/20-Verteilung sehen, damit ich weiß, wo ich den Plan überschreite und ob die Verteilung zu meinen Zielen passt.
- **Ausgangslage:** Zugewiesenes Geld (Plan) und Ausgaben im Monat.
- **Ablauf:**
  1. Reports › Budgettreue, „Monat“ wählen.
  2. „Maßkette Plan gegen Ist“ und „Kategorien im Detail“ lesen (Gruppen aufklappbar); „Kategorien über Plan“ zählt die Überschreitungen.
  3. „50/30/20 je Monat“ (zugewiesenes Geld, Zwölftel) und „Planabweichung, rollierend 12 Monate“ (Ziel ± 10 %) ansehen.
  4. In der Tabelle „Einordnung“ je Kategorie lesen.
- **Ergebnis:** Ich sehe Überschreitungen und die Verteilung.
- **Abnahmekriterien:**
  - Plan je Kategorie entspricht dem zugewiesenen Betrag in Plan › Monat; Ist dem Netto-Konsum in der Ausgabenanalyse.
  - 50/30/20 nutzt nur Haushaltseinkommen (ohne Kapitalerträge und Erstattungen) und deckt sich mit R01 in Heute.
  - Randfall: Im laufenden Monat zählt nur bis heute; Monate ohne Plan sind leer markiert.
- **Status:** live · **Verweis:** 2.2

### RP-12a – Ausgabenanalyse
- **Story:** Als Nutzer möchte ich sehen, wofür ich Geld ausgebe und was sich gegenüber dem Vorzeitraum geändert hat, damit ich gezielt dort spare, wo es am meisten wirkt.
- **Ausgangslage:** Ausgaben in Bedarf und Wunsch im Zeitraum.
- **Ablauf:**
  1. Reports › Ausgabenanalyse, „Zeitraum“ wählen.
  2. „Konsum nach Gruppe“ mit Vergleich zum Vorzeitraum lesen.
  3. „Größte Veränderungen“ ansehen; eine Kategorie öffnet ihre Buchungen.
  4. „Klassen und Zukunft“ und die 12-Monats-Heatmap prüfen.
- **Ergebnis:** Ich kenne die größten Treiber der Ausgaben.
- **Abnahmekriterien:**
  - Die Summe der Gruppen entspricht der „Maßkette Konsum“ und der Kategorieübersicht im selben Zeitraum.
  - Erstattungen sind gegen ihre Kategorie gerechnet; Zukunft steht getrennt und ist kein Konsum.
  - Randfall: Für „Alles“ gibt es keinen gleich langen Vorzeitraum („Kein gleich langer Vorzeitraum verfügbar.“); ohne Monatsdaten „Noch keine Monatsdaten“.
- **Status:** live · **Verweis:** 2.1

### RP-12b – Empfänger-Analyse
- **Story:** Als Nutzer möchte ich sehen, bei wem ich das meiste Geld lasse und wie oft ich dort zahle, damit ich Gewohnheiten und Verträge mit Händlern prüfe.
- **Ausgangslage:** Buchungen mit Empfängern in Bedarf und Wunsch.
- **Ablauf:**
  1. Reports › Empfänger-Analyse, „Zeitraum“ wählen.
  2. „Empfänger nach Nettoausgaben“ (Balken) und „Häufigste Empfänger“ (Anzahl, durchschnittlicher Betrag) lesen.
  3. „Alle Empfänger“: Empfänger öffnen, um Kategorien und Buchungen zu sehen.
- **Ergebnis:** Ich kenne Summe und Häufigkeit je Empfänger.
- **Abnahmekriterien:**
  - Die Summe der Empfänger entspricht dem Netto-Konsum der Ausgabenanalyse im selben Zeitraum.
  - Die Anzahl entspricht den Buchungen im Explorer mit Zeilen „Empfänger“.
  - Randfall: Ausgaben ohne Kategorie und Überweisungen sind bewusst nicht enthalten (Hinweis im Bericht).
- **Status:** live · **Verweis:** 2.5

### RP-13a – Verträge und Kosten
- **Story:** Als Nutzer möchte ich meine Verträge und Abos mit Preis und Preisverlauf sehen, damit ich Preiserhöhungen bemerke und überlege, was ich kündigen kann.
- **Ausgangslage:** Wiederkehrende Zahlungen sind unter Plan › Zahlungen gepflegt und mit Buchungen verknüpft.
- **Ablauf:**
  1. Reports › Verträge und Kosten öffnen.
  2. „Gebunden je Monat“ (Fixkosten plus periodische Zahlungen geteilt durch 12) mit „Monatsbindung und Preisverlauf“ lesen.
  3. „Preis prüfen“ nennt erhöhte Preise; „Alle Verträge und Abos“ zeigt „Letzte Preisänderung“.
  4. „Fremdwährung“ zeigt Verträge in anderer Währung; „Wiederkehrende Zahlungen pflegen“ führt zu Plan › Zahlungen.
- **Ergebnis:** Ich weiß, was mich bindet und was teurer geworden ist.
- **Abnahmekriterien:**
  - Die Monatsbindung entspricht der Summe der Beträge in Plan › Zahlungen (geteilt durch Intervall).
  - Preise stammen aus verknüpften Buchungen und sind als abgeleitet markiert.
  - Randfall: Ohne Verträge „Noch keine Verträge“; Zahlungen mit Enddatum zählen nicht zur Bindung; Kündigungsfristen gibt es nicht (nicht im Datenmodell).
- **Status:** live · **Verweis:** 2.3

### RP-13b – Persönliche Inflation
- **Story:** Als Nutzer möchte ich meine persönliche Inflation gegen den Verbraucherpreisindex sehen, damit ich weiß, ob meine Kosten schneller steigen als die allgemeine Teuerung und woran es liegt.
- **Ausgangslage:** Warenkorb ist unter Einstellungen › Warenkorb eingerichtet; Buchungen seit Oktober 2023.
- **Ablauf:**
  1. Reports › Persönliche Inflation öffnen.
  2. Indexlinie (Oktober 2023 = 100) gegen VPI lesen; Wirkung je Vertrag und Beiträge ansehen.
  3. „Kategorie-Explorer“: „Kategorien auswählen“ und je Kategorie Eigener Index, Differenz seit Basis, Mengeneffekt und Anteil an der Ausgabendifferenz zum VPI lesen.
  4. Annahmen im Warenkorb anpassen (Einstellungen › Warenkorb).
- **Ergebnis:** Ich sehe Abstand zum VPI in Prozentpunkten und die Treiber.
- **Abnahmekriterien:**
  - Die Gewichte stammen aus dem Warenkorb und ergeben 100 %.
  - Der Gesamtindex ist mit einem Gesamt-VPI-Ersatz markiert, wenn Warenkorbpositionen fehlen.
  - Randfall: Eine Kategorie ohne VPI-Zuordnung fällt auf den Gesamt-VPI zurück; Variable Buchungen mit wechselndem Mix tragen einen Hinweis.
- **Status:** live · **Verweis:** 2.4

### RP-14 – Bank- und Zinskosten
- **Story:** Als Nutzer möchte ich sehen, was mich das Geld selbst kostet (Zinsen, Gebühren, Dispo), damit ich einen teuren Kredit, ein teures Konto oder Depot ablöse.
- **Ausgangslage:** Mindestens ein geschlossener Monat; Kredite haben gepflegte Konditionen.
- **Ablauf:**
  1. Reports › Bank- und Zinskosten öffnen.
  2. „Kosten nach Art“ und „Maßkette erfasste Bank- und Zinskosten“ lesen (Kreditzinsen, Bank- und Kartengebühren, Handelsgebühren, Fremdwährung, Überziehung).
  3. „Haben- und Dividenden-Erträge“ separat ansehen; „Kredit- und Dispolinien · Originalwährungen“ prüfen.
  4. „Quellen und Abgrenzung“ öffnen.
- **Ergebnis:** Ich kenne die größte Kostenquelle und die Jahressummen.
- **Abnahmekriterien:**
  - Die Summe nach Art entspricht der Maßkette; Tilgung zählt nicht als Kosten.
  - Zinskosten decken sich mit Kosten im Report Kosten, Steuern, Erträge für Wertpapierkosten.
  - Randfall: Ohne gebuchte Zinsen dienen gespeicherte Kreditkonditionen als markierte Schätzung; Spreads und TER ohne Daten sind nicht enthalten.
- **Status:** live · **Verweis:** 2.6

### RP-15a – Liquiditätsprognose
- **Story:** Als Nutzer möchte ich sehen, ob das Geld auf den Budget-Konten bis zu 12 Monate reicht, auch mit geplanten Ereignissen, damit ich rechtzeitig umschichte oder Zahlungen verschiebe.
- **Ausgangslage:** Wiederkehrende Zahlungen und Sparpläne sind gepflegt; geplante Ereignisse optional.
- **Ablauf:**
  1. Plan › Prognose öffnen (der Bericht liegt im Bereich Plan).
  2. „Prognosezeitraum“ wählen (90 Tage, 6 oder 12 Monate); die Linie mit Band zeigt „Budget-Konten“.
  3. Unter „Werkzeuge“ Einkommenspausen, Ereignisse, Stellschrauben und Buchungen streichen testen; „Ohne Ereignisse“ zeigt den Vergleich.
  4. „Nächste Buchungsereignisse“ prüfen; „Einzelkontovorschau“ je Konto öffnen.
- **Ergebnis:** Ich sehe den tiefsten Punkt und das Urteil für die nächsten 6 Monate.
- **Abnahmekriterien:**
  - Der Startsaldo entspricht der Summe der Budget-Konten in Konten › Übersicht.
  - Ein Ereignis (hinzufügen, abschalten, entfernen) ändert die Linie sofort und ist rückgängig machbar.
  - Der 10-%-Puffer ist als Band sichtbar.
  - Randfall: Ohne größere Buchungen „Im Prognosezeitraum stehen keine größeren Buchungen an.“
- **Status:** live · **Verweis:** 3.1

### RP-15b – Cashflow-Verlauf
- **Story:** Als Nutzer möchte ich sehen, ob ich mehr verdiene als ich ausgebe, damit ich weiß, ob der Haushalt wirklich Überschuss erzeugt.
- **Ausgangslage:** Mindestens ein abgeschlossener Monat.
- **Ablauf:**
  1. Reports › Cashflow-Verlauf, „Zeitraum“ wählen.
  2. „Maßkette Nettocashflow“ lesen: Haushaltseinkommen minus Bedarf und Wunsch, Zukunft als Teil.
  3. Tabelle „Je Monat“ ansehen; Kapitalerträge (separat) sind eine eigene Serie.
- **Ergebnis:** Ich kenne den Nettocashflow je Monat.
- **Abnahmekriterien:**
  - Der Nettocashflow entspricht Einnahmen minus Ausgaben in Einnahmen und Cashflow.
  - Umbuchungen, Erstattungen und Kontaktrückzahlungen zählen nie als Einnahmen; Kapitalerträge stehen nicht im Netto.
  - Randfall: Ein laufender Monat ist als unvollständig gekennzeichnet; leere Monate bleiben Lücken.
- **Status:** live · **Verweis:** 3.2

### RP-15c – Jahresvorschau Zahlungen
- **Story:** Als Nutzer möchte ich die Zahlungen der nächsten 12 Monate im Kalender sehen, damit ich große Fälligkeiten (Versicherung, Steuern) vorab abdecke.
- **Ausgangslage:** Wiederkehrende Zahlungen, Sparpläne und künftige Umbuchungen sind gepflegt.
- **Ablauf:**
  1. Reports › Jahresvorschau Zahlungen öffnen.
  2. „Jahreskalender Zahlungen“ und „Zahlungskalender“ lesen; „Maßkette Jahresvorschau“ zeigt die EUR-Summe.
  3. „Fälligkeiten und Verknüpfungen“ prüfen (Fällig, Vertrag, Status/Buchung).
  4. „Wiederkehrende Zahlungen öffnen“ führt zur Pflege.
- **Ergebnis:** Ich weiß, wann welcher Betrag fällig wird.
- **Abnahmekriterien:**
  - Die Summe der Monate entspricht den erwarteten Abgängen in Plan › Zahlungen plus Sparplanausführungen.
  - Eine Zahlung wird nicht doppelt gezählt, wenn Umbuchung und Zeitplan dasselbe Ereignis sind.
  - Randfall: Nicht verknüpfte erwartete Zahlungen bleiben getrennt und werden nicht geraten; ein „Abrechnungsausgleich“ zeigt Einzugstermin und Betrag.
- **Status:** live · **Verweis:** 3.4

### RP-16a – Vermögensverläufe
- **Story:** Als Nutzer möchte ich sehen, woraus das Vermögen über die Zeit besteht, damit ich erkenne, wie sich die Mischung aus Konten, Anlagen und Schulden verschiebt.
- **Ausgangslage:** Konten mit Salden seit Aufzeichnungsbeginn.
- **Ablauf:**
  1. Reports › Vermögensverläufe, „Zeitraum“ wählen.
  2. Gestapelte Flächen nach Kontotyp, Schulden als gestrichelte Linie; „Maßkette Nettovermögen im Zeitraum“ lesen.
  3. Tabelle „Struktur“ (Kontotyp, Veränderung, Anteil heute) ansehen.
- **Ergebnis:** Ich sehe die Struktur und ihre Veränderung.
- **Abnahmekriterien:**
  - Der Verlauf stimmt mit Vermögen › Nettovermögen überein (gleiche Serie und Maßkette).
  - Wertpapiere sind mit den Positionen in Vermögen › Portfolio abgestimmt.
  - Randfall: „Noch keine Konten. Lege unter Konten ein Konto an.“; bei geschätzten Kursen „≈“.
- **Status:** live · **Verweis:** 3.3

### RP-16b – Sparziele-Fortschritt
- **Story:** Als Nutzer möchte ich sehen, ob die Sparziele im Plan liegen, damit ich Rate oder Termin rechtzeitig anpasse.
- **Ausgangslage:** Sparziele unter Plan › Ziele angelegt; für Tagesgeld ist die Zuordnung zu Zielen erfasst.
- **Ablauf:**
  1. Reports › Sparziele-Fortschritt, „Monat“ wählen (Sparziele · Monat).
  2. Fortschrittsbalken mit Soll-Marke lesen; „Tagesgeld-Zuordnung · bis heute“ ansehen.
  3. „Zielstände und Quellen“ prüfen.
- **Ergebnis:** Ich sehe Stand je Ziel und Notgroschen in Monaten.
- **Abnahmekriterien:**
  - Der Zielstand entspricht Plan › Ziele für denselben Monat.
  - Die Reserve in Monaten entspricht geschlossenem Bedarf laut Finanz-Check.
  - Randfall: Fremdwährungsreserven sind ausdrücklich unvollständig markiert; Konten ohne Zielzuordnung zählen nicht zu einem Ziel.
- **Status:** live · **Verweis:** 3.5
  Fehlt noch: Zuordnung geteilter Konten und Kategorien zu Zielen (keine Quelle).

### RP-16c – Vermögen und Schulden
- **Story:** Als Nutzer möchte ich Vermögenswerte und Schulden je Monatsende mit dem Saldo sehen, damit ich weiß, ob ich netto schuldenfrei werde.
- **Ausgangslage:** Konten mit Salden, Kredite/Karten mit negativem Stand.
- **Ablauf:**
  1. Reports › Vermögen & Schulden, „Zeitraum“ wählen (Standard Alles).
  2. Kopfzahlen Nettovermögen, Vermögenswerte, Schulden und Veränderung lesen; Balken je Monatsende, Linie Nettovermögen.
  3. Mit `?monat=` bzw. einem Monat „Monatsenden“ die Konten dieses Monats öffnen.
  4. „Schulden nach Konto“ vergleichen.
- **Ergebnis:** Ich kenne Vermögen, Schulden und Veränderung je Monat.
- **Abnahmekriterien:**
  - Endwert und Anfangswert entsprechen Vermögen › Nettovermögen.
  - Ein Konto zählt als Vermögen, solange es positiv ist, und als Schuld, solange es negativ ist.
  - Randfall: Monate mit geschätzten Kursen tragen „≈“; die Monatstabelle ist die lesbare Alternative am Handy.
- **Status:** live · **Verweis:** 3.6

### RP-17a – Depots im Vergleich
- **Story:** Als Nutzer möchte ich meine Depots nebeneinander vergleichen, damit ich erkenne, welcher Broker oder welches Konto am besten läuft.
- **Ausgangslage:** Mindestens zwei Anlagekonten (Depot, Krypto, P2P oder manuell) mit Wert.
- **Ablauf:**
  1. Reports › Depots im Vergleich, „Zeitraum“ wählen.
  2. Karten je Depot und die Tabelle „Kennzahlen nebeneinander“ lesen.
  3. Benchmarks (aus Einstellungen) sind gestrichelt eingeblendet.
  4. „Depot-Rechnungen, Benchmarks und Kennzahlen“ öffnen.
- **Ergebnis:** Ich sehe Rendite und Wert je Depot gegen den Index.
- **Abnahmekriterien:**
  - Die Summe der Depotwerte entspricht dem Anlageanteil im Nettovermögen.
  - Ein geschlossenes Depot ohne Wert und Flüsse im Zeitraum ist ausgeblendet.
  - Randfall: P2P und manuelle Werte haben Flüsse, aber keine Produktliste.
- **Status:** live · **Verweis:** 4.1

### RP-17b – Einzahlungen und Wert
- **Story:** Als Nutzer möchte ich sehen, was ich eingezahlt habe und was es heute wert ist, damit ich Eigenleistung und Wertzuwachs trennen kann.
- **Ausgangslage:** Wertpapierbestand mit Kursen; Einzahlungen als Handel erfasst.
- **Ablauf:**
  1. Reports › Einzahlungen und Wert, „Zeitraum“ wählen.
  2. „Maßkette Einzahlungen und Wert“ und Diagramm (Stufenlinie gegen Wertlinie) lesen; „Wert am Ende des Zeitraums“.
  3. „Je Monat im Zeitraum“ und „Je Kalenderjahr im Zeitraum“ (Anfang, Nettozuflüsse/Entnahmen, Wertänderung, Ende) ansehen.
- **Ergebnis:** Ich sehe Zufluss und Wertänderung je Monat.
- **Abnahmekriterien:**
  - Anfang plus Nettozuflüsse plus Wertänderung ergibt das Ende (Monatsabstimmung).
  - Der Wert entspricht dem Wertpapierwert (ohne Depot-Bargeld) in Vermögen › Portfolio.
  - Randfall: „Wertpapierbewertung nicht verfügbar.“ bei fehlenden Kursen; Depotkassa und Sparplan-Zuordnung sind nicht enthalten.
- **Status:** live · **Verweis:** 4.3

### RP-18a – Portfolio-Auswertung (Allocation)
- **Story:** Als Nutzer möchte ich sehen, woraus das Portfolio besteht und wie weit es vom Soll abweicht, damit ich die nächste Einzahlung dorthin lenke, wo es fehlt.
- **Ausgangslage:** Positionen mit Klasse und Region; Sollquoten gesetzt.
- **Ablauf:**
  1. Reports › Portfolio-Auswertung öffnen.
  2. Sonnendiagramm Klasse/Produkt oder Region/Produkt lesen; „Anteile am klassifizierten Marktwert“.
  3. „Soll und Ist über die Zeit“ und die Tabelle „Gruppe › Klasse › Produkt“ (Anteil, Ist, Abweichung) ansehen.
  4. „Positionen außerhalb der Schichten“ und Hinweise zu „Sonstiges“ prüfen.
- **Ergebnis:** Ich sehe die Verteilung und ihre Entwicklung gegen das Soll.
- **Abnahmekriterien:**
  - Die Klassenanteile entsprechen Vermögen › Portfolio › Allokation (100 % des positiven klassifizierten Marktwerts).
  - Bargeld, negative und unklassifizierte Positionen stehen getrennt.
  - Randfall: „Nicht alle Klassen haben ein Soll“; der Verlauf beginnt mit Aufzeichnungsbeginn.
- **Status:** live · **Verweis:** 4.2

### RP-18b – Rendite und Kennzahlen
- **Story:** Als Nutzer möchte ich Rendite, Risiko und Vergleich mit Indizes sehen, damit ich beurteile, ob meine Auswahl den Aufwand wert ist.
- **Ausgangslage:** Wertpapierbestand mit Kursen; Benchmarks gewählt.
- **Ablauf:**
  1. Reports › Rendite und Kennzahlen, „Zeitraum“ wählen.
  2. „Maßkette Portfolioleistung im gewählten Zeitraum“ und Kennzahlen lesen; bis zu vier Benchmarks per Haken einblenden.
  3. „Monatliche Klassenverläufe und Werte“ (Heatmap) und „Realisierte Gewinne“ ansehen.
  4. „Kennzahlen, Zahlungsströme und Bewertungsquellen im Detail“ öffnen.
- **Ergebnis:** Ich sehe Rendite, Schwankung und Abstand zu den Indizes.
- **Abnahmekriterien:**
  - Dieselben Werte wie Vermögen › Portfolio › Kennzahlen für denselben Zeitraum.
  - Die Rendite wird ohne Depotkassa gerechnet; Indizes sind EUR-Kursrenditen.
  - Randfall: „Portfolioauswertung nicht verfügbar.“ bei fehlender Bewertung; keine Lücken werden geglättet.
- **Status:** live · **Verweis:** 4.4
  Fehlt noch: Abnahme gegen Portfolio Performance.

### RP-19 – Kosten, Steuern, Erträge
- **Story:** Als Nutzer möchte ich sehen, was von den Erträgen nach Gebühren und Steuern bleibt, damit ich teure Produkte erkenne und die Nettorendite kenne.
- **Ausgangslage:** Dividenden, Zinsen, Gebühren und Steuern sind erfasst.
- **Ablauf:**
  1. Reports › Kosten, Steuern, Erträge öffnen.
  2. Mit „Darstellung“ zwischen „Gebühren und Steuern“, „Erträge“ und „Kosten im Verlauf“ wechseln.
  3. „Erträge nach Kosten und Steuern, 12 Monate“ lesen: brutto, „Einbehalt laut Broker, wie gebucht“, „Gebühren und TER“, „Netto nach Steuern und Kosten“.
  4. Stückliste je Produkt ansehen; CSV je Währung.
- **Ergebnis:** Ich kenne Nettoertrag und Kosten je Produkt.
- **Abnahmekriterien:**
  - Ertrag minus Steuer minus Gebühren ergibt Netto; die Summe der Produkte stimmt.
  - Steuern erscheinen wie gebucht; es gibt keine zweite Berechnung (illustrative latente KESt ist als Beispiel gekennzeichnet).
  - Randfall: Nicht erfasste Spreads fehlen und sind benannt.
- **Status:** live · **Verweis:** 4.5

### RP-20 – Jahresreport
- **Extension:** Owner decision #1118 extends this report; delivery scope and remaining acceptance are tracked in RP-20a below.
- **Story:** Als Nutzer möchte ich das Jahr auf zwei A4-Seiten drucken, damit ich ein Ablagedokument für Steuer, Überblick und Jahresabschluss habe.
- **Ausgangslage:** Mindestens ein abgeschlossenes Jahr.
- **Ablauf:**
  1. Reports › Jahresreport öffnen, „Jahr“ wählen.
  2. Blatt 1 und 2 lesen: Nettovermögenskette, Einkommen, Konsum, Zukunft, Sparquote, Kapitalerträge, Cashflow je Monat, größte Kategorien, 50/30/20, Finanz-Check, Befunde.
  3. „Drucken“ und „Als PDF speichern“ über den Druckdialog.
- **Ergebnis:** Ein zweiseitiges Jahresblatt.
- **Abnahmekriterien:**
  - Der Druck ergibt genau zwei A4-Seiten.
  - Nettovermögenskette entspricht Vermögen › Nettovermögen; Sparquote entspricht Sparquote und Geldalter.
  - Randfall: Nur volle Monate zählen; ein laufendes Jahr ist als Teiljahr erkennbar; Gehaltserhöhungen und Preisänderungen gibt es noch nicht als Befunde.
- **Status:** live · **Verweis:** 5.1

### RP-20a – Jahreskennzahlen und Vermögenszuwachs (#1118, first slice)
- **Story:** Als Nutzer möchte ich Vermögenszuwachs und die Veränderung meiner bisherigen Jahreskennzahlen sehen, damit ich das Jahr beurteilen kann.
- **Ausgangslage:** Mindestens ein voller Monat im Hauptbuch; Redesign aktiv.
- **Ablauf:**
  1. Reports › Jahresreport öffnen und das Jahr wählen; ein Teiljahr ist mit seinem letzten vollen Monat markiert.
  2. Im Vermögensreport Anfang, Ende und Vermögensänderung in Euro und Prozent lesen; dieselbe Änderung steht neben der Vermögenskette im A4-Druckblatt.
  3. In der Zusammenfassung Einnahmen, Konsum, Gespart und Kapitalerträge gegenüber genau denselben Vorjahresmonaten vergleichen; die Sparquote in Prozentpunkten vergleichen.
  4. Die gewählte Darstellung weiterhin auf zwei A4-Seiten drucken.
- **Abnahmekriterien:**
  - Anfang und Ende stammen unverändert aus dem bestehenden Nettovermögens-Read-Model; Prozentänderung nutzt die gemeinsame Berechnung, auch bei negativem Anfangsvermögen.
  - Anfangsvermögen null: Euroänderung bleibt sichtbar, Prozentänderung ist „nicht ermittelbar“ mit Grund. Fehlende oder geschätzte Bewertungen ergeben keine geschätzte neue Änderungskennzahl.
  - Vorjahreswerte nutzen die gemeinsamen Monatsfiguren und die gemeinsame Sparquote. Fehlende Vorjahresmonate werden nicht auf ein Jahr hochgerechnet; der Vergleich ist dann „nicht ermittelbar“ mit Grund. Ein Vorjahreswert null verhindert nur dessen Prozentänderung.
  - Die Summe der Geldwerte bleibt centgenau; keine Buchung und keine zentrale Finanzkennzahl wird geändert.
- **Status:** implemented locally; PR review and live acceptance pending · **Verweis:** 5.1, #1118
- **Remaining scope:** Investment values/contributions/TTWROR/money-weighted return; trading activity/results/costs/hit rate; household with/without market; investment/cash savings split; prior-year comparisons for wealth and the new investment/trading figures (including relative savings-rate change). Slice 2 context (inflation, benchmark, debt, income sources, spending changes, reserves, goals) remains open. RP-20's existing live status does not imply these additions are live.

### RP-21a – Finanz-Check-Verlauf
- **Story:** Als Nutzer möchte ich sehen, welche Regeln verletzt sind und seit wann, damit ich zuerst die offene Regel der aktuellen Stufe behebe.
- **Ausgangslage:** Regelwerk ist unter Einstellungen › Regelwerk konfiguriert; die App speichert die Ergebnisse zu den Monatsenden.
- **Ablauf:**
  1. Reports › Finanz-Check-Verlauf öffnen.
  2. „Stufen nach Nettovermögen“ und „Regeln der aktuellen Stufe“ lesen; die Statusleiste zeigt 12 Monatsenden plus heute.
  3. In „Regelwerk mit Verlauf“ Schwelle, Status und „seit“-Datum prüfen; offene Aktionen sind verlinkt.
- **Ergebnis:** Ich sehe, welche Regel seit wann offen ist.
- **Abnahmekriterien:**
  - Der Status je Regel entspricht Einstellungen › Regelwerk und Heute für den Stichtag.
  - Das Öffnen des Berichts berechnet die gespeicherten Ergebnisse idempotent neu.
  - Randfall: Ein Tag ohne Daten bleibt „nicht bewertbar“; nur die letzten zwölf Monatsenden sind gespeichert.
- **Status:** live · **Verweis:** 5.2

### RP-21b – Kontakte-Abrechnung
- **Story:** Als Nutzer möchte ich sehen, wer wem wie viel schuldet, damit ich Auslagen zurückfordere und den Überblick über offene Salden habe.
- **Ausgangslage:** Kontakte mit Auslagen oder Rückzahlungen unter Konten › Kontakte.
- **Ablauf:**
  1. Reports › Kontakte-Abrechnung öffnen (fester Gesamtzeitraum, nur EUR).
  2. „Offen“ und „Maßkette Kontakte“ (Forderung minus Guthaben) lesen.
  3. Eine Person öffnen: Kontoblatt mit laufendem Saldo und Quellbuchungen.
- **Ergebnis:** Ich sehe je Person den offenen Saldo.
- **Abnahmekriterien:**
  - Der Saldo je Person entspricht Konten › Kontakte.
  - Vorgemerkte Buchungen sind ausdrücklich eingeschlossen.
  - Randfall: Mischwährung ist nicht verfügbar („Der Report ist nicht verfügbar. Es wird kein Teilsaldo gezeigt.“); Salden fließen nicht ins Nettovermögen.
- **Status:** live · **Verweis:** 5.4

### RP-22 – Explorer
- **Story:** Als Nutzer möchte ich eigene Fragen als Pivot über Buchungen stellen, damit ich Auswertungen bekomme, die kein fester Bericht bietet.
- **Ausgangslage:** Buchungen mit Kategorien; eine konkrete Frage (zum Beispiel Ausgaben je Empfänger je Quartal).
- **Ablauf:**
  1. Reports › Explorer öffnen, „Zeitraum“ wählen.
  2. Unter „Auswertungseinstellungen“ „Zeilen“ (Kategorie, Gruppe, Klasse, Empfänger, Einnahmenart), „Spalten“ (Monat, Quartal, Jahr, keine) und „Kennzahl“ wählen.
  3. Zeilen öffnen, um Buchungen zu sehen; „Darstellung der Auswertung“ wechselt Tabelle und Diagramm.
  4. Mit „Vorlagen“ starten oder die Auswertung unter „Meine Auswertungen“/„Gespeicherte Ansichten“ sichern; „CSV exportieren“.
- **Ergebnis:** Eine eigene Tabelle mit Summe, Durchschnitt und Anzahl.
- **Abnahmekriterien:**
  - Summen entsprechen Kategorieübersicht und Ausgabenanalyse im selben Zeitraum; die Buchungen hinter einer Zeile ergeben deren Summe.
  - Die CSV enthält die sichtbaren Zeilen und Spalten; bei geänderter Auswahl meldet die App den geänderten Stand.
  - Randfall: Ohne Treffer ist die Tabelle leer; gespeicherte Ansichten bleiben beim Neuladen erhalten.
- **Status:** live · **Verweis:** 5.3

### RP-23a – Zeitraumvergleich
- **Story:** Als Nutzer möchte ich zwei Zeiträume vergleichen, damit ich sehe, was sich gegenüber damals geändert hat und welche Kategorie den Unterschied macht.
- **Ausgangslage:** Mindestens zwei vergleichbare Zeiträume mit Buchungen.
- **Ablauf:**
  1. Reports › Zeitraumvergleich, „Vergleich“ (vier Arten) wählen.
  2. „Maßkette Zeitraumvergleich“ lesen: Konsum vorher plus mehr minus weniger gleich jetzt.
  3. „Veränderung je Kategorie“ (Balken um Null) und die Tabelle Vorher/Differenz ansehen.
- **Ergebnis:** Ich sehe Mehr und Weniger je Kategorie.
- **Abnahmekriterien:**
  - „Summe Konsum · alle Kategorien“ stimmt mit der Ausgabenanalyse beider Zeiträume überein.
  - Kapitalerträge stehen getrennt von Einkommen und Sparquote.
  - Randfall: Die Vergleichsart steht nicht in der Adresse; Monate werden paarweise verglichen und fehlende Monate nicht erfunden.
- **Status:** live · **Verweis:** 5.5

### RP-23b – Gesamtübersicht
- **Story:** Als Nutzer möchte ich sehen, was Sparen und Markt zum Vermögen beigetragen haben, damit ich weiß, ob mein Fortschritt von mir oder vom Markt kommt.
- **Ausgangslage:** Nettovermögen seit Beginn; Standardansicht in Überblick.
- **Ablauf:**
  1. Reports › Gesamtübersicht öffnen (erste Ansicht in Überblick), „Zeitraum“ wählen.
  2. „Vom Anfang zum Ende“ lesen: Anfang plus Gespart plus Markt gleich Ende.
  3. „Sparen, Markt und Nettovermögen“ (Monatsbalken) und die Tabelle „Je Monat“ ansehen.
  4. „CSV exportieren“.
- **Ergebnis:** Anteil von Sparen und Markt je Monat.
- **Abnahmekriterien:**
  - Endwert und Eigenanteil stimmen mit Vermögen › Nettovermögen überein.
  - Die CSV entspricht der Monatstabelle.
  - Randfall: „Noch keine Monate in diesem Zeitraum.“; geschätzte Kurse tragen „≈“.
- **Status:** live · **Verweis:** 5.6

### RP-24 – Fachbegriffe erklärt
- **Story:** Als Nutzer möchte ich Fachbegriffe in Reports kurz erklärt bekommen, damit ich Zahlen wie TTWROR, XIRR oder Geldalter richtig lese und nicht falsch entscheide.
- **Ausgangslage:** Ein Bericht verwendet einen Fachbegriff.
- **Ablauf:**
  1. Einen Bericht öffnen und den gepunktet unterstrichenen Begriff antippen oder per Tastatur wählen.
  2. Ein Hinweis mit einem Satz Erklärung öffnet sich; Escape oder Tippen daneben schließt ihn.
- **Ergebnis:** Ich verstehe den Begriff ohne den Bericht zu verlassen.
- **Abnahmekriterien:**
  - Nur Fachbegriffe in Berichten sind unterstrichen, Heute und normale Überschriften nicht.
  - Das Ziel ist per Tastatur und Touch (mindestens 44 px) bedienbar.
  - Randfall: Am Handy deckt der Hinweis die Zahl nicht dauerhaft ab.
- **Status:** live · **Verweis:** E2
