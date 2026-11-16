# Effizienz der Abläufe – Analyse

Stand: 15.11.2026. Grundlage: alle 172 Stories (Ablauf-Abschnitte), Verdachtsfälle gegen den Code in `apps/web/src` geprüft. Keine Änderung am Produktcode. Vorschläge halten die Invarianten aus `SPEC.md` ein (Beträge in Cent, Audit und Rückgängig, keine stille Änderung von Finanzzahlen, Einzelnutzer, keine Import-Funktion).

Schreibweise: „Schritte“ zählt Klicks und Eingaben, die der Nutzer für den Vorgang braucht. Es sind Schätzungen aus dem Ablauf und dem Code, keine Messungen.

## 1. Kurzfazit

1. Die täglichen Wege sind schon kurz: Buchung erfassen, Bankzeilen bestätigen und Überziehung decken brauchen wenig Schritte und haben gute Vorbelegung.
2. Die Zeit geht in den monatlichen Wiederholungen verloren, in denen für jedes Konto, jede Kategorie oder jedes Dokument dasselbe von Hand getippt wird.
3. Größte Zeitfresser: (a) Kontostände im Monatsabschluss je Konto abtippen, obwohl der Bankstand vorliegt; (b) Sparplan-Abrechnungen von Hand in „Handel erfassen“ abschreiben; (c) Kategorie und Empfänger einer Buchung nur über das Seitenpanel ändern, Geld verteilen ohne Vorlage und Zeitraum je Report neu wählen.
4. Mehrere Stories beschreiben dieselbe Funktion doppelt (siehe Abschnitt 4); das kostet nicht den Nutzer Zeit, aber Pflegeaufwand.

## 2. Häufige Abläufe zuerst

