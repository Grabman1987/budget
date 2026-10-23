# Übergabeprompt: Budget-Backlog fortsetzen

Diesen gesamten Prompt einschließlich der verlinkten Bestandsunterlagen als Übergabe verwenden. Dokumentationsstand: 23.10.2026, Europe/Vienna. Er ist kein neuer Implementierungs-, Test- oder Live-Nachweis.

## 1. Dein Auftrag und deine Zuständigkeit

Du übernimmst die alleinige Koordination für **Grabman1987/budget**. Die lokale Codex CLI auf dem Rechner des Nutzers ist bei Bedarf Unterstützung. Frühere parallele Integrationszuständigkeiten anderer Chats sind durch die spätere ausdrückliche Zuweisung an den Hauptkoordinator überholt. Starte keine zweite Integration und behaupte keine Fernsteuerung fremder Chats oder des lokalen Terminals ohne tatsächlich vorhandene Werkzeuge.

Arbeite vorhandene Pakete weiter. Erhalte Branches, lokale Änderungen, Reviews, Freigaben und Nachweise. Implementiere vorhandene Funktionen nicht erneut. Nutze den aktuellen Checkout beziehungsweise vorhandene isolierte Worktrees; setze keinen Checkout ungeprüft zurück.

**Aktuelle Phase: Implementierung und unabhängiges Quelltextreview.**

- Keine Tests oder Teständerungen, Builds, Typprüfungen, Browser-/API-/Datenbankausführungen zur Validierung, CI-Starts, PR-Erstellungen, Merges, Deployments oder Queue-Loops.
- Normale Commits und Pushes auf den jeweiligen Arbeitsbranches sind erlaubt. Keine Force-Pushes. Keine Produktdaten, Geheimnisse, privaten PDFs oder vertraulichen Rohlogs in Git.
- #719 bleibt STOP. Keine STOP-Datei entfernen und keine gestoppte Aktion unter anderem Namen erneut ausführen.
- Keine Issues schließen oder Boardeinträge auf Live setzen. Quelltextreview ersetzt keine Laufzeitprüfung und keinen nachgewiesenen Deploy.
- Alle neuen Pakete bleiben **NICHT VALIDIERT / NICHT LIVE**. Frühere gültige Prüfnachweise behalten ihre genaue Revision und Reichweite.
- Erhalte Integer-Cent-Regeln, finanzielle Semantik, Sicherheit, Sperren, Audit, Idempotenz und Undo. Keine zusätzliche Rundungs-, Match-, Buchungs- oder Anlagepolitik erfinden.
- Die ausdrücklichen Nutzeranweisungen dieser Phase haben Vorrang vor älteren Repository-Aufforderungen, Tests, PRs oder Auslieferung auszuführen. Ändere die Regeln deswegen nicht stillschweigend.

Delegiere ressourcenbewusst: Luna für kleine Änderungen und Bestandsaufnahmen, Sol für gewöhnliche UI/API-Arbeit, stärkere Modelle gezielt für komplexe Finanzlogik und unabhängige Reviews. Nur tatsächlich verfügbare Modelle verwenden. Ein Autor pro betroffener Datei beziehungsweise kritischem Bereich; eigene abgegrenzte Aufträge und nur nötigen Kontext übergeben. Der Autor prüft nicht seinen eigenen Diff unabhängig. Keine Agents nur zur Auslastung starten und keine mehrfachen identischen Inventuren.

Ein einzelner Blocker hält unabhängige Arbeit nicht auf. Die Phase endet, wenn mögliche Implementierungen gesichert und verbleibende Aufgaben einzeln konkret dokumentiert sind. Wenn weiterhin nur bereits dokumentierte externe Blocker bestehen, keine Scheinarbeit oder Wiederholungsschleife starten.

## 2. Einstieg und maßgebliche Links

- Repository: https://github.com/Grabman1987/budget
- Issues: https://github.com/Grabman1987/budget/issues
- Persönliches Projektboard: https://github.com/users/Grabman1987/projects/1
- App: https://budget-fg.fly.dev/
- Health: https://budget-fg.fly.dev/health
- Prüfen-Seite: https://budget-fg.fly.dev/konten/pruefen?von=%2F
- Zentrale Übergabe-Branch: https://github.com/Grabman1987/budget/tree/codex/handoff-cloud-environment-20261022
- Vor diesem Prompt vollständig gepushter Koordinations-Checkpoint: https://github.com/Grabman1987/budget/commit/ee9f64ce73d7375556432069bddab8bab6ccbc07

Lies zuerst die unveränderlichen Bestandsunterlagen an diesem Checkpoint:

