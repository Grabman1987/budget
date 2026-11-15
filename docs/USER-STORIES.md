# User-Stories – Budget

Dieser Katalog beschreibt, was der Nutzer in der App tun können soll, und woran er das prüft. Stand: 15.11.2026.
Status: `live` = in der Produktions-App vorhanden (die Abnahme durch den Nutzer steht trotzdem aus), `teilweise` = nur ein Teil ist da, `offen` = beauftragt oder angefangen, aber noch nicht nutzbar, `geplant` = bewusst später.
Verweis: Issue-/PR-Nummer oder Abschnitt in `docs/FEATURES.md` (Y = Budget, I = Investments, Zahl = Report) bzw. `SPEC.md`. Grundlage der Status: FEATURES, STATUS und Issue-Stand vom 15.11.2026.

## Heute

| ID | Userstory | Abnahmekriterien | Status | Verweis |
| --- | --- | --- | --- | --- |
| H-01 | Als Nutzer möchte ich auf „Heute“ drei Antwortkarten sehen (frei, Nettovermögen, nächstes Sparziel), damit ich den Stand in Sekunden kenne. | Die Karten stehen oben auf Heute. Nettovermögen stimmt mit Vermögen › Nettovermögen überein. Das nächste unfertige Sparziel wird genannt. | live | Y13-C |
| H-02 | Als Nutzer möchte ich „Frei bis Gehalt“ als Cashflow-Zahl sehen = Kontostand der Budget-Konten + erwartete Eingänge vor dem Gehalt − offene Abflüsse bis zum Gehalt + aktivierter Dispo-Rahmen, damit ich weiß, was bis zum Gehalt noch ausgebbar ist. | Die Zahl lässt sich in diese vier Teile zerlegen. Ohne Dispo-Häkchen fließt kein Dispo ein. Ein Umschalter wechselt zwischen „Monat“ und „Bis Gehalt“. | live | #1084, PR #1086, Y13 |
| H-03 | Als Nutzer möchte ich die Pace (Ist, Hochrechnung, Deckel) unter der Kontoprognose sehen, damit ich früh merke, ob ich über Plan liege. | Ist ist durchgezogen, Hochrechnung gestrichelt, über dem Deckel rot. Der Plan-bis-heute-Punkt ist sichtbar. | live | Y13-P |
| H-04 | Als Nutzer möchte ich die Kontoprognose (R07) im gleichen Zeitraum wie die Pace sehen, damit ich Engpässe vor dem Gehalt erkenne. | 14 Tage Rückblick sind sichtbar. Die Kurve endet am Gehalts- bzw. Monatsende plus zwei Tage. Heute und Report zeigen denselben Zeitraum. | live | Report R07 (FEATURES) |
| H-05 | Als Nutzer möchte ich Heute am Telefon bedienen können, damit ich nicht zoomen muss. | Der Monatswähler ist gut tippbar. Der Umschalter Monat/Bis Gehalt ist nicht überdimensioniert. Die Aufgabenliste bricht nicht um. | live | #1065 |
| H-06 | Als Nutzer möchte ich, dass Heute schnell lädt, damit ich die App gern täglich öffne. | Kaltes Laden unter 500 ms. Bei Fehlern erscheint ein klarer Hinweis statt falscher Zahlen. | offen | #1073, #956 |

## Plan (Budget)

