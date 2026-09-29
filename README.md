# Budget

Private Haushalts-Finanz-App (PWA) für einen Nutzer. Ersetzt das bisherige Cockpit auf Actual Budget, YNAB und Portfolio Performance: Envelope-Budgeting, Regelwerk aus Finanz-Basics und vollständiges Vermögens- und Portfolio-Tracking in einer Datenbasis.

Stand 29.09.2026: P1a–P1e umgesetzt, Audit-Korrekturen P1f offen (`docs/audit/2026-09-29-p1-audit.md`), noch nicht deployt. Gate 1 steht noch aus.

## Wo steht was

| Pfad | Inhalt |
| --- | --- |
| `SPEC.md` | Spezifikation: Umfang, Architektur, Pakete, Gates, Vorrang der Quellen |
| `PRODUCT.md` | Produktfakten und alle Entscheidungen aus der Designphase |
| `DESIGN.md`, `.impeccable/` | Designsystem „Blaupause“ und Richtungsverträge je Seite |
| `design/prototype/` | Klickbarer Prototyp (statisches HTML/JS) mit Beispiel-Hauptbuch und Rechenregeln |
| `design/screens/` | Referenz-Screenshots aller Seiten (Desktop 1440, Handy 390) |
| `docs/concept/` | Ursprüngliches Produktkonzept und Ist-Analyse des alten Cockpits |
| `docs/data-model.md` | Datenmodell (Schema v1), Entscheidungen, Beispiel-Hauptbuch |
| `docs/ROADMAP.md` | Pakete P1–P6 mit Aufgaben und Abnahmekriterien |
| `docs/prompts/` | Fertige Aufträge für die einzelnen Cloud-Sitzungen |
| `docs/CLOUD-SETUP.md` | Anleitung: GitHub, Claude Code in der Cloud, Fly-Deploy |
| `reference/finance-hub/` | Getestete Rechenmodule des alten Cockpits zum Portieren (bereinigt) |
| `CLAUDE.md`, `AGENTS.md` | Arbeitsregeln für Coding-Agenten |

## Entwickeln

Node 22 (`.nvmrc`), npm workspaces.

```bash
npm install
npm run dev        # Web (Vite, :5173) + Server (Hono, :3000) mit Hot Reload
npm run check      # Typecheck + Lint + Unit-Tests
npm run test:e2e   # Build + Playwright (einmalig: npx playwright install chromium)
npm run db:seed    # synthetische Beispieldaten nach ./data/dev.sqlite (siehe docs/data-model.md)
npm run build      # apps/web/dist + apps/server/dist/index.js
npm start          # Produktions-Server (liefert die gebaute Web-App aus)
```

## Prototyp ansehen

```bash
npm run proto
```

Dann http://localhost:5180 öffnen. Alle Zahlen sind Beispieldaten.
