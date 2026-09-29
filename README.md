# Budget

Private Haushalts-Finanz-App (PWA) für einen Nutzer. Ersetzt das bisherige Cockpit auf Actual Budget, YNAB und Portfolio Performance: Envelope-Budgeting, Regelwerk aus Finanz-Basics und vollständiges Vermögens- und Portfolio-Tracking in einer Datenbasis.

Stand: Ende P0, Kandidat für Gate 1 (29.09.2026). Code entsteht ab P1.

## Wo steht was

| Pfad | Inhalt |
| --- | --- |
| `SPEC.md` | Spezifikation: Umfang, Architektur, Pakete, Gates, Vorrang der Quellen |
| `PRODUCT.md` | Produktfakten und alle Entscheidungen aus der Designphase |
| `DESIGN.md`, `.impeccable/` | Designsystem „Blaupause“ und Richtungsverträge je Seite |
| `design/prototype/` | Klickbarer Prototyp (statisches HTML/JS) mit Beispiel-Hauptbuch und Rechenregeln |
| `design/screens/` | Referenz-Screenshots aller Seiten (Desktop 1440, Handy 390) |
| `docs/concept/` | Ursprüngliches Produktkonzept und Ist-Analyse des alten Cockpits |
| `docs/ROADMAP.md` | Pakete P1–P6 mit Aufgaben und Abnahmekriterien |
| `docs/prompts/` | Fertige Aufträge für die einzelnen Cloud-Sitzungen |
| `docs/CLOUD-SETUP.md` | Anleitung: GitHub, Claude Code in der Cloud, Fly-Deploy |
| `reference/finance-hub/` | Getestete Rechenmodule des alten Cockpits zum Portieren (bereinigt) |
| `CLAUDE.md`, `AGENTS.md` | Arbeitsregeln für Coding-Agenten |

## Prototyp ansehen

```bash
python -m http.server 5180 -d design/prototype
```

Dann http://localhost:5180 öffnen. Alle Zahlen sind Beispieldaten.