| ID | Userstory | Abnahmekriterien | Status | Verweis |
| --- | --- | --- | --- | --- |
| P-01 | Als Nutzer möchte ich Zu verteilen, Zugewiesen, Aktivität und Verfügbar je Kategorie sehen, damit ich Geld nach dem Umschlagprinzip verteile. | Jede Zeile zeigt die vier Werte. Der Übertrag in den Folgemonat ist sichtbar. Die Summen stimmen mit dem Monat überein. | live | Y07 |
| P-02 | Als Nutzer möchte ich Kategorien und Gruppen anlegen, ordnen und als Bedarf/Wunsch/Zukunft einstufen, damit die 50/30/20-Sicht stimmt. | Kategorie lässt sich anlegen, verschieben und einstufen. Die Klasse wirkt in Plan und Reports. | live | Y06 |
| P-03 | Als Nutzer möchte ich die Kategoriestruktur wie im Vorsystem wiederfinden, damit ich mich nicht neu einarbeiten muss. | Gruppen und Reihenfolge entsprechen der vereinbarten Vorlage. Es gehen keine Buchungen verloren. | offen | #969 |
| P-04 | Als Nutzer möchte ich blasse Vorschläge (Ziel, Median) und „Leere füllen“ nutzen, damit ich schneller verteile. | Wie letzter Monat, Ø 3 Monate und Ziel sind wählbar. Nichts wird ohne Klick gespeichert. | live | Y09a |
| P-05 | Als Nutzer möchte ich am Gehaltstag Geld geführt verteilen, damit ich nichts vergesse. | Der Ablauf führt Schritt für Schritt. Ein Fortschritt ist sichtbar. Am Ende ist „Zu verteilen“ null oder der Rest genannt. | live | #1055, #1071 |
| P-06 | Als Nutzer möchte ich Überziehungen decken, mit dem größten ausreichenden Vorschlag und Teildeckung per Sammelaktion, damit ich schnell ausgleiche. | Die Quelle wird benannt. Die Sammeldeckung ist rückgängig machbar. | live | Y10 |
| P-07 | Als Nutzer möchte ich Zahlungskategorien für Kreditkarten und Barvorschüsse sehen, damit Kartenschulden gedeckt sind. | Jede Karte hat eine Zahlungskategorie. Käufe bewegen Geld dorthin. | teilweise | Y08 |
| P-08 | Als Nutzer möchte ich den Monat als Wasserfall (neun Stufen) mit Triage sehen, damit ich weiß, wohin das Geld fließt. | Die Stufenfolge ist unverändert. Die Triage zeigt Dringendes zuerst. | live | Y09 |
| P-09 | Als Nutzer möchte ich wiederkehrende Zahlungen (wöchentlich bis jährlich) mit Versionen und Fälligkeiten pflegen, damit Abbuchungen erwartet werden. | Zahlung anlegen, ändern, beenden. Zuordnung zu Buchungen und verpasste Zahlung sind sichtbar. | live | Y11 |
| P-10 | Als Nutzer möchte ich Sparziele und Rücklagen führen und Kategorieziele übernehmen, damit ich den Fortschritt sehe. | Ziel mit Betrag und Datum anlegen. Der Fortschritt wird angezeigt. | live | Y12 |
| P-11 | Als Nutzer möchte ich in Plan › Jahr geplante Ereignisse pflegen, damit ich große Ausgaben vorausplane. | Ereignis anlegen, ausschalten, entfernen, rückgängig. Zwölf Monate sind sichtbar. | teilweise | Y14 |
| P-12 | Als Nutzer möchte ich Plan und Buchungen ruhiger und fokussierter, damit ich weniger abgelenkt bin. | Die fünf kleinen Verbesserungen aus dem Issue sind umgesetzt. | offen | #992 |

## Konten und Buchungen