| Ablauf | Häufigkeit | Schritte heute | Minimal | Befund | Vorschlag |
| --- | --- | --- | --- | --- | --- |
| Buchung erfassen (K-04) | täglich, mehrmals | 4 bis 6 (Betrag, Empfänger, Kategorie aus Empfänger vorbelegt, Speichern); Datum = heute, zuletzt benutzte Konten und Kategorien zuerst, „Speichern und neu“ behält den Kontext | 3 | Im Code geprüft: effizient. Lücke nur bei späterer Korrektur der Kategorie (B-07). | Nichts am Formular ändern; B-07. |
| Bankzeile bestätigen (I-01, I-01a) | täglich bis wöchentlich, 5 bis 20 Zeilen | sicherer Vorschlag: 1 Klick; alle sicheren: 2 Klicks (Vorschau, Ausführen); unsicher: Prüfen, Kategorie, Empfänger, Bestätigen = 4 | 1 je Zeile, 2 für alle | Im Code geprüft: „Alle sicheren bestätigen (n)“ ist da, aber nicht in den Stories beschrieben. Auf 100 Zeilen je Lauf begrenzt. | Story I-01a ergänzen (B-15). Kein Umbau. |
| Geld am Gehaltstag verteilen (P-05, P-04) | monatlich | Assistent: 4 Schritte; im Schritt „Zuweisen“ je Kategorie ein Klick oder Betrag tippen, bei 15 bis 20 Kategorien 15 bis 25 Eingaben | 3 (Vorlage wählen, prüfen, bestätigen) | Im Code geprüft: der Assistent füllt nur Lücken zum Ziel („Alle füllen“). „Wie letzter Monat“ und „Ø 3 Monate“ gibt es nur im Plan-Menü (B-01). | Vorlage im Assistenten anbieten. |
| Überziehung decken (P-06) | wöchentlich bis monatlich | Plan: 1 bis 2 Klicks je Zeile, „Überzogene decken“ für alle = 2 | 2 | Im Plan effizient. Im Monatsabschluss Schritt 3 nur je Kategorie, 3 bis 4 Schritte je Zeile (B-03). | Sammel-Decken auch im Abschluss. |
| Monatsabschluss (M-01 bis M-02) | monatlich | ca. 10 feste Schritte plus je Konto 4 (Kontostand prüfen: Dialog, Saldo tippen, Stichtag, Bestätigen) plus je überzogener Kategorie 3 bis 4; bei 8 Konten und 3 Überziehungen rund 55 | ca. 12 | Im Code geprüft: Schritt 2 nutzt den abgerufenen Bankstand nicht (B-08), Schritt 3 hat keine Sammelaktion (B-03). | B-08 und B-03; größter Hebel. |
| Kontostand abgleichen (K-06) | monatlich je Konto, 6 bis 10 Konten | 5 (Dialog, Saldo laut Bank tippen, Stichtag, Differenz prüfen, Bestätigen) | 1 (bei Bank-Sync) | Im Code geprüft: Auf der Kontoseite gibt es „Abgleich sperren bis heute“ mit einem Klick, wenn ein Bankstand vorliegt. Die Story nennt das nicht; Monatsabschluss und Heute nutzen es nicht. | B-06, B-08. |
| Dokument hochladen (I-04) | monatlich, 2 bis 4 Dateien (Gehalt, Karte, Belege) | 6 je Datei: Dialog, Datei, Typ prüfen, Konto wählen, Weiter, Abschluss | 2 (Datei ablegen, Bestätigen) | Im Code geprüft: genau eine Datei je Dialog, Konto muss gewählt werden. Gehaltszettel kommen schon nachts automatisch (I-06). | B-16. |
| Sparplan-Ausführung bestätigen (V-07) | monatlich, 3 bis 5 Pläne | 4 je Plan, davon Stück, Betrag und Gebühr von Hand aus der Abrechnung abgetippt | 1 je Plan | Im Code geprüft: der Dialog sagt ausdrücklich „aus der Abrechnung übernehmen“. Medienbruch. | B-19 (V-15 vorziehen). |
| Kurse und Depot prüfen (V-06a, V-03) | wöchentlich | 1 bis 2 (Positionen öffnen); Kurse laufen nachts | 1 | Effizient. Nur Fehlerfälle kosten Schritte (B-18). | Nichts ändern. |
| Warnung zu Kurs oder Quelle erledigen (I-01b, V-14) | gelegentlich, derzeit 7 offene | 4 (Aufgaben, erklären, Quelle prüfen, als erledigt markieren) | 0 | Nur aus Story: die Warnung schließt sich nicht von selbst, wenn die Quelle wieder liefert (B-18). | Selbstheilend schließen. |
| Zeitraum in Reports wählen (RP-*) | wöchentlich, mehrere Reports | je Report 1 bis 2 Schritte | 0 | Im Code geprüft: Vermögen übernimmt den Zeitraum beim Wechsel, die Reports starten je Report auf „YTD“ (B-22). | Zeitraum merken. |
| Auslage oder Rückzahlung bei Kontakt (C-01, C-03a) | gelegentlich | 3 bis 4; Rückzahlung vorbelegt „älteste Auslage zuerst“ | 3 | Effizient. | Nichts ändern. |
| Wiederkehrende Zahlung anlegen und Abbuchung zuordnen (P-09) | selten anlegen, monatlich zuordnen | anlegen 6; zuordnen 3 je Abbuchung | 0 beim Zuordnen | Nur aus Story: Abbuchung wird von Hand verknüpft (B-05). | Automatisch verknüpfen, Ausnahmen vorlegen. |

## 3. Befunde je Bereich

Problemtypen: zu viele Schritte, Doppelerfassung, Umweg, fehlende Vorbelegung, fehlende Sammelaktion, Medienbruch, unnötige Bestätigung, gleiche Aufgabe an zwei Orten, fehlende Automatik. Aufwand: klein (Tage), mittel (bis eine Woche), groß (länger).

### Heute und Plan

