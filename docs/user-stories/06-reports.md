# User-Stories – Reports

Historical references follow `docs/FEATURES.md` (positions 1.1–5.6). The hub retains 16 main reports and the source catalog retains 29 entries after #1156. Plan destinations and the total Explorer template retain their old URLs; Prognosegenauigkeit is retired.

**Shared entry:** Open Reports (`/reports`) and search by report name or question. The redesign groups its 16 main reports into columns; recent active reports remain available. In a report, “Bericht wechseln” opens the shared menu; Alt+Shift+Left/Right still navigates to adjacent reports. Monthly and annual reports offer indented paper presentations, and the monthly report also offers “Finanz-Check-Verlauf”. Period reports retain “Zeitraum-Schnellauswahl” (Dieser Monat, Letzter Monat, 3 Monate, 6 Monate, 12 Monate, Dieses Jahr, Letztes Jahr, Alles, Benutzerdefiniert), “Voriger Zeitraum”/“Nächster Zeitraum” and “Zeitraum wählen”, with the selection in `?zeitraum=`. The remembered period remains available; explicit URL periods take precedence. Monthly reports retain “Monat”, “Vormonat” and “Nächster Monat”; annual reports retain “Jahr”. Dotted terminology opens RP-24 explanations, and “Berechnung und Einordnung” explains the calculation basis. Plan destinations and the total Explorer template are documented below for bookmark compatibility; they have no standalone report entries. The liquidity forecast remains under Plan › Prognose.