| ID | Userstory | Abnahmekriterien | Status | Verweis |
| --- | --- | --- | --- | --- |
| K-01 | Als Nutzer möchte ich Konten nach Gruppen (Budget, Karten, Kredite, Investments) sehen und sortieren, damit die Seitenleiste meine Ordnung zeigt. | Gruppen stehen in fester Reihenfolge. Konten sind per Ziehen sortierbar. Schulden erscheinen als Schulden. | live | Y01 |
| K-02 | Als Nutzer möchte ich im Kontoregister Datum und Betrag direkt ändern und Status und Markierungen sehen, damit ich schnell pflege. | Inline-Änderung wirkt sofort. Statussymbole und Markierungen sind sichtbar. | live | Y02 |
| K-03 | Als Nutzer möchte ich einen Saldenverlauf mit Vorschau auf Geplantes sehen, damit ich künftige Stände abschätze. | Verlauf wählbar von 0 bis 365 Tagen. Limit und Fadenkreuz sind sichtbar. | live | Y02 |
| K-04 | Als Nutzer möchte ich Einnahmen und Ausgaben erfassen, damit Bargeld sofort als bestätigt gilt. | Neue Buchung startet „vorgemerkt“. „Wiederholen“ legt einen Plan an. | live | Y03 |
| K-05 | Als Nutzer möchte ich Splitbuchungen, Kontoumbuchungen und Sammelaktionen nutzen, damit komplexe Fälle stimmen. | Die Split-Summe muss aufgehen. Sammelaktion wirkt auf mehrere Zeilen. | live | Y04 |
| K-06 | Als Nutzer möchte ich den Kontostand prüfen und bestätigte Buchungen sperren, damit ein alter Stand fix bleibt. | Bankstand, Datum und Abruf sind sichtbar. Passt der Stand, sperrt „bis heute“. | live | Y05 |
| K-07 | Als Nutzer möchte ich Zuordnungsregeln („Immer so zuordnen“) pflegen, damit wiederkehrende Buchungen automatisch einsortiert werden. | Regel mit Bedingungen anlegen. Vorschau auf die Historie. Ändern und Rückgängig. | live | Y18 |
| K-08 | Als Nutzer möchte ich Belege fotografieren oder hochladen und mit Buchungen verknüpfen, damit ich Nachweise habe. | Der Beleg hängt an der Buchung. Vorschau und Download gehen. Verknüpfung ist rückgängig machbar. | live | Y21 |
| K-09 | Als Nutzer möchte ich beim Wechsel von Konto oder Filter nie eine veraltete Tabelle bearbeiten, damit ich nichts falsch buche. | Nach dem Wechsel ist die alte Tabelle nicht bearbeitbar. Adresse und Inhalt passen zusammen. | live | #1074 |
| K-10 | Als Nutzer möchte ich bei jeder Änderung sehen, ob sie lokal, gesendet, gespeichert oder fehlgeschlagen ist, und dass Wiederholen nichts doppelt bucht. | Vier Zustände sind sichtbar. Doppeltes Senden erzeugt eine Buchung. | offen | #1075 |
| K-11 | Als Nutzer möchte ich Fremdwährungsbuchungen mit Originalbetrag sehen, damit Kurse nachvollziehbar sind. | Originalbetrag und EUR-Betrag sind sichtbar. Ein fehlender Kurs wird gemeldet. | teilweise | I13 |
| K-12 | Als Nutzer möchte ich Umbuchungen und Wertpapierkäufe als einen Vorgang mit Zustand „unterwegs“ sehen, damit nichts doppelt oder fehlend wirkt. | Ein Vorgang zeigt beide Seiten. „Unterwegs“ endet bei Eingang. | offen | #1080 |
| K-13 | Als Nutzer möchte ich Wertpapierüberträge mit belegter Kostenbasis erfassen, damit Gewinne stimmen. | Der Übertrag nennt Kostenbasis und Beleg. Unbekannte Basis bleibt unbekannt. | geplant | #520 |
| K-14 | Als Nutzer möchte ich Fremdwährungsüberträge begrenzt vorbereiten, damit Kurs und Gebühr stimmen. | Übertrag mit Währung, Kurs und Gebühr, im Umfang des Issues. | geplant | #519 |
| K-15 | Als Nutzer möchte ich Bankzeilen automatisch lesen lassen, damit ich weniger tippe. | Nächtlicher Abruf. Neue Zeilen landen ungeprüft im Posteingang. | teilweise | Y19, Y20 |

## Kontakte