| ID | Stories | Problemtyp | Kosten für den Nutzer | Vorschlag | Aufwand | Prüfung |
| --- | --- | --- | --- | --- | --- | --- |
| B-01 | P-05, P-04 | fehlende Vorbelegung | Am Gehaltstag je Kategorie ein Betrag, obwohl „Wie letzter Monat“ und „Ø 3 Monate“ existieren. 10 bis 20 Eingaben monatlich. | Im Schritt „Zuweisen“ dieselben Quellen wie im Plan-Menü anbieten, mit Vorschau, danach „Leere füllen“. Vorlage nur für Kategorien ohne Ziel. | klein | im Code geprüft |
| B-02 | I-06, P-05, H-05 | Umweg | Nach dem Bestätigen des Gehaltszettels muss der Nutzer zu Heute und dort „Verteilen“ wählen. | Im Abschluss des Gehalts-Dialogs „Jetzt verteilen“ anbieten (Link auf den Assistenten). | klein | nur aus Story |
| B-03 | M-01, P-06 | fehlende Sammelaktion | Im Monatsabschluss muss jede überzogene Kategorie einzeln geöffnet und gedeckt werden; im Plan geht es mit „Überzogene decken“ in zwei Klicks. | Denselben Sammel-Knopf mit Vorschau in Schritt 3 anbieten. | klein | im Code geprüft |
| B-04 | P-02, K-04 | Umweg | Eine neue Kategorie beim Erfassen einer Buchung erforderte den Wechsel zu Einstellungen › Kategorien. | „Neue Kategorie …“ öffnet das bestehende Formular direkt im Wähler und wählt das Ergebnis; Rückgängig für unbenutzte Kategorien. | mittel | #1104 implementiert; CI und Live-Abnahme offen |
| B-05 | P-09, K-15 | fehlende Automatik | Jede Abbuchung einer wiederkehrenden Zahlung wird mit „Buchung verknüpfen“ zugeordnet. Bei 10 bis 20 Verträgen sind das 30 bis 60 Schritte im Monat. | Bei eindeutigem Treffer (Betrag, Datum, Gegenpart) automatisch verknüpfen und nur Unklares in Prüfen zeigen; sichtbar und rückgängig. Der Posteingang kennt bereits den Typ „Wiederkehrende Zahlungen“. | mittel | nur aus Story |

### Konten und Buchungen

| ID | Stories | Problemtyp | Kosten für den Nutzer | Vorschlag | Aufwand | Prüfung |
| --- | --- | --- | --- | --- | --- | --- |
| B-06 | K-06 | fehlende Automatik | Der Kontostand-Dialog verlangt „Saldo laut Bank“ per Hand, auch wenn der Bankstand per Bank-Sync vorliegt. | Bei vorhandenem Bankstand den Wert vorbelegen und mit Datum anzeigen („Bankstand vom …“); der Nutzer bestätigt nur. Ohne Bank-Sync bleibt die Eingabe. | klein | im Code geprüft |
| B-07 | K-02, K-05c | zu viele Schritte | Inline lassen sich nur Datum und Betrag ändern. Die häufigste Korrektur, die Kategorie, braucht das Panel (3 Schritte) oder die Sammeländerung (5 Schritte, auch für eine einzige Buchung). | Kategorie (und Empfänger) als Inline-Feld im Kontoregister und in „Alle Buchungen“, mit demselben Wähler. | mittel | im Code geprüft |
| B-08 | K-06, M-01 | fehlende Automatik, Doppelerfassung | Im Monatsabschluss Schritt 2 tippt der Nutzer je Konto den Saldo ab, obwohl der abgerufene Bankstand vorliegt und die Kontoseite ihn mit einem Klick sperren kann. | Schritt 2: je Konto „Mit Bankstand bestätigen“, wenn Stand und Stichtag passen; Differenzen öffnen den bisherigen Dialog. Kein stilles Abgleichen: Der Nutzer klickt, die Gruppe ist rückgängig. | mittel | im Code geprüft |
| B-09 | K-12, K-13, V-02 | Doppelerfassung | Geld aufs Verrechnungskonto überweisen und danach den Kauf erfassen sind zwei Erfassungen mit zwei Daten. Die Zwischenzeit („unterwegs“) wirkt wie ein Fehler. | K-12 wie beschlossen (Vorgang beim Konto); Priorität nach den Hebeln darüber, da groß. | groß | nur aus Story |
| B-10 | K-08, I-04, K-04 | gleiche Aufgabe an zwei Orten | Belege gibt es an drei Stellen: im Buchungsformular („Dokument hochladen“), im Abschnitt „Belege“ der Buchung („Foto aufnehmen“) und im zentralen Upload. Der Nutzer muss wissen, welcher Weg wann gilt. | Einen Einstieg („Beleg hinzufügen“) mit gemeinsamem Dialog; zentraler Upload bleibt für unbekannte Dokumente. | klein | im Code geprüft |
| B-11 | K-01, E-11 | gleiche Aufgabe an zwei Orten | „Konto anlegen“ ist in Konten und in Einstellungen › Konten vorhanden. | Beide führen schon zum selben Formular (`account-form`); nur die Stories zusammenlegen (Abschnitt 4). | klein | im Code geprüft |

