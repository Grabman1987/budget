# Übergabe: Heute, drei Antwortkarten

Branch: `codex/heute-cards-1005`.

Neue Commits im verifizierten `heute-cards-1005.bundle`:

- `3446413a`: gemeinsame Cent-Quellen und synthetische Regressionstests.
- `37238e11`: drei kompakte Karten, Sparzielzeile und Browserprüfungen.
- `f5907d1a`: Produktentscheidung, Features und visuelle Evidenz.

Die ursprüngliche Worktree-Git-Verwaltung verweigert Schreibzugriffe. Die Commits liegen deshalb in einer separaten lokalen Git-Verwaltung und im Bundle. Push und Draft-PR sind nicht erfolgt: CLI-Anmeldung fehlgeschlagen; Connector-Schreiben mit „requires approval, but approval policy is never“ abgewiesen.

## Owner steps

1. Sobald die ursprüngliche Git-Verwaltung wieder beschreibbar ist, im Worktree die Bundle-Commits übernehmen. Vorher zusätzliche eigene Änderungen prüfen. Der gemischte Reset erhält die Arbeitsdateien; keinen Hard-Reset verwenden.

   ```sh
   git fetch ./heute-cards-1005.bundle refs/heads/codex/heute-cards-1005
   git reset --mixed FETCH_HEAD
   git log -3 --oneline
   ```

2. In einer funktionierenden Umgebung `npm run check` und `npm run build` grün abschließen. Der abgeschlossene lokale Unit-Lauf hatte 3.226 bestandene, sechs fehlgeschlagene und zwei bereits übersprungene Tests. Drei unveränderte Import-Testdateien scheiterten mit Windows-ENOMEM/SystemError und Timeouts; Details stehen in `docs/evidence/heute-cards-1005/README.md`.
3. GitHub-Anmeldung herstellen, `git push -u origin HEAD`, dann Draft-PR mit dem vorbereiteten Text unten erstellen. Nicht mergen.
4. Karten und Einzahlung/Markt-Aufteilung prüfen; Linux-Baselines und CI bestätigen. Keine Schlüssel, Provider-Consents oder Migrationen erforderlich.

## Vorbereiteter Draft-PR

Titel: `Heute: drei kompakte Antwortkarten mit gemeinsamen Cent-Quellen`

### Zusammenfassung

Heute beantwortet Nettovermögen, Monatsergebnis und Budget jeweils mit einer Zahl, einem proportionalen Balken und zwei Unterzeilen. Das Budget zeigt den Tagesmarker; darunter steht das nächste offene Sparziel. Bestehende Vermögen-, One-Pager-, Gesamtübersicht-, Pace- und Sparziel-Reads liefern die Zahlen. Auf dem Telefon sind die Karten gestapelt und höchstens 120 px hoch. Aufmerksamkeit, Pace, Kontoprognose und Vermögensverlauf bleiben erhalten.

Entfernte redundante Zonen: große Leitmaß-Zahl mit Frageüberschrift sowie aktuelle Vermögenszahl und Monatsdelta aus der früheren Gesamtvermögen-Zeile. Die Herleitung bleibt erreichbar.

Minimale gemeinsame Änderungen: One-Pager-Ergebnis-Read verfügbar machen, signierte Vermögenswerte im bestehenden Heute-Domainmodul aufteilen und den doppelten Leitmaß-Header im bestehenden Chart für Heute ausblenden. Keine neue Dependency. PRODUCT.md dokumentiert die Owner-Entscheidung 05.10.2026; FEATURES.md und ROADMAP.md sind aktualisiert.

Der Branch enthält erhaltene tägliche-Budget/Pace-Vorarbeiten und den Merge von origin/main einschließlich UX-2. Zwei frühere Linux-Mobile-Baselineänderungen stammen aus diesen Vorarbeiten. Für diese Karten wurden keine Baselines lokal regeneriert.

### Testplan

- Synthetische Cent-Gleichheit mit den vorhandenen Quellen; Monatsauswahl, Haushaltseinnahmen, Schulden und Sparziele: relevante 54 Tests bestanden.
- Sechs Browserprüfungen bestanden: neue Karten in beiden Themes, vorhandene Quellenlinks sowie UX-2-Reihenfolge auf Desktop und Telefon. Kartenhöhe, Überlauf und Accessibility geprüft.
- Lint, alle Workspace-Typprüfungen sowie Produktions- und E2E-Build bestanden.
- Offene lokale Prüfschranke: vollständiger Unit-Lauf, 340 Dateien bestanden / 3 fehlgeschlagen; 3.226 Tests bestanden / 6 fehlgeschlagen / 2 bestehende Skips. Windows-Importprozessfehler und Timeouts beheben bzw. in funktionierender Umgebung prüfen, bevor dieser Draft veröffentlicht wird.
- Betroffene Linux-Baselines: `shell-heute-light-desktop-linux.png`, `shell-heute-dark-desktop-linux.png`, `shell-heute-light-mobile-linux.png`, `shell-heute-dark-mobile-linux.png` unter `e2e/shell.spec.ts-snapshots/`. Auf gepinntem Linux prüfen.

### Owner steps

- Gemeinsame Cent-Quellen, mobile Darstellung und Einzahlung/Markt gegenüber sonstigen Vermögensbewegungen abnehmen.
- Vollständigen lokalen Check, Linux-Visuals und CI bestätigen; anschließend nach normalem Review mergen.
- Keine Provider-Schlüssel, Consents, Migrationen oder Deployment-Schritte für diese Änderung erforderlich.