**Shared table continuation (#1161):** RP-05b, the retained RP-07a year grid, RP-08 monthly grid and RP-09 full-history grid use the same register table shell as RP-14. Read the named table, scroll within its region (keyboard or phone), and keep the header and nested row hierarchy visible. Acceptance: aligned tabular numbers, register typography/density, unchanged drilldowns, CSV and masked amounts, with print showing the full table. Status: layout foundation implemented for review; each existing grid retains its current row heat/sign policy pending the later report-group slices. RP-07b's separate category-list table and other report tables remain outside this slice.

**Shared table continuation, sign rule (#1161, train 4):** Cashflow per month (RP-05a), Vermögen & Schulden (month ends, accounts, debt comparison) and the monthly Jahresreport/Monatsreport summary tables use the same register shell (sticky header, keyboard-scrollable region, tabular right-aligned figures). One sign rule applies to every table on the shell: no "+" prefix on any amount or percentage; a minus only where the figure really is negative; the direction of a change is named by its column heading. One colour rule is stated in `table-grid.tsx`: spending rows tint "more" red and never green, income and saving rows tint "more" green. Acceptance: unchanged figures from the same domain functions, masked amounts, light/dark, desktop 1440 and phone 390. Status: implemented for review; the remaining bespoke tables (contracts, inflation, payees, payroll, liquidity, portfolio, Explorer, contact) and chart-generated value tables stay for later slices.

**Shared table, third slice (#1161, train 4):** The period comparison table, the liquidity tables (planned events, outlook per month, large movements, next booking events), payroll (months, annual salaries, 14 salaries), projects, savings per year, personal inflation, inflation explorer, contract and plan-deviation tables and the contact ledger now use the same register shell. The sign rule applies to their amounts, percentages and percentage points: no "+", a minus only for negative figures; the inflation sentence names the direction in words ("über"/"unter dem VPI"). Acceptance: unchanged figures, masked amounts, light/dark, desktop 1440 and phone 390, test ids kept. The same rule now applies to the headline deltas of the Monatsreport/Jahresreport summaries, the year comparison, the wealth change and the Vermögen & Schulden headline (a minus only when negative; the label such as "Veränderung" names the direction). Status: implemented for review; Explorer, portfolio (returns keep their sign), the calculation-chain operators and the contract/plan phone lists remain.

**Cell drill-down under the matrix (#1206):** In Reports › Auswertung (all Explorer matrix templates, e.g. “Kategorie im Verlauf”), clicking a month or total cell opens “<Zeile> · <Monat> · Buchungen” directly under the matrix inside the same card, above “Datenbasis und Darstellung”. The panel is scrolled into view and focused; the chosen cell stays marked. It is a register table (shared `ReportTable`) with Datum, Empfänger, Konto, Notiz and Anteil; a split shows its classified share with “Teil von <Gesamtbetrag>”; the date opens the booking. The footer “Summe” equals the cell value, otherwise a visible alert says so. “Buchungen schließen” and Esc close the panel and return focus to the cell. Same sign rule as the other tables (no “+”), amounts masked with the privacy toggle, on phone 390 the table scrolls sideways. Status: implemented for review; screenshot baselines of the Explorer drill-down pending.

**Aufteilungen:** RP-05, RP-07, RP-11, RP-12, RP-13, RP-15, RP-16, RP-17, RP-18, RP-21 und RP-23 sind in a/b(/c) geteilt, weil sie unabhängige Berichte bündeln. Namen folgen dem Katalog der App: RP-05b „Einnahmen und Cashflow“ (früher „Einnahmen und Ausgaben“), RP-11a (retired forecast-accuracy report; redirects to Budgettreue), RP-11b „Budgettreue“, RP-13a „Verträge und Abos“, RP-18a „Portfolio-Auswertung“.

### RP-Header – Compact report header and subreports
- **Portfolio views (#1157):** the portfolio views left the Vermögensreport. “Portfolio-Auswertung” is its own entry in the Portfolio group; old addresses (`/reports/vermoegen-schulden?darstellung=einzahlungen|rendite|kennzahlen|klassen|verteilung`, `/reports/peinzahlungen`, `/reports/prendite`) redirect there with the period intent unchanged. Merging “Einzahlungen und Wert” with “Rendite” into one “Wertentwicklung” report is not done.
- **Statement line (#1155):** every report body renders its statement directly under the header (`ReportFrame`); “Kosten gesamt” now has one (total, portfolio cost ratio) instead of the generic “Keine Bewertung möglich”.
- **Sign rule (#1161):** no “+” prefix in report tables (see `table-format.ts`); applied to the spending comparison, portfolio contributions, depot comparison and allocation tables.
- **Story:** As a user, I want to switch reports through one shared menu and find the figure controls immediately below it.
- **Flow:** Open a report and choose “Bericht wechseln”. Under “Monatsbericht”, choose the indented “Finanz-Check-Verlauf” or monthly A4 sheet; under “Jahresbericht”, choose the annual A4 sheet; under “Einnahmen und Cashflow” the indented “Projekte und Nebeneinkünfte”; under “Ausgaben” the indented “Empfänger”. Month and period intent remain in the URL, and Back restores the previous presentation.
- **Acceptance:** Back link, visible title and menu share one compact row, including at 390 px. Controls and the quiet data basis sit together below it. No “Report N” line or visible report arrows. Monthly/annual paper presentations and finance-check history have no second presentation select. Menu labels, focus, deep links and RP-00's period preference remain usable.
- **Status:** first slice for review (#1150); shared heading and monthly submenu checked with synthetic data on desktop/390 px and WebKit in light/dark. All views of Einnahmen und Cashflow (Einnahmen, Cashflow, Projekte), Ausgaben (Kategorien und Verlauf, Empfänger), Vermögensreport (Vermögensverlauf, Gesamtübersicht), Kosten und Steuern (Kosten gesamt, Bank- und Zinskosten, Erträge, Kosten im Verlauf) and Portfolio-Auswertung (Einzahlungen und Wert, Rendite und Risiko, Kennzahlen, Anlageklassen im Verlauf) are indented menu entries; their in-report view selects are gone (the legacy report keeps its own switches). Explorer templates stay a template choice inside the Explorer. CI and live acceptance remain open.

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
  1. Open Reports › Monatsbericht; choose the indented “A4 Druckblatt · Monat” in the report menu when needed.
  2. Mit „Monat“, „Vormonat“ und „Nächster Monat“ den Monat wählen; bei einem laufenden Monat steht „Monat läuft noch · Beträge bisher“.
  3. „Maßkette des Monats“, 50/30/20 auf zugewiesenem Geld („Zwölftel“), Nettovermögen mit Eigenanteil und Markt, größte Ausgaben, Plan und Finanz-Check-Zellen lesen.
  4. „Drucken“ wählen; „Als PDF speichern“ geht über den Druckdialog (A4 Hochformat).
- **Ergebnis:** Ich habe Ergebnis, Verteilung und Auffälligkeiten des Monats auf einer Seite.
- **Abnahmekriterien:**
  - Einnahmen, Konsum und Gespart stimmen mit Reports Einnahmen und Cashflow und Heute für denselben Monat überein.
  - Der Druck ergibt eine saubere A4-Seite ohne App-Menü.
  - Randfall: Ohne Einnahmen im Monat steht „Ohne Einnahmen im Monat lässt sich keine Verteilung berechnen.“; ohne Ausgaben „In diesem Monat gibt es keine Ausgaben in Bedarf und Wunsch.“
  - Randfall: Kapitalerträge erscheinen nur als Hinweis, nicht in Einnahmen oder Sparquote; für einen laufenden Monat gibt es keine Quote.
- **Status:** report live; shared header and paper-menu entry for review (#1150), live acceptance pending · **Verweis:** 1.1

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

**RP-02 continuation (#1207; connected proof for #1066):** Monthly net includes special
payments in their payout month. The solid series/table column is “Regulär / kombiniert”,
describing whole documents rather than comparable running net. A combined document stays
whole; no split, estimated statutory allocation or split-review task is introduced.
Separate special slips remain hatched in the same month. Telearbeit/Fahrgeld count as pay;
travel expenses stay outside the salary curves. Missing slips remain inspection gaps and
are absent from the recorded-month table. Synthetic browser acceptance covers literal
regular, separate-special, combined-without-wage-read and missing-slip cases, shared frame,
keyboard/touch inspection, privacy and both themes at 1440/390. Read-only inspection retains
captured slips and annual totals unchanged. Full development views remain under RP-03;
owner live acceptance is pending.

### RP-03 – Echte Gehaltsentwicklung
- **Story:** Als Nutzer möchte ich Grundgehalt, Sonderzahlungen und Bonus getrennt und real gegen Inflation sehen, damit ich erkenne, ob ich wirklich mehr verdiene oder nur die Preise gestiegen sind.
- **Ausgangslage:** Mehrere Gehaltszettel liegen vor; jede Lohnart ist einer von fünf Komponenten zugeordnet.
- **Ablauf:**
  1. Reports › Gehaltsreport: Lohnarten einmal den fünf Komponenten zuordnen (Grundgehalt, Sonderzahlungen, variable Bezüge, Sachbezüge, Erstattungen); nicht zugeordnete Lohnarten sind aufgelistet und sperren den betroffenen Monat für Vergleiche.
  2. Leitwert „Grundgehalt brutto pro Monat“ als Stufenlinie mit jeder Erhöhung (Datum, Betrag, Prozent).
  3. Jahresvergleich und Monatsvergleich je Komponente; Monate mit Sonderzahlung oder Bonus sind markiert; Bonus je Jahr mit Anteil am Grundgehalt.
  4. „Real gegen nominal“: Index gegen VPI und persönliche Inflation, kumuliert in Prozent und Euro.
  5. In Reports › Gehaltsreport › Gehaltsentwicklung stehen der letzte belegte Grundgehaltsbetrag mit Monat, Stufen, Jahreswerte, der Vergleich gleicher Kalendermonate, Bonus mit separat zuordenbarer SV und Lohnsteuer sowie Datenlücken und nicht zugeordnete Lohnarten. Preisvergleiche zeigen je Reihe ihren gemeinsamen Ausgangsmonat mit Basis 100, Indexwerte je Monat sowie Preisabstand in Euro und reale Änderung je Jahr. Ohne Monatswahl gilt der aktuelle Monat.
- **Ergebnis:** Ich sehe den echten Zuwachs und Kaufkraftverlust.
- **Abnahmekriterien:**
  - Sachbezüge und Spesen verzerren die Entwicklung nicht; sie stehen getrennt.
  - Fehlende Monate sind Lücken, keine Fortschreibung.
  - Der Inflationsvergleich nutzt VPI und den vorhandenen Warenkorb (Persönliche Inflation).
  - Randfall: Eine Lohnart ohne Zuordnung blockiert nur ihren Monat und wird genannt.
  - Der nominale Datenpfad verwendet gespeicherte Lohnzeilen und Komponenten-Zuordnungen sowie die gemeinsame Rechenlogik. Spätere und gelöschte Gehaltszettel sind ausgeschlossen; Lesen verändert weder Daten noch Buchungen.
- **Status:** Nominale und reale Entwicklung zur Durchsicht implementiert · **Verweis:** #1066
  Offen: Zuordnungsoberfläche und Designabnahme, Vorschau/Bestätigung des expliziten PDF-Neulesens, Ereignismarker und gedruckte Arbeitgeberbeiträge.

### RP-02a – Netto der letzten 24 Monate mit Sonderzahlungen
- **Story:** Als Nutzer möchte ich je Monat das laufende Netto und die Sonderzahlungen getrennt, aber mit korrekter Monatssumme sehen, damit ein Bonusmonat das laufende Gehalt nicht scheinbar einbrechen lässt.
- **Ausgangslage:** Mehrere Gehaltszettel, darunter laufende und Sonderzahlungs-Zettel.
- **Ablauf:**
  1. Reports › Gehaltsreport, Karte „Netto der letzten Monate“ lesen: volle Säule = laufender Zettel, schraffiert = eigener Sonderzahlungs-Zettel desselben Monats; jeder Monat zeigt sein volles Netto.
  2. Tabelle „Laufend · Sonderzahlung · Bonus · Summe“ je Monat lesen.
- **Ergebnis:** Die Monatssumme enthält laufendes Netto und Sonderzahlungen; Steuer wird nicht zwischen den Teilen umverteilt.
- **Abnahmekriterien:**
  - Ein kombinierter Zettel (laufendes Gehalt plus Sonderzahlung) wird nie geteilt: Sonderzahlungen gehören in den Monat der Auszahlung und zählen voll in dessen Brutto, Netto und Summe (Entscheidung 17.11.2026, #1207). Es gibt weder „Aufteilung unklar“ noch eine Prüfen-Aufgabe zum Teilen.
  - Der Verlauf „Brutto und Netto je Monat“ enthält Sonderzahlungen und zählt Telearbeit und Fahrgeld als Gehalt; Jahressummen und Vorjahresvergleich enthalten Sonderzahlungen (Hinweis in der Oberfläche).
  - Telearbeit und Fahrgeld zählen als Gehalt; nur Reisespesen bleiben ausgenommen („ohne Reisespesen“). Die Regel steht an einer Stelle (`wage-label-rules.ts`); gespeicherte Zettel, Jahressummen und Sparquote bleiben unverändert.
  - Beträge folgen dem Datenschutzschalter; kein „+“ vor Beträgen.
- **Status:** in Prüfung · **Verweis:** #1207

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
  2. In the redesign, inspect open expectations first, above the income chart. Expand received and unplanned income when needed; the disclosure remembers its state.
  3. „Einnahmen nach Art und Monat“ (12 Monate gestapelt) und die Tabelle mit Anteil ansehen.
  4. Kapitalerträge („Kapitalerträge, kein Einkommen“) und „Sonstige Einnahmen · Ausgleich Kontakt“ getrennt ablesen.
- **Ergebnis:** Ich erkenne fehlende erwartete Einnahmen und die Verteilung nach Art.
- **Abnahmekriterien:**
  - Die Summe stimmt mit dem Haushaltseinkommen in Einnahmen und Cashflow überein (ohne Kapitalerträge, Erstattungen und Umbuchungen).
  - Eine nicht eingegangene erwartete Zahlung zeigt den Status offen.
  - Randfall: Keine Einnahmen im Zeitraum: „Keine Einnahmen im Zeitraum.“; ohne erwartete Einnahmen: „Für diesen Monat sind keine Einnahmen erwartet.“
  - Randfall: Noch nicht zugeordnete Vorkommen zeigen „nicht zugeordnet“.
- **#1159 first slice criteria:** Pending, missing, overdue, unlinked and deviating expectations remain visible at the top. Received and unplanned entries remain available in a collapsed disclosure. Empty, fully received and unavailable project expectations are distinct. Existing domain amounts, privacy masking and the OFF reader are preserved.
- **#1159 status:** First slice ready for review, not live-accepted. The integrated reader and prior-year comparison continue in RP-05b.
- **Acknowledgment continuation (#1109, P-09a):** In Plan's income detail, “Bereits erhalten” removes an unlinked occurrence from open expectations without displaying a shortfall or reducing the booked monthly result. The retained amount is a “Planwert”; no extra received income is invented. Undo restores the open expectation. Expected totals remain received household income plus genuinely open remainders.
- **Receipt-link continuation (#1109):** Plan additionally offers a one-click explicit link to an unclaimed same-payer EUR receipt in the same month/window, with the same income type and an amount within the existing range/tolerance. Server-side revalidation and grouped Undo preserve the original receipt and received total. A stale proposal leaves the expectation open. The existing report body remains unchanged.
- **Continuation status:** Acknowledgment wording and the bounded receipt-link continuation are ready for review after local verification; broader receipt linking, combined/payslip settlement and contact compensation expectations remain open. The existing report body is unchanged and this continuation is not live-accepted.
- **Status:** live · **Verweis:** 1.3

### RP-05b – Einnahmen und Cashflow
- **Story:** Als Nutzer möchte ich Einnahmen und Ausgaben je Monat mit Ergebnis sehen und die Buchungen hinter jeder Zahl öffnen, damit ich nachvollziehe, was nach den Ausgaben bleibt und warum.
- **Ausgangslage:** Mindestens ein geschlossener Monat mit Buchungen.
- **Ablauf:**
  1. Reports › Einnahmen und Cashflow öffnen, „Zeitraum“ wählen.
  2. Monatstabelle und Diagramm lesen: Einnahmen oben, Ausgaben unten, Cashflow als Linie; Gruppen sind aufklappbar.
  2a. Abschnitt „Cashflow“ lesen: Aussagezeile (Cashflow des Zeitraums, Durchschnitt je Monat, Veränderung gegenüber Vorjahreszeitraum bzw. Vorperiode, wenn Daten vorliegen), Säulen je Monat um die Nulllinie (positiv gefüllt, negativ gestrichelt) mit der kumulierten Linie sowie Tabelle Monat · Einnahmen · Ausgaben · Cashflow · kumuliert.
  3. Eine Zelle anklicken: „Buchungen“ listet die dahinterliegenden Buchungen.
  4. „CSV“ exportiert genau die angezeigten Zeilen und Spalten.
- **Ergebnis:** Ich sehe das Monatsergebnis und kann jede Zahl bis zur Buchung verfolgen.
- **Abnahmekriterien:**
  - Die Summe der Buchungen einer Zelle entspricht dem Zellwert.
  - Cashflow verwendet die Summe der Haushaltseinnahmen abzüglich aller Ausgaben, einschließlich Zukunft. Der frühere Verlauf zog nur Bedarf und Wunsch ab. „Kumuliert“ summiert die Monatswerte. Die alten Cashflow-Adressen öffnen diesen Abschnitt und erhalten den URL-Kontext.
  - Die CSV enthält dieselben Zeilen und Spalten wie die Tabelle.
  - Randfall: Eine Zelle außerhalb des Zeitraums meldet „Diese Zelle ist im Reportzeitraum nicht verfügbar.“; eine leere Zelle „Keine Buchungen in dieser Zelle.“
- **#1159 continuation:** Redesign combines period income by type, monthly expectations, and Cashflow in one report. The development chart plots the matching full prior-year months where recorded. Open expectations come first, with received entries and the same month of the preceding year in separate disclosures. The projects entry remains indented.
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
  1. Reports › Ausgabenanalyse öffnen, „Kategorien und Verlauf“ wählen und „Zeitraum“ einstellen.
  2. In der Liste Verlaufslinie, Summe, Durchschnitt, Änderung zur Vorperiode und Anteil am Konsum lesen.
  3. Eine Zeile öffnen: Ist/Plan-Verlauf, „Höchster Monat“ und „Empfänger“.
  4. Über „Kategorien vergleichen“ den Kategorietrend wählen (mindestens eine Kategorie).
- **Ergebnis:** Ich erkenne Trends je Kategorie und die größten Empfänger.
- **Abnahmekriterien:**
  - Die Summe je Kategorie stimmt mit Ausgabenanalyse und Explorer für denselben Zeitraum überein.
  - Plan entspricht dem zugewiesenen Betrag.
  - Randfall: Ohne ausgewählte Kategorie steht „Wähle mindestens eine Kategorie für den Verlauf.“; Zukunft-Kategorien sind gekennzeichnet.
- **Continuation (#1158, first slice):** The redesign exposes the existing monthly category reader at `/reports/ausgaben?darstellung=kategorien`. Largest absolute changes come first, with category ID as the stable tie-breaker; unavailable comparisons follow available ones. The period and category selection remain in the URL across view changes and reload. The default period matches the spending report (1J); explicit and remembered periods still take precedence. Monthly scope, Zukunft separation and amount privacy remain visible. The existing Explorer and legacy category bookmark remain unchanged.
- **Status:** existing reader live; consolidated category view implemented for review (#1158), CI and owner acceptance pending. **Verweis:** 1.6

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

### RP-09 – Gesamttabelle (Explorer template)
- **Story:** Export the displayed monthly overview, including month-end net worth, for external checks.
- **Flow:** Open Reports > Auswertung, select “Gesamttabelle”, choose detail depth, inspect the horizontally scrollable table and export CSV. The retained “Alle Monate: Nettovermögen und CSV” disclosure provides the existing full table.
- **Acceptance:** No standalone report entry or alias link appears in the hub. `/reports/gesamttabelle` still opens the total Explorer template, preserving explicit period, month, filters and hash. CSV contains exactly its displayed rows and columns; monthly net worth still uses the existing valuation. The running month remains identifiable, mobile tables remain scrollable and privacy masks amounts.
- **Reader lifetime (#1156):** The full-history disclosure starts closed, reads valuation facts only when opened, and closes again after a template switch, source refresh or reload. Stale/error facts never leave an export button or old valuation visible. Privacy masks the table; the deliberate CSV download retains the exact unmasked export, including UTF-8 BOM, CRLF, cent precision and the running-month marker.
- **Status:** implemented for review (#1156); CI and owner acceptance pending. **Verweis:** 1.8

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

### RP-11a – Retired Prognosegenauigkeit
- **Story:** Existing forecast-accuracy bookmarks remain useful after the owner retires this report.
- **Flow:** Open `/reports/planungstreue` or a saved Budgettreue link with `darstellung=planungstreue`; read Budgettreue for the retained month and period.
- **Acceptance:** No report entry, search result, subview selector or forecast-accuracy body remains. The old report address redirects to Budgettreue with month, explicit period and hash intact; reload works. Geldfluss remains an independent report. Stored snapshots, financial calculations and the Heute Pace note remain unchanged.
- **Status:** retirement implemented for review (#1156), per owner decision 2026-11-15; CI and owner acceptance pending. **Verweis:** 1.11

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
  5. „Kategorien und Verlauf“ wählen: Monatsübersicht nach größter Änderung lesen, Kategorien für den Trend auswählen; mit derselben Zeitraumwahl zu Gruppen oder Empfängern zurückkehren.
- **Ergebnis:** Ich kenne die größten Treiber der Ausgaben.
- **Abnahmekriterien:**
  - Die Summe der Gruppen entspricht der „Maßkette Konsum“ und der Kategorieübersicht im selben Zeitraum.
  - Erstattungen sind gegen ihre Kategorie gerechnet; Zukunft steht getrennt und ist kein Konsum.
  - Randfall: Für „Alles“ gibt es keinen gleich langen Vorzeitraum („Kein gleich langer Vorzeitraum verfügbar.“); ohne Monatsdaten „Noch keine Monatsdaten“.
- **Continuation criteria (#1158):** In ON, `vergleich=vorjahr` compares with the same days one year earlier and survives reload and period changes; the default is the equally long previous period. In ON, `darstellung=kategorien` reopens the category reader after reload; selected categories and period survive switching among all three views. Existing group/payee figures and the OFF view set remain unchanged.
- **Status:** existing body live; first consolidation slice implemented for review (#1158). Comparison mode Vorperiode/Vorjahr is delivered (address `vergleich=vorjahr`, same figures, only the comparison window differs; Empfänger is a view of the same report). The comparison section also shows the chain “Vorzeitraum + Mehr − Weniger = Jetzt” (per-category changes of the existing figures; hidden unless it adds up to the cent). Der eigene Vergleich akzeptiert ein Von- und ein Bis-Datum, zählt beide Tage mit und zeigt fehlende Buchungshistorie an. Die alten Kategorien- und Vergleichsadressen führen zur Ausgabenanalyse. **Verweis:** 2.1

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

### RP-13a – Verträge und Abos
- **Story:** Als Nutzer möchte ich meine Verträge und Abos mit Preis und Preisverlauf sehen, damit ich Preiserhöhungen bemerke und überlege, was ich kündigen kann.
- **Ausgangslage:** Wiederkehrende Zahlungen sind unter Plan › Zahlungen gepflegt und mit Buchungen verknüpft.
- **Ablauf:**
  1. Reports › Verträge und Abos öffnen.
  2. „Gebunden je Monat“ (Fixkosten plus periodische Zahlungen geteilt durch 12) mit „Monatsbindung und Preisverlauf“ lesen.
  3. „Preis prüfen“ nennt erhöhte Preise; „Alle Verträge und Abos“ zeigt „Letzte Preisänderung“.
  4. „Fremdwährung“ zeigt Verträge in anderer Währung; „Wiederkehrende Zahlungen pflegen“ führt zu Plan › Zahlungen.
- **Ergebnis:** Ich weiß, was mich bindet und was teurer geworden ist.
- **Abnahmekriterien:**
  - Die Monatsbindung entspricht der Summe der Beträge in Plan › Zahlungen (geteilt durch Intervall).
  - Preise stammen aus verknüpften Buchungen und sind als abgeleitet markiert.
  - Randfall: Ohne Verträge „Noch keine Verträge“; Zahlungen mit Enddatum zählen nicht zur Bindung; Kündigungsfristen gibt es nicht (nicht im Datenmodell).
- **Status:** implementation in review (#1160 navigation slice); owner acceptance pending · **Verweis:** 2.3

- **Navigation acceptance (#1160):** No bank-cost selector remains in contracts. The former `/reports/abos?darstellung=bankkosten` bookmark redirects to `/reports/psteuern?darstellung=bankkosten`, preserving query context and hash.

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
  1. Reports › Portfolio › Kosten und Steuern öffnen; Darstellung „Bank- und Zinskosten“ wählen.
  2. „Kosten nach Art“ und „Maßkette erfasste Bank- und Zinskosten“ lesen (Kreditzinsen, Bank- und Kartengebühren, Handelsgebühren, Fremdwährung, Überziehung).
  3. „Haben- und Dividenden-Erträge“ separat ansehen; „Kredit- und Dispolinien · Originalwährungen“ prüfen.
  4. „Quellen und Abgrenzung“ öffnen.
  5. Read cost types, sources, credit lines and calendar years in the shared register tables; scroll additional columns horizontally on phone or with the keyboard.
- **Ergebnis:** Ich kenne die größte Kostenquelle und die Jahressummen.
- **Abnahmekriterien:**
  - Die Summe nach Art entspricht der Maßkette; Tilgung zählt nicht als Kosten.
  - Zinskosten decken sich mit Kosten im Report Kosten, Steuern, Erträge für Wertpapierkosten.
  - Tables share register density, right-aligned tabular figures and a sticky header within the scroll region; the page itself does not scroll horizontally (1440/390, light/dark).
  - Positive amounts and changes have no plus prefix; negative values retain their minus. Historical costs and changes use neutral ink; higher expenses are never coloured green.
  - “Beträge verbergen” still masks all money, including native currency; source links and legacy report addresses remain available.
  - Randfall: Ohne gebuchte Zinsen dienen gespeicherte Kreditkonditionen als markierte Schätzung; Spreads und TER ohne Daten sind nicht enthalten.
- **Status:** implementation in review (#1160 navigation slice); owner acceptance pending · **Verweis:** 2.6

- **Navigation acceptance (#1160):** Bank costs share the Portfolio report and selector. `/reports/kosten` and former contract bank-cost bookmarks retain the bank reader; source amounts, estimates, privacy, reload and Back remain intact.
- **Total view (#1160):** `darstellung=gesamt` ("Kosten gesamt") shows one annual figure in three blocks: household bank and interest costs (own sum, no portfolio ratio), portfolio costs (trade fees and fees of depot-like accounts, counted once from the bank reader, plus TER share) and taxes withheld by the broker (labelled "einbehalten/erstattet", sign kept, a refund is negative), with a grand total. The cost ratio relates only the portfolio costs (no taxes, no household costs) to the portfolio value; gaps of the bank report (interest periods without EUR rate, trades without exchange rate) are shown as "unvollständig: …". The portfolio reader's own trading fees are not added (they are the bank reader's "Depot- / Transaktionsgebühren"). The selected calendar-year window applies to both readers and the closing portfolio value. All years show their grand total and portfolio-cost ratio, newest first, with partial or incomplete data marked. TER and modelled interest remain labelled as estimates. The hub name is “Verträge und Abos”.

### RP-15a – Liquiditätsprognose
- **Story:** Als Nutzer möchte ich sehen, ob das Geld auf den Budget-Konten bis zu 12 Monate reicht, auch mit geplanten Ereignissen, damit ich rechtzeitig umschichte oder Zahlungen verschiebe.
- **Ausgangslage:** Wiederkehrende Zahlungen und Sparpläne sind gepflegt; geplante Ereignisse optional.
- **Ablauf:**
  1. Open Plan › Prognose. `/reports/liquiditaet` redirects here; this destination no longer appears in Reports.
  2. „Prognosezeitraum“ wählen (90 Tage, 6 oder 12 Monate); die Linie mit Band zeigt „Budget-Konten“.
  3. Unter „Werkzeuge“ Einkommenspausen, Ereignisse, Stellschrauben und Buchungen streichen testen; „Ohne Ereignisse“ zeigt den Vergleich.
  4. „Nächste Buchungsereignisse“ prüfen; „Einzelkontovorschau“ je Konto öffnen.
- **Ergebnis:** Ich sehe den tiefsten Punkt und das Urteil für die nächsten 6 Monate.
- **Abnahmekriterien:**
  - The Reports hub and recents omit this destination; its old URL preserves month, period and hash on redirect and reload.
  - Der Startsaldo entspricht der Summe der Budget-Konten in Konten › Übersicht.
  - Ein Ereignis (hinzufügen, abschalten, entfernen) ändert die Linie sofort und ist rückgängig machbar.
  - Der 10-%-Puffer ist als Band sichtbar.
  - Randfall: Ohne größere Buchungen „Im Prognosezeitraum stehen keine größeren Buchungen an.“
- **Status:** existing Plan flow retained; catalog cleanup implemented for review (#1156), CI and owner acceptance pending · **Verweis:** 3.1

### RP-15b – Cashflow-Verlauf (legacy presentation)
- **Redesign:** The old addresses open the Cashflow section in RP-05b. The legacy reader remains available with the redesign flag off.
- **Story:** Als Nutzer möchte ich sehen, ob ich mehr verdiene als ich ausgebe, damit ich weiß, ob der Haushalt wirklich Überschuss erzeugt.
- **Ausgangslage:** Mindestens ein abgeschlossener Monat.
- **Ablauf:**
  1. Reports › Cashflow-Verlauf, „Zeitraum“ wählen.
  2. „Maßkette Nettocashflow“ lesen: Haushaltseinkommen minus Bedarf und Wunsch, Zukunft als Teil.
  3. Tabelle „Je Monat“ ansehen; Kapitalerträge (separat) sind eine eigene Serie.
- **Ergebnis:** Ich kenne den Nettocashflow je Monat.
- **Abnahmekriterien:**
  - Im bisherigen Verlauf ist der Nettocashflow das Haushaltseinkommen abzüglich Bedarf und Wunsch. Der integrierte Cashflow (RP-05b) zieht alle Ausgaben ab, einschließlich Zukunft.
  - Umbuchungen, Erstattungen und Kontaktrückzahlungen zählen nie als Einnahmen; Kapitalerträge stehen nicht im Netto.
  - Randfall: Ein laufender Monat ist als unvollständig gekennzeichnet; leere Monate bleiben Lücken.
- **Status:** live · **Verweis:** 3.2

### RP-15c – Jahresvorschau Zahlungen
- **Story:** Als Nutzer möchte ich die Zahlungen der nächsten 12 Monate im Kalender sehen, damit ich große Fälligkeiten (Versicherung, Steuern) vorab abdecke.
- **Ausgangslage:** Wiederkehrende Zahlungen, Sparpläne und künftige Umbuchungen sind gepflegt.
- **Ablauf:**
  1. Open Plan › Zahlungen and select the calendar. `/reports/vorschau` redirects here; Jahresvorschau no longer appears in Reports.
  2. „Jahreskalender Zahlungen“ und „Zahlungskalender“ lesen; „Maßkette Jahresvorschau“ zeigt die EUR-Summe.
  3. „Fälligkeiten und Verknüpfungen“ prüfen (Fällig, Vertrag, Status/Buchung).
  4. „Wiederkehrende Zahlungen öffnen“ führt zur Pflege.
- **Ergebnis:** Ich weiß, wann welcher Betrag fällig wird.
- **Abnahmekriterien:**
  - The Reports hub and recents omit this destination; its old URL preserves month, period and hash on redirect and reload.
  - Die Summe der Monate entspricht den erwarteten Abgängen in Plan › Zahlungen plus Sparplanausführungen.
  - Eine Zahlung wird nicht doppelt gezählt, wenn Umbuchung und Zeitplan dasselbe Ereignis sind.
  - Randfall: Nicht verknüpfte erwartete Zahlungen bleiben getrennt und werden nicht geraten; ein „Abrechnungsausgleich“ zeigt Einzugstermin und Betrag.
- **Status:** existing Plan flow retained; catalog cleanup implemented for review (#1156), CI and owner acceptance pending · **Verweis:** 3.4

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
  1. Open Plan › Ziele and select the progress view and month. `/reports/sparziele` redirects here; Sparziele no longer appears in Reports.
  2. Fortschrittsbalken mit Soll-Marke lesen; „Tagesgeld-Zuordnung · bis heute“ ansehen.
  3. „Zielstände und Quellen“ prüfen.
- **Ergebnis:** Ich sehe Stand je Ziel und Notgroschen in Monaten.
- **Abnahmekriterien:**
  - The Reports hub and recents omit this destination; its old URL preserves month, period and hash on redirect and reload.
  - Der Zielstand entspricht Plan › Ziele für denselben Monat.
  - Die Reserve in Monaten entspricht geschlossenem Bedarf laut Finanz-Check.
  - Randfall: Fremdwährungsreserven sind ausdrücklich unvollständig markiert; Konten ohne Zielzuordnung zählen nicht zu einem Ziel.
- **Status:** existing Plan flow retained; catalog cleanup implemented for review (#1156), CI and owner acceptance pending · **Verweis:** 3.5
  Fehlt noch: Zuordnung geteilter Konten und Kategorien zu Zielen (keine Quelle).

### RP-16c – Vermögen und Schulden
- **Story:** Als Nutzer möchte ich Vermögenswerte und Schulden je Monatsende mit dem Saldo sehen, damit ich weiß, ob ich netto schuldenfrei werde.
- **Ausgangslage:** Konten mit Salden, Kredite/Karten mit negativem Stand.
- **Ablauf:**
  1. Reports › Vermögen & Schulden, „Zeitraum“ wählen (Standard Alles).
  2. Kopfzahlen Nettovermögen, Vermögenswerte, Schulden und Veränderung lesen; Balken je Monatsende, Linie Nettovermögen.
  3. Mit `?monat=` bzw. einem Monat „Monatsenden“ die Konten dieses Monats öffnen.
  4. „Schulden nach Konto“ vergleichen. Detailed debt planning and financial freedom open under Vermögen; neither is a separate wealth-report view.
- **Ergebnis:** Ich kenne Vermögen, Schulden und Veränderung je Monat.
- **Abnahmekriterien:**
  - Endwert und Anfangswert entsprechen Vermögen › Nettovermögen.
  - Ein Konto zählt als Vermögen, solange es positiv ist, und als Schuld, solange es negativ ist.
  - Randfall: Monate mit geschätzten Kursen tragen „≈“; die Monatstabelle ist die lesbare Alternative am Handy.
- **Acceptance addition (#1157):** In redesign ON, old `darstellung=schulden` and `darstellung=freiheit` report bookmarks redirect to `/vermoegen/schulden` and `/vermoegen/freiheit`, preserving period, month and fragment through reload. Existing figures, goal edits, privacy and Undo remain unchanged.
- **Status:** existing report live; duplicate-view removal implemented for review, CI and owner acceptance pending (#1157). Wealth-view consolidation and portfolio menu/value-development work remain open. · **Verweis:** 3.6

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

### RP-19 – Kosten und Steuern
- **Story:** Als Nutzer möchte ich sehen, was von den Erträgen nach Gebühren und Steuern bleibt, damit ich teure Produkte erkenne und die Nettorendite kenne.
- **Ausgangslage:** Dividenden, Zinsen, Gebühren und Steuern sind erfasst.
- **Ablauf:**
  1. Reports › Portfolio › Kosten und Steuern öffnen.
  2. Mit „Darstellung“ zwischen „Bank- und Zinskosten“, „Gebühren und Steuern“, „Erträge“ und „Kosten im Verlauf“ wechseln.
  3. „Erträge nach Kosten und Steuern, 12 Monate“ lesen: brutto, „Einbehalt laut Broker, wie gebucht“, „Gebühren und TER“, „Netto nach Steuern und Kosten“.
  4. Stückliste je Produkt ansehen; CSV je Währung.
- **Ergebnis:** Ich kenne Nettoertrag und Kosten je Produkt.
- **Abnahmekriterien:**
  - Ertrag minus Steuer minus Gebühren ergibt Netto; die Summe der Produkte stimmt.
  - Steuern erscheinen wie gebucht; es gibt keine zweite Berechnung (illustrative latente KESt ist als Beispiel gekennzeichnet).
  - Randfall: Nicht erfasste Spreads fehlen und sind benannt.
- **Status:** implementation in review (#1160 navigation slice); owner acceptance pending · **Verweis:** 4.5

- **Navigation acceptance (#1160):** Bank costs share the Portfolio report and selector. `/reports/kosten` and former contract bank-cost bookmarks retain the bank reader; source amounts, estimates, privacy, reload and Back remain intact.
- **Total view (#1160):** `darstellung=gesamt` ("Kosten gesamt") shows one annual figure in three blocks: household bank and interest costs (own sum, no portfolio ratio), portfolio costs (trade fees and fees of depot-like accounts, counted once from the bank reader, plus TER share) and taxes withheld by the broker (labelled "einbehalten/erstattet", sign kept, a refund is negative), with a grand total. The cost ratio relates only the portfolio costs (no taxes, no household costs) to the portfolio value; gaps of the bank report (interest periods without EUR rate, trades without exchange rate) are shown as "unvollständig: …". The portfolio reader's own trading fees are not added (they are the bank reader's "Depot- / Transaktionsgebühren"). The selected calendar-year window applies to both readers and the closing portfolio value. All years show their grand total and portfolio-cost ratio, newest first, with partial or incomplete data marked. TER and modelled interest remain labelled as estimates. The hub name is “Verträge und Abos”.

- **Calendar-year totals (#1160):** In „Kosten gesamt“, select a year or reopen its `jahr` bookmark. Each row shows combined costs and the portfolio cost ratio at the closing valuation, newest first. All sources use the stated date range, and partial years, estimated TER and modelled interest are labelled. The privacy toggle hides the amounts and cost ratio. Other cost-report views retain their rolling periods.

### RP-20 – Jahresreport
- **Extension:** Owner decision #1118 extends this report; delivery scope and remaining acceptance are tracked in RP-20a below.
- **Story:** Als Nutzer möchte ich das Jahr auf zwei A4-Seiten drucken, damit ich ein Ablagedokument für Steuer, Überblick und Jahresabschluss habe.
- **Ausgangslage:** Mindestens ein abgeschlossenes Jahr.
- **Ablauf:**
  1. Open Reports › Jahresreport and select “Jahr”; the indented “A4 Druckblatt · Jahr” is available in the report menu.
  2. Blatt 1 und 2 lesen: Nettovermögenskette, Einkommen, Konsum, Zukunft, Sparquote, Kapitalerträge, Cashflow je Monat, größte Kategorien, 50/30/20, Finanz-Check, Befunde.
     The summary shows starting net worth and the change in euros and percent; the A4 detail shows the change beside the existing net worth chain.
  3. „Drucken“ und „Als PDF speichern“ über den Druckdialog.
- **Ergebnis:** Ein zweiseitiges Jahresblatt.
- **Abnahmekriterien:**
  - Der Druck ergibt genau zwei A4-Seiten.
  - Nettovermögenskette entspricht Vermögen › Nettovermögen; Sparquote entspricht Sparquote und Geldalter.
  - Wealth change is end minus start from the same net worth series, with exact cents and the shared ratio calculation. With starting net worth ≤ 0, the euro change remains available and the percentage says “nicht ermittelbar” with its reason. Missing valuations retain their specific reason without substituting zero.
  - Amount privacy also hides the wealth-change percentage. Full and partial years still print on two A4 pages.
  - Randfall: Nur volle Monate zählen; ein laufendes Jahr ist als Teiljahr erkennbar; Gehaltserhöhungen und Preisänderungen gibt es noch nicht als Befunde.
- **Status:** existing report live; wealth-change extension (#1118), shared header and paper-menu entry (#1150) implemented, review/live acceptance pending. Investments/trading, with/without market, split savings rate, complete prior-year comparisons and context from #1118 remain open. · **Verweis:** 5.1

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
- **Remaining scope:** (investments, trading, wealth with/without market and split savings rate: see RP-20b) household income/consumption with/without market; prior-year comparisons for the new investment/trading figures (including relative savings-rate change). Slice 2 context (inflation, benchmark, debt, income sources, spending changes, reserves, goals) remains open. RP-20's existing live status does not imply these additions are live.

### RP-20b – Investments, Trading und geteilte Sparquote (#1118, slice 1b)
- **Story:** Als Nutzer möchte ich im Jahresreport sehen, wie sich meine Investments und mein Trading entwickelt haben und wie viel meiner Sparquote in Investments statt auf Bargeldkonten floss, damit ich das Jahr beurteilen kann.
- **Ausgangslage:** Mindestens ein voller Monat im Hauptbuch; Redesign aktiv.
- **Ablauf:**
  1. Reports › Jahresreport öffnen, Jahr wählen, auf Blatt 2 Abschnitt I lesen.
  2. Vermögenszuwachs ohne Markt (eigener Beitrag) und mit Markt nebeneinander vergleichen.
  3. Sparquote gesamt, davon in Investments, davon auf Kontos lesen.
  4. Investments: Wert Anfang/Ende, Netto-Einzahlungen, Marktergebnis, TTWROR, annualisierte XIRR, Erträge; Trading: Käufe/Verkäufe, Sparplan-Käufe, realisierte Gewinne und Verluste, Trefferquote geschlossener Positionen, Gebühren und Steuern.
- **Abnahmekriterien:**
  - Wert, Einzahlungen, Marktergebnis, TTWROR und annualisierte XIRR sind centgenau/identisch mit dem Portfolio-Report für denselben Zeitraum (Test); Erträge, Gebühren und Steuern nutzen die Vermögen-Helfer auf den Trades der enthaltenen Monate; realisierter Gewinn ist die Differenz zweier Stände derselben Funktion wie im Portfolio.
  - Investiert + Bargeld ergeben exakt die Sparquote (Cent und Basispunkte, Test); Bargeld ist der Rest.
  - Ohne Kurse oder Depotdaten steht „nicht ermittelbar“ mit Grund; nichts wird geschätzt. Fehlende Einstandsdaten oder keine geschlossene Position werden an der Trefferquote erklärt.
- **Status:** implemented locally; PR review and live acceptance pending · **Verweis:** 5.1, #1118
- **Slice 2 im Block:** Vergleich mit dem konfigurierten Vergleichswert, Restschuld Anfang/Ende, Einkommen nach Quelle (bestehende Leser). Netto-Einzahlungen sind das Geld, das netto ins Depot floss, keine echte Zerlegung der Sparquote; der Zeitraum „bis letzter voller Monat“ steht im Block. Der Block ist ein Bildschirmabschnitt und wird nicht gedruckt (Blatt 2 hat keinen Platz; ein drittes A4-Blatt wäre Owner-Entscheid).
- **Remaining scope:** Vorjahresvergleich der weiteren Investment-/Trading-Zahlen; Realwerte (Inflation), Zinszahlungen, Sparziele, Rücklage (noch keine gemeinsame Berechnung).

- **Vorjahresvergleich (#1118):** Gewinne, Verluste und Trefferquote vergleichen dieselben Kalendermonate des Vorjahres. Ein vollständiger Verkauf beendet die Position; frühere Teilverkäufe zählen zu ihrem Ergebnis. Die neuen Werte und Differenzen folgen dem Privatsphäre-Schalter.

### RP-21a – Finanz-Check-Verlauf
- **Story:** Als Nutzer möchte ich sehen, welche Regeln verletzt sind und seit wann, damit ich zuerst die offene Regel der aktuellen Stufe behebe.
- **Ausgangslage:** Regelwerk ist unter Einstellungen › Regelwerk konfiguriert; die App speichert die Ergebnisse zu den Monatsenden.
- **Ablauf:**
  1. Open “Bericht wechseln” in a report and choose the indented “Finanz-Check-Verlauf” under “Monatsbericht”. Its direct link remains reachable.
  2. „Stufen nach Nettovermögen“ und „Regeln der aktuellen Stufe“ lesen; die Statusleiste zeigt 12 Monatsenden plus heute.
  3. In „Regelwerk mit Verlauf“ Schwelle, Status und „seit“-Datum prüfen; offene Aktionen sind verlinkt.
- **Ergebnis:** Ich sehe, welche Regel seit wann offen ist.
- **Abnahmekriterien:**
  - Der Status je Regel entspricht Einstellungen › Regelwerk und Heute für den Stichtag.
  - The shared report menu replaces the second presentation select; Back and reopening preserve the selected month context.
  - Das Öffnen des Berichts berechnet die gespeicherten Ergebnisse idempotent neu.
  - Randfall: Ein Tag ohne Daten bleibt „nicht bewertbar“; nur die letzten zwölf Monatsenden sind gespeichert.
- **Status:** report live; compact shared header and menu path for review (#1150), live acceptance pending · **Verweis:** 5.2

### RP-21b – Kontakte-Abrechnung
- **Story:** Als Nutzer möchte ich sehen, wer wem wie viel schuldet, damit ich Auslagen zurückfordere und den Überblick über offene Salden habe.
- **Ausgangslage:** Kontakte mit Auslagen oder Rückzahlungen unter Konten › Kontakte.
- **Ablauf:**
  1. Reports › Kontakte-Abrechnung öffnen (fester Gesamtzeitraum, nur EUR).
  2. „Offen“ und „Maßkette Kontakte“ (Forderung minus Guthaben) lesen.
  3. Eine Person öffnen: zuerst offene Forderungen mit Datum, Empfänger, Betrag und Offen (rechts), danach der Saldoverlauf über die gesamte erfasste Zeit.
  4. „Vergangene Buchungen“ bei Bedarf aufklappen und in Seiten zu 20 Bewegungen blättern; die Zusammenfassung nennt Anzahl und Summe der vollständig beglichenen Auslagen. Offene Auslagen bleiben unabhängig vom Monat oben.
  5. Tatsächlich verbleibendes freies Guthaben erscheint in einer Zeile; „Guthaben ändern“ führt zum Kontakt. Automatische Verrechnungsdetails bleiben dort.
- **Ergebnis:** Ich sehe je Person den offenen Saldo.
- **Abnahmekriterien:**
  - Der Saldo je Person entspricht Konten › Kontakte.
  - Vorgemerkte Buchungen sind ausdrücklich eingeschlossen.
  - Randfall: Mischwährung ist nicht verfügbar („Der Report ist nicht verfügbar. Es wird kein Teilsaldo gezeigt.“); Salden fließen nicht ins Nettovermögen.
  - Keine Pluspräfixe in den Zeilen. Forderungen und Guthaben haben ausgeschriebene Richtungen; der Nettosaldo stammt unverändert aus derselben Kontaktabrechnung wie Konten › Kontakte. Die Tabellensumme ist die Bruttoforderung; vorhandenes Guthaben bleibt separat sichtbar.
  - Datenschutz blendet Beträge auch in Summen, Kopiertext und zugänglichen Beschriftungen aus; Desktop 1440 und Telefon 390 in Hell/Dunkel bleiben bedienbar.
  - Plan-Prüfung (#1149, ohne Verhaltensänderung): Neue Kategorie-Einkäufe mit Kontaktanteilen belasten die ursprüngliche Einkaufskategorie brutto bis zur Rückzahlung. Zugeordnete Rückzahlungen fließen in diese Kategorie zurück. Der Anteil wird nicht zusätzlich als eigene Auslagen-Kategorie belastet und nicht zusätzlich im Nettovermögen gezählt. Historische/alleinstehende Auslagen ohne belegte Ursprungskategorie behalten ihre gespeicherte Kategorie. Grundlage: `docs/shared-expenses.md`, `SPEC.md` (#963/#978); keine Neuberechnung oder Datenänderung in diesem Teil.
- **Status:** teilweise · **Verweis:** 5.4, #1149. Erster Teil: offene Tabelle, gesamter Saldoverlauf und geschlossene, paginierte Vergangenheit für den gewählten Kontakt. Zweiter Teil (Redesign): alle Kontakte mit offenem Betrag stehen untereinander mit je einem Kontoblatt (jede Liste lädt ihr eigenes Blatt; ein Link der linken Liste markiert und fokussiert das gewählte Blatt); ausgeglichene Kontakte erscheinen nur nach „Auch ausgeglichene Kontakte“ und eingeklappt unter „Ausgeglichene Kontakte (n)“, ein gewählter ausgeglichener Kontakt klappt sie auf. Offen: vollständige Wiederverwendung des Buchungsregister-Bauteils. Private Abnahme ausständig.

RP-21b continuation (#1149, contacts slice of #1161), superseding the open shared-table
item in the previous status: both open and historical booking
tables now use `ReportTable`, including its sticky header, keyboard/phone scrolling,
register density and right-aligned tabular amounts. Receivables are positive and
repayments negative, without plus prefixes; both use quiet ink. Fully settled contacts
remain exclusively inside the closed “Ausgeglichene Kontakte” history even when
“Auch ausgeglichene Kontakte” is enabled; selecting a historical contact opens it.
The four columns remain Datum, Empfänger, Betrag, Offen (owner correction, no category).
The existing statement, gross claims, separate credit, source dialog, copy and 20-row
history pagination remain authoritative. No booking, allocation or valuation changes.
Status: implemented for review; CI and owner acceptance pending. Other reports in
#1161 remain outside this slice.

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
- **Status:** Im Redesign wählen Leser Vorperiode, Vorjahr oder eigene Tage in der Ausgabenanalyse. Die alte Adresse öffnet den letzten vollen Monat mit Vorjahresvergleich, sofern das Lesezeichen keine Zeitraumwahl enthält. Die oben beschriebenen vier Arten bleiben in der älteren Darstellung verfügbar. **Verweis:** 5.5

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
