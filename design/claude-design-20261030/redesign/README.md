# Redesign

## Farbregel
Final for all redesign pages (Heute, Prüfen, Plan). Colour is never the only signal; every state also carries an icon.

| State | Colour | Icon |
|---|---|---|
| Fits / target met (also while money is still available within the target) | Blue | check |
| Still open / underfunded | Amber | partial pie |
| Overspent | Red | "!" (cash) or card (credit card) |
| More than the target assigned | Green | arrow up |
| 0 or paused | Grey | dash / "Zz" |

The lead figure "Zu verteilen" is green while money is available to assign. Red is reserved for "act now".

## Icons
Area icons as in the live app (apps/web/src/nav/areas.ts): Heute = Home, Plan = Table2, Konten = Landmark, Vermögen = TrendingUp, Reports = ChartColumn.

## Kopfzeile
Kein „FG“-Avatar und kein Seiten-⋯ auf Seiten außer Heute, es sei denn eine Seite hat eigene Aktionen. Einstellungen und Profil: Desktop über das Profil unten links in der Sidebar, Phone nur über den Avatar auf Heute. Siehe NOTIZEN-einstellungen.md.

## Weitere Notizen
- [NOTIZEN-einstellungen.md](NOTIZEN-einstellungen.md)

## Plan-Unterseiten (Desktop)
- [plan-jahr-v1.html](plan-jahr-v1.html)
- [plan-zahlungen-v1.html](plan-zahlungen-v1.html)
- [plan-ziele-v1.html](plan-ziele-v1.html)
- [plan-prognose-v1.html](plan-prognose-v1.html)

- [vermoegen-netto-v1.html](vermoegen-netto-v1.html) (überholt → [v3](vermoegen-v3.html) / Reports)
- [vermoegen-portfolio-v1.html](vermoegen-portfolio-v1.html) (überholt, ersetzt durch v2; v2 selbst überholt → v3 / Reports)
- [vermoegen-schulden-v1.html](vermoegen-schulden-v1.html) (überholt → [v3](vermoegen-v3.html) / Reports)
- [vermoegen-freiheit-v1.html](vermoegen-freiheit-v1.html) (überholt → Report 9 „Finanzielle Freiheit“)

- plan-monat-v1.html: überholt, ersetzt durch plan-monat-v2.html
- [reports-v1.html](reports-v1.html)
- [reports-v1.html](reports-v1.html)
- [einstellungen-v1.html](einstellungen-v1.html)
- [vermoegen-portfolio-v2.html](vermoegen-portfolio-v2.html) (überholt → [v3](vermoegen-v3.html) / Report 9, 11)

## Vermögen v3 (aktiv, Zyklus 36)
- [vermoegen-v3.html](vermoegen-v3.html) · [Positionen](vermoegen-v3-positionen.html) · [Sparpläne, Allokation, Schulden](vermoegen-v3-planen.html): Vermögen = Übersicht + Aktion. Seiten-Dropdown: Übersicht · Positionen · Sparpläne · Allokation · Schulden. Anlageart-Dropdown (Alle · Wertpapiere · Krypto · P2P) auf Positionen, Sparpläne, Allokation. Primäraktion „+ Investment“ (Wertpapier, Krypto, P2P-Konto, Handel, Sparplan, Wert aktualisieren).
- Regel: Führt ein Element jetzt zu einer Aktion → Vermögen. Nur Auswertung → Reports. Nur ein kompaktes Diagramm „Verlauf“ auf der Übersicht; keine Heatmaps und keine Kennzahlentabellen in Vermögen.
- Verschoben in Reports: Report 9 Darstellungen Verlauf, Schulden-Verlauf, Finanzielle Freiheit · Report 11 Wert und Rendite, Kennzahlen (inkl. Monatsrenditen-Heatmap), Anlageklassen im Verlauf · Report 12 Erträge · NEU Report 16 Kontakte („Wer schuldet wem wie viel?“; Stammdaten bleiben in Einstellungen). Der Tab Konten › Kontakte entfällt zugunsten von Report 16.
- Reports: alles auf einer Seite in [reports-v1.html](reports-v1.html) (Übersicht, Explorer, 16 Report-Zeilen, Zeilen werden beim Scrollen geladen). Die Dateien reports-v1-zeilen-1/2/3.html leiten dorthin weiter. Weitere Darstellungen: [reports-v1-auswertungen.html](reports-v1-auswertungen.html). Kopf aller Reports: Rechenkette plus Ergebnis rechts, keine ganzen Sätze.

## Reports v1 · Reihenfolge (Zyklus 42)
Berichte: 1 Monatsbericht · 2 Jahresbericht · 3 Zeitraumvergleich. Auswertungen: 4 Kontakte · 5 Auswertung. Portfolio: 6 Vermögensreport (vormals Vermögen und Portfolio) · 7 Depots im Vergleich · 8 Kosten, Steuern, Erträge. Einnahmen und Ausgaben: 9 Einnahmen und Cashflow · 10 Ausgabenanalyse · 11 Gehalt · 12 Geldfluss · 13 Sparquote und Geldalter · 14 Budgettreue · 15 Verträge und Kosten · 16 Persönliche Inflation. Alle Zeilen auf [reports-v1.html](reports-v1.html).
Vermögen v3: Zielallokation und Stufen werden in Einstellungen › Vermögen bearbeitet.
