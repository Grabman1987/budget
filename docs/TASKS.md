# Budget: Tasks und Fortschritt

Stand: 1. Oktober 2026. Diese Liste zeigt Implementierung, Prüfung und Integration
getrennt. Maßgeblich bleiben SPEC.md, ROADMAP.md und die tatsächlichen GitHub-Checks.
Echte Finanzdaten wurden nicht verarbeitet.

| Aufgabe | Status | Nachweis / nächster Schritt |
| --- | --- | --- |
| Cloud-Konfiguration und Netzwerk reparieren | Für Budget-Arbeit nutzbar | Bestehende Runtime weiter an `cecfgver_6abe3f2c576481a090a729b1ac0d545b` mit sieben Hosts; GitHub/Fly und gepinnter Chromium-Download erfolgreich; keine weitere Webseitenfreigabe für den bereitgestellten Skill-Katalog nötig |
| WIP und 28 Auditdokumente wiederherstellen | Erledigt | Archiv- und Manifesthashes, bytegleicher ursprünglicher Patch geprüft; neue Maschine berücksichtigt |
| A03 EUR-Kontenübersicht unabhängig prüfen | Lokal abgenommen, Draft-PR | [PR #71](https://github.com/Grabman1987/budget/pull/71), Commit `49a2cf0`; Typecheck/Lint, 1.291 Tests, Produktionsbuild; 19 Browser-/Referenzchecks plus 7 Setup-/Restbetragschecks bestanden; acht viewportbedingte Skips |
| Vorbereitete Vorgänger als Draft-PRs erfassen | Erledigt | #71–#83, siehe Stack unten; #72 und #73 inzwischen gemergt |
| Skillübersicht und diese Taskliste ergänzen | Erledigt | Nutzerbereitgestellter Katalog, SHA-256 `dfe7dd20…737071`, geprüft; vier lokale Profile angepasst, keine Upstream-Pakete installiert |
| Laufzeit- und Netzwerkdiagnose | Abgeschlossen | Bestehende Runtime weiter mit sieben Hosts, Spec-/Observed-Revision 8; GitHub/Fly HTTP 200, Plado/direkter Dropboxlink CONNECT 403. Ursprünglicher WIP und alle 29 Auditdokumente vor Fortsetzung bytegleich geprüft; Sicherung außerhalb des Repos erhalten |
| A04 gespeicherte Gate-2-Kontosalden | Lokal unabhängig abgenommen | Gemeinsamer Konto-Reader gegen Sollwerte; Off-Budget/geschlossen, fehlende Konten, Währung, Öffnungsdaten und Ein-Cent-Änderungen. Typecheck/Lint und 1.301 Tests in 132 Dateien grün; PR/CI folgen |
| A02 historische FX-Kosten/Gebühren/Erträge | Offen | Unabhängige Sollfälle und konsistente historische Basiswährung |
| A09 Gewinne vollständig verkaufter Positionen | Offen | Vollverkauf, Teilverkauf und Wiederkauf |
| A10 mehrere Broker pro Wertpapier | Offen | Konten-/Institutionszuordnung in Aggregationen erhalten |
| Native FX-Kontodetails | Separat offen | Tabellen, Charts und Kontostandsabgleich konsistent beschriften; kein Teil der A03-Überblicksabnahme |
| PR-Stack integrieren | In Arbeit | #72/#73 gemergt; #74 regulär mit main aktualisiert, frische CI läuft. Windows-Fehler bei #78: BackupScheduler-Zeitlimit und SQLite-Cleanup; kein Umgehen. Auto-Merge im Repo deaktiviert; Integration erfolgt nach Prüfung |
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
13. [#83 Task- und Skillübersicht](https://github.com/Grabman1987/budget/pull/83)

## Arbeitsregeln

Ein Schreibagent pro Checkout, unabhängiges Review und eine Aufgabe pro PR.
Keine fehlerhafte CI umgehen und keine Screenshots aktualisieren, um Fehler zu
verbergen. Keine realen Exporte in Repository, Tests, Logs oder PRs.

Diese Liste bei abgeschlossenen Schritten oder konkreten Blockaden aktualisieren.