### Kontakte

| ID | Stories | Problemtyp | Kosten für den Nutzer | Vorschlag | Aufwand | Prüfung |
| --- | --- | --- | --- | --- | --- | --- |
| B-12 | C-04, E-13b, E-13, C-01 | gleiche Aufgabe an zwei Orten | Kontakte verwalten liegt in Konten › Kontakte (Saldo, Verlauf) und in Einstellungen › Kontakte (anlegen, Aliase, zusammenführen). Zusammenführen ist ein Bauteil (`contact-merge`), aber zwei Stories. | Aktionen „Umbenennen“, „Zusammenführen“ im Kontakt selbst; Einstellungen verweist nur dorthin. | klein | im Code geprüft |
| B-13 | C-03b, C-03c | Medienbruch | Korrekturen laufen über Betreiber-Befehl (`migrate-cli`), nicht in der App. | Bewusst so (Einzelnutzer, selten). Nur beobachten, wie oft es vorkommt. | – | nur aus Story |

### Prüfen und Dokument-Upload

| ID | Stories | Problemtyp | Kosten für den Nutzer | Vorschlag | Aufwand | Prüfung |
| --- | --- | --- | --- | --- | --- | --- |
| B-14 | I-03, I-01 | Umweg | Wer eine Bankzeile aufteilen oder mit Notiz, Projekt und Beleg versehen will, muss sie erst bestätigen und danach die Buchung öffnen. | Dialog „Alle Felder“ wie in #1048 beschrieben fertigstellen; kein weiterer Bildschirm. | klein | nur aus Story |
| B-15 | I-01a, I-02, I-01 | gleiche Aufgabe an zwei Orten | Drei Wege für Bankzeilen (Liste, Auswahl, geführt) und ein vierter im Code („Alle sicheren bestätigen“), den keine Story nennt. | Wege behalten, da sie verschiedene Mengen bedienen; I-01a um „Alle sicheren bestätigen“ ergänzen und die Wahl des Wegs in einem Satz erklären. | klein | im Code geprüft |
| B-16 | I-04, I-08, I-09 | zu viele Schritte, fehlende Vorbelegung | Jede Datei einzeln (6 Schritte), Typ und Konto werden von Hand bestätigt. Bei Kartenabrechnungen steht die Karte im Dokument. | Mehrfachauswahl; Konto aus der maskierten Kartennummer oder dem letzten Upload vorschlagen; „Weiter“ nur bei Unsicherheit verlangen. | mittel | im Code geprüft |
| B-17 | I-06 | fehlende Vorbelegung | Bei jedem Gehaltszettel wählt der Nutzer zwischen „Gehaltsbuchung (±5 Tage)“ und „Neue Auszahlung vormerken“ und ordnet unbekannte Lohnarten zu. | Bei genau einer Treffer-Buchung vorwählen; einmal zugeordnete Lohnarten merken (sichtbar in der Vorschau). | klein | nur aus Story |
| B-18 | I-01b, V-14, V-06a | fehlende Automatik | Eine Warnung wie „Kurse nicht abrufbar“ bleibt offen, bis der Nutzer sie von Hand schließt, auch wenn der nächste Abruf klappt. | Warnung schließt sich selbst nach erfolgreichem Abruf (mit Protokolleintrag). „Als erledigt markieren“ bleibt für echte Ausnahmen. Passt zu V-14: kein Wegklicken ohne Ursache. | klein | nur aus Story |

### Vermögen und Portfolio

