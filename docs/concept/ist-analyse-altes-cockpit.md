# Ist-Analyse: bestehende App und Feedback

Stand: 28.09.2026. Grundlage: Repo `Grabman1987/finance-hub`, Branch `codex/phase2-replacement-readiness` (131 Commits, 95 Testdateien), sowie das Feedback-PDF in `05_Input/`.

## Kernbefund

Die bestehende App ist funktional weit, aber architektonisch ein **Cockpit auf Actual Budget**. Die meisten Feedback-Punkte sind Symptome dieser einen Grundentscheidung. Deshalb wird die App neu geplant (siehe `01_Konzept`). Die getestete Rechenlogik wird übernommen, UI, Datenhaltung und Informationsarchitektur werden neu gebaut.

## Repo-Befunde

| Aspekt | Befund | Folge |
| --- | --- | --- |
| Architektur | Actual Server 26.9 im selben Container (Port 5006), Cockpit als Proxy auf 5007. `unified-routing.mjs` leitet nur `/cockpit` und einen Plugin-Pfad um, alles andere geht an Actual | Zwei Welten by design; `/budget` landet in Actual |
| Datenhaltung | 1) Actual-SQLite (Konten, Buchungen, Budget, Regeln, Schedules). 2) Verschlüsselter JSON-Blob `workspace.enc.json` mit ca. 60 Top-Level-Keys unter `settings` (z. B. `contactC`, `debts`, `payrollRecords`, `documents`, `liquidity`, `transactionDimensions`, `planRows`), 10-MB-Limit, Belege darin | Split-Brain, keine referenzielle Integrität, keine Queries |
| Client | `@actual-app/api` läuft im Browser und lädt das komplette Budget in IndexedDB (ca. 1,2 MB Erstladung) | „27 Konten werden geladen“, langsamer Start, Passwort-Login gegen Actual |
| Frontend | Vanilla JS mit String-Templates, `src/main.js` 137 KB, rund 27 CSS-Dateien | Kein Komponentensystem, inkonsistentes Design, Mobil- und Desktop-Menü unterschiedlich |
| Personalisierung | „Kontakt C.“ 272 Treffer in 21 Code-Dateien, Bitpanda 354, Mining-Plattform 49, Hörbuch-Abo 46 | Fachlogik an eine Person gebunden |
| Stärken | DOM-freie, getestete Modelle (Liquidität, Tilgung, TTWROR/IRR, Payroll, Reconciliation), Nachtlauf-Worker, CSP/HSTS/AES-GCM/ETag, Release-Skript mit Rollback | Werden übernommen |
| Sicherheit | History ohne IBANs oder echte Credentials; `docs/audit/` enthält private Finanzdetails | Repo privat halten |

## Feedback → Ursache → Richtung

| Feedback | Ursache | Richtung im neuen Konzept |
| --- | --- | --- |
| Passwort-Login, nichts gespeichert | Actual-Passwort, Token nur in `sessionStorage` | Passkeys (Face ID/Touch ID), 30-Tage-Session |
| `/budget` vs. `/cockpit` | Actual-UI wird ausgeliefert | Eine App auf Root |
| Empfänger ohne Autovervollständigung | `<datalist>`, auf iOS Safari kaum unterstützt | Eigene Combobox, Empfänger schlägt Kategorie vor |
| „Abgleichbuchungen“, „Bankstatus: Bei Bank gebucht“ | Actual-Begriffe ungefiltert | Eigenes Glossar, Bank-Status automatisch |
| Drei Kategorie-Eingaben | Gewachsen: Chips, Select, Picker | Ein Picker, „Aufteilen“ immer sichtbar |
| Person, Rückforderung Kontakt C., Spese/Diät | Person als eigene Dimension | Entfällt; generisch über Kontakte und Split-Anteile |
| Inflow/Outflow, große Zahl, Farbe | fehlt | Übernommen (Outflow vorausgewählt, rot/grün) |
| Vergangene Monate deutlich überplant | Lange Budgethistorie aus YNAB mit negativem „Zu verteilen“-Vortrag; Ursache nicht verifiziert | Stichtag 01.10.2023 mit Eröffnungssalden |
| Einnahmen im Plan nicht aufgeschlüsselt | Kein Einnahmen-Report | Einnahmenarten, Bericht B06 |
| Kontakt C.-Themen (Miete, Hörbuch-Abo, Auslagen) | Personenlogik im Code | Generisch: erwartete Zahlungen (versioniert) plus Kontakte mit Forderungskonto |

## Referenz: Sure (sure.am)

Community-Fork von Maybe Finance, AGPLv3, Rails/Postgres/Redis/Sidekiq. Tracking- und Net-Worth-orientiert, Budgets als Ausgabenlimits. Übernommen werden Konzepte, nicht Code: polymorphe Kontotypen, Tagessalden mit Flüssen, Securities/Holdings/Trades/Valuations, Transfers als Paar, Recurring Transactions mit Toleranz und Wochenend-/Feiertagsregel, Goals mit Konto-Zuordnung, Kategorien mit Farbe und Lucide-Icon.
