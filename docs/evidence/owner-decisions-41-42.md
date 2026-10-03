# Owner-Entscheidungen 41 und 42

Branch: `feat/income-next-month-and-pending`. Änderungen liegen im Arbeitsbaum;
keine Git-Schreiboperationen, kein Commit, kein PR und kein Deployment.
Alle Testdaten sind synthetisch. Es wurde keine echte Bank-API aufgerufen.

## Umsetzung

- **41:** Enable Banking liefert BOOK und PDNG. BOOK wird standardmäßig über den
  bestehenden idempotenten Importpfad als kontowirksame, ungeprüfte Buchung ohne
  Kategorie/Einnahmeart übernommen. Der Posteingang zeigt die unzugeordnete Buchung;
  PDNG bleibt ein Kandidat bis zur ausdrücklichen Bestätigung. In Datenquellen kann
  jede Verbindung stattdessen Bestätigung vor Übernahme verlangen. Audit, Undo/Redo,
  stabile PDNG→BOOK-Identität, gelöschte Buchungen und Saldenwarnungen sind berücksichtigt.
- **42:** Einnahmen behalten Datum, Kategorie und Einnahmeart. Die Option
  **Für nächsten Monat** verschiebt ausschließlich den Budgetmonat einschließlich
  Zu verteilen und der Budget-Auswertungen. Cash-flow-/Einnahmenberichte behalten
  das tatsächliche Datum. Einstellungen › Zuordnungsregeln bietet Vorgaben pro
  Zahler, Einnahmenkategorie oder Einnahmeart, mit dieser Priorität und einer
  ausdrücklichen Einzelbuchungs-Ausnahme. Regeln gelten für neue Owner-Eingaben
  und die erste Bank-Kategorisierung, nicht beim Bankabruf und nicht rückwirkend.
- Migration `0019_income_next_month_and_pending` ergänzt zwei Spalten mit
  kompatiblen Defaults. Der Snapshot enthält gegenüber 0018 genau diese zwei
  Ergänzungen; Vorgänger-ID, SQL und Journal passen zusammen. Der Orchestrator
  muss SQL, Journal und Snapshot nach Einordnung anderer Migrationen umnummerieren.

## Checks

- `npm.cmd ci`: erfolgreich, Lockfile unverändert.
- Vollständiger Typecheck und Lint: erfolgreich. Web-Typecheck wurde nach der
  letzten UI-Korrektur erneut ausgeführt.
- `npm.cmd run build` und `npm.cmd run build:e2e`: erfolgreich.
- Betroffene Domain-/API-/Service-/Adapter-/Buchungsmodell-Tests: **7 Dateien,
  117 Tests bestanden**. Literale Monats-/Jahresgrenzen, tatsächlicher Kontostand,
  Regelpriorität, explizite Ausnahme, Audit/Undo/Redo und atomare Ablehnung
  unzulässiger Buchungen sind enthalten. Ein zusätzlicher Bankfall prüft, dass
  erst Owner-Kategorisierung die Einkommensregel übernimmt und Undo den Kontostand
  unverändert lässt.
- Relevante Browserfälle: **6 bestanden**, Desktop 1440 und Mobil 390, isolierte
  Ledgers mit festem Datum. Einkommen verwendet die echte lokale API; Bank-UI
  verwendet synthetische Antworten. Axe und Überlaufprüfung, Hell/Dunkel,
  Speichern, Bearbeiten und Undo/Redo. Screenshots liegen lokal unter
  `test-results/income-{rules,capture}-{desktop,mobile}-{light,dark}.png`
  sowie den Bank-Sync-Aufnahmen.
- Der vollständige `npm.cmd run check` wurde ausgeführt. Typecheck/Lint bestanden;
  der zunächst unbeschränkte Testlauf hatte Ressourcenfehler. Der vollständige
  Wiederholungslauf mit zwei Workern ergab **220/222 Dateien grün, 2.156 Tests
  bestanden, 2 bestehende Skips und 5 Fehler**. Vier Fehler betreffen unveränderte
  Import-Worker-Tests; ein CSV-Export-Abbruchtest überschritt fünf Sekunden.
