## Zusammenfassung

Report 2.4 trennt „Warenkorb vs. VPI“ und „Kategorie-Explorer“. Mehrfachauswahl startet mit den Warenkorb-Kategorien; eigene Indexlinien ab Oktober 2023 werden je Kategorie mit dem zugeordneten VPI-Teilindex oder „Gesamt-VPI (kein Teilindex)“ verglichen. Zuordnungen bleiben in den Warenkorb-Einstellungen editierbar, unabhängig von der Preis-Methode.

Differenzen erscheinen neutral in Prozentpunkten. Buchungsdurchschnitte benennen Einkaufsmix und Anzahl-Effekte; der Mengenanteil bezieht sich ausdrücklich auf die Ausgabendifferenz zum VPI. Der feste Hinweis lässt die Interpretation beim Owner. Die bisherige Jahresbewertung „besser/schlechter“ entfällt.

Die bestehende VPI-Datenquelle und Verkettung pro Vertrag werden wiederverwendet. Minimale gemeinsame Änderung am Inflation-Read-Model: Preisreihen einmal für alle Kategorien aufbauen, danach den bisherigen Headline-Warenkorb auswählen. Keine neue Abhängigkeit, Migration oder automatische Buchung. Auf Part B gestapelt, ohne Rebase.

## Testplan

- Synthetische Domain-, API- und Komponententests für Basis, Teilindex/Fallback, pp-Differenz, Anzahl/Einheiten, parallele Verträge, fehlende Daten und festen Hinweis.
- Zwei neue Explorer-E2E plus bisherige Warenkorb-/VPI-Fälle: **8/8** auf Desktop 1440 und Mobil 390, Hell/Dunkel mit Axe und Overflow-Prüfung. Abschließend Explorer auf dem letzten Produktionsbuild nochmals **4/4** grün.
- `npm run check` genau einmal: alle Workspace-Typprüfungen und ESLint bestanden; Abbruch bei Prettier nach einer späten Änderung der E2E-Datei. Betroffene Format-/Lint-Prüfungen danach grün. Vollständige Unit-Suite: **331 Dateien / 3.121 Tests**, Exit 0; abschließende betroffene Regressionen **37/37**, einschließlich skalierter Einheiten. Web-/Domain-Typprüfungen erneut grün; Produktions- und E2E-Build grün.
- Review-Bilder: `docs/evidence/inflation-basket-b2-1005/`. Betroffene Bildflächen: Report 2.4 und Warenkorb-Einstellungen. Für diese Flächen gibt es keine versionierten Screenshot-Assertion-Baselines; bestehende Bilder sind Review-Belege. Keine Baseline lokal regeneriert.

## Owner steps

- Kategorien und COICOP-Zuordnungen unter Einstellungen › Warenkorb prüfen; Buchungsanzahl und Einkaufsmix selbst einordnen.
- Regulären lokalen Git-Index nach Lieferung mit `git reset --mixed HEAD` auffrischen: Git verweigert hier `index.lock`, deshalb wurde ein temporärer Index verwendet. Arbeitsdateien bleiben dabei erhalten.
- Keine Schlüssel, Bank-Einwilligungen oder Provider-Einrichtung erforderlich.

Offen: CI und Owner-Abnahme. Nicht gemergt.