| ID | Userstory | Abnahmekriterien | Status | Verweis |
| --- | --- | --- | --- | --- |
| C-01 | Als Nutzer möchte ich Kontakte mit Forderungen und Guthaben führen, damit ich weiß, wer mir was schuldet. | Kontakt zeigt Saldo und Verlauf. Eine Auslage mindert das Vermögen bis zur Rückzahlung. | live | Y15 |
| C-02 | Als Nutzer möchte ich eine Abrechnung je Kontakt, damit ich sie vorlegen kann. | Abrechnung mit laufendem Saldo ist abrufbar. | live | Y15 |
| C-03 | Als Nutzer möchte ich Rückzahlungen gezielt zuordnen und das Guthaben auch nach automatischer Verrechnung wählen, damit der Saldo stimmt. | Zuordnung zu einer einzelnen Forderung ist wählbar. Die Guthaben-Wahl ist nachträglich änderbar. | offen | #978 |
| C-04 | Als Nutzer möchte ich Kontakte zusammenführen, damit Doppelte verschwinden. | Zusammenführen mit Rückgängig-Vertrag. | geplant | #871, #869 |

## Vermögen und Portfolio

| ID | Userstory | Abnahmekriterien | Status | Verweis |
| --- | --- | --- | --- | --- |
| V-01 | Als Nutzer möchte ich Wertpapiere, Depots, Verrechnungskonten und Anlageklassen verwalten, damit mein Bestand abgebildet ist. | Wertpapier anlegen und ändern. Klasse zuordnen. | teilweise | I01 |
| V-02 | Als Nutzer möchte ich Käufe, Verkäufe, Dividenden, Zinsen, Gebühren und Steuern erfassen, damit Bestände und Erträge stimmen. | Ein Trade ist an seine Buchung gekoppelt. Bearbeiten und Rückgängig wirken auf beide. | teilweise | I02, I03 |
| V-03 | Als Nutzer möchte ich aktuelle Positionen und den Verlauf je Wertpapier sehen, damit ich die Entwicklung erkenne. | Bestand je Broker. Detailseite mit Kursen. | teilweise | I04, I09 |
| V-04 | Als Nutzer möchte ich Einstandskosten per Durchschnitt oder FIFO wählen, damit Gewinne meiner Methode folgen. | Einstellung ist speicherbar. Werte ändern sich nachvollziehbar. | live | I06 |
| V-05 | Als Nutzer möchte ich realisierte und unrealisierte Gewinne sehen, damit ich Ergebnisse kenne. | Beide getrennt. Unbekannte Basis wird als unbekannt gezeigt. | offen | I07, I05 |
| V-06 | Als Nutzer möchte ich Kurse nachts automatisch laden und manuell überschreiben können, damit Werte aktuell sind. | Ein Lauf pro Nacht. Manueller Kurs mit Rückgängig. Veraltete Quelle wird gewarnt. | teilweise | I10, I11, I12 |
| V-07 | Als Nutzer möchte ich Sparpläne anlegen und deren Ausführungen zuordnen, damit Abweichungen auffallen. | Plan anlegen, ändern, beenden. Ausführung wird zugeordnet. | teilweise | I17 |
| V-08 | Als Nutzer möchte ich Kennzahlen (TWROR, XIRR, Volatilität, Drawdown) sehen, damit ich Renditen vergleichen kann. | Kennzahlen je Zeitraum. Vergleich mit Referenz. | teilweise | I14, I15 |
| V-09 | Als Nutzer möchte ich Soll/Ist der Anlageklassen und Hinweise zum Umschichten sehen, damit ich Abweichungen erkenne. | Soll- und Ist-Anteil je Klasse. Hinweise zu R13–R15. | teilweise | I16 |
| V-10 | Als Nutzer möchte ich eine monatliche Trendallokation und eine tägliche Sparplanvorschau mit getrenntem Rebalancing, damit ich die Verteilung plane. | Vorschau täglich. Rebalancing getrennt dargestellt. | geplant | #762 |
| V-11 | Als Nutzer möchte ich Nettovermögen mit Eigenanteil, Marktanteil und Zusammensetzung sehen, damit ich weiß, was Sparen und was Markt war. | Täglicher Verlauf. Anteile getrennt. | live | I18 |
| V-12 | Als Nutzer möchte ich Kredite mit Sondertilgung durchrechnen, damit ich die Ersparnis sehe. | Zinssatz und Laufzeit erfassbar. Das Modell wird nicht gespeichert. | teilweise | I19 |
| V-13 | Als Nutzer möchte ich die Freiheitszahl (R16) mit Soll-Pfad sehen, damit ich mein Ziel verfolge. | Zahl und Monate der Freiheit sichtbar. Sparprognose ungespeichert. | teilweise | I20 |
| V-14 | Als Nutzer möchte ich Kurs- und Kryptoabweichungen mit Ursache je Warnung sehen, damit ich sie beheben kann. | Jede Warnung nennt die Ursache. | offen | #1081 |
| V-15 | Als Nutzer möchte ich Wertpapierabrechnungen als PDF (Sparplan, Round-up, Kauf/Verkauf) deterministisch einlesen lassen, damit Trades nicht getippt werden. | Dasselbe PDF liefert dasselbe Ergebnis. Treffer landen im Posteingang. | offen | #1057 |
| V-16 | Als Nutzer möchte ich die Pensions- und Rentenlücke prüfen, damit ich vorsorge. | Ausdrücklich zurückgestellt. | geplant | #815 |

