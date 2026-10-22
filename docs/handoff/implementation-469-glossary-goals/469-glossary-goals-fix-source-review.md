# #469 Glossar-Korrektur — enger Source-Review

Geprüft: `47377c904544f3302cb55ddfc4b93b460eca2367` gegen `e0e39d4b0b5b04ad6966e8603d0bd91cf4b66cad` auf `codex/impl-469-glossary-goals`. Der Delta enthält ausschließlich eine Glossar-Zeile in `apps/web/src/reports/term.tsx:12`.

**Vorheriger P2 geschlossen, kein neuer Befund im engen Delta.** Die neue Erklärung knüpft den negativen Betrag nicht mehr zwingend an eine zu hohe Zuweisung, sondern nennt ein Defizit des aktuell verteilbaren Geldes und ungedeckte Ausgaben als mögliche Ursache. Das stimmt mit der kanonischen Berechnung von `toBeAssignedCents` und dem Übertrag ungedeckter Barausgaben in `packages/domain/src/ledger/budget.ts:47-49,425` überein. Benachbarte Glossar-Begriffe, Beträge, Komponentenverhalten und Finanzlogik sind im Delta unverändert.

Nur Quelltext geprüft; keine Tests, Checks, Builds, Browser-, Laufzeit- oder CI-Prüfung. Weiterhin **NOT VALIDATED**.