| ID | Stories | Problemtyp | Kosten für den Nutzer | Vorschlag | Aufwand | Prüfung |
| --- | --- | --- | --- | --- | --- | --- |
| B-19 | V-07, V-15, V-02 | Medienbruch | Pro Sparplan-Ausführung Stück, Betrag und Gebühr aus dem PDF abtippen (je 3 Felder, Tippfehler möglich). | V-15 vor die übrigen Vermögens-Stories ziehen: PDF hochladen, Handelsvorschlag mit Sparplan-Zuordnung, ein Klick „Bestätigen“. | groß | im Code geprüft |
| B-20 | V-01, V-04, E-03a, E-11 | gleiche Aufgabe an zwei Orten | Depots und Verrechnungskonten in Einstellungen › Konten, Instrumente in Vermögen, Anlageklassen, Zielallokation und Einstandsmethode wieder in Einstellungen. Selten genutzt, aber verstreut. | Kontextlinks („Zielquoten ändern“, „Depot anlegen“) statt neuer Bildschirme. | klein | nur aus Story |

### Reports und Monatsabschluss

| ID | Stories | Problemtyp | Kosten für den Nutzer | Vorschlag | Aufwand | Prüfung |
| --- | --- | --- | --- | --- | --- | --- |
| B-22 | RP-05a bis RP-23b | fehlende Vorbelegung | Jeder Report startet auf „YTD“ (Zeitraum in der Adresse, kein gemeinsamer Wert); wer mehrere Reports im selben Zeitraum liest, wählt ihn jedes Mal neu. Vermögen übernimmt den Zeitraum bereits. | Zeitraum und Monat reportübergreifend merken, wie bei „Frei bis Gehalt“ auf Heute. | klein | im Code geprüft |
| B-23 | M-01, M-02, P-04 | gleiche Aufgabe an zwei Orten | Schritt 4 des Abschlusses (Folgemonat „wie Vormonat“ oder „Durchschnitt“, dann „Plan übernehmen“) ist dieselbe Funktion wie „Automatisch zuweisen“ im Plan. | Beide mit demselben Baustein bedienen (B-01) und in beiden die gleiche Vorschau zeigen. | klein | nur aus Story |
| B-24 | M-01, M-03, P-05 | Umweg | M-03 spricht vom „Monatsabschluss unter Reports“, M-01 startet in Plan mit „Monat abschließen“. Der Nutzer muss raten, wo er beginnt. | Einen Einstieg festlegen (Plan) und in Reports nur verlinken. | klein | nur aus Story |

Zählung: 23 Befunde, davon 13 im Code geprüft und 10 nur aus der Story gelesen.

## 4. Doppelte oder überlappende Stories und Funktionen