## Reports

Je Report eine Story, Familien sind zusammengefasst. Jeder Report ist genau einmal genannt.

| ID | Userstory | Abnahmekriterien | Status | Verweis |
| --- | --- | --- | --- | --- |
| RP-01 | Als Nutzer möchte ich den Monats-One-Pager (1.1) mit Ergebniskette und 50/30/20 sehen und drucken, damit ich den Monat auf einer Seite habe. | Monat wählbar. Der Druck ergibt eine saubere Seite. | live | 1.1 |
| RP-02 | Als Nutzer möchte ich den Gehaltsreport (1.2) mit Brutto/Netto und Jahresvergleich sehen, damit ich mein Gehalt verfolge. | Erfasste Gehälter je Monat. Warnung bei fehlender Verknüpfung. | live | 1.2 |
| RP-03 | Als Nutzer möchte ich im Gehaltsreport die echte Entwicklung (Grundgehalt, Bonus, real gegen Inflation) sehen. | Grundgehalt und Bonus getrennt. Realer Vergleich vorhanden. | offen | #1066 |
| RP-04 | Als Nutzer möchte ich einen Monat mit Sonderzahlung korrekt dargestellt bekommen, ohne erfundene Netto-/Steueraufteilung. | Keine Aufteilung ohne Beleg. Die Summe stimmt. | offen | #1078 |
| RP-05 | Als Nutzer möchte ich Einnahmen (1.3) und Einnahmen und Ausgaben (1.10) sehen, damit ich Eingänge und Ergebnis kenne. | Einnahmen nach Art. Erwartet gegen erhalten. Gruppen aufklappbar. | live | 1.3, 1.10 |
| RP-06 | Als Nutzer möchte ich den Geldfluss (1.4) als Sankey sehen, damit ich die Verteilung erkenne. | Anteile für Bedarf/Wunsch/Zukunft/Übrig sind sichtbar. | live | 1.4 |
| RP-07 | Als Nutzer möchte ich Jahresansicht (1.5) und Kategorieübersicht (1.6) sehen, damit ich Muster erkenne. | Heatmap Kategorie × Monat. Verlauf, Summe und Änderung je Kategorie. | live | 1.5, 1.6 |
| RP-08 | Als Nutzer möchte ich Sparquote und Geldalter (1.7) sehen. | Nur Haushaltseinkommen. Rollierend 12 Monate. | live | 1.7 |
| RP-09 | Als Nutzer möchte ich die Gesamttabelle (1.8) mit CSV sehen. | Die CSV enthält genau die angezeigten Zeilen und Spalten. | live | 1.8 |
| RP-10 | Als Nutzer möchte ich Projekte und Nebeneinkünfte (1.9) auswerten. | GuV je Projekt. Quellen verlinkt. | live | 1.9 |
| RP-11 | Als Nutzer möchte ich Budgettreue (1.11) und Budgettreue inkl. 50/30/20 (2.2) sehen. | Plan gegen Ist je Kategorie. Der Stand am 15. wird festgehalten. | live | 1.11, 2.2 |
| RP-12 | Als Nutzer möchte ich Ausgabenanalyse (2.1) und Empfänger-Analyse (2.5) sehen. | Größte Änderungen. Summe und Häufigkeit je Empfänger. | live | 2.1, 2.5 |
| RP-13 | Als Nutzer möchte ich Verträge und Abos (2.3) und Persönliche Inflation (2.4) sehen. | Abos mit Preis. Inflation vertragsbezogen. | live | 2.3, 2.4 |
| RP-14 | Als Nutzer möchte ich Bank- und Zinskosten (2.6) sehen. | Monatlich nach Zinsen, Gebühren und Dispo. | live | 2.6 |
| RP-15 | Als Nutzer möchte ich Liquiditätsprognose (3.1), Cashflow-Verlauf (3.2) und Jahresvorschau Zahlungen (3.4) sehen. | 90 Tage bis 12 Monate. Geplante Ereignisse änderbar. | live | 3.1, 3.2, 3.4 |
| RP-16 | Als Nutzer möchte ich Vermögensverläufe (3.3), Sparziele-Fortschritt (3.5) und Vermögen & Schulden (3.6) sehen. | Verlauf stimmt mit Vermögen › Nettovermögen überein. | live | 3.3, 3.5, 3.6 |
| RP-17 | Als Nutzer möchte ich Depots im Vergleich (4.1) und Einzahlungen und Wert (4.3) sehen. | Alle Anlagekontoarten. Monatsabstimmung. | live | 4.1, 4.3 |
| RP-18 | Als Nutzer möchte ich Allocation (4.2) und Rendite und Kennzahlen (4.4) sehen. | Sunburst nach Klasse. Vier Benchmarks wählbar. | live | 4.2, 4.4 |
| RP-19 | Als Nutzer möchte ich Kosten, Steuern, Erträge (4.5) sehen. | Kette Ertrag − Steuer − Gebühren = netto. | live | 4.5 |
| RP-20 | Als Nutzer möchte ich den Jahresreport (5.1) auf zwei A4-Seiten drucken. | Der Druck ergibt genau zwei Seiten. | live | 5.1 |
| RP-21 | Als Nutzer möchte ich Finanz-Check-Verlauf (5.2) und Kontakte-Abrechnung (5.4) sehen. | Stufen und Regelstatus. Kontakte mit laufendem Saldo. | live | 5.2, 5.4 |
| RP-22 | Als Nutzer möchte ich den Explorer (5.3) als Pivot über Buchungen nutzen. | Zeilen und Spalten sind wählbar. | live | 5.3 |
| RP-23 | Als Nutzer möchte ich Zeitraumvergleich (5.5) und Gesamtübersicht (5.6) sehen. | Vier Vergleichsarten. Monatsgesamtbild als erste Ansicht in Überblick. | live | 5.5, 5.6 |
| RP-24 | Als Nutzer möchte ich Fachbegriffe in Reports kurz erklärt bekommen. | Gepunktete Unterstreichung öffnet eine Erklärung. | live | FEATURES E2 |

