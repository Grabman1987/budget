# Budget

Private Haushalts-Finanz-App (PWA) für einen Nutzer. Ersetzt das bisherige Cockpit auf Actual Budget, YNAB und Portfolio Performance: Envelope-Budgeting, Regelwerk aus Finanz-Basics und vollständiges Vermögens- und Portfolio-Tracking in einer Datenbasis.

**Status, 2026-10-01:** the foundation and P1 audit fixes are implemented, together with accounts/bookings, the monthly budget, a YNAB import wizard, expected payments, goals, rules and the net-worth page. Several other pages remain placeholders. The owner reports the configured Fly app as deployed; its running commit, device login and real encrypted restore are unverified. Gates 1–4 remain unaccepted.

[Current status](docs/STATUS.md) separates implementation from acceptance. [The follow-up audit](docs/audit/2026-10-01-follow-up.md) records corrections before the first **EUR-only** import; [the roadmap](docs/ROADMAP.md) holds ordered tasks. The owner retired the prototype-only Fly app on 2026-10-01; the design reference remains versioned in `design/prototype`.

Owner scope update: remove import as an app feature. Keep only CSV export of all accounts and portfolios, initially as a placeholder. The existing wizard is legacy implementation scheduled for removal; separate one-time migration is being clarified.

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
| `docs/STATUS.md` | Current implementation, acceptance and operations status |
| `docs/prompts/` | Fertige Aufträge für die einzelnen Cloud-Sitzungen |
| `docs/CLOUD-SETUP.md` | Anleitung: GitHub, Claude Code in der Cloud |
| `docs/ops.md` | Betrieb: erster Deploy, GitHub-Einstellungen, Backup (Litestream), Wiederherstellung, Rollback |
| `reference/finance-hub/` | Getestete Rechenmodule des alten Cockpits zum Portieren (bereinigt) |
| `CLAUDE.md`, `AGENTS.md` | Arbeitsregeln für Coding-Agenten |

## Entwickeln

Node `^22.14.0 || ^24.0.0` (`.nvmrc`: 22), npm workspaces. Läuft unter Windows, macOS und Linux; `.npmrc` setzt `ignore-scripts=true` (better-sqlite3 liefert fertige Binaries, es wird nichts kompiliert).

```bash
npm ci
npm run db:seed    # synthetische Beispieldaten nach data/dev.sqlite (siehe docs/data-model.md)
npm run dev        # Vite (:5173) + Server (:3000), Hot Reload
npm run check      # Typecheck + Lint + Unit-Tests
npm run test:e2e   # E2E-Build + Playwright (einmalig: npx playwright install chromium)
npm run build      # apps/web/dist + apps/server/dist/index.js (ohne /dev-Seiten)
npm start          # Produktions-Server (liefert die gebaute Web-App aus)
```

**`npm run dev` Ende zu Ende.** Im Browser `http://localhost:5173` öffnen (Vite leitet `/api` an den Server weiter). Der Server verwendet dieselbe Datei `data/dev.sqlite` wie `db:seed`, erwartet den Origin `http://localhost:5173` und druckt beim Start einen zufälligen Einrichtungscode (`Dev setup token …`). Damit unter `/setup` den ersten Passkey anlegen (`localhost` ist für WebAuthn erlaubt). Die Einstellungen stehen in `.env.example`; `.env` ist optional und nicht im Repository. `npm run db:seed` löscht die Datei samt Passkeys neu.

**E2E und Screenshots.** Die Vergleichsbilder (`e2e/**-snapshots`) sind unter Linux erzeugt. Unter Windows/macOS werden die visuellen Vergleiche mit einem Hinweis übersprungen, alles andere läuft. Für identische Pixel (und zum Aktualisieren der Bilder) den Container verwenden:

```bash
docker run --rm -it --ipc=host -v "$PWD":/work -w /work mcr.microsoft.com/playwright:v1.56.1-noble \
  bash -c "npm ci && npm run test:e2e"          # Bilder aktualisieren: ... npx playwright test --update-snapshots
```

## Prototyp ansehen

```bash
npm run proto
```

Dann http://localhost:5180 öffnen. Alle Zahlen sind Beispieldaten.