- CSV-Export separat mit einem lokalen Testtimeout von 20 Sekunden: **9/9 grün**.
  Ohne erhöhten Timeout kann der Abbruchtest nachfolgende Tests beeinflussen;
  Testassertionen und Repository-Timeouts wurden nicht verändert.
- `git diff --check`: erfolgreich. Die temporäre lokale Playwright-Konfiguration
  startete ausschließlich die isolierten Testserver mit einem Worker und wurde entfernt.

## Offene Verifikation und Owner-Schritte

Der vollständige lokale Check ist **nicht grün**. Windows/Node scheitert bereits
ohne App-Code bei `node:os.userInfo()` mit `uv_os_get_passwd returned ENOMEM`.
tsx benutzt diesen Aufruf beim Start der Import-Worker; dadurch scheitern vier
bestehende Worker-Tests. Derselbe Fehler blockiert eine erneute Drizzle-Generierung.
Die Migration wurde zuvor generiert; Snapshot/SQL wurden zusätzlich statisch
abgeglichen und die SQLite-Migration durch die API-/Repository-Tests ausgeführt.
Kein Produktcode, Test oder Tool wurde geändert, um den Systemfehler zu umgehen.

Orchestrator: Migration einordnen/umnummerieren und Generation sowie vollständigen
Check/CI in einer funktionierenden Windows- oder CI-Umgebung wiederholen;
anschließend Commit und PR erstellen. Owner: Quellenoption und Gehaltsregel prüfen,
ersten Bankabruf sowie den ersten Monatswechsel abstimmen. Mehrdeutige Änderungen
von Provider-Identitäten ohne stabile Referenz und automatische Transferzuordnung
bleiben außerhalb dieser beiden Entscheidungen.

## Geänderte Dateien

- SPEC.md
- apps/server/src/api/bank-sync.test.ts
- apps/server/src/api/bank-sync.ts
- apps/server/src/api/income-month.test.ts
- apps/server/src/api/income-month.ts
- apps/server/src/api/index.ts
- apps/server/src/api/schemas.ts
- apps/server/src/bank-sync/enable-banking.test.ts
- apps/server/src/bank-sync/enable-banking.ts
- apps/server/src/bank-sync/service.test.ts
- apps/server/src/bank-sync/service.ts
- apps/web/src/budget/use-category-writes.ts
- apps/web/src/ledger/api.ts
- apps/web/src/ledger/booking-model.ts
- apps/web/src/ledger/capture-form.tsx
- apps/web/src/ledger/types.ts
- apps/web/src/pages/data-sources.tsx
- apps/web/src/pages/income-month-rules.tsx
- apps/web/src/router.tsx
- docs/DATA_SOURCES.md
- docs/FEATURES.md
- docs/ROADMAP.md
- docs/evidence/owner-decisions-41-42.md
- e2e/bank-sync.spec.ts
- e2e/income-next-month.spec.ts
- packages/db/drizzle/0019_income_next_month_and_pending.sql
- packages/db/drizzle/meta/0019_snapshot.json
- packages/db/drizzle/meta/_journal.json
- packages/db/src/repos/allocation.ts
- packages/db/src/repos/bookings.ts
- packages/db/src/repos/income-month.ts
- packages/db/src/repos/index.ts
- packages/db/src/repos/invariants.ts
- packages/db/src/repos/ledger-queries.ts
- packages/db/src/repos/month-reports.ts
- packages/db/src/repos/queries.ts
- packages/db/src/schema/bank-sync.ts
- packages/db/src/schema/bookings.ts
- packages/domain/src/bank-sync.ts
- packages/domain/src/income-month.test.ts
- packages/domain/src/income-month.ts
- packages/domain/src/index.ts
- packages/domain/src/ledger/budget.test.ts
- packages/domain/src/ledger/budget.ts