## Prüfen/Posteingang und Dokument-Upload

| ID | Userstory | Abnahmekriterien | Status | Verweis |
| --- | --- | --- | --- | --- |
| I-01 | Als Nutzer möchte ich im Posteingang kategorisieren, Vorschläge annehmen oder ablehnen und Ausnahmen lösen. | Der Zähler sinkt je erledigtem Eintrag. Ein Vorschlag gilt nur nach Klick. | live | Y16 |
| I-02 | Als Nutzer möchte ich Prüfen geführt mit Fortschritt durchgehen. | Fortschritt sichtbar. Reihenfolge klar. | live | #1054 |
| I-03 | Als Nutzer möchte ich über „Alle Felder“ eine Bankzeile in einem Schritt vervollständigen. | „Alle Felder“ lässt sich aufklappen. Speichern in einem Schritt. | offen | #1048 |
| I-04 | Als Nutzer möchte ich einen zentralen Dokument-Upload, der den Typ erkennt und den passenden Ablauf startet. | Der Typ wird genannt. Der passende Ablauf startet. | live | #1039, #1053 |
| I-05 | Als Nutzer möchte ich, dass Dokumente ohne Gehaltsbezug (Bonus-, Pensionskassenmitteilung) im Mitteilungsarchiv landen. | Kein offener Gehaltszettel-Eintrag. Die Mitteilung ist im Archiv auffindbar. | live | #1077 |
| I-06 | Als Nutzer möchte ich Gehaltszettel automatisch lesen lassen und bestätigen. | Ein neues PDF wird zum Vorschlag. Bestätigen legt die Zeilen an. | teilweise | Y22 |
| I-07 | Als Nutzer möchte ich den Prüfdialog für Gehaltszettel lesbar nutzen. | Keine leere linke Hälfte. Knöpfe brechen nicht um. Auswahlfelder sind vollständig lesbar. | offen | #1068 |
| I-08 | Als Nutzer möchte ich eine Kartenabrechnung ohne Nummer und Zeitraum prüfbar abschließen. | Die Prüfung gelingt ohne beide Angaben. | offen | #1079 |
| I-09 | Als Nutzer möchte ich Kartenabrechnungen mit versetzten Spalten lesen lassen. | Positionen werden erkannt, nicht null Zeilen. | offen | #1056 |
| I-10 | Als Nutzer möchte ich bei Import-Zuordnungen Mehrdeutigkeiten nachvollziehen. | Mehrdeutige Treffer werden gezeigt. | offen | #516 |

