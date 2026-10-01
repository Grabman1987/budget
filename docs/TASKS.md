# Budget: Tasks und Fortschritt

Stand: 1. Oktober 2026. Diese Liste zeigt Implementierung, Prüfung und Integration
getrennt. Maßgeblich bleiben SPEC.md, ROADMAP.md und die tatsächlichen GitHub-Checks.
Echte Finanzdaten wurden nicht verarbeitet.

| Aufgabe | Status | Nachweis / nächster Schritt |
| --- | --- | --- |
| Cloud-Konfiguration und Netzwerk reparieren | Für Budget-Arbeit nutzbar | Bestehende Runtime weiter an `cecfgver_6abe3f2c576481a090a729b1ac0d545b` mit sieben Hosts; GitHub/Fly und gepinnter Chromium-Download erfolgreich; keine weitere Webseitenfreigabe für den bereitgestellten Skill-Katalog nötig |
| WIP und 28 Auditdokumente wiederherstellen | Erledigt | Archiv- und Manifesthashes, bytegleicher ursprünglicher Patch geprüft; neue Maschine berücksichtigt |
| A03 EUR-Kontenübersicht unabhängig prüfen | Gemergt | [PR #71](https://github.com/Grabman1987/budget/pull/71), Commit `49a2cf0`; Typecheck/Lint, 1.291 Tests, Produktionsbuild; 19 Browser-/Referenzchecks plus 7 Setup-/Restbetragschecks bestanden; acht viewportbedingte Skips |
| Vorbereitete Vorgänger als Draft-PRs erfassen | Erledigt | #71–#83 aus den verifizierten Branches angelegt; Integrationsnachweis siehe unten |
| Skillübersicht und diese Taskliste ergänzen | Gemergt | Nutzerbereitgestellter Katalog, SHA-256 `dfe7dd20…737071`, geprüft; vier lokale Profile angepasst, keine Upstream-Pakete installiert; [PR #84](https://github.com/Grabman1987/budget/pull/84) |
| Laufzeit- und Netzwerkdiagnose | Abgeschlossen | Bestehende Runtime weiterhin an derselben Quellversion mit sieben Hosts, letzter Status Spec-/Observed-Revision 11. GitHub/Fly nutzbar; bereitgestellter Skill-Katalog macht weitere Webseitenfreigaben unnötig. Alle 29 ursprünglichen Auditdateien und 16 Sicherungsartefakte erneut per SHA-256 bestätigt |
| A04 gespeicherte Gate-2-Kontosalden | Gemergt | Gemeinsamer Konto-Reader gegen Sollwerte; Off-Budget/geschlossen, fehlende Konten, Währung, Öffnungsdaten und Ein-Cent-Änderungen. Typecheck/Lint und 1.301 Tests in 132 Dateien grün; [PR #85](https://github.com/Grabman1987/budget/pull/85) |
| A02 historische FX-Kosten/Gebühren/Erträge | Gemergt | Historische Trade-/Snapshotkosten, aktuelle EUR-Bewertung, Gebühren/Erträge und typisierte fehlende Kurse; sieben unabhängige Sollfälle; Typecheck/Lint, 1.308 Tests und Build grün; [PR #86](https://github.com/Grabman1987/budget/pull/86) |
| Backup-Test unter Windows stabilisieren | Gemergt | Scheduler nutzt nur benötigte migrierte Tabellen; SQLite-Handles auch nach Assertions schließen, HTTP-Server vor Temp-Verzeichnisabbau abwarten. Keine Zeitlimits erhöht, alle Assertions erhalten; fünf gezielte Backup-Tests und vollständige 1.308 Tests grün; [PR #87](https://github.com/Grabman1987/budget/pull/87): alle vier CI-Prüfungen einschließlich Windows grün |
| A09 Gewinne und Einstandsmethode | Gemergt | [PR #88](https://github.com/Grabman1987/budget/pull/88): gleitender Durchschnitt als Standard, FIFO dauerhaft in Einstellungen › Depots & Kryptos wählbar; belegte Gewinne bleiben nach Verkauf und Snapshots erhalten. Fehlender Einstand: Kosten/unrealisierter Gewinn unbekannt; Vollständigkeitsflag für Verkaufsgewinn. Passende Bestandsaufnahmen bewahren bekannte Durchschnitts-/FIFO-Historie; echte Korrekturen bleiben Anker. Typecheck/Lint, 1.343 Tests und Build grün; fünf Browserchecks mit Desktop-/Handyaufnahmen. Brokersteuern werden nicht erneut berechnet |
| A10 mehrere Broker pro Wertpapier | Gemergt | [PR #89](https://github.com/Grabman1987/budget/pull/89): Depotinstitution bestimmt Plattformanteile und bestehende Crypto/P2P-Risikogrenzen; Wertpapier-/Klassenaggregation bleibt erhalten. Sechs unabhängige Sollfälle, Typecheck/Lint und alle 1.349 Tests in 139 Dateien und Produktionsbuild grün |
| Native FX-Kontodetails | Separat offen | Tabellen, Charts und Kontostandsabgleich konsistent beschriften; kein Teil der A03-Überblicksabnahme |
| PR-Stack integrieren | Auditkorrekturen integriert | Alle 19 Vorgänger einschließlich A10 nach jeweils frischer vollständiger Linux-/E2E-, Windows-, Docker- und Restore-CI gemergt. Versionsnachweis separat in #90; kein Umgehen von Schutzregeln |
| Image-Version direkt prüfen | Implementiert, lokal geprüft | [PR #90](https://github.com/Grabman1987/budget/pull/90): streng validierte Commit-ID in `/health`, Build-Arg aus geprüftem Checkout und Docker-Smoke mit exakter ID. Typecheck/Lint, alle 1.355 Tests und Produktionsbuild grün; lokaler Versions-/Readinesscheck bestanden. Frische PR-/Main-CI und Live-Nachweis werden für die Release-Abnahme separat geprüft |
| Produktion verifizieren | In Arbeit | Main-CI, tatsächlicher Fly-Deploy und `/health`-Revision müssen auf denselben Commit zeigen; übersprungener Deploy zählt nicht als Erfolg |
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
14. [#84 verifizierter Skill-Katalog](https://github.com/Grabman1987/budget/pull/84)
15. [#85 gespeicherte Gate-2-Kontosalden](https://github.com/Grabman1987/budget/pull/85)
16. [#86 historische FX-Bewertung](https://github.com/Grabman1987/budget/pull/86)
17. [#87 Backup-Testbereinigung](https://github.com/Grabman1987/budget/pull/87)
18. [#88 Gewinne und Einstandsmethode](https://github.com/Grabman1987/budget/pull/88)
19. [#89 Brokerzuordnung](https://github.com/Grabman1987/budget/pull/89)
20. [#90 Image-Version](https://github.com/Grabman1987/budget/pull/90)

## Arbeitsregeln

Ein Schreibagent pro Checkout, unabhängiges Review und eine Aufgabe pro PR.
Keine fehlerhafte CI umgehen und keine Screenshots aktualisieren, um Fehler zu
verbergen. Keine realen Exporte in Repository, Tests, Logs oder PRs.

Diese Liste bei abgeschlossenen Schritten oder konkreten Blockaden aktualisieren.
