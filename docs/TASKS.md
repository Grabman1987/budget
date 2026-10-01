# Budget: Tasks und Fortschritt

Stand: 1. Oktober 2026. Diese Liste zeigt Implementierung, Prüfung und Integration
getrennt. Maßgeblich bleiben SPEC.md, ROADMAP.md und die tatsächlichen GitHub-Checks.
Echte Finanzdaten wurden nicht verarbeitet.

| Aufgabe | Status | Nachweis / nächster Schritt |
| --- | --- | --- |
| Cloud-Konfiguration und Netzwerk reparieren | Erledigt | Veröffentlichte Version `cecfgver_6abe3f2c576481a090a729b1ac0d545b`; sieben Hosts, Policy enforced; GitHub/Fly und gepinnter Chromium-Download erfolgreich |
| WIP und 28 Auditdokumente wiederherstellen | Erledigt | Archiv- und Manifesthashes, bytegleicher ursprünglicher Patch geprüft; neue Maschine berücksichtigt |
| A03 EUR-Kontenübersicht unabhängig prüfen | Lokal abgenommen, Draft-PR | [PR #71](https://github.com/Grabman1987/budget/pull/71), Commit `49a2cf0`; Typecheck/Lint, 1.291 Tests, Produktionsbuild; 19 Browser-/Referenzchecks plus 7 Setup-/Restbetragschecks bestanden; acht viewportbedingte Skips |
| Vorbereitete Vorgänger als Draft-PRs erfassen | Erledigt | #72–#82, siehe Stack unten; noch keine Merges/Deployments |
| Skillübersicht und diese Taskliste ergänzen | In Arbeit | Vier relevante lokale Profile dokumentiert; plado und Dropbox liefern HTTP 403, zentraler Dropbox-Katalog unverändert |
| A04 gespeicherte Gate-2-Kontosalden | Analyse abgeschlossen, Implementierung offen | Reproduktion: Off-Budget-Darlehen +1 Cent bleibt unerkannt. Monatssalden, fehlende Konten, Währung und Öffnungsgrenzen prüfen |
| A02 historische FX-Kosten/Gebühren/Erträge | Offen | Unabhängige Sollfälle und konsistente historische Basiswährung |
| A09 Gewinne vollständig verkaufter Positionen | Offen | Vollverkauf, Teilverkauf und Wiederkauf |
| A10 mehrere Broker pro Wertpapier | Offen | Konten-/Institutionszuordnung in Aggregationen erhalten |
| Native FX-Kontodetails | Separat offen | Tabellen, Charts und Kontostandsabgleich konsistent beschriften; kein Teil der A03-Überblicksabnahme |
| PR-Stack integrieren | CI läuft | Nur in Reihenfolge, erfolgreiche vorgeschriebene Checks; Folge-PRs korrekt auf main ausrichten |
| Produktion verifizieren | Offen | Main-CI, tatsächlicher Fly-Deploy und laufender Commit; übersprungener Deploy zählt nicht als Erfolg |
| Private EUR-Migration / Gate 2 | Offen | Berechtigten Zugang zu privaten Exporten, Sicherung, Mapping und centgenaue Abnahme etablieren |
| PP-Migration / Gate 3 und Ablösung | Offen | Erst nach Investmentkorrekturen und nachgewiesenen Beständen/Renditen |

## PR-Stack in Integrationsreihenfolge

1. [#72 Statusdokumentation](https://github.com/Grabman1987/budget/pull/72)
2. [#73 Import-UI / CSV-Platzhalter](https://github.com/Grabman1987/budget/pull/73)
3. [#74 A07 exakte Beträge](https://github.com/Grabman1987/budget/pull/74)
4. [#75 A06 Einkommen](https://github.com/Grabman1987/budget/pull/75)
5. [#76 A01 Trade-Abrechnung](https://github.com/Grabman1987/budget/pull/76)
6. [#77 UI-Test-Isolation](https://github.com/Grabman1987/budget/pull/77)
7. [#78 A08 Kontowährung](https://github.com/Grabman1987/budget/pull/78)
8. [#79 A05 erwartete Zahlungen](https://github.com/Grabman1987/budget/pull/79)
9. [#80 A03 EUR-Budget-Sperre](https://github.com/Grabman1987/budget/pull/80)
10. [#81 Produkt-Inspirationen](https://github.com/Grabman1987/budget/pull/81)
11. [#82 lokale Skill-Profile](https://github.com/Grabman1987/budget/pull/82)
12. [#71 A03 EUR-Kontenübersicht](https://github.com/Grabman1987/budget/pull/71)

## Arbeitsregeln

Ein Schreibagent pro Checkout, unabhängiges Review und eine Aufgabe pro PR.
Keine fehlerhafte CI umgehen und keine Screenshots aktualisieren, um Fehler zu
verbergen. Keine realen Exporte in Repository, Tests, Logs oder PRs.

Diese Liste bei abgeschlossenen Schritten oder konkreten Blockaden aktualisieren.
