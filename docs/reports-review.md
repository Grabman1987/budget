# Reports-Durchsicht (Issue #1151)

Stand: 15.11.2026. Reine Analyse, keine Codeänderung. Keine echten Zahlen oder Namen; alles ist strukturell beschrieben.

## Zusammenfassung

1. Die App kennt 34 Katalogberichte, im Redesign sind sie hinter 16 Hub-Berichten mit bis zu 9 Unteransichten versteckt (Auswahlfeld "Darstellung"); das Berichtsmenü zeigt die Unteransichten nicht, deshalb der zweite Select.
2. Der Berichtskopf besteht aus bis zu sechs Zeilen (Zurück, Titel + Wechsel + Pfeile, "Report N", Steuerelemente, Rechenkette/Ergebnis, Datenbasis, Zusatzsteuerung); "Report N" ist nur die Position im Hub und hat keine Bedeutung.
3. Die Antwort auf die Frage ("so what") steckt in `VerdictLine` im eingeklappten Block "Berechnung und Einordnung"; oben steht nur eine Rechenkette. Das ist die größte inhaltliche Lücke aller Reports.
4. Mehrfach dieselbe Zahl in verschiedener Verpackung: Vermögen (Bilanz, Verlauf, Gesamtübersicht), Ausgaben (Ausgabenanalyse, Kategorien, Vergleich, Explorer), Einnahmen (vier Ansichten); gemeinsame Tabellenkomponente nutzen nur 5 Reports, rund 40 Dateien haben eigene `<table>`.
5. Größte Hebel: Kontakte neu (#1149), ein Kopf (#1150), Jahresreport ausbauen (#1118), Vermögensreport trennen (Vermögen / Portfolio), Aussage-Zeile sichtbar machen.

## Grundlagen und Methode

- Quellen: docs/FEATURES.md, docs/user-stories/06-reports.md, apps/web/src/nav/reports-catalog.ts, reports/report-hub-model.ts, reports/report-frame.tsx, reports/report-navigation.tsx, Seitenkomponenten unter apps/web/src/reports/, Routen und Weiterleitungen in router.tsx. Tests nicht gelesen.
- Die Live-App (Redesign) zeigt 16 Hub-Berichte. Alte Katalogadressen leiten weiter. Dieses Dokument bleibt bei den 34 Katalogeinträgen, weil Stories und FEATURES so zählen, und nennt je Eintrag den Hub, in dem er heute lebt. Dazu zwei Ansichten ohne Katalognummer.
- Daten wurden nicht gegen eine Live-Instanz geprüft. Aussagen zu "leer" oder "immer null" sind Strukturaussagen aus dem Code; wo es von den Daten abhängt, steht "nicht geprüft".
- Eingaben des Eigentümers: Kontakte (#1149), Kopf und Navigation (#1150), Jahresreport (#1118).

## Querschnittsbefunde

- **Kopf (`ReportFrame`):** Zurück-Link, Titel, "Bericht wechseln" als aufklappbarer Block mit Suche, zwei Pfeiltasten, Zeile "Report N", Steuerelemente, Rechenkette mit Ergebnis, "Datenbasis / Stand", Zusatzsteuerung. Auf dem Handy bekommt der Titel eine eigene Zeile (mobile-report-header.css), die Steuerelemente rutschen darunter.
- **Unteransichten:** `ReportViewControl` ist ein zweites Auswahlfeld im Bericht (Einnahmen: 4 Ansichten, Ausgaben: 2, Budgettreue: 2, Verträge: 2, Vermögensreport: 9, Monatsbericht: 3, Kontakte: 2). Das Menü kennt sie nicht.
- **Aussage:** `VerdictLine` liegt im eingeklappten `<details>` "Berechnung und Einordnung". Das Ergebnis oben ist eine Zahl ohne Bewertung.
- **Tabellen:** Gemeinsame Komponenten `RowsGrid`/`TableReportFrame` nutzen nur Einnahmen und Ausgaben (income-expense-report), Kategorieübersicht, Sparquote, Gesamttabelle und die Jahresansicht (year-report). Alle anderen haben eigene `<table>`-Markups; Dichte, Zeilenhöhe und Zahlenausrichtung sind deshalb nicht garantiert gleich.
- **Vorzeichen:** "+" wird an mehreren Stellen vorangestellt (Veränderungen, Planabweichung, Inflation in Punkten, Rechenketten-Operatoren; report-frame.tsx über `signed`). Keine einheitliche Regel "Minus nur wo die Richtung abweicht".
- **Farben:** Design: Grün = Geld ist da, Rot = handeln. Bei Ausgaben ist "mehr" eine schlechte Nachricht, bei Einnahmen eine gute; ob die Zuordnung je Bericht stimmt: nicht geprüft.
- **Handy:** Breite Tabellen scrollen seitlich (`ReportTableScroll`). Vier-Zeilen-Kopf siehe oben. Diagramme und Sankey am Handy: nicht geprüft.
- **Datenschutz:** Beträge werden durchgängig maskiert (`maskMoneyText`/`privateAmount`).

Größen: S = bis ca. 1 Std., M = ca. 1 Tag / ein PR, L = mehrere PRs oder Datenmodell.

## 1 Monat und Einkommen

### 1.1 Monats-One-Pager (Hub "Monatsbericht")
- Frage: Wie lief der Monat, auf einem Blatt?
- Zeigt heute: Maßkette Einnahmen/Konsum/Gespart/Zukunft, 50/30/20 auf zugewiesenem Geld, Nettovermögen (Eigenanteil/Markt), größte Ausgaben, Planabweichung, Finanz-Check-Zellen, Revisionen, A4-Druck; Darstellung: Monatsbericht / Finanz-Check-Verlauf / Druckblatt.
- Ohne Aussage: Im laufenden Monat keine Quote; Revisionstabelle ist ein Prüfprotokoll (nicht geprüft, ob oft leer).
- Fehlt: Vergleich mit Vormonat und Vorjahresmonat; ein Satz "gut/schlecht und warum".
- Überschneidung: Einnahmen/Konsum/Gespart mit Einnahmen und Cashflow; 50/30/20 mit Budgettreue; Finanz-Check mit 5.2; Heute.
- Design: Eigene Tabellen; die Dreifach-Darstellung im Select belegt Platz für Druck, der ein Link sein könnte.
- Urteil: überarbeiten (Vormonat/Vorjahr, Aussage-Zeile; Finanz-Check als eigener Menüpunkt) · M.

### 1.2 Gehaltsreport (Hub "Gehalt")
- Frage: Was bleibt vom Brutto, und hat sich das Gehalt entwickelt?
- Zeigt heute: Brutto, Abzüge, Netto je Monat aus Gehaltszetteln, Auszahlungskontrolle gegen Bankbuchung, Jahresgehälter mit Vorjahr, Historie, Erfassung/Upload.
- Ohne Aussage: Monate ohne Zettel sind Lücken (richtig); Erfassung und Upload gehören zur Pflege, nicht zum Bericht.
- Fehlt: Real gegen Inflation, Grundgehalt getrennt von Sonderzahlung (#1066, #1078 offen).
- Überschneidung: Einkommensart in 1.3; Gehaltsteil im Jahresreport.
- Design: Eigene Rechenkette mit `op`-Vorzeichen, Pflege-Formulare mit Auswertung gemischt.
- Urteil: überarbeiten (Pflege von Auswertung trennen) · M; Gehaltsentwicklung real · L (geplant).

### 1.3 Einnahmen (Hub "Einnahmen und Cashflow", Ansicht "Einnahmen")
- Frage: Woher kommt das Geld, und kam alles Erwartete?
- Zeigt heute: 12 Monate nach Einkommensart gestapelt, Tabelle mit Anteil, "Erwartet gegen eingegangen", Kapitalerträge und Kontaktausgleich getrennt.
- Ohne Aussage: Erwartet-Liste zeigt "nicht zugeordnet" solange Vorkommen nicht materialisiert sind; beglichene Posten verlängern die Liste (nicht geprüft).
- Fehlt: Nur offene Erwartungen oben, Vorjahr.
- Überschneidung: Summe deckt sich mit 1.10; Plan zeigt Erwartetes ebenfalls.
- Design: Gestapelte Säulen und Soll/Ist-Liste mit eigenem Markup.
- Urteil: zusammenlegen mit 1.10 (Erwartet-Liste nur offen) · M.

### 1.4 Geldfluss (Hub "Geldfluss")
- Frage: Wohin fließt das Geld?
- Zeigt heute: Sankey Einnahmen zu Bedarf/Wunsch/Zukunft/Rest, Stückliste mit Betrag und Anteil, eigener Zeitraumschalter (`SPANS`).
- Ohne Aussage: Sankey liest sich bei vielen Kategorien schwer; Stückliste enthält dieselben Zahlen.
- Fehlt: Vorzeitraum; Hinweis, ob die Verteilung zum Ziel (50/30/20) passt.
- Überschneidung: Bedarf/Wunsch/Zukunft in Ausgabenanalyse, Budgettreue, One-Pager.
- Design: Eigener Zeitraumschalter statt gemeinsamer Schnellauswahl; Handy nicht geprüft.
- Urteil: zusammenlegen mit Budgettreue (Ansicht "Verteilung") oder als Bild behalten; Eigentümer entscheidet · S.

### 1.5 Jahresansicht (Hub "Auswertung" = Explorer-Vorlage "Jahr")
- Frage: Wie verteilt sich ein Jahr über die Monate?
- Zeigt heute: Heatmap Kategorie x Monat, Detailtiefe, Maßkette, Vorjahresvergleich, Zelle öffnet Buchungen. Alte Adresse leitet zum Explorer.
- Ohne Aussage: Leere Zeilen für Kategorien ohne Buchungen (nicht geprüft).
- Fehlt: Markierung von Ausreißern statt reiner Farbskala.
- Überschneidung: Explorer; Jahresreport enthält dieselbe Heat-Tabelle.
- Design: Gemeinsame Tabellenkomponente; am Handy seitlich scrollbar.
- Urteil: zusammenlegen (Jahresreport verlinkt statt kopiert) · S.

### 1.6 Kategorieübersicht (Hub "Auswertung" = Explorer-Vorlage "Kategorie")
- Frage: Wie verhält sich jede Kategorie, wo steuere ich nach?
- Zeigt heute: Liste mit Verlaufslinie, Summe, Durchschnitt, Änderung zur Vorperiode, Anteil am Konsum; Zeile öffnet Ist/Plan, Höchstmonat, Empfänger.
- Ohne Aussage: Zeilen mit lauter Nullen (nicht geprüft).
- Fehlt: Sortierung nach Änderung als Standard.
- Überschneidung: Ausgabenanalyse, Explorer, Zeitraumvergleich: vier Berichte, gleiche Summe.
- Design: Gemeinsame Komponente (category-report).
- Urteil: zusammenlegen mit 2.1 · M.

### 1.7 Sparquote und Geldalter (Hub "Sparquote und Geldalter")
- Frage: Wie viel bleibt, und wie alt ist das ausgegebene Geld?
- Zeigt heute: Maßkette, Sparquote monatlich und rollierend 12 Monate gegen Ziel R01, Geldalter (FIFO, R03) gegen Ziel, Tabelle je Jahr.
- Ohne Aussage: Laufender Monat ohne Quote (richtig); zwei unabhängige Kennzahlen ohne gemeinsame Frage.
- Fehlt: Aufteilung in Anlage und Bargeld (#1118).
- Überschneidung: Sparquote auch in One-Pager, Jahresreport, Heute, Finanz-Check.
- Design: Gemeinsame Komponente; Zielmarke als Linie.
- Urteil: behalten, später in zwei Ansichten teilen · S.

### 1.8 Gesamttabelle (Hub "Auswertung" = Explorer-Vorlage "Gesamt")
- Frage: keine klare Frage ("alle Zahlen, alle Monate"); echter Zweck ist der CSV-Export.
- Zeigt heute: Alle Monate seit Beginn als Spalten, Detailtiefe, Nettovermögen am Monatsende, CSV.
- Ohne Aussage: Wächst mit jedem Monat nach rechts; abgeschlossene Frühmonate dominieren.
- Fehlt: -
- Überschneidung: Explorer (Kategorie x Monat) plus Gesamtübersicht.
- Design: Gemeinsame Komponente; Handy nur seitliches Scrollen.
- Urteil: entfernen als eigener Bericht, Explorer-Vorlage + CSV behalten · S.

### 1.9 Projekte und Nebeneinkünfte (Hub "Einnahmen und Cashflow", Ansicht "Projekt-Ergebnisse")
- Frage: Was bringt ein Nebenprojekt unterm Strich?
- Zeigt heute: Einnahmen, Kosten, Ergebnis je Projekt (nur geschlossene Monate), Vorperiode, Projektverläufe mit Quellbuchungen.
- Ohne Aussage: Ohne angelegte Projekte leer (nicht geprüft, ob ausgeblendet).
- Fehlt: Stunden und Stundensatz.
- Überschneidung: Einkommensart "Nebeneinkünfte" in 1.3.
- Design: Eigene Tabelle; Projektfilter als drittes Auswahlfeld im Kopf.
- Urteil: behalten, im Menü eingerückt unter "Einnahmen und Ausgaben" · S.

### 1.10 Einnahmen und Cashflow (Hub "Einnahmen und Cashflow", Ansichten "Einnahmen und Ausgaben", "Cashflow")
- Frage: Was bleibt nach den Ausgaben?
- Zeigt heute: Monatstabelle Einnahmen oben, Ausgaben unten, Netto als Linie, aufklappbare Gruppen, Zelle öffnet Buchungen, CSV; Ansicht Cashflow mit Maßkette, Kapitalerträge als eigene Serie.
- Ohne Aussage: Cashflow und Einnahmen/Ausgaben liefern dasselbe Netto in zwei Ansichten.
- Fehlt: Vorjahr; Aussage, ob der Überschuss wächst.
- Überschneidung: 1.3, 3.2, One-Pager, Heute.
- Design: Gemeinsame Tabellenkomponente (gut).
- Urteil: zusammenlegen (Cashflow integrieren) · M.

### 1.11 Prognosegenauigkeit (Hub "Budgettreue", Ansicht "Prognosegenauigkeit")
- Frage: Wie treffsicher ist die Hochrechnung am 15.?
- Zeigt heute: Trefferquote, Prognose gegen Ist je Kategorie (Abweichung € und %, Treffer), größte Abweichungen zuerst, Monatsbalken.
- Ohne Aussage: Misst die App selbst, nicht den Haushalt; Monate ohne Stand am 15. "nicht bewertet".
- Fehlt: Konsequenz ("dieser Kategorie nicht trauen").
- Überschneidung: Budgettreue (2.2) im selben Monat mit Plan statt Prognose.
- Design: Eigenes Markup; Balken um Null mit Vorzeichenfarbe, Bedeutung nicht geprüft.
- Urteil: entfernen oder in Budgettreue als Randhinweis (Eigentümer entscheidet) · S.

## 2 Ausgaben und Plan

### 2.1 Ausgabenanalyse (Hub "Ausgaben", Ansicht "Gruppen und Kategorien")
- Frage: Wofür geben wir Geld aus, was hat sich gegenüber dem Vorzeitraum geändert?
- Zeigt heute: Konsum nach Gruppe mit Vorperiode, Vorjahr oder eigenem Vergleichszeitraum mit exakten Tagen. Die Auswahl bleibt in der Adresse. Kategorien und Verlauf sowie Empfänger sind eigene Ansichten desselben Berichts.
- Ohne Aussage: Für „Alles“ gibt es keine gleich lange Vorperiode. Beim eigenen Vergleich steht fehlende Historie ausdrücklich dabei.
- Fehlt: -
- Überschneidung: 1.6, Explorer, 5.5, Geldfluss.
- Design: Eigene Komponenten.
- Urteil: Die alten Adressen für Kategorien und Zeitraumvergleich öffnen die entsprechenden Ansichten der Ausgabenanalyse. Die Explorer-Vorlagen und gespeicherten Ansichten bleiben erreichbar.

### 2.2 Budgettreue inkl. 50/30/20 (Hub "Budgettreue", Ansicht "Budgettreue")
- Frage: Halten wir den Plan, stimmt 50/30/20?
- Zeigt heute: Plan gegen Ist je Kategorie, "Kategorien über Plan", 50/30/20 je Monat, rollierende Planabweichung, Einordnung je Kategorie.
- Ohne Aussage: Monate ohne Plan leer; rollierende Abweichung ohne Zielband schwer lesbar.
- Fehlt: Ein Satz, welche Kategorien den Plan sprengen.
- Überschneidung: One-Pager, Plan › Monat, Geldfluss.
- Design: Eigene Tabellen; "+"-Prefix an der Planabweichung; Rot/Grün bei Überschreitung nicht geprüft.
- Urteil: behalten, Verteilung aus Geldfluss aufnehmen · M.

### 2.3 Verträge und Abos (Hub "Verträge und Kosten", Ansicht "Verträge")
- Frage: Was bindet uns monatlich, was wurde teurer?
- Zeigt heute: Bindung je Monat, Preisverlauf, "Preis prüfen", alle Verträge mit letzter Preisänderung, Fremdwährung.
- Ohne Aussage: Fremdwährungsblock ohne Fremdwährungsverträge (nicht geprüft); Preise abgeleitet.
- Fehlt: Kündigungsfristen (bewusst nicht im Datenmodell).
- Überschneidung: Plan › Zahlungen führt dieselben Beträge; Jahresvorschau.
- Design: Eigene Tabellen; Menütitel vermischt Verträge und Bankkosten.
- Urteil: behalten, Titel "Verträge und Abos" ohne Bankkosten · S.

### 2.4 Persönliche Inflation (Hub "Persönliche Inflation")
- Frage: Steigen unsere Preise schneller als die allgemeine Teuerung, und woran liegt es?
- Zeigt heute: Index (Basis Oktober 2023) gegen VPI, Wirkung je Vertrag, Kategorie-Explorer mit Eigenindex, Differenz in Prozentpunkten, Mengeneffekt.
- Ohne Aussage: Kategorien ohne VPI-Zuordnung zeigen Gesamt-VPI als Ersatz; viele Fachbegriffe.
- Fehlt: Abstand in Prozentpunkten in einfacher Sprache oben.
- Überschneidung: Gehalt real (geplant), Jahresreport Slice 2.
- Design: Zwei Auswahlfelder, eigene Vorzeichenformate.
- Urteil: überarbeiten (Aussage oben) · M.

### 2.5 Empfänger-Analyse (Hub "Ausgaben", Ansicht "Empfänger")
- Frage: Bei wem lassen wir das meiste Geld?
- Zeigt heute: Empfänger nach Nettoausgaben, häufigste Empfänger mit Durchschnitt, Liste aller Empfänger mit Aufschlüsselung.
- Ohne Aussage: Ausgaben ohne Kategorie und Überweisungen nicht enthalten (Hinweis vorhanden).
- Fehlt: Trend je Empfänger.
- Überschneidung: Explorer mit Zeilen "Empfänger".
- Design: Eigene Komponente.
- Urteil: behalten als Ansicht · S.

### 2.6 Bank- und Zinskosten (Hub "Verträge und Kosten", Ansicht "Bank- und Zinskosten")
- Frage: Was kostet uns das Geld selbst?
- Zeigt heute: Monatlich gestapelt Kreditzinsen, Gebühren, Handelsgebühren, Fremdwährung, Überziehung; Erträge getrennt; Kreditlinien; Quellen.
- Ohne Aussage: Schätzungen aus Kreditkonditionen markiert; Spreads/TER fehlen (genannt).
- Fehlt: Gesamtkosten je Jahr als eine Zahl.
- Überschneidung: 4.5 für Handelskosten.
- Design: Gestapelte Säulen, eigene Tabelle.
- Urteil: zusammenlegen mit 4.5 · M.

## 3 Zukunft und Vermögen

### 3.1 Liquiditätsprognose (unter Plan › Prognose)
- Frage: Reicht das Geld auf den Budget-Konten, auch mit geplanten Ereignissen?
- Zeigt heute: Linie mit 10-%-Band, tiefster Punkt, Urteil für 6 Monate, Werkzeuge, nächste Buchungen, Einzelkontovorschau.
- Ohne Aussage: nicht geprüft. Fehlt: -
- Überschneidung: 3.4, Plan › Jahr.
- Design: Eigene Seite außerhalb des Reports-Rahmens.
- Urteil: behalten unter Plan, aus der Berichtsliste entfernen (schon Weiterleitung) · S.

### 3.2 Cashflow-Verlauf (Hub "Einnahmen und Cashflow", Ansicht "Cashflow")
- Frage: Verdienen wir mehr, als wir ausgeben?
- Zeigt heute: Netto je Monat, Kapitalerträge getrennt, Monatstabelle, laufender Monat als unvollständig markiert.
- Ohne Aussage: Dasselbe Netto wie 1.10. Fehlt: -
- Überschneidung: vollständig mit 1.10. Design: wie 1.10.
- Urteil: zusammenlegen mit 1.10 · S.

### 3.3 Vermögensverläufe (Hub "Vermögensreport", Ansichten "Vermögensverlauf", "Gesamtübersicht")
- Frage: Woraus besteht das Vermögen, wie hat sich die Mischung verschoben?
- Zeigt heute: Gestapelte Flächen nach Kontotyp, Schulden als gestrichelte Linie, Tabelle Struktur.
- Ohne Aussage: Dieselbe Netto-Serie wie 3.6 und 5.6. Fehlt: -
- Überschneidung: 3.6, 5.6, Vermögen › Nettovermögen.
- Design: Gemeinsames Legendenmuster, eigene Tabelle.
- Urteil: zusammenlegen mit 3.6 und 5.6 · M.

### 3.4 Jahresvorschau Zahlungen (unter Plan › Zahlungen)
- Frage: Welche Zahlungen kommen in den nächsten 12 Monaten?
- Zeigt heute: Jahreskalender, Zahlungskalender, Fälligkeiten und Verknüpfungen, Maßkette.
- Ohne Aussage: nicht geprüft. Fehlt: -
- Überschneidung: Plan › Zahlungen, 3.1.
- Design: Im Plan-Bereich; Alt-Adresse leitet um.
- Urteil: entfernen aus Reports · S.

### 3.5 Sparziele-Fortschritt (unter Plan › Ziele)
- Frage: Liegen die Sparziele im Plan?
- Zeigt heute: Fortschrittsbalken mit Soll-Marke, Tagesgeld-Zuordnung, Zielstände, Notgroschen in Monaten.
- Ohne Aussage: Konten ohne Zielzuordnung zählen nicht; Fremdwährungsreserven unvollständig.
- Fehlt: Zuordnung geteilter Konten (keine Quelle).
- Überschneidung: Plan › Ziele, Finanz-Check-Reserve.
- Design: Im Plan-Bereich.
- Urteil: entfernen aus Reports · S.

### 3.6 Vermögen & Schulden (Hub "Vermögensreport", Ansicht "Vermögen und Schulden")
- Frage: Was besitzen wir, was schulden wir, wie entwickelt sich der Saldo?
- Zeigt heute: Nettovermögen, Vermögenswerte, Schulden, Veränderung in € und %; Balken je Monatsende mit Nettolinie; Konten des Monats; Schulden nach Konto.
- Ohne Aussage: Schulden nach Konto bei einem Haushalt ohne Kredite leer (nicht geprüft).
- Fehlt: Vorjahr in %, Aussage "vermögender geworden?" (#1118).
- Überschneidung: 3.3, 5.6, Schulden-Verlauf.
- Design: Gemeinsame Legende; Monatstabelle als Handy-Ersatz (gut).
- Urteil: behalten als der eine Vermögensbericht, 3.3 und 5.6 als Umschalter · M.

## 4 Portfolio

### 4.1 Depots im Vergleich
- Frage: Welches Depot läuft am besten?
- Zeigt heute: Karten je Depot, Kennzahlen nebeneinander, Benchmarks gestrichelt; geschlossene Depots ohne Wert und Fluss ausgeblendet.
- Ohne Aussage: P2P/manuell ohne Produktliste (nicht geprüft). Fehlt: -
- Überschneidung: 4.4, Vermögen › Portfolio.
- Design: Karten und Tabelle; Handy nicht geprüft.
- Urteil: behalten · S.

### 4.2 Allocation (Ansicht "Verteilung über Zeit" im Vermögensreport)
- Frage: Woraus besteht das Portfolio, wie weit weg vom Soll?
- Zeigt heute: Sonnendiagramme Klasse/Produkt und Region/Produkt, Soll und Ist über Zeit, Tabelle Gruppe › Klasse › Produkt.
- Ohne Aussage: Sonnendiagramm am Handy schwer lesbar (nicht geprüft).
- Fehlt: Konkrete Handlung ("nächste Einzahlung in Klasse X").
- Überschneidung: Vermögen › Portfolio › Allokation.
- Design: Liegt im Select neben acht anderen Ansichten.
- Urteil: überarbeiten, als Portfolio-Unterbericht ins Menü · M.

### 4.3 Einzahlungen und Wert (Ansicht im Vermögensreport)
- Frage: Was haben wir eingezahlt, was ist es wert?
- Zeigt heute: Stufenlinie Einzahlung gegen Wertlinie, Monatsabstimmung, Kalenderjahre.
- Ohne Aussage: Depotkasse und Sparplan-Zuordnung ausgenommen. Fehlt: -
- Überschneidung: 4.4, 5.6.
- Design: Eigene Tabelle.
- Urteil: zusammenlegen mit 4.4 als "Wertentwicklung" · M.

### 4.4 Rendite und Kennzahlen (Ansichten "Rendite & Risiko", "Kennzahlen", "Anlageklassen im Verlauf")
- Frage: Wie gut, wie riskant, gegen welchen Index?
- Zeigt heute: Maßkette Portfolioleistung, Kennzahlen (TTWROR, XIRR u. a.), bis zu vier Benchmarks, Heatmap Klassen, realisierte Gewinne.
- Ohne Aussage: Drei Ansichten desselben Berichts im Select; Abnahme gegen Portfolio Performance offen.
- Fehlt: Gegenüberstellung mit/ohne Kapitalerträge (#1118).
- Überschneidung: Vermögen › Portfolio › Kennzahlen, 4.1.
- Design: Fachbegriffe erklärt (gut), viele Kennzahlen gleichrangig.
- Urteil: überarbeiten (wichtigste Kennzahl zuerst) · M.

### 4.5 Kosten, Steuern, Erträge
- Frage: Was bleibt von den Erträgen nach Gebühren und Steuern?
- Zeigt heute: Brutto − Einbehalt − Gebühren/TER = netto (12 Monate), Stückliste je Produkt, drei Darstellungen, CSV je Währung, latente KESt als Beispiel.
- Ohne Aussage: Latente KESt ist Illustration.
- Fehlt: Kostenquote in % des Depotwerts.
- Überschneidung: 2.6.
- Design: Eigener Dreier-Schalter.
- Urteil: zusammenlegen mit 2.6 · M.

## 5 Überblick

### 5.1 Jahresreport (Hub "Jahresbericht")
- Frage: Wie lief das Jahr, bin ich vermögender geworden?
- Zeigt heute: Zwei A4-Blätter: Vermögenskette, Einnahmen/Konsum/Zukunft/Sparquote, Kapitalerträge, Cashflow- und Vermögensdiagramm, Monatsliste, zehn größte Kategorien, 50/30/20, Finanz-Check, Kategorie x Monat, Revisionen, Auffälligkeiten; lokal neu: Änderung in € und %, Vorjahresvergleich.
- Ohne Aussage: Markt nur als Kettenglied, nicht als Rendite; Revisionsliste ist Protokoll.
- Fehlt: Alles aus #1118 (Investments, Trading, mit/ohne Markt, geteilte Sparquote, Slice 2).
- Überschneidung: One-Pager, Sparquote, Heat-Tabelle aus 1.5.
- Design: Eigene Tabellen; Druck mit fester Seitenzahl, kaum Platz für Zuwachs.
- Urteil: überarbeiten laut #1118 (Aussagen vor Details, Heat-Tabelle kürzen) · L.

### 5.2 Finanz-Check-Verlauf (Ansicht im Monatsbericht)
- Frage: Welche Regeln sind verletzt, seit wann?
- Zeigt heute: Stufen nach Nettovermögen, Regeln der aktuellen Stufe, Statusleiste 12 Monatsenden + heute, Schwelle, "seit", Aktionen.
- Ohne Aussage: "nicht bewertbar"-Streifen bleiben stehen; nur zwölf Monatsenden gespeichert.
- Fehlt: Priorität ("zuerst diese Regel") als eine Zeile oben.
- Überschneidung: Einstellungen › Regelwerk, Heute, Monatsbericht-Zellen.
- Design: Im Select des Monatsberichts versteckt (Anlass für #1150).
- Urteil: behalten, eingerückt unter Monatsbericht · S.

### 5.3 Explorer (Hub "Auswertung")
- Frage: Eigene Frage, eigene Tabelle.
- Zeigt heute: Pivot (Zeilen Kategorie/Gruppe/Klasse/Empfänger/Einnahmenart, Spalten Monat/Quartal/Jahr/keine), Vorlagen, gespeicherte Ansichten (nur im Browser), Diagramm, CSV.
- Ohne Aussage: Werkzeug, kein Bericht; Wahl nicht in der Adresse.
- Fehlt: Serverseitig gespeicherte Ansichten.
- Überschneidung: nimmt 1.5, 1.6, 1.8 als Vorlagen auf.
- Design: Eigene Pivottabelle; Dichte nicht geprüft.
- Urteil: behalten als "Auswertung", Wahl in Adresse · M.

### 5.4 Kontakte-Abrechnung (Hub "Kontakte")
- Frage: Wer schuldet mir wie viel, und seit wann?
- Zeigt heute: Ansichten "Salden" und "Offene Posten", Kontaktliste, Kontoblatt und Saldenverlauf; nutzt `ContactBody` aus Konten › Kontakte, darin die Liste "Guthaben verwenden" mit Nullzeilen.
- Ohne Aussage: Nullzeilen "Freies Kontaktguthaben", beglichene Verläufe, zwei Ansichten für "offen".
- Fehlt: Tabelle im Stil der Buchungsregister mit Spalte "Offen", Summenzeile je Kontakt, Verlaufsdiagramm, eingeklappte "Vergangene Buchungen" (#1149).
- Überschneidung: Konten › Kontakte.
- Design: Keine gemeinsame Tabellenkomponente; "+"-Vorzeichen nicht geprüft.
- Urteil: überarbeiten komplett laut #1149 · L.

### 5.5 Zeitraumvergleich
- Das Redesign öffnet aus dieser alten Adresse die Ausgabenanalyse mit Vorjahresvergleich. Abweichende gespeicherte Vergleichsdaten und Anker bleiben erhalten. Die folgende Bestandsaufnahme beschreibt die frühere Ansicht.
- Frage: Was hat sich gegenüber damals geändert, welche Kategorie macht den Unterschied?
- Zeigt heute: Vier Vergleichsarten, Maßkette Konsum vorher + mehr − weniger = jetzt, Balken um Null, Tabelle Jetzt/Vorher/Differenz.
- Ohne Aussage: Vergleichsart nicht in der Adresse.
- Fehlt: Einnahmen und Sparquote im Vergleich.
- Überschneidung: 2.1, Jahresreport Vorjahr.
- Design: Eigene Tabelle; Farbe "mehr" nicht geprüft.
- Urteil: zusammenlegen mit 2.1 (Vergleichsmodus) · M.

### 5.6 Gesamtübersicht (Ansicht im Vermögensreport)
- Frage: Kommt der Vermögenszuwachs vom Sparen oder vom Markt?
- Zeigt heute: Anfang + Gespart + Markt = Ende, Monatsbalken, Tabelle je Monat, CSV.
- Ohne Aussage: Gleiche Serie wie 3.3/3.6. Fehlt: -
- Überschneidung: 3.3, 3.6, Jahresreport-Kette.
- Design: Monatstabelle als Handy-Ersatz.
- Urteil: zusammenlegen mit 3.6 · S.

## Ohne Katalognummer

### Schulden-Verlauf (Ansicht im Vermögensreport)
- Frage: Wie schnell werden Schulden abgebaut?
- Zeigt heute / Ohne Aussage / Design: nicht geprüft (Quelle wealth/debt-*.tsx).
- Fehlt: Zinsen und Rest zum Jahresende (#1118 Slice 2).
- Überschneidung: Vermögen › Schulden, 3.6 "Schulden nach Konto".
- Urteil: zusammenlegen mit 3.6 oder unter "Vermögen" eingerückt · S.

### Finanzielle Freiheit (Ansicht im Vermögensreport)
- Frage: Wann reichen Vermögen oder Erträge für die Ausgaben?
- Zeigt heute / Ohne Aussage / Fehlt / Design: nicht geprüft (freedom-report.tsx, wealth/freedom-*).
- Überschneidung: eigene Seite Vermögen › Finanzielle Freiheit (nach Dateistruktur).
- Urteil: nicht geprüft; wegen Doppelung entfernen oder verlinken · S.

## Zehn Änderungen nach Wert
1. Kontakte-Report neu (#1149). L
2. Ein Berichtskopf + eingerücktes Menü (#1150): "Report N", zweiter Select und Pfeile weg, zwei Zeilen. M
3. Aussage-Zeile sichtbar (VerdictLine aus dem eingeklappten Block nach oben). M
4. Jahresreport ausbauen (#1118); Aussagen vor Details. L
5. Vermögensreport trennen: 3.3/3.6/5.6 zu einem Bericht; 4.2 bis 4.4 ins Menü "Portfolio". M
6. Ausgaben bündeln: 1.6, 2.1, 5.5 und "Größte Veränderungen" mit Vergleichsmodus; Explorer bleibt. M
7. Einnahmen und Cashflow zusammenlegen (1.3, 1.10, 3.2), Erwartet-Liste nur offene Posten. M
8. Gemeinsame Tabelle für alle Berichte plus Vorzeichen- und Farbregel. L
9. Kostenbericht vereinen (2.6 und 4.5), Kostenzahl je Jahr. M
10. Aufräumen: Gesamttabelle, Jahresvorschau, Sparziele, Liquiditätsprognose aus der Berichtsliste; Prognosegenauigkeit prüfen. S

## Vorschlag Berichtsmenü

Oberste Ebene sind Gruppen, darunter Berichte, eingerückt deren Unterberichte (im Menü sichtbar, kein zweites Auswahlfeld im Kopf).

- **Überblick**
  - Monatsbericht
    - Finanz-Check-Verlauf
    - A4-Druckblatt Monat
  - Jahresbericht
    - A4-Druckblatt Jahr
  - Zeitraumvergleich (später: Modus in Ausgaben)
  - Kontakte
    - Offene Posten
    - Vergangene Buchungen
- **Einnahmen und Ausgaben**
  - Einnahmen und Ausgaben (inkl. Cashflow, Erwartet gegen Eingegangen)
    - Projekte und Nebeneinkünfte
  - Ausgaben
    - Kategorien
    - Empfänger
  - Gehalt
  - Geldfluss und Budgettreue
    - Budgettreue (50/30/20)
    - Prognosegenauigkeit (Entscheidung offen)
  - Sparquote und Geldalter
  - Verträge und Abos
  - Persönliche Inflation
- **Vermögen**
  - Vermögensreport (Bilanz, Verlauf, Gesamtübersicht)
    - Schulden
    - Finanzielle Freiheit
- **Portfolio**
  - Depots im Vergleich
  - Wertentwicklung (Einzahlungen und Wert, Rendite, Kennzahlen)
  - Verteilung und Soll
  - Kosten und Steuern (inkl. Bank- und Zinskosten)
- **Auswertung**
  - Explorer
    - Vorlagen: Jahr, Kategorie, Gesamt

Unter Plan bleiben: Prognose, Zahlungen (Jahresvorschau), Ziele.

## Offene Fragen an den Eigentümer
- Prognosegenauigkeit (1.11): wird sie genutzt? Wenn nein, entfernen.
- Geldfluss (1.4): Sankey behalten oder in Budgettreue aufgehen lassen?
- Finanzielle Freiheit und Schulden-Verlauf: Inhalt nicht im Detail geprüft; Sichtung in der Live-App nötig.
- Alle "nicht geprüft"-Stellen (Handy, Farbbedeutung, leere Zeilen) brauchen eine Sichtprüfung in der laufenden App, Desktop 1440 und Handy 390.