## Monatsabschluss

| ID | Userstory | Abnahmekriterien | Status | Verweis |
| --- | --- | --- | --- | --- |
| M-01 | Als Nutzer möchte ich den Monat in fünf geführten Schritten abschließen. | Alle Schritte abhakbar. Abschluss nur vollständig. | teilweise | Y24 |
| M-02 | Als Nutzer möchte ich nach dem Abschluss einen Folgemonat-Entwurf und einen 50/30/20-Entwurf erhalten. | Der Entwurf ist nach Abschluss sichtbar. | teilweise | Y24 |
| M-03 | Als Nutzer möchte ich Wochen-, Quartals- und Jahresroutinen. | Routinen sind abrufbar. | offen | Y24 |

## Regelwerk/Finanz-Check

| ID | Userstory | Abnahmekriterien | Status | Verweis |
| --- | --- | --- | --- | --- |
| F-01 | Als Nutzer möchte ich die Regeln (R01–R16) mit Status und Schwellen sehen. | Je Regel ein Status. Schwellen sind einstellbar. | teilweise | Y23 |
| F-02 | Als Nutzer möchte ich Finanz-Check-Scores von 0 bis 100 mit Herleitung. | Der Score ist nachvollziehbar. | geplant | #814 |
| F-03 | Als Nutzer möchte ich meine Risikotoleranz und Risikotragfähigkeit freiwillig erfassen. | Die Eingabe ist freiwillig. | geplant | #812 |
| F-04 | Als Nutzer möchte ich Familiensituation und Verpflichtungen im Profil angeben. | Angaben fließen in Hinweise ein. | geplant | #813 |

## Einstellungen (Konten, Datenquellen, Sicherheit/Passkey, Sicherung)

