# Revision 06 — Kommentare aus Parts 1–5

Stand: 15.10.2026. Bestehende Datei: [Budget in Figma](https://www.figma.com/design/Nv9oaV96Npql6onEofCFEi?node-id=194-54809).

74 bestehende/neue Desktop- und Phone-Ansichten in 37 Szenarien überarbeitet und mit stabilen IDs in den vorhandenen Gesamtprototyp übernommen. Sieben ergänzende Zustände: P24, R38–R40, V22–V24. Der Gesamtumfang beträgt damit 177 Szenarien / 354 Hauptansichten, zuzüglich der vorhandenen Theme-Gegenproben. Originale Referenzseiten bleiben erhalten.

## Was der GitHub-Abgleich ergeben hat

Der vorhandene Programmcode enthält mehr fachliche Darstellung als die bisherigen Figma-Diagramme. Die folgenden Komponenten wurden tatsächlich gelesen, nicht nur nach Dateinamen gesucht. Ausgangsstand des Design-Branches vor dieser Revision: `618b54d838d2cabb3fc44b54910d07b65914c2bb`.

| Vorhandene Quelle | Im Entwurf wieder sichtbar |
|---|---|
| `apps/web/src/wealth/networth-chart.tsx`, `networth-model.ts` | Tägliches Nettovermögen in EUR; Eigenleistung und Marktbewegung getrennt vom Bestand, eigene gemeinsame Nulllinie der Beiträge. |
| `apps/web/src/wealth/portfolio-overview.tsx` | Täglicher Verlauf, gemeinsame Indexbasis, Kurse und Datenlücken; Euro-Bestand zusätzlich zum Renditeindex. |
| `apps/web/src/heute/charts.tsx` | Ist/Prognose, Ereignisse als Stufen, Heute, Gehalt, Tiefpunkt und dasselbe Zeitfenster. |
| `apps/web/src/reports/liquidity-chart.tsx` | Ereignisse und Liquiditätsvorschau als eigenständige fachliche Ansicht. |
| `apps/web/src/pages/portfolio-allocation-report.tsx` | Zusammensetzung, Anlageklassen und Entwicklung der Klassen. |
| `packages/db/src/repos/portfolio-performance.ts` | Klassenbezogene Reihen und Abgrenzung von Umbuchungen/Zuordnungseffekten. |
| `packages/db/src/repos/portfolio-benchmarks.ts` | Auswahl Weltaktien, S&P 500, Nasdaq und ATX; gemeinsamer Vergleich. |
| `apps/web/src/reports/payroll-report.tsx`, `payslip-panel.tsx` | Laufendes Gehalt, Sonderzahlungen, Erstattungen, Telearbeit, Fahrtkostenzuschuss und bestehende Berechnungsgruppen. |

**Abgrenzung:** Die täglichen Benchmark-Kurven unmittelbar in V02 und ein neu konfigurierbares Gehalts-Auswertungsfeld sind Zielentwurf-Ergänzungen. Der vorhandene Benchmark-Repository liefert Monatsreihen; daraus wurden keine angeblichen realen Tageskurse interpoliert. Die neuen Figma-Kurven und Gehaltsdaten sind ausdrücklich synthetische Beispiele. Diese Revision ändert keine App-, Datenbank- oder Produktionsdateien und behauptet keine erfolgte Backend-Implementierung dieser Erweiterungen.

## Kommentar-Checkliste

Mehrfach übermittelte Screenshots sind zusammengeführt. „Umgesetzt“ meint die native Figma-Darstellung und die unten ausgewiesenen Prototyp-Zustände, nicht das automatische Schließen eines Figma-Kommentar-Threads.

| ID | Kommentar / Anforderung | Umsetzung |
|---|---|---|
| C01 | Fehlende X-Achsen / informationsarme Diagramme | R01/R03/R09/R10/R11 und H01/H02/V01/V02 mit Zwischenbeschriftungen, Einheiten, Serien/Legenden; zusätzliche Achsen für P05/P11, R06/R16, V04/V06/V16. |
| C02 | Hoch-/Tiefpunkte | Datenpunkte und Werte in den Hauptdiagrammen, mit Datum/Monat; zusätzliche Bestandsdiagramme erhalten Extremwertangaben aus ihren vorhandenen Vektorwerten. Prognosewerte sind getrennt gekennzeichnet. |
| C03 | Heatmap-Farben ohne Bedeutung | R05/R35 mit gemeinsamer fünfstufiger EUR-Skala, gebundenen Hell-/Dunkel-Variablen, Legende und exakten Zahlen; identische Beträge gleich gefärbt. |
| C04 | Geldfluss ohne Kategorien | R04: Wohnen 900, Lebensmittel 280, weitere Ausgaben 950, Überschuss 1.470; Diagramm und Tabelle stimmen überein. |
| C05 | Kontoprognose sieht fachlich anders aus | H02: Ist, Ereignisstufen, Heute, Gehalt, Null und Tiefpunkt. Ausgewähltes Fenster bis Gehalt reicht korrekt bis 17. November. |
| C06 | Vermögen auf Platz 2 | H01: Vermögensabschnitt unmittelbar nach dem Monatsverlauf. |
| C07 | Vermögen mit Tageskursen | H01/V01/V02 mit Tagesständen und tatsächlichen täglichen Änderungen des synthetischen Beispiels. |
| C08 | Zu schmale Vermögens-/Schuldensäulen | R09: Säulenbreite 58 % des Monatsabstands, gemeinsame Null, Schulden darunter, Netto als eigene Differenzlinie. |
| C09 | Tabellenumrandung fehlt | P01–P03: durchgehender Außenrand, Gruppen- und Zeilengrenzen. |
| C10 | Doppelter Strich im Schriftfeld | P01–P04: überlagerte äußere Rastersegmente entfernt; ein Außenrand bleibt. |
| C11 | Uneinheitliches Spacing | P01–P03: gemeinsame Zeilen-/Gruppenstruktur, Ausrichtung und Zielbalken ohne zusätzliche leere Gruppenzeilen. |
| C12 | Benchmark fehlt | V02: Portfolio plus Weltaktien/Nasdaq; V22/V23/V24 zeigen die einzeln schaltbaren Zustände. R11 ergänzt alle vier vorhandenen Benchmark-Arten. |
| C13 | Istvermögen-Graph fehlt | V01: tägliches Nettovermögen; V02: tatsächlicher täglicher Depotwert in EUR vor dem separaten Renditeindex. |
| C14 | Asset-Aufteilung und Entwicklung fehlen | V02: Anteile, absolute Beträge und täglicher Klassenverlauf; V01: Budget-Konten, Wertpapiere, liquide Depotmittel und Schulden. |
| C15 | Portfolio-Buttons untereinander | Desktop: gruppierte Aktionen und dreispaltiges Verwaltungsraster; Zusammenhang bleibt beim zugehörigen Abschnitt. |
| C16 | Telearbeit / Fahrtkostenzuschuss fehlen | G03: beide als einzelne, mit Quellcode versehene Erstattungen. |
| C17 | Sonderzahlung fehlt unter Brutto | G03: getrenntes laufendes Brutto, Sonderzahlung und Bruttosumme. |
| C18 | Quellcode/Spaltennummer vor Bezeichnung | G03/G04: Code steht vor Lohnart bzw. wird als eigenes Zuordnungsfeld gezeigt. |
| C19 | Unbekannte Lohnart: neues Feld erstellen | G04: bestehendes Feld zuordnen oder neues Auswertungsfeld mit Bezeichnung, Code, Berechnungsgruppe und Gültigkeit definieren; Reportspalte auswählbar. Zielentwurf, kein neuer physischer DB-Spaltentyp. |
| C20 | Gehaltserwartung doppelt zum Datum | G03: ein Auszahlungsdatum; Erwartungszuordnung als eigener optionaler Abschnitt mit Betragsvergleich. |
| C21 | Abschluss-Buttons nebeneinander | G06: Gehaltsreport/Rückgängig nebeneinander; Bestätigung des Belegs bleibt vom Bankstatus getrennt. |
| C22 | Button-Wirrwarr im Plan | P01–P03: Monats-/Ansichtssteuerung, primäre bzw. Auswahlaktionen; seltene Aktionen in P24 mit drei Gruppen. Keine der übernommenen Funktionen wird durch Weglassen ersetzt. |
| C23 | Zieleingabe fehlt | P02: Zielbetrag, Rhythmus, Fälligkeit, Budgetklasse. P03: sichtbare Eingabe für ausgewählte Kategorien mit Vorschau und klarer Wirkung je Kategorie. |
| C24 | 3/5/10 Jahre und mehrjähriger Verlauf | R38/R39/R40 mit monatlicher synthetischer Historie, Jahresticks und Jahreswerten; R03 verlinkt die Ansichten. In der App hängt Verfügbarkeit von vorhandenen Belegen ab. |
| C25 | Jahresbrutto/-netto nebeneinander | R03 und R38–R40: beide Kennzahlen; 2026 ausdrücklich Jänner–Oktober, keine ungekennzeichnete Hochrechnung. |
| C26 | Titel Zahlungen und Abos | P08 in beiden Gerätevarianten umbenannt. |
| C27 | Aufteilung fehlt | F01/F04: Buchungszeile ergänzen, Kategorie-/Kontaktanteile, Restbetrag und Speichervoraussetzung. |
| C28 | Unklare Werteeingabe | F04: Wert und Einheit getrennt, 50 % → 60 € sichtbar, eigener Anteil als EUR-Eingabe. |
| C29 | Umbuchung zweispaltig mit Status am Konto | F03: Von/Nach nebeneinander am Desktop; eigener Haken je Seite; Bargeld bestätigt, Bank vorgemerkt. Gemeinsames Speichern/Rückgängig erklärt. |

## Rechenbeispiele und Grenzen

- Budget: 3.600 − 3.480 = 120 € noch zu verplanen. 200 € bereits zugewiesener Übertrag + 3.480 − 2.130 = 1.550 € in Kategorien verfügbar. Übertrag wird nicht nochmals als frei zu verteilender Eingang gezählt.
- Geldfluss: 900 + 280 + 950 = 2.130; 2.130 + 1.470 = 3.600 €.
- Vermögen: 4.820 + 18.600 + 3.230 = 26.650 €; minus 4.480 € Schulden = 22.170 € netto. Aktien 12.000 + Anleihen 6.600 = 18.600 €.
- Gehalt Oktober: 4.000 + 500 − 680 − 520 − 35 = 3.265 € Nettogehalt; 30 + 45 € Erstattungen ergeben 3.340 € Auszahlung. Die Abzüge sind synthetische Belegwerte, keine vorgetäuschte Steuerberechnung.
- Jahresgehalt 2026 bisher: 41.900 € brutto / 29.085 € netto für zehn Monate. Erstattungen sind nicht Teil des Jahresnettos. Vollständige historische Beispieljahre haben zwölf Monate; aktuelle Monate bleiben ausdrücklich unvollständig.
- Geteilte Ausgabe: 60 € eigener Anteil + 50 % von 120 € = 120 €; Rest 0 €.

## Prüfung und Übergabe

`source-manifest.json` und `prototype-manifest.json` enthalten die stabilen Zuordnungen; `verification.json` enthält die tatsächlich ausgeführten Figma-Prüfungen. Die JS-Dateien dokumentieren die angewandten nativen Änderungen, einschließlich gezielter Korrekturen nach Screenshotprüfung. Einzelne Dateien sind Werkzeuge mit expliziten Parametern, kein pauschaler Neuaufbau der Datei.

Visuell geprüft wurden Diagramme, Desktop-/Phone-Formulare, lange Checkbox-Beschriftungen und die quantitative Heatmap einschließlich Hell/Dunkel. Eine Strukturprüfung kontrolliert Textbreiten, Inhaltsgleichheit Quelle/Prototyp, feste Navigation, vorhandene Zielseiten und die Benchmark-/Gehaltszustände.

Die Figma-Anbindung bietet hier keinen Zugriff zum Lesen oder Schließen echter Kommentar-Threads. Deshalb sind die Screenshot-Kommentare dokumentiert und umgesetzt, aber native Kommentar-Threads nicht als automatisch erledigt ausgegeben.