| Gruppe | Empfehlung |
| --- | --- |
| K-13 und V-17; K-14 und V-18 | Erledigt am 15.11.2026: K-13 und K-14 sind die Stories, V-17 und V-18 verweisen. |
| K-01 und E-11 (Konto anlegen) | Zu einer Story machen; derselbe Formular-Baustein. |
| C-04 und E-13b (Kontakte zusammenführen) | Zu einer Story; derselbe Baustein `contact-merge`. |
| K-10 und A-02 (Speicherstatus, Wiederholschutz, #1075) | Beide beschreiben denselben Statuswechsel; in A-02 zusammenfassen, K-10 als Verweis. |
| I-01, I-01a, I-02 (Bankzeilen) | Behalten, aber in einer Übersicht gegenüberstellen: eine Zeile, Auswahl, geführt, „Alle sicheren“. |
| M-02 und P-04 (Folgemonat aus Vormonat füllen) | Ein Baustein, zwei Einstiege (B-23). |
| RP-15a (Liquiditätsprognose) und H-04 (Kontoprognose auf Heute) | Der Report liegt unter Plan › Prognose; H-04 verweist nur. Beide Stories gegeneinander abgleichen. |
| RP-21b (Kontakte-Abrechnung) und C-02 | Wahrscheinlich dieselbe Auswertung; prüfen und zusammenlegen. |
| RP-18b und V-08; RP-18a und V-09a; RP-16a/RP-16c und V-11 | Vermögens-Seiten und Reports zeigen ähnliche Auswertungen. Jeweils eine führende Story bestimmen, die andere verweist. |
| RP-05a, RP-05b, RP-15b (Einnahmen, Einnahmen und Cashflow, Cashflow-Verlauf) | Inhaltlich überlappend; nur aus den Titeln und den Abläufen gelesen, vor dem Zusammenlegen am Bildschirm prüfen. |
| RP-07a, RP-09, RP-20 (Jahresansicht, Gesamttabelle, Jahresreport) | Wie oben: Kandidaten für eine Zusammenlegung; RP-20 wurde nur nach dem Titel beurteilt. |
| RP-24 (Fachbegriffe erklärt) und E-10 (Glossar, bewusst offen) | Das Glossar existiert als Report; E-10 darauf verweisen, damit nicht ein zweites entsteht. |
| E-03, E-04, K-15 (Datenquellen und Bank-Sync) | Eine Story für den Einrichtungsweg, die anderen beschreiben nur Zustände. |
| M-03 und M-01 | M-03 entfällt; Einstieg „Monat abschließen“ festlegen (B-24). |

## 5. Was schon effizient ist

- Buchung erfassen: Datum heute, zuletzt benutzte Konten und Kategorien zuerst, Standardkategorie des Empfängers, „Speichern und neu“ behält den Kontext (im Code geprüft).
- „Alle sicheren bestätigen“ mit Vorschau und geführtes Prüfen mit Tasten (I-01a, I-02).
- „Überzogene decken“ und der Vorschlag für die Quelle im Plan (P-06); geführtes „Geld verteilen“ mit Rückgängig (P-05).
- Rückzahlung bei Kontakten ist mit „älteste Auslage zuerst“ vorbelegt; „Text zum Kopieren“ erspart das Abtippen in Nachrichten (C-02, C-03a).
- Kurse laufen nachts, Gehaltszettel werden automatisch gefunden (V-06a, I-06).
- Rückgängig und Wiederholen überall (E-08), Suche mit Strg+K (A-04), Offline-Erfassung ohne Doppelbuchung (A-01a, A-02).
- Bewusste Reibung, die bleiben soll: Grund beim Aufschieben im Monatsabschluss (M-01a), Passkey beim Export (E-06, E-07), Vorschau vor dem Zusammenführen. Das sind Schutz vor stillen Änderungen, keine Zeitfresser.

## 6. Top 10 Maßnahmen

Rangfolge nach (Häufigkeit mal gesparte Schritte) durch Aufwand.

1. Monatsabschluss Schritt 2 und Kontostand-Dialog mit dem abgerufenen Bankstand vorbelegen und mit einem Klick bestätigen (K-06, M-01; B-06, B-08).
2. „Überzogene decken“ mit Vorschau auch im Monatsabschluss Schritt 3 (M-01, P-06; B-03).
3. „Wie letzter Monat“, „Ø 3 Monate“ im Assistenten „Geld verteilen“ anbieten (P-05, P-04, M-02; B-01, B-23).
4. Kategorie und Empfänger inline im Kontoregister und in „Alle Buchungen“ ändern (K-02, K-05c; B-07).
5. Sparplan-Abrechnung als PDF einlesen und als Handelsvorschlag bestätigen statt abtippen (V-07, V-15; B-19).
6. Reportübergreifenden Zeitraum merken (RP-05a bis RP-23b; B-22).
7. Warnungen zu Kursen und Quellen schließen sich nach erfolgreichem Abruf selbst (I-01b, V-14, V-06a; B-18).
8. Abbuchungen wiederkehrender Zahlungen bei eindeutigem Treffer automatisch verknüpfen (P-09, K-15; B-05).
9. Mehrfach-Upload mit Konto-Vorschlag und weniger Bestätigungen (I-04, I-08, I-09; B-16).
10. Neue Kategorie direkt im Kategorie-Wähler anlegen (P-02, K-04; B-04).

Danach, weil groß: Umbuchung und Wertpapierkauf als ein Vorgang (K-12; B-09).