| ID | Userstory | Abnahmekriterien | Status | Verweis |
| --- | --- | --- | --- | --- |
| E-01 | Als Nutzer möchte ich je Konto den Dispo per Häkchen mit Limit aktivieren, damit „Frei bis Gehalt“ ihn einrechnet. | Häkchen und Limit sind speicherbar. Es wirkt auf H-02. | live | #1086 |
| E-02 | Als Nutzer möchte ich je Konto einen Zweck (Bargeld, Gehaltskonto, Verrechnung, Investmentkonto, Sonstiges) mit Dispo je Zweck wählen, bei Verrechnung als Lombardkredit. | Zweck ist wählbar. Dispo-Optionen hängen vom Zweck ab. | offen | #1093 |
| E-03 | Als Nutzer möchte ich Quellen und Anlageklassen verwalten. | Editor und Betriebsstatus sind vorhanden. | teilweise | FEATURES KPIs |
| E-04 | Als Nutzer möchte ich Bankverbindungen mit klaren Fehler- und Wiederaufnahme-Zuständen. | Jeder Fehler ist benannt. | offen | #859 |
| E-05 | Als Nutzer möchte ich mich nur mit Passkey anmelden und Sitzungen und Wiederherstellung verwalten. | Login mit Passkey. Die Wiederherstellung gibt den Export nicht frei. | live | FEATURES KPIs |
| E-06 | Als Nutzer möchte ich alle Daten als CSV-ZIP exportieren, nach erneuter Passkey-Bestätigung. | Export nur nach Bestätigung. | live | FEATURES KPIs |
| E-07 | Als Nutzer möchte ich eine verschlüsselte Sicherung und Wiederherstellung. | Nächtliche Kopie vorhanden. Eine echte Wiederherstellung ist noch nicht bestätigt. | teilweise | FEATURES KPIs, #522 |
| E-08 | Als Nutzer möchte ich ein Änderungsprotokoll mit Rückgängig. | Jede Änderung wird protokolliert. | live | FEATURES KPIs |
| E-09 | Als Nutzer möchte ich einen privaten Einrichtungsassistenten in sechs Schritten. | Getrennt von der Passkey-Einrichtung. | geplant | #873 |
| E-10 | Als Nutzer möchte ich bei einer Veröffentlichung Login, Onboarding und Glossar. | Später. | geplant | #490 |

## App allgemein (PWA/Offline, Suche, Design hell/dunkel, Handy)

| ID | Userstory | Abnahmekriterien | Status | Verweis |
| --- | --- | --- | --- | --- |
| A-01 | Als Nutzer möchte ich die App installieren und Buchungen offline erfassen. | Offline erfasst, später gesendet. | teilweise | Y26 |
| A-02 | Als Nutzer möchte ich, dass Wiederholungen offline keine Doppelbuchungen oder Doppelbelege erzeugen. | Eine Buchung je Eintrag. | offen | #559 |
| A-03 | Als Nutzer möchte ich Belege offline erfassen und den Upload getrennt wiederholen. | Der Beleg bleibt lokal. Der Upload ist separat wiederholbar. | offen | #699, #700 |
| A-04 | Als Nutzer möchte ich mit Strg+K / ⌘K suchen. | Seiten, Reports, Konten, Kategorien und Kontakte sind auffindbar. | teilweise | Y17 |
| A-05 | Als Nutzer möchte ich die App hell und dunkel nutzen. | Beide Modi sind lesbar. | live | Y25 |
| A-06 | Als Nutzer möchte ich ein sichtbares Zeichenbrett-Raster als Hintergrund. | Das Raster ist sichtbar. | offen | #1047 |
| A-07 | Als Nutzer möchte ich die App am Handy sicher bedienen. | Tippflächen mindestens 44 px. Kein seitliches Scrollen. | teilweise | Y25 |
| A-08 | Als Nutzer möchte ich, dass die iPhone-Tests stabil laufen. | Der WebKit-Lauf ist grün. | offen | #1064 |
| A-09 | Als Nutzer möchte ich eine freigegebene Veröffentlichung mit Rollback. | Rollback ist geprobt. | geplant | #874 |
| A-10 | Als Nutzer möchte ich eine vollständige Zustands- und Barrierefreiheits-Abnahme. | Alle Zustände sind geprüft. | offen | #872 |

## Abnahme

1. Der Nutzer öffnet in der App den Bildschirm der Story.
2. Er prüft die Abnahmekriterien nacheinander.
3. Er meldet je Story „passt“ oder „fehlt“ mit der Story-ID, z. B. „H-02 passt“.
4. Bei „fehlt“ nennt er das Kriterium, das nicht stimmt.
5. Erst nach „passt“ gilt die Story als abgenommen, unabhängig vom Status `live`.