1. [SOURCE-PROGRESS-LATEST.md](https://github.com/Grabman1987/budget/blob/ee9f64ce73d7375556432069bddab8bab6ccbc07/docs/handoff/cloud-environment-20261022/SOURCE-PROGRESS-LATEST.md): gesicherte Umsetzung und exakte Branchstände.
2. [checkpoints.json](https://github.com/Grabman1987/budget/blob/ee9f64ce73d7375556432069bddab8bab6ccbc07/docs/handoff/cloud-environment-20261022/checkpoints.json): maschinenlesbares Manifest der 37 Source-Branches.
3. [SOURCE-REVIEW-COVERAGE.md](https://github.com/Grabman1987/budget/blob/ee9f64ce73d7375556432069bddab8bab6ccbc07/docs/handoff/cloud-environment-20261022/SOURCE-REVIEW-COVERAGE.md): geprüfte Produktrevision, Reviewumfang, spätere Dokumentationsrevision und Einschränkungen getrennt.
4. [PHASE-RESIDUALS.md](https://github.com/Grabman1987/budget/blob/ee9f64ce73d7375556432069bddab8bab6ccbc07/docs/handoff/cloud-environment-20261022/PHASE-RESIDUALS.md): konkrete Blocker und nachgelagerte Phasen.
5. [remaining-open-reconciliation.md](https://github.com/Grabman1987/budget/blob/ee9f64ce73d7375556432069bddab8bab6ccbc07/docs/handoff/cloud-environment-20261022/remaining-open-reconciliation.md): alle 32 offenen Issues ohne direkten Manifestverweis eingeordnet.

Danach die aktuellen Repository-Regeln und nur die zum Paket passenden Skills lesen:

- https://github.com/Grabman1987/budget/blob/main/AGENTS.md
- https://github.com/Grabman1987/budget/blob/main/CLAUDE.md
- https://github.com/Grabman1987/budget/blob/main/SPEC.md
- https://github.com/Grabman1987/budget/blob/main/docs/queue/README.md
- https://github.com/Grabman1987/budget/blob/main/docs/skills.md
- https://github.com/Grabman1987/budget/blob/main/.agents/skills/budget-ponytail/SKILL.md
- https://github.com/Grabman1987/budget/blob/main/DESIGN.md
- https://github.com/Grabman1987/budget/blob/main/docs/ROADMAP.md

Historische Dateien `CURRENT-COORDINATION.md`, `source-gap-inventory.md` und `backlog-coverage-latest.md` enthalten überholte Zwischenstände. Ihre späteren Korrekturhinweise und die fünf aktuellen Unterlagen oben gehen vor. Insbesondere #727, #520 und #762 nicht aufgrund alter Gap-Listen erneut von vorn implementieren.

## 3. Tatsächlich erreichter Stand

Letzter dokumentierter GitHub-Abruf: **23.10.2026, 01:22:59 Uhr Europe/Vienna**. Ergebnis: **94 offene Repository-Issues**, davon **62 mit direkten Verweisen** in den **37 Source-Branch-Checkpoints**. Das ist weder die Zahl offener Boardeinträge noch eine Aussage, dass 62 Tickets abgeschlossen sind. Das Issue-Set war gegenüber der vorangehenden Inventur unverändert.

Alle 37 Source-Worktrees waren bei der abschließenden Bestandsprüfung ohne ungesicherte Änderungen. Der danach fertiggestellte Settings-Fix wurde ebenfalls normal committed, gepusht und mit sauberem Worktree übergeben. Die Koordinations-Branch war am Checkpoint `ee9f64ce73d7375556432069bddab8bab6ccbc07` sauber. Andere Worktrees wurden erhalten, nicht bereinigt. Zuletzt liefen keine Subagents oder Tests mehr im Hintergrund. Alte Agentnamen sind kein Beleg laufender Arbeit.

Die unten genannten Pakete sind Code- und Dokumentationsstände. Teilweise liegen mehrere Pakete auf unterschiedlichen Basen oder enthalten frühere Pakete. **Nicht alle Branches unabhängig vollständig cherry-picken oder zusammenführen.** Vor späterer Integration Abstammung, Abhängigkeiten und überlappende Dateien prüfen.

### Zuletzt fertiggestellte konkrete Änderungen

- **#520 Wertpapierüberträge:** historische Lot-/Kostenbasisprojektion, Restcent-Regel, Paarpersistenz, Berichtsprojektionen, atomarer Writer, gruppiertes Undo/Redo, strikte authentifizierte Apply-API und explizite Bestätigung in der UI. Unklares Speicherergebnis behält den Idempotenzschlüssel auch nach späterem 4xx; ein offener Verwerfen-Dialog umgeht die Unsicherheitssperre nicht mehr. Datierte native Änderungen werden nicht durch einen nur für neue Transfers bestimmten Eröffnungsprüfer blockiert. Produktkorrektur `d52d3cbd37d2052f9d096f7e86057c5c1a474f23`, Dokumentationshead `ed1ad3a2722266d8cc1b4b6ee0256d0393c4cf08`; die vier letzten Reviewbefunde sind quelltextbezogen geschlossen. Migration und Laufzeit ungetestet.
- **#762 Strategie:** monatliche Einmalauswertung, auditierter Entscheidungsstand, Vorschau/Rebalancing-Vorschlag und Zuordnung tatsächlich erfasster Trades samt Statuslebenszyklus. Exakte Bewertungsfakten sind im Vorschlags-Revisionsschlüssel gebunden; gerundete gleiche Centbeträge verdecken keine Änderungen der zugrunde liegenden Kurse/Stückzahlen. Produkt `8f1475709f50b706dbcba9e12c91deefc2579cc4`, Dokumentationshead `4b403b8623167a8298c1a83528f3d25c963fedd6`. Reale Datenversorgung und zeitgesteuerter Aufruf fehlen weiterhin. Keine Brokerorders.
- **#485/#486 Einstellungen:** Navigation/Abschnitte, Autosave, dauerhafte Beobachtung der letzten abgeschlossenen CSV-Serverantwort und Rückmeldung bei Marktaktualisierungsfehlern. Letzter Fix lädt das CSS direkt mit `DisplayPreferences`, damit direkte Aufrufe von Darstellung die vorgesehenen Regeln erhalten. Produkt `79d9f35a4e87ab12f472a54035fac630b6f6888e`, Dokumentationshead `ad331cb8a30c8da1ecd1edbe58144962a99353cf`; enger unabhängiger Review abgeschlossen. Theme-/Privacy-/Undo-Logik unverändert.
- **#469:** verständliche Beschriftungen und Glossar. Negatives „Zu verteilen“ wird nicht mehr fälschlich ausschließlich mit zu hohen Zuweisungen erklärt. Produkt `47377c904544f3302cb55ddfc4b93b460eca2367`, unabhängig nachgeprüft.
- **#516:** nachvollziehbare, nur lesende Importerklärungen. Generische Importzeilen werden nicht unbelegt als YNAB bezeichnet; veraltete Erklärungsergebnisse werden während Neuladen/nach Fehler nicht als aktuell gezeigt. Produkt `e7f2b743ffba61be845f5ae7b9ca2defe7ea3f76`, unabhängig nachgeprüft. Matcher unverändert.
- **#519:** Fremdwährungsbuchungen mit Originalbeträgen und separat erklärtem Kurs-/Ausführungseffekt. Wiederholungsanlage für verbundene FX-Gebühren abgesichert; exakt geprüfte Korrektur `d6cb8e1c0555196c5dcdefa01784f621a4a0d521`.
- **#574/Offline:** bereits unbekanntes Zustellergebnis bleibt nach abgelehntem Folgeversuch unbekannt; Betragstext-Maskierung korrigiert. Port in die Kontakt-/Offline-Zusammenstellung bei `ed6a393c3dc67c68d8620bd9b39dd475aa6a9f1b` unabhängig geprüft. Das ist kein Laufzeitnachweis für die gesamte Zusammenstellung.
- **#727:** dokumentarische Neubewertung einer bereits repräsentierten Gutschrift und Korrektur des Refresh-/Undo-Ablaufs als separates Source-Paket gesichert; finale Produktkorrektur `4d130943456665c824d7b1cca15efe0218b00678`.
- Weitere Pakete: Portfolio/Charts, Plan, Heute/Monatsabschluss, Offline-Belege, Schulden, Reports, Kontoregister, Jahresansicht, Gehaltsvorschau, Kontakte, Zahlungen, Abgleich, Posteingang, Ziele, Icons, Typografie, mobile Buchungserfassung, Vermögenszusammensetzung und Tabellen. Umfang und Reviewgrenzen stehen in der folgenden Bestandsliste und in der Reviewmatrix; die Liste ist keine Behauptung vollständiger Akzeptanz aller Kriterien.

## 4. Alle 37 gesicherten Source-Branches

Die vollständige SHA bezeichnet den übergebenen Branch-Head, häufig einen Dokumentationscommit nach dem geprüften Produktcommit. Links sind unveränderlich auf diesen Commit oder dessen Baum gerichtet. Aktuelle Remote-Branches vor Änderungen erneut vergleichen, Abweichungen erhalten und untersuchen.

| Tickets | Implementierter Bereich / Einordnung | Remote-Branch | Vollständiger gesicherter Commit |
|---|---|---|---|
| [544](https://github.com/Grabman1987/budget/issues/544), [546](https://github.com/Grabman1987/budget/issues/546), [547](https://github.com/Grabman1987/budget/issues/547), [548](https://github.com/Grabman1987/budget/issues/548) | Portfolio, Renditen und Charts | [codex/impl-544-548-portfolio](https://github.com/Grabman1987/budget/tree/codex/impl-544-548-portfolio) | [17ecb6e320b169c7cfab402dcff042e67398ef84](https://github.com/Grabman1987/budget/commit/17ecb6e320b169c7cfab402dcff042e67398ef84) |
| [591](https://github.com/Grabman1987/budget/issues/591), [592](https://github.com/Grabman1987/budget/issues/592), [593](https://github.com/Grabman1987/budget/issues/593) | Plan-Monatsübersicht und Seitenliste | [codex/impl-591-593-plan](https://github.com/Grabman1987/budget/tree/codex/impl-591-593-plan) | [12dc0565e9b43b913b49214b9005d427f5ec56ce](https://github.com/Grabman1987/budget/commit/12dc0565e9b43b913b49214b9005d427f5ec56ce) |
| [572](https://github.com/Grabman1987/budget/issues/572), [573](https://github.com/Grabman1987/budget/issues/573), [574](https://github.com/Grabman1987/budget/issues/574), [575](https://github.com/Grabman1987/budget/issues/575), [600](https://github.com/Grabman1987/budget/issues/600), [601](https://github.com/Grabman1987/budget/issues/601), [602](https://github.com/Grabman1987/budget/issues/602), [603](https://github.com/Grabman1987/budget/issues/603) | Heute, Aufgaben und Monatsabschluss | [codex/impl-heute-month-close](https://github.com/Grabman1987/budget/tree/codex/impl-heute-month-close) | [496b4e029585a2ddf2120442060244a14edc58e0](https://github.com/Grabman1987/budget/commit/496b4e029585a2ddf2120442060244a14edc58e0) |
| [558](https://github.com/Grabman1987/budget/issues/558), [559](https://github.com/Grabman1987/budget/issues/559), [699](https://github.com/Grabman1987/budget/issues/699), [700](https://github.com/Grabman1987/budget/issues/700) | Offline-Buchungen, echte Belegdateien und Zustell-Retry | [codex/impl-offline-558-700](https://github.com/Grabman1987/budget/tree/codex/impl-offline-558-700) | [0475743d467e4ebcdc1b489bb5d5054c360dd78d](https://github.com/Grabman1987/budget/commit/0475743d467e4ebcdc1b489bb5d5054c360dd78d) |
| [611](https://github.com/Grabman1987/budget/issues/611), [612](https://github.com/Grabman1987/budget/issues/612) | Schuldenansichten und Währungsabgrenzung | [codex/impl-611-612-debt](https://github.com/Grabman1987/budget/tree/codex/impl-611-612-debt) | [a395db8c9f4990846bc3a3ec65db071d1c0e616c](https://github.com/Grabman1987/budget/commit/a395db8c9f4990846bc3a3ec65db071d1c0e616c) |
| [553](https://github.com/Grabman1987/budget/issues/553), [554](https://github.com/Grabman1987/budget/issues/554), [619](https://github.com/Grabman1987/budget/issues/619), [620](https://github.com/Grabman1987/budget/issues/620), [621](https://github.com/Grabman1987/budget/issues/621), [622](https://github.com/Grabman1987/budget/issues/622), [623](https://github.com/Grabman1987/budget/issues/623), [628](https://github.com/Grabman1987/budget/issues/628) | Reports, Detailansichten, Export-/Druckdarstellung | [codex/impl-619-623-reports](https://github.com/Grabman1987/budget/tree/codex/impl-619-623-reports) | [4c6827344f9853787c64bdf117f10e5cc9617653](https://github.com/Grabman1987/budget/commit/4c6827344f9853787c64bdf117f10e5cc9617653) |
| [515](https://github.com/Grabman1987/budget/issues/515), [594](https://github.com/Grabman1987/budget/issues/594), [596](https://github.com/Grabman1987/budget/issues/596), [597](https://github.com/Grabman1987/budget/issues/597) | Kontoregister und Buchungsdarstellung | [codex/impl-594-597-ledger](https://github.com/Grabman1987/budget/tree/codex/impl-594-597-ledger) | [f140d6ac8086f3902887f8d68660bc1a5f1bbde0](https://github.com/Grabman1987/budget/commit/f140d6ac8086f3902887f8d68660bc1a5f1bbde0) |
| [608](https://github.com/Grabman1987/budget/issues/608) | Jahresansicht und unabhängige Ereignis-Fehlerzustände | [codex/backlog-608-year-delivery](https://github.com/Grabman1987/budget/tree/codex/backlog-608-year-delivery) | [6b2892ad22dfdd1e44da4184b8dad20ab54c1e4d](https://github.com/Grabman1987/budget/commit/6b2892ad22dfdd1e44da4184b8dad20ab54c1e4d) |
| [469](https://github.com/Grabman1987/budget/issues/469), [471](https://github.com/Grabman1987/budget/issues/471), [486](https://github.com/Grabman1987/budget/issues/486) | Historischer kombinierter Settings-Stand; Nachfolger verwenden | [codex/impl-settings-469-486](https://github.com/Grabman1987/budget/tree/codex/impl-settings-469-486) | [09312b49e578db493bfe279133d30260c5e2ed44](https://github.com/Grabman1987/budget/commit/09312b49e578db493bfe279133d30260c5e2ed44) |
| [609](https://github.com/Grabman1987/budget/issues/609) | Gehaltsvorschau | [codex/impl-609-payslip-preview](https://github.com/Grabman1987/budget/tree/codex/impl-609-payslip-preview) | [813854c29ec095f47179f928fa43b5beb1b8679b](https://github.com/Grabman1987/budget/commit/813854c29ec095f47179f928fa43b5beb1b8679b) |
| [599](https://github.com/Grabman1987/budget/issues/599) | Kontakte, Tabellen und Buchungsnavigation | [codex/impl-599-contacts](https://github.com/Grabman1987/budget/tree/codex/impl-599-contacts) | [9fd8c9555f52fa07e0d2015acbc32b67bf8c187b](https://github.com/Grabman1987/budget/commit/9fd8c9555f52fa07e0d2015acbc32b67bf8c187b) |
| [518](https://github.com/Grabman1987/budget/issues/518), [521](https://github.com/Grabman1987/budget/issues/521) | Erklärungen zu Liquidität/Allokation und Detailverweise | [codex/impl-518-521-explanations](https://github.com/Grabman1987/budget/tree/codex/impl-518-521-explanations) | [dfa0eafd0491157baca29b7e5678b8d0bc3e0ca1](https://github.com/Grabman1987/budget/commit/dfa0eafd0491157baca29b7e5678b8d0bc3e0ca1) |
| [607](https://github.com/Grabman1987/budget/issues/607) | Zahlungen und Revisionsschutz beim Löschen | [codex/impl-607-payments](https://github.com/Grabman1987/budget/tree/codex/impl-607-payments) | [8325561b7a1a6e47ef0ef67d27d0959d9f7c5b84](https://github.com/Grabman1987/budget/commit/8325561b7a1a6e47ef0ef67d27d0959d9f7c5b84) |
| [564](https://github.com/Grabman1987/budget/issues/564), [565](https://github.com/Grabman1987/budget/issues/565) | Kontoprüfung/Abgleich, Revisionskonflikte und Privatsphäre | [codex/impl-564-565-reconcile](https://github.com/Grabman1987/budget/tree/codex/impl-564-565-reconcile) | [7d24f141e309af1cd531d898befaf0b6bf6b2329](https://github.com/Grabman1987/budget/commit/7d24f141e309af1cd531d898befaf0b6bf6b2329) |
| [562](https://github.com/Grabman1987/budget/issues/562), [563](https://github.com/Grabman1987/budget/issues/563) | Posteingang/Bankprüfung und bestätigter Save versus Refresh | [codex/impl-562-563-inbox](https://github.com/Grabman1987/budget/tree/codex/impl-562-563-inbox) | [f830a1d0b17ed6cedb8e9fed871d7d31b7145192](https://github.com/Grabman1987/budget/commit/f830a1d0b17ed6cedb8e9fed871d7d31b7145192) |
| [485](https://github.com/Grabman1987/budget/issues/485), [486](https://github.com/Grabman1987/budget/issues/486) | Einstellungsnavigation, Exportbeobachtung, Darstellung-CSS | [codex/impl-485-486-settings-navigation](https://github.com/Grabman1987/budget/tree/codex/impl-485-486-settings-navigation) | [ad331cb8a30c8da1ecd1edbe58144962a99353cf](https://github.com/Grabman1987/budget/commit/ad331cb8a30c8da1ecd1edbe58144962a99353cf) |
| [514](https://github.com/Grabman1987/budget/issues/514) | Ziele und bestätigter Save versus Refresh | [codex/impl-514-targets](https://github.com/Grabman1987/budget/tree/codex/impl-514-targets) | [4e4a938ee7cca6adeffc35849991a8abb3c4afc3](https://github.com/Grabman1987/budget/commit/4e4a938ee7cca6adeffc35849991a8abb3c4afc3) |
| [519](https://github.com/Grabman1987/budget/issues/519) | Historische FX-Vorbereitung; Posting-Branch ist kanonisch | [codex/impl-519-fx-transfers](https://github.com/Grabman1987/budget/tree/codex/impl-519-fx-transfers) | [8b37818bf1c3160638b9909c8ad7feaf7af7c93b](https://github.com/Grabman1987/budget/commit/8b37818bf1c3160638b9909c8ad7feaf7af7c93b) |
| [520](https://github.com/Grabman1987/budget/issues/520) | Wertpapiertransfer-Reader, Restcent-Split und Preview-Vorstufe | [codex/impl-520-security-transfers](https://github.com/Grabman1987/budget/tree/codex/impl-520-security-transfers) | [2de7fa9611e7a37683edabdaf8ba075c7c26b944](https://github.com/Grabman1987/budget/commit/2de7fa9611e7a37683edabdaf8ba075c7c26b944) |
| [471](https://github.com/Grabman1987/budget/issues/471) | Icons, Formen und Abkürzungen | [codex/impl-471-icons](https://github.com/Grabman1987/budget/tree/codex/impl-471-icons) | [178c80b15a8e1e6e66115c2635d8992bb703d662](https://github.com/Grabman1987/budget/commit/178c80b15a8e1e6e66115c2635d8992bb703d662) |
| [469](https://github.com/Grabman1987/budget/issues/469) | Verständliche UI-Beschriftungen | [codex/impl-469-copy](https://github.com/Grabman1987/budget/tree/codex/impl-469-copy) | [65aee06ce8b5ae970a6b2bcb11b2ef652cddb132](https://github.com/Grabman1987/budget/commit/65aee06ce8b5ae970a6b2bcb11b2ef652cddb132) |
| [489](https://github.com/Grabman1987/budget/issues/489) | Übersichtsdesign; Produktionsflag weiterhin aus | [codex/impl-489-overview-design](https://github.com/Grabman1987/budget/tree/codex/impl-489-overview-design) | [9fab18bbb2a9b54b17bbc2e2ef06206212c18b5a](https://github.com/Grabman1987/budget/commit/9fab18bbb2a9b54b17bbc2e2ef06206212c18b5a) |
| [516](https://github.com/Grabman1987/budget/issues/516) | Nur lesende Importerklärungen, Herkunft und Aktualität | [codex/impl-516-import-explanations](https://github.com/Grabman1987/budget/tree/codex/impl-516-import-explanations) | [8f3cd1266370bf0aadf4a03d2d88c740d19fde71](https://github.com/Grabman1987/budget/commit/8f3cd1266370bf0aadf4a03d2d88c740d19fde71) |
| [469](https://github.com/Grabman1987/budget/issues/469) | Glossar-/Zieltexte, negative Budgetverfügbarkeit erklärt | [codex/impl-469-glossary-goals](https://github.com/Grabman1987/budget/tree/codex/impl-469-glossary-goals) | [142aca8077cc2a80c455e9c1e78ef22b89e127b7](https://github.com/Grabman1987/budget/commit/142aca8077cc2a80c455e9c1e78ef22b89e127b7) |
| [473](https://github.com/Grabman1987/budget/issues/473) | Typografie und Sankey-Rollen | [codex/impl-473-typography](https://github.com/Grabman1987/budget/tree/codex/impl-473-typography) | [9ef01d05ade1a6f5ac3a2ac99dd5e8275888107c](https://github.com/Grabman1987/budget/commit/9ef01d05ade1a6f5ac3a2ac99dd5e8275888107c) |
| [519](https://github.com/Grabman1987/budget/issues/519) | Explizite FX-Buchungen und Schutz verbundener Gebühren | [codex/impl-519-fx-posting](https://github.com/Grabman1987/budget/tree/codex/impl-519-fx-posting) | [d6cb8e1c0555196c5dcdefa01784f621a4a0d521](https://github.com/Grabman1987/budget/commit/d6cb8e1c0555196c5dcdefa01784f621a4a0d521) |
| [762](https://github.com/Grabman1987/budget/issues/762) | Strategievorschau, Monatsentscheidungen und Rebalancing-Lebenszyklus | [codex/impl-762-strategy](https://github.com/Grabman1987/budget/tree/codex/impl-762-strategy) | [4b403b8623167a8298c1a83528f3d25c963fedd6](https://github.com/Grabman1987/budget/commit/4b403b8623167a8298c1a83528f3d25c963fedd6) |
| [586](https://github.com/Grabman1987/budget/issues/586) | Mobile Buchungserfassung; Geräteabnahme noch offen | [codex/backlog-586-mobile-capture](https://github.com/Grabman1987/budget/tree/codex/backlog-586-mobile-capture) | [df13e773cf355ec5ea082c7316b05df0b340c517](https://github.com/Grabman1987/budget/commit/df13e773cf355ec5ea082c7316b05df0b340c517) |
| [550](https://github.com/Grabman1987/budget/issues/550), [551](https://github.com/Grabman1987/budget/issues/551) | Vermögenszusammensetzung und Entwicklung | [codex/backlog-550-551-composition](https://github.com/Grabman1987/budget/tree/codex/backlog-550-551-composition) | [ecfdcef53317815c0363e0b1c67ca83bd95cd1b2](https://github.com/Grabman1987/budget/commit/ecfdcef53317815c0363e0b1c67ca83bd95cd1b2) |
| [470](https://github.com/Grabman1987/budget/issues/470) | Lesbarkeit und Gruppierung von Tabellen | [codex/impl-470-table-readability](https://github.com/Grabman1987/budget/tree/codex/impl-470-table-readability) | [28b2b2784e63e7674ea9a9bd9a5b4ec4c3a53340](https://github.com/Grabman1987/budget/commit/28b2b2784e63e7674ea9a9bd9a5b4ec4c3a53340) |
| [474](https://github.com/Grabman1987/budget/issues/474) | Designlinien, begrenzter UI-Diff | [codex/impl-474-design-lines](https://github.com/Grabman1987/budget/tree/codex/impl-474-design-lines) | [ced6c7805f1d74541084a1835b1f154de76a3dec](https://github.com/Grabman1987/budget/commit/ced6c7805f1d74541084a1835b1f154de76a3dec) |
| [574](https://github.com/Grabman1987/budget/issues/574), [599](https://github.com/Grabman1987/budget/issues/599), [558](https://github.com/Grabman1987/budget/issues/558), [559](https://github.com/Grabman1987/budget/issues/559), [699](https://github.com/Grabman1987/budget/issues/699), [700](https://github.com/Grabman1987/budget/issues/700) | Zusammenstellung von Heute/Kontakten/Offline-Quelländerungen | [codex/impl-574-offline-contact-assembly](https://github.com/Grabman1987/budget/tree/codex/impl-574-offline-contact-assembly) | [798b7715e7703aec8f5a9c755cbbe239f9f06e12](https://github.com/Grabman1987/budget/commit/798b7715e7703aec8f5a9c755cbbe239f9f06e12) |
| [488](https://github.com/Grabman1987/budget/issues/488) | Report-Antworten zuerst, Details ein-/ausklappbar | [codex/impl-488-answer-first](https://github.com/Grabman1987/budget/tree/codex/impl-488-answer-first) | [fa0c22083299aa2520e18a365c0ac7d22b10538a](https://github.com/Grabman1987/budget/commit/fa0c22083299aa2520e18a365c0ac7d22b10538a) |
| [487](https://github.com/Grabman1987/budget/issues/487) | Portfolio-Report und Druckkorrektur | [codex/impl-487-portfolio-report](https://github.com/Grabman1987/budget/tree/codex/impl-487-portfolio-report) | [8ba342d00b995d8611af87e968ce159f54375382](https://github.com/Grabman1987/budget/commit/8ba342d00b995d8611af87e968ce159f54375382) |
| [486](https://github.com/Grabman1987/budget/issues/486) | Dauerhafte manuelle Scan-Koordination | [codex/impl-486-manual-scan](https://github.com/Grabman1987/budget/tree/codex/impl-486-manual-scan) | [ff620377e9f6905a3fa48f2464e1339269d4ea35](https://github.com/Grabman1987/budget/commit/ff620377e9f6905a3fa48f2464e1339269d4ea35) |
| [727](https://github.com/Grabman1987/budget/issues/727) | Abrechnungs-/Gutschrift-Neubewertung und Undo-Refresh | [codex/impl-727-source-reassessment](https://github.com/Grabman1987/budget/tree/codex/impl-727-source-reassessment) | [a6edf91a8bdd8e072c726acac7fafb6d44b5f0c6](https://github.com/Grabman1987/budget/commit/a6edf91a8bdd8e072c726acac7fafb6d44b5f0c6) |
| [520](https://github.com/Grabman1987/budget/issues/520) | Wertpapiertransfer-Persistenz, Writer/Undo und Apply-API/UI | [codex/impl-520-transfer-persistence](https://github.com/Grabman1987/budget/tree/codex/impl-520-transfer-persistence) | [ed1ad3a2722266d8cc1b4b6ee0256d0393c4cf08](https://github.com/Grabman1987/budget/commit/ed1ad3a2722266d8cc1b4b6ee0256d0393c4cf08) |

## 5. Abhängigkeiten und Integrationsfallen

- **#520 kanonischer Weiterentwicklungsstand:** `codex/impl-520-transfer-persistence`. Der frühere Reader-/Split-/Preview-Branch `codex/impl-520-security-transfers` bleibt Nachweis und Vorstufe, keine zweite unabhängige Implementation.
- **#519 kanonischer Stand:** `codex/impl-519-fx-posting`. `codex/impl-519-fx-transfers` ist historische Vorbereitung. Alte Hinweise auf fehlende Entscheidungen sind dort überholt.
- **Alte kombinierte Settings-Branch:** alle sieben Produktpfade von `codex/impl-settings-469-486` sind in der direkten Nachfahren-Branch `codex/impl-485-486-settings-navigation` erhalten oder ersetzt. Nichts isoliert doppelt portieren. Herkunftsnachweis ist nicht rückwirkend ein Vollreview der alten Branch.
- **Migrationen:** vorhandener Source-Stack 0048 (#604) → 0049 (#607) → 0050 (#514) → 0051 (#519) → 0052 (#486 manueller Scan). **0053 exklusiv für #520** reserviert. Kein Migrationslauf dieser Phase. Vor späteren Änderungen aktuellen Main und alle aktiven Migrationen erneut abgleichen; die Reservierung ist ein dokumentierter Bestand, keine dauerhaft garantierte freie Nummer.
- #607 DELETE-Revisionsschutz `d80c2744c50fd42a59d241a3bd5329e1530a1ea0` erhalten.
- Gemeinsame Write-Hooks: #562/#514 trennen bestätigten Speichererfolg von nachfolgendem Refresh-Fehler. #727 besitzt zusätzliche History-Callbacks. Beim späteren Zusammenstellen alle Verhaltensweisen erhalten, nicht eine ganze ältere Hook-Datei darüberkopieren. #520 enthält gezielt den schmalen #514-Fix `ce7c59df2ad5c962b80cd2236cc7ffb502c21113`.
- Dokumentations-/Frontendbranches erben teils ältere Ledger-Dateien. Nur die tatsächlichen Deltas und Abhängigkeiten übernehmen, keine ältere Finanzimplementierung zurückkopieren.
- Reviewbefunde wurden oft in mehreren begrenzten Korrekturen geschlossen. „Kein weiterer Befund im Diff“ ist kein Review des gesamten kumulierten Branchbaums und kein Nachweis kompilierter Typen oder korrekter UI-Geometrie.

## 6. Offene Implementierungsblocker

### #516: Mehrdeutigkeiten beim Bankimport

Issue: https://github.com/Grabman1987/budget/issues/516

Bestehendes `matchBankLines` ordnet gleich große Gruppen identischer Zeilen/Kandidaten der Reihe nach zu; konkurrierende Zeilen für ein Ziel werden nach Datumsnähe und dann Quellreihenfolge aufgelöst. SPEC-004 sagt allgemeiner, mehrere Kandidaten müssten offenbleiben. Bestehende finanzielle Tests bilden das derzeitige deterministische Verhalten ab.

Die bereits gestellte Produktfrage ist offen: **Dieses deterministische Verhalten für äquivalente Treffer beibehalten oder jeden mehrdeutigen Fall zur manuellen Prüfung offenlassen?** Keine Antwort erfinden, nicht nebenbei Matcher oder Finanzorakel ändern. Die fertige Darstellung erklärt das bestehende Verhalten und zeigt nicht rekonstruierbare historische Herkunft ausdrücklich als unbekannt.

Paketvertrag: https://github.com/Grabman1987/budget/blob/8f3cd1266370bf0aadf4a03d2d88c740d19fde71/IMPORT-516-NOT-VALIDATED.md

### #762: Tatsächliche Markt-/Kalenderdaten und Automatik

Issue: https://github.com/Grabman1987/budget/issues/762

Vorhanden: Server-Provider-Schnittstelle, fail-closed Darstellung, monatlicher One-shot-Service, auditierte einmalige Monatsentscheidung, Rebalancing-Lebenszyklus. **Nicht vorhanden:** reale vertrauenswürdige Datenversorgung und deren geplanter Aufruf in der ausgelieferten Serverkomposition.

Konkrete externe Voraussetzungen:

1. Nachgewiesene Zuordnung eines unterstützten Feeds zum ungehebelten Nasdaq-100-USD-Preisindex NDX, einschließlich Präzision und brauchbarem Zugang. FRED `NASDAQ100` ist recherchierter Kandidat, nicht schon validierte Integration.
2. Vollständiger tatsächlicher US-Handelskalender für den benötigten Zeitraum, inklusive tatsächlicher Schlusszeiten, früher Schließungen und Ausnahmen. Keine bloße Werktagsberechnung und kein Ableiten des Kalenders aus fehlenden Kursen.
3. Verfügbarkeit der Schlusskurse innerhalb des bestehenden Entscheidungsfensters; tatsächlicher Beobachtungszeitpunkt bleibt sichtbar. Nicht rückdatieren.

Erst mit belegtem Vertrag den wirklichen Adapter und einen providergebundenen Zeitplan implementieren. Derselbe Provider muss API und monatliche Auswertung versorgen. Keine Timer hinzufügen, die nur den immer unbekannten Default aufrufen, keine erfundenen `verified`-Flags, keine Ersatz-ETF-/Yahoo-Reihe als Identitätsnachweis. Ein fehlender API-Key allein wäre kein Grund, beliebigen unabhängigen Source-Code aufzuschieben; hier fehlt zusätzlich die verifizierte Daten-/Kalendergrundlage. Vorherige direkte Dokumentzugriffe scheiterten mit CONNECT403; keine blinden Wiederholungen ohne geänderte Voraussetzungen.

Quellen und Pläne:

- https://github.com/Grabman1987/budget/blob/4b403b8623167a8298c1a83528f3d25c963fedd6/STRATEGY-762-PROVIDER-PLAN.md
- https://github.com/Grabman1987/budget/blob/ee9f64ce73d7375556432069bddab8bab6ccbc07/docs/handoff/cloud-environment-20261022/762-remaining-provider-source-scope.md
- https://indexes.nasdaq.com/Index/Overview/NDX
- https://fred.stlouisfed.org/series/NASDAQ100
- https://fred.stlouisfed.org/docs/api/fred/series_observations.html
- https://www.nasdaqtrader.com/trader.aspx?id=Calendar

## 7. Weitere offene Issues: keine doppelte Implementierung

Diese Zuordnung ist eine Bestandsaufnahme, keine Live-/Vollständigkeitsbescheinigung. Bestehende PR-Zustände und Heads stammen aus den dokumentierten Abrufen; vor späterer Integration frisch lesen. Der aktuelle Stand kann inzwischen abweichen.

| Open issue | Classification | Evidence-based disposition |
|---|---|---|
| [#741](https://github.com/Grabman1987/budget/issues/741) | Owner-controlled private prerequisite | Payroll/document source is delivered through merged PRs #752/#757. Remaining historical originals, archive, and linking involve private owner data/operations; not new source implementation. |
| [#726](https://github.com/Grabman1987/budget/issues/726) | External configuration and owner restore prerequisite | Statement-intake source is delivered in PR #729. Production receipt-volume configuration and owner restore/CLI evidence remain; no source gap established. |
| [#626](https://github.com/Grabman1987/budget/issues/626) | Existing implementation; acceptance/archival residual | Dedicated branch `codex/626-explorer-chart` at `1aacdcea934aafb0a8236b305c9c5d1e4af0eb6e` contains chart toggle source and existing evidence artifacts. No direct manifest entry; open status alone does not justify duplicate code work. |
| [#604](https://github.com/Grabman1987/budget/issues/604) | Existing implementation in PR | Open PR #760 at head `352412911b60c80d2b64182e95f7c3cfc9ee50b9` contains the reviewed goal lifecycle source. Remaining exact-head integration/CI and merge are not source gaps; do not duplicate implementation. |
| [#566](https://github.com/Grabman1987/budget/issues/566) | Existing implementation in PR | Open PR #758 at head `8e1d0bd38ca7f6ad66f3063295e1ca3e444df079` implements task-source grouping and one bank status; the older #561 dependency is closed/live (`985ba992`). Remaining integration/acceptance only; no duplicate source assignment. |
| [#542](https://github.com/Grabman1987/budget/issues/542) | No substantiated source gap | The later bounded source diagnosis records the existing low-point clamp from #580 and does not justify a speculative patch. The original overflow artifact was not inspected; exact-case acceptance remains a residual, not a source defect claim. |
| [#529](https://github.com/Grabman1987/budget/issues/529) | Coordination | Prioritized implementation-list/coordination issue, not application source work. |
| [#527](https://github.com/Grabman1987/budget/issues/527) | Parent / child implementation and integration | Debt source is represented by #611–612. Remaining parent-level composition/acceptance, not a separate source gap established by this audit. |
| [#525](https://github.com/Grabman1987/budget/issues/525) | Parent / child implementation and integration | Portfolio source is represented by #544–548. Remaining aggregate acceptance/integration; no new source gap established. |
| [#524](https://github.com/Grabman1987/budget/issues/524) | Parent / child implementation and integration | Net-worth/report children are represented by #487 and #550–551. Remaining aggregate acceptance/integration, not duplicate child implementation. |
| [#523](https://github.com/Grabman1987/budget/issues/523) | Existing capture source | `capture-form.tsx`, `split-editor.tsx`, and `ledger.css` already contain the requested capture structure; the two-column behavior is also represented by #583. Remaining acceptance, not an uncovered source task. |
| [#522](https://github.com/Grabman1987/budget/issues/522) | Child implementations plus private restore prerequisite | WP-014 source packages for offline capture/retry (#558/#559/#699/#700) and statement intake (#726) are represented. Remaining private restore/receipt-volume operations are external; no additional source gap identified. |
| [#517](https://github.com/Grabman1987/budget/issues/517) | Existing child PRs and local implementation | Child delivery is present in PRs #701, #715, and #709; local `codex/impl-517-explorer` is at `4f50e612fed8d812ae054470a3e31ab9553e2732`, though no matching remote ref was recorded. Treat as checkpoint/integration bookkeeping, not missing code. |
| [#513](https://github.com/Grabman1987/budget/issues/513) | Release/acceptance gate | Portfolio Performance cut-over requires full acceptance evidence. This is not a request for new source in this phase. |
| [#508](https://github.com/Grabman1987/budget/issues/508) | Owner adoption/aggregate review | Child reference-adoption packages have source checkpoints; remaining adoption and owner review are product acceptance, not an evidenced source gap. |
| [#499](https://github.com/Grabman1987/budget/issues/499) | Owner acceptance/aggregate integration | Constituent owner-feedback source deliveries are checkpointed. Open epic status does not establish missing source; remaining aggregate/owner acceptance is separate. |
| [#490](https://github.com/Grabman1987/budget/issues/490) | Deferred PUB1 | Login/onboarding/glossary is deferred until public release. No current source work is due. |
| [#483](https://github.com/Grabman1987/budget/issues/483) | Parent / child implementation and integration | Month-close child screens #600–603 have source checkpoints. Remaining parent acceptance/integration, not a distinct gap established here. |
| [#482](https://github.com/Grabman1987/budget/issues/482) | Parent / child implementation and integration | Plan children #607–609 and #608 have source checkpoints. Remaining aggregate acceptance/integration. |
| [#479](https://github.com/Grabman1987/budget/issues/479) | Parent / child implementation and integration | Register children #586, #594–597, and #599 have source checkpoints. Remaining acceptance/integration. |
| [#477](https://github.com/Grabman1987/budget/issues/477) | Parent / child implementation and integration | Inbox/reconciliation children #562–565 have source checkpoints. Remaining aggregate acceptance/integration. |
| [#476](https://github.com/Grabman1987/budget/issues/476) | Existing implementation in PRs | Forecast tools/detail were delivered in merged PR #756; open PR #759 (`codex/backlog-476-catalog-link`, source commit `f4e97e93bbd2d8c2393d71e4fcf873a6c5832ebb`, PR head `0a4f7ef19f7f2f99bd656e4e89c00e6206190bb5`) adds catalog navigation. Remaining browser/keyboard/touch/accessibility/CI acceptance; no duplicate source task indicated. |
| [#475](https://github.com/Grabman1987/budget/issues/475) | Parent / child implementation and integration | Today child screens #572–575 have source checkpoints. Remaining aggregate acceptance/integration, not a separate source task. |
| [#467](https://github.com/Grabman1987/budget/issues/467) | Delivered child issues | Children #577–582 have delivered source via PRs #753, #714, #651, #667, #674, and #684. Open parent is acceptance/aggregate bookkeeping; do not duplicate account-source work. |
| [#450](https://github.com/Grabman1987/budget/issues/450) | Parent / child implementation and integration | Monthly overview/side-list source is in #591–593. Remaining parent acceptance/integration. |
| [#449](https://github.com/Grabman1987/budget/issues/449) | Parent / child implementation and integration | Monthly header/filter source is in #591–593. No separate source gap is established absent a specific unmet AC. |
| [#358](https://github.com/Grabman1987/budget/issues/358) | User prerequisite | Owner must personally confirm a current account balance. |
| [#357](https://github.com/Grabman1987/budget/issues/357) | User acceptance/evidence | Month-close proof requires owner review; no source change implied. |
| [#356](https://github.com/Grabman1987/budget/issues/356) | User acceptance/evidence | Return comparison requires owner review; no source change implied. |
| [#355](https://github.com/Grabman1987/budget/issues/355) | User acceptance/evidence | Portfolio holding requires owner review; no source change implied. |
| [#354](https://github.com/Grabman1987/budget/issues/354) | User acceptance/evidence | Account/month comparison requires owner review; no source change implied. |
| [#310](https://github.com/Grabman1987/budget/issues/310) | User/device acceptance | Requires acceptance on a real iPhone; no source change implied. |

Zusätzliche Phasengrenzen:

- #741 historische Gmail-/Dropbox-Abrechnungen und Verknüpfungen sind weiterhin private operative Arbeit. Die Nutzerautorisierung ist vorhanden; nicht erneut pauschal um Erlaubnis bitten. Tatsächlichen Connector-/Dateizugriff und fehlende Herkunfts-/Zuordnungsnachweise prüfen, sobald diese operative Phase beauftragt ist. Keine privaten Dokumente als Source-Fixtures in Git.
- #726/#522 Produktionsspeicher/Receipt-Volume und Restore-Nachweis sind Konfigurations-/Betriebsaufgaben. Kein destruktives Seeding, insbesondere kein `db:seed --fresh`.
- #699 besitzt eine frühere automatische Ablehnung einer privaten Operation. Diese nicht umgehen, erneut formulieren oder über einen anderen Agenten ausführen. Die unabhängige Offline-Source-Arbeit wurde davon getrennt erhalten.
- #626/#719 bleibt gestoppt. Vorhandene Implementierung und alte Artefakte heben STOP nicht auf. #542 ist ohne den konkreten Overflow-Nachweis keine Einladung zu einer spekulativen CSS-Änderung; bestehender Clamp aus #580 wurde im Source gefunden.
- #490 PUB1 bleibt für öffentliche Freigabe zurückgestellt. Nicht ungefragt Login/Onboarding für ein neues öffentliches Produkt entwickeln.

## 8. Erhaltene Nutzerentscheidungen

Diese Entscheidungen nicht erneut erfragen. Sie ersetzen keine spätere Laufzeitabnahme und berechtigen in dieser Phase nicht zu Teständerungen oder Produktionsdatenänderungen.

- #481: klare Trennung zwischen Mehrkategorie-Gruppenüberschrift und erster Kategorie hat Vorrang. **44 statt 55 Zeilen / 20 % Reduktion akzeptiert.** Frühere Erlaubnis zum Zusammenlegen wurde durch diese spätere Entscheidung ersetzt.
- „Offene Buchungen“ auf Konten/Prüfen meint **noch zu prüfende Bankumsätze**, nicht bloß bereits gespeicherte vorgemerkte Buchungen.
- #559: echte Offline-Belegdateien mit eigenständigem Retry; fehlgeschlagener Upload lässt bereits gespeicherte Buchung bestehen.
- #595: alle sechs vorhandenen Markierungen erhalten und durch Form/Beschriftung erkennbar machen.
- #511: nicht verlustfrei darstellbare PP-Kurse einzeln ablehnen. „Kurse prüfen“ zählt gehaltene Wertpapiere bei fehlendem oder mehr als sieben Tage altem Kurs; gültige Ausführungskurse/reine FX-Lücken nicht dazurechnen.
- #550: Prozentanteile beziehen sich auf Nettovermögen, Schulden negativ; bei Nettovermögen unter 100 Euro oder unvollständigen Werten nur Eurobeträge. Kein neues abweichendes Schwellenmodell einführen.
- #604: laufenden Monat in die Planrate einschließen; „Rate zuweisen“ ergänzt nur den fehlenden Monatsbetrag. Wählbarer Startmonat. Abschluss manuell oder nach belegtem Erreichen und anschließender erster tatsächlicher Ausgabe; Zuweisungsänderung zählt nicht, Undo stellt Zustand wieder her.
- #519: tatsächliche Originalbeträge behalten, Abweichung zum angegebenen Kurs sichtbar. Referenz-/Ausführungseffekt nicht als erfundene Gebühr oder Einnahme buchen. Budget- und Trackingkonten unterstützen; tatsächliche Gebühren separat kategorisieren.
- #520: nicht teilbarer Restcent bleibt im Ursprungsbestand und geht bei dessen späterem vollständigem Übertrag mit. Gesamtkostenbasis erhalten.
- #762: Monatsrate standardmäßig investieren, vorhandenes freies Guthaben nur optional zusätzlich. Broker ist keine zwingende Produktentscheidung; der 15. bleibt ohne Ausführungskalender ein vorläufiger Planungstag. Nasdaq-Signalkalender und tatsächlicher Broker-Ausführungstag sind getrennte Verträge.
- Kartenabrechnung: Ausgleich bezieht sich auf **Betrag der vorher ausgestellten Abrechnung**, nicht den jeweils aktuellen gesamten Kartensaldo.
- Tankbuchungen bleiben wie erfasst. Die **spätere ausdrückliche Klarstellung** sieht den Bonus als separate Differenzgutschrift auf dem Kartenkonto vor; sie ersetzt die frühere widersprüchliche Angabe, er sei bereits im Tankbetrag enthalten. Keine Doppelgutschrift bei bereits repräsentierter Differenz.
- Visa/Austrocard/Gehaltszettel sollen mit deterministischen Skripten ohne KI geparst werden. Eindeutig erkannte, vollständig geprüfte neue Buchungen dürfen nach Upload automatisch gespeichert und vorhandene passende Buchungen verknüpft werden. Unklare Fälle gehen nach Prüfen, bestehende Tankbuchungen bleiben erhalten. Die ältere pauschale Vorgabe „Upload allein bucht nie“ wurde für diesen ausdrücklich freigegebenen Umfang erweitert.
- Kontaktübersicht: kompakte übersichtliche Tabelle, Buchungen öffnen/bearbeiten, für WhatsApp/E-Mail kopierbar. Geschenkte Ausgaben sind eigene Ausgaben, keine Forderung gegen den Kontakt; konkrete private Korrekturen nicht aus einem Screenshot global ableiten oder als Testdaten speichern.
- Kategorieauswahl: Gruppenüberschriften, Kontakte am Ende, mehr nutzbare Ausklapphöhe und kompaktere Zeilen. Plan-Seitenpanel kompakter; Aktivitätsbetrag führt zur nachvollziehbaren Buchungsliste.
- Unabhängige Codex-Reviews wurden als Ersatz für die ursprünglich namentlich verlangten Opus-Reviews zugelassen. Finanz-/Sicherheitsumfang nicht reduzieren.
- Für eine **später ausdrücklich wieder freigegebene Testphase** gilt die Dauerfreigabe technischer Testanpassungen an beauftragte UI/API-Änderungen: Selektoren, Beschriftungen, Tabellenstruktur, Aufklappen von Details sowie Fixtures für neue Leseabfragen/freigegebene Uploadfelder. Pro Datei dokumentieren und unabhängig prüfen. Finanzorakel, Sicherheit, Sperren, Audit, Undo, Toleranzen und Zeitlimits bleiben unverändert. **Aktuell gilt trotzdem das spätere vollständige Verbot von Tests und Teständerungen.**
- Frühere eng begrenzte Einzel-Testfreigaben bleiben historisch erhalten: #543 zwei Performance-Erwartungen; #511 zwei Präzisions-Ablehnungserwartungen; #726 Migration-44-Testaufbau; #727 Migration-45-Testaufbau; #732 zwei eingegrenzte UI-Abfragen; #735 zwei Aufklapp-Klickzeilen; #737 genau vier byteidentische Buffer-Vergleiche. Nicht auf beliebige Finanztests verallgemeinern oder jetzt erneut anwenden.

## 9. Frühere Auslieferungen und vorhandene PRs

Diese historischen Nachweise sind zu bewahren; sie sind keine Aussage über den heutigen Live-Head:

- [PR #756](https://github.com/Grabman1987/budget/pull/756), #568/#569: Head `450dce73aa14bb8a4c338a6fbc105a3de8080d0b`, nach damaliger Delegationsmeldung geprüft live unter `7adb8f016439c0c3bbd391265d52a2f0fd3c33c6`; Main-CI 39787966699, Deploy 39788181495. Issues damals geschlossen/Board Live.
- [PR #757](https://github.com/Grabman1987/budget/pull/757), Payroll: kanonische Lieferung statt [#755](https://github.com/Grabman1987/budget/pull/755). Damals geprüft live `6420676d257698767931dd151863765cec914acf`, Main-CI 39793134926, Deploy 39793516313. #741 blieb wegen privatem Archivbetrieb offen; #755-Branch/Nachweise erhalten.
- [PR #758](https://github.com/Grabman1987/budget/pull/758), #566: gesicherter Head `8e1d0bd38ca7f6ad66f3063295e1ca3e444df079`; nicht als aktuell live behaupten. Dokumentierte APT-Runner-Probleme wurden mit eng begrenztem offiziellen Ubuntu-Mirrorwechsel bearbeitet, keine Tests/Gates gelockert.
- [PR #759](https://github.com/Grabman1987/budget/pull/759), #476: dokumentierter Head `0a4f7ef19f7f2f99bd656e4e89c00e6206190bb5`; Source-Kataloglink `f4e97e93bbd2d8c2393d71e4fcf873a6c5832ebb`.
- [PR #760](https://github.com/Grabman1987/budget/pull/760), #604: dokumentierter Head `352412911b60c80d2b64182e95f7c3cfc9ee50b9`, ältere Prüfbelege im PR erhalten. Nicht dieselben Tests blind wiederholen und nicht auf spätere Revisionen übertragen.
- [PR #719](https://github.com/Grabman1987/budget/pull/719), #626: **STOP**.
- Statement-Grundlagen: [#729](https://github.com/Grabman1987/budget/pull/729) und [#733](https://github.com/Grabman1987/budget/pull/733); Neubewertung später separat unter #727 gesichert.
- Historischer lokaler Boardabgleich setzte genau #543, #560, #555, #624, #615, #616, #627, #595, #556, #617, #481, #509, #578, #625, #606 und #590 nach Closed-/Eindeutigkeitsprüfung auf Live. #649/#677/#650/#632 blieben ausgenommen. Das ist kein aktueller Boardabruf und keine Freigabe, weitere Source-Pakete als Live zu markieren.

## 10. Cloud, Zugriffe und wiederkehrende Infrastrukturprobleme

Veröffentlichter Umgebungsentwurf, einem Chat zugeordnete Version und tatsächlich wirksame Runtime-Netzwerkregel sind drei getrennte Zustände. In der Historie wurde wiederholt die falsche Konfiguration veröffentlicht; damit änderte sich die laufende Hauptinstanz nicht.

- Historische Hauptkonfiguration: `cecfg_6abdf330ba0481a0997c587c11e1e0ea`, gemeldete Version `cecfgver_6abe4e94ba5481a09319324b2f4bca1c`.
- Andere Einrichtungs-Konfiguration: `cecfg_6ada3b44b8348190a600e064523cb54b`; mehrere Entwürfe/Versionen existieren. Nicht nach Namen allein verwechseln.
- Letzte frühere Runtime-Beobachtung im Hauptkontext: verbunden/laufend, Netzwerk enforced, Spec-Revision 728, aber weiterhin ältere Zuordnung und nicht alle gewünschten Hosts. **Das ist kein neuer Runtime-Nachweis dieses Übergabeprompts.**
- Vor Änderungen aktuellen Provider-/Runtime-Status lesen. Netzwerkänderungen nur ergänzend: **bestehende Liste vereinigen mit benötigten Hosts**, niemals die Liste durch einen vermeintlichen Mindestbestand ersetzen. Paketmanager-Freigaben, Skripte, Repo-Verknüpfung und sonstige Einstellungen erhalten. Keine automatische Instanzneustarts oder Proxyumgehung.
- Repository-/REST-Zugriff und GitHub-Projects-Berechtigung sind getrennt. Früher hatte der lokale persönliche `gh`-Login `project`, die Cloud-Integration nicht. Tokens nie ausgeben oder in Chat/Git übertragen. Fehlenden Projects-Zugriff nicht durch Issue-Zahlen als Boardstand kaschieren.
- Node aus `.nvmrc`, Playwright aus Projekt/Lockfile. Browser-Builds müssen zu dieser Version passen. System-Chromium ist kein gleichwertiger Chromium-/WebKit-Nachweis.
- Historisch: Browserdownloads HTTP403, Systembibliotheken `su: Authentication failure`, aktive Policy teilweise unknown. Fehler anhand konkreter URL/Redirects/Antwort prüfen, nicht mit höheren Timeouts oder blinden Retries behandeln. Keine Fehlermeldung so stark bereinigen, dass die Ursache verloren geht; Geheimnisse/signierte URLs trotzdem schützen.
- Frühere 479 Testdateien/4360 Tests oder Browserberichte sind **historisch**, keine Bestätigung für neue Branches oder die neue Umgebung. Browserinstallation/-start und Tests sind derzeit ausgesetzt; erst in einer passenden späteren Phase ausführen.

Gesicherter Mindestbestand zusätzlicher Hosts, immer mit vorhandenen Freigaben vereinigen:

```text
api.github.com
budget-fg.fly.dev
cdn.playwright.dev
codeload.github.com
dl.dropboxusercontent.com
github.com
plado.pages.dev
playwright.download.prss.microsoft.com
raw.githubusercontent.com
www.dropbox.com
storage.googleapis.com
productionresultssa17.blob.core.windows.net
chatgpt.com
```

Quelle: [required-hosts.txt](https://github.com/Grabman1987/budget/blob/ee9f64ce73d7375556432069bddab8bab6ccbc07/docs/handoff/cloud-environment-20261022/required-hosts.txt). Artefakt-Redirecthosts können sich ändern; alte Hostfreigabe ist keine Garantie für einen späteren Download.

## 11. Historische Chats und lokale Pfade

Historische geteilte Chats, nur als Hintergrund und nur wenn tatsächlich lesbar:

- https://chatgpt.com/s/cx_6ad5c195c61081919ff51424be57ad04
- https://chatgpt.com/s/cx_6ad5c21631788191a7dc2ecffc943834
- https://chatgpt.com/s/cx_6ad5c2353dd481919aa1146b3b549abf
- https://chatgpt.com/s/cx_6ad91f7e61208191891e380bee1f75e3

Früherer lokaler Integrationschat „Merge-Konflikt in #753 beheben“ hatte Thread-ID `01a16218-41fd-70d0-9b2a-60b070a1659a`. Das ist kein Zugriffstoken und keine Zusicherung, dass ein neuer Chat ihn lesen/steuern kann. Diese Übergabe und die Git-Nachweise genügen für die gesicherte Source-Arbeit.

Falls derselbe Workspace erhalten ist:

- Hauptcheckout `/workspace/budget`; vorhandene Worktrees mit `git worktree list` lesen.
- Zentrale Übergabe `/workspace/handoff-cloud-environment-20261022`.
- #520 `/workspace/impl-520-transfer-persistence`.
- #762 `/workspace/impl-762-strategy`.
- Kontrollunterlagen `/workspace/.budget-tools/cloud-control`, jetzt Symlink auf `/workspace/.budget-tools/cloud-control-persistent`.

Der alte temporäre Nachweisordner unter `/tmp` verschwand bei einer Executor-Wiederherstellung. Nicht behaupten, lokale-only Nachweise seien wiederhergestellt. Gepushte Berichte sind erhalten; rekonstruierte Pläne sind ausdrücklich als solche markiert. **Lokale Pfade allein sind keine Übergabe.** Verwende die GitHub-/Commitlinks dieses Dokuments.

## 12. Archivierte Belege und vorbereitete Diffs

Die folgende vollständige zentrale Dateiliste verweist auf den eingefrorenen Koordinationsstand. Historische Pläne/Patches nicht blind erneut anwenden. Beispielsweise die Typografie- und Offline-Kontakt-Patches wurden bereits in ihren Paketen weiterverarbeitet; aktuelle Branch-Diffs und Reviewmatrix gehen vor. Für frühere testbezogene Freigaben nur tatsächlich erhaltene gepushte Diffs verwenden; verschwundene lokale Dateien nicht als verfügbar behaupten.

- [469-residual-copy-review.md](https://github.com/Grabman1987/budget/blob/ee9f64ce73d7375556432069bddab8bab6ccbc07/docs/handoff/cloud-environment-20261022/469-residual-copy-review.md)
- [470-display-source-review.md](https://github.com/Grabman1987/budget/blob/ee9f64ce73d7375556432069bddab8bab6ccbc07/docs/handoff/cloud-environment-20261022/470-display-source-review.md)
- [473-crossbranch-516-css.patch](https://github.com/Grabman1987/budget/blob/ee9f64ce73d7375556432069bddab8bab6ccbc07/docs/handoff/cloud-environment-20261022/473-crossbranch-516-css.patch)
- [486-manual-scan-design.md](https://github.com/Grabman1987/budget/blob/ee9f64ce73d7375556432069bddab8bab6ccbc07/docs/handoff/cloud-environment-20261022/486-manual-scan-design.md)
- [519-fx-fee-pinned-fix-source-review.md](https://github.com/Grabman1987/budget/blob/ee9f64ce73d7375556432069bddab8bab6ccbc07/docs/handoff/cloud-environment-20261022/519-fx-fee-pinned-fix-source-review.md)
- [520-apply-api-ui-fix-source-review.md](https://github.com/Grabman1987/budget/blob/ee9f64ce73d7375556432069bddab8bab6ccbc07/docs/handoff/cloud-environment-20261022/520-apply-api-ui-fix-source-review.md)
- [520-apply-api-ui-source-review.md](https://github.com/Grabman1987/budget/blob/ee9f64ce73d7375556432069bddab8bab6ccbc07/docs/handoff/cloud-environment-20261022/520-apply-api-ui-source-review.md)
- [520-history-plan-minimality-review.md](https://github.com/Grabman1987/budget/blob/ee9f64ce73d7375556432069bddab8bab6ccbc07/docs/handoff/cloud-environment-20261022/520-history-plan-minimality-review.md)
- [520-lineage-policy-review.md](https://github.com/Grabman1987/budget/blob/ee9f64ce73d7375556432069bddab8bab6ccbc07/docs/handoff/cloud-environment-20261022/520-lineage-policy-review.md)
- [520-persistence-fix-source-review.md](https://github.com/Grabman1987/budget/blob/ee9f64ce73d7375556432069bddab8bab6ccbc07/docs/handoff/cloud-environment-20261022/520-persistence-fix-source-review.md)
- [520-persistence-source-review.md](https://github.com/Grabman1987/budget/blob/ee9f64ce73d7375556432069bddab8bab6ccbc07/docs/handoff/cloud-environment-20261022/520-persistence-source-review.md)
- [520-writer-undo-fix-source-review.md](https://github.com/Grabman1987/budget/blob/ee9f64ce73d7375556432069bddab8bab6ccbc07/docs/handoff/cloud-environment-20261022/520-writer-undo-fix-source-review.md)
- [520-writer-undo-integration-map.md](https://github.com/Grabman1987/budget/blob/ee9f64ce73d7375556432069bddab8bab6ccbc07/docs/handoff/cloud-environment-20261022/520-writer-undo-integration-map.md)
- [542-overflow-source-diagnosis.md](https://github.com/Grabman1987/budget/blob/ee9f64ce73d7375556432069bddab8bab6ccbc07/docs/handoff/cloud-environment-20261022/542-overflow-source-diagnosis.md)
- [574-contact-599-integration.patch](https://github.com/Grabman1987/budget/blob/ee9f64ce73d7375556432069bddab8bab6ccbc07/docs/handoff/cloud-environment-20261022/574-contact-599-integration.patch)
- [727-reassessment-refresh-fix-source-review.md](https://github.com/Grabman1987/budget/blob/ee9f64ce73d7375556432069bddab8bab6ccbc07/docs/handoff/cloud-environment-20261022/727-reassessment-refresh-fix-source-review.md)
- [762-rebalance-lifecycle-fix-source-review.md](https://github.com/Grabman1987/budget/blob/ee9f64ce73d7375556432069bddab8bab6ccbc07/docs/handoff/cloud-environment-20261022/762-rebalance-lifecycle-fix-source-review.md)
- [762-rebalance-lifecycle-plan-review.md](https://github.com/Grabman1987/budget/blob/ee9f64ce73d7375556432069bddab8bab6ccbc07/docs/handoff/cloud-environment-20261022/762-rebalance-lifecycle-plan-review.md)
- [762-rebalance-lifecycle-plan.md](https://github.com/Grabman1987/budget/blob/ee9f64ce73d7375556432069bddab8bab6ccbc07/docs/handoff/cloud-environment-20261022/762-rebalance-lifecycle-plan.md)
- [762-rebalance-lifecycle-source-review.md](https://github.com/Grabman1987/budget/blob/ee9f64ce73d7375556432069bddab8bab6ccbc07/docs/handoff/cloud-environment-20261022/762-rebalance-lifecycle-source-review.md)
- [762-rebalance-valuation-source-review.md](https://github.com/Grabman1987/budget/blob/ee9f64ce73d7375556432069bddab8bab6ccbc07/docs/handoff/cloud-environment-20261022/762-rebalance-valuation-source-review.md)
- [762-remaining-provider-source-scope.md](https://github.com/Grabman1987/budget/blob/ee9f64ce73d7375556432069bddab8bab6ccbc07/docs/handoff/cloud-environment-20261022/762-remaining-provider-source-scope.md)
- [CURRENT-COORDINATION.md](https://github.com/Grabman1987/budget/blob/ee9f64ce73d7375556432069bddab8bab6ccbc07/docs/handoff/cloud-environment-20261022/CURRENT-COORDINATION.md)
- [PHASE-RESIDUALS.md](https://github.com/Grabman1987/budget/blob/ee9f64ce73d7375556432069bddab8bab6ccbc07/docs/handoff/cloud-environment-20261022/PHASE-RESIDUALS.md)
- [README.md](https://github.com/Grabman1987/budget/blob/ee9f64ce73d7375556432069bddab8bab6ccbc07/docs/handoff/cloud-environment-20261022/README.md)
- [SOURCE-PROGRESS-LATEST.md](https://github.com/Grabman1987/budget/blob/ee9f64ce73d7375556432069bddab8bab6ccbc07/docs/handoff/cloud-environment-20261022/SOURCE-PROGRESS-LATEST.md)
- [SOURCE-REVIEW-COVERAGE.md](https://github.com/Grabman1987/budget/blob/ee9f64ce73d7375556432069bddab8bab6ccbc07/docs/handoff/cloud-environment-20261022/SOURCE-REVIEW-COVERAGE.md)
- [backlog-coverage-latest.md](https://github.com/Grabman1987/budget/blob/ee9f64ce73d7375556432069bddab8bab6ccbc07/docs/handoff/cloud-environment-20261022/backlog-coverage-latest.md)
- [checkpoints.json](https://github.com/Grabman1987/budget/blob/ee9f64ce73d7375556432069bddab8bab6ccbc07/docs/handoff/cloud-environment-20261022/checkpoints.json)
- [combined-settings-source-coverage.md](https://github.com/Grabman1987/budget/blob/ee9f64ce73d7375556432069bddab8bab6ccbc07/docs/handoff/cloud-environment-20261022/combined-settings-source-coverage.md)
- [remaining-archived-review-index.md](https://github.com/Grabman1987/budget/blob/ee9f64ce73d7375556432069bddab8bab6ccbc07/docs/handoff/cloud-environment-20261022/remaining-archived-review-index.md)
- [remaining-open-reconciliation.md](https://github.com/Grabman1987/budget/blob/ee9f64ce73d7375556432069bddab8bab6ccbc07/docs/handoff/cloud-environment-20261022/remaining-open-reconciliation.md)
- [required-hosts.txt](https://github.com/Grabman1987/budget/blob/ee9f64ce73d7375556432069bddab8bab6ccbc07/docs/handoff/cloud-environment-20261022/required-hosts.txt)
- [settings-display-preferences-fix-source-review.md](https://github.com/Grabman1987/budget/blob/ee9f64ce73d7375556432069bddab8bab6ccbc07/docs/handoff/cloud-environment-20261022/settings-display-preferences-fix-source-review.md)
- [settings-display-preferences-source-review.md](https://github.com/Grabman1987/budget/blob/ee9f64ce73d7375556432069bddab8bab6ccbc07/docs/handoff/cloud-environment-20261022/settings-display-preferences-source-review.md)
- [source-gap-inventory.md](https://github.com/Grabman1987/budget/blob/ee9f64ce73d7375556432069bddab8bab6ccbc07/docs/handoff/cloud-environment-20261022/source-gap-inventory.md)

Die pro Paket archivierten zusätzlichen Reviews stehen in den jeweiligen Commitbäumen aus Abschnitt 4; genaue Pfade und geprüfte Produktrevisionen sind vollständig in `SOURCE-REVIEW-COVERAGE.md` aufgeführt. Lies den betreffenden Bericht, nicht nur sein Urteil.

## 13. Was du als Erstes tatsächlich tun sollst

1. Übernimm dieses Dokument und den Checkpoint, lies die fünf maßgeblichen Bestandsdateien. Prüfe Arbeitsverzeichnis, lokale Änderungen, vorhandene Worktrees und tatsächliche Agents nur lesend.
2. Vergleiche die benötigten Remote-Branches mit den gesicherten SHAs. Wenn Abweichungen bestehen, neue Arbeit erhalten und untersuchen; nie auf alte SHAs zurücksetzen. Nicht sämtliche Pakete neu bauen oder erneut reviewen.
3. Prüfe neue Antworten oder konkrete Veränderungen an #516/#762. Ohne neue Grundlage bleiben diese spezifischen Blocker bestehen. Zugriffslücken knapp und handlungsfähig benennen, keine Geheimnisse anfordern.
4. Prüfe bei Bedarf einmal den aktuellen Issue-Bestand. Nur ein **konkret unbelegtes akzeptiertes Kriterium** rechtfertigt ein neues Implementierungspaket. Offene Elternissues, ausstehende Tests oder „nicht Live“ sind allein keine Source-Lücke.
5. Bearbeite gegebenenfalls das nächste tatsächlich unabhängige Source-Paket, mit passendem Modell und klarer Datei-Zuständigkeit. Bestehende finanzielle Freigaben nicht erneut erfragen. Neue echte Produktentscheidungen gezielt erklären.
6. Sichere den abgegrenzten Diff, unabhängige Reviewbefunde und deren Korrekturen auf der bestehenden passenden Branch. Normale Pushes; keine Hooks auslösen, die verbotene Tests/Builds starten. Vorher Workflowtrigger lesen, damit kein verbotener CI-Start ausgelöst wird.
7. Aktualisiere die zentrale Übersicht mit Ticket, Branch, voller SHA, tatsächlichem Umfang, geprüfter Produktrevision, Restpunkten und zugänglichem Nachweis. Keine privaten Rohdaten aufnehmen.
8. Wenn keine unblockierte Source-Aufgabe übrig ist, dokumentiere das konkret und halte das Goal als blockiert an. Keine laufende Hintergrundarbeit behaupten und keine automatische Fortsetzung als neue Genehmigung für Tests/Integration verstehen.

Berichte knapp anhand konkreter Änderungen und verbleibender Schritte. **„Implementiert“, „quellgeprüft“, „laufzeitgeprüft“, „gemergt“ und „Live“ bleiben unterschiedliche Zustände.**
