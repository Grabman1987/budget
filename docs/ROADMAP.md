# Roadmap

Packages and gates from `SPEC.md` §11. Each task below is one cloud session and one pull request. Ready-to-paste prompts: `docs/prompts/`. Tick the boxes in the PR that completes them.

Gate 1 (specification and designs accepted by the owner): **pending owner sign-off.**

## P1 Fundament

### P1a — Repo scaffold and stack spike (`docs/prompts/P1a.md`)
- [ ] npm workspaces: `apps/web`, `apps/server`, `packages/domain`, `packages/db`, `packages/ui`, `packages/fixtures` (worker later)
- [ ] TypeScript strict, shared tsconfig, ESLint, Prettier, Vitest; `npm run check` = typecheck + lint + unit tests
- [ ] `apps/server`: Hono app with `/health`, serves the built web app, strict CSP (`script-src 'self'`), HSTS
- [ ] `apps/web`: Vite + React + TanStack Router + Query, one route rendering "Budget" in the blueprint fonts
- [ ] `packages/domain/money`: cents type, de-AT formatter (`1.234,56 €`, real minus, sign option, no-cents option), arithmetic amount parser (`12,50+8,20`, `1.576`, `× ÷`, no eval) with tests ported from `design/prototype/app.js` behaviour and `reference/finance-hub/money-input.mjs`
- [ ] `npm run proto` serves `design/prototype` on port 5180
- [ ] Playwright set up (`npm run test:e2e`) with one smoke test
- [ ] Dockerfile (Node 22, multi-stage), `fly.toml` (region `fra`, volume mount `/data`, app name from env/placeholder)
- [ ] GitHub Actions: `ci.yml` (check + e2e on PRs), `deploy.yml` (on push to `main`: `flyctl deploy --remote-only`, skipped when `FLY_API_TOKEN` is not set)
- [ ] Chart spike: render the Heute pace chart and one Sankey from prototype data with own SVG + d3-scale/d3-shape; note the decision in `docs/adr/0001-charts.md`

### P1b — Design tokens and blueprint primitives (`docs/prompts/P1b.md`)
- [ ] Tokens from `.impeccable/design.json` / `DESIGN.md` → CSS custom properties + Tailwind theme; light and dark (`prefers-color-scheme` + manual toggle), print tokens
- [ ] Self-hosted fonts from `design/prototype/fonts/`
- [ ] Primitives in `packages/ui`: TitleBlock (Schriftfeld), Registers, DimensionChain (inline, with balancing of rounded parts), PartsList (Stückliste with groups and positions), RevisionTable, AmountInput (uses domain parser), Segmented, Switch, SidePanel / BottomSheet, Toast with undo, Status stamps, class swatches (need/want/future hatching)
- [ ] Chart primitives: axis/graticule, line (solid/dashed/dash-dot), bars around zero, step line, band, elevation mark
- [ ] Dev page `/dev/bauteile` showing every primitive in light and dark
- [ ] Visual tests of primitives against crops of `design/screens`

### P1c — App shell and routing (`docs/prompts/P1c.md`)
- [ ] Desktop: sidebar "Planliste" 01–05 with collapse, top bar (search Ctrl K, Posteingang with counter, + Buchung), theme toggle, profile
- [ ] Mobile (< 768 px): header, tab bar, floating + button; same routes and order
- [ ] Routes for all areas and registers (SPEC §3) with placeholder pages built from TitleBlock + Registers; every view has its own URL
- [ ] Side panel (desktop) / bottom sheet (phone) pattern wired to a route param
- [ ] E2E screenshots of the shell at 1440 and 390 compared with `design/screens` (layout, not data)

### P1d — Database, fixtures and domain core (`docs/prompts/P1d.md`)
- [ ] Drizzle schema v1 for the entities in SPEC §5, migrations, repositories; soft delete; audit log with undo; idempotency keys for imports
- [ ] `packages/fixtures`: deterministic TypeScript port of the sample ledger generator in `design/prototype/reports-core.js` producing real bookings (not monthly sums) for Okt 2023 – 17.09.2026
- [ ] Dev seed script loads the fixtures into SQLite
- [ ] Domain: account balances from bookings, envelope month (assigned / activity / available, rollover), `alloc` (50/30/20 as twelfths), net worth series
- [ ] Tests reproduce prototype figures (e.g. net worth 17.09.2026 = 84.730 €; August 2026 allocation Bedarf/Wunsch/Zukunft/Rest as in the One-Pager)

### P1e — Passkey login, security, deploy (`docs/prompts/P1e.md`)
- [ ] SimpleWebAuthn registration and login, several passkeys, ten recovery codes, session cookie (HttpOnly, SameSite=Strict, 30 days), step-up for sensitive actions
- [ ] First-device bootstrap via one-time setup token from an environment secret; no open registration
- [ ] Rate limiting on auth endpoints; audit of logins
- [ ] Litestream backup to object storage (config + restore instructions in `docs/ops.md`)
- [ ] Deployed to the new Fly app; `/health` green; login works on phone and desktop

## P2 Kern und Migration
Accounts (roles and terms), bookings with splits and transfers, capture dialog (SPEC §3), categories/groups/classes, Plan › Monat (waterfall, views, triage, distribute money), Konten (Übersicht, Einzelkonto, Kontostand prüfen with Ausgleich, Alle Buchungen). Migration tooling from Actual (runs on the server, never commits data). **Gate 2:** balances per account and month match to the cent.

## P3 Planung und Steuerung
Expected payments, contacts with receivables, savings goals, rule set R01–R16 + stages, Heute page, Posteingang basics.

## P4 Datenquellen
Enable Banking adapter, CSV/XLSX import with saved mapping, worker with nightly run and catch-up, inbox items, assignment rules, source status in Einstellungen › Datenquellen.

## P5 Vermögen
Price history (yfinance + Ariva, source per price), ECB rates, trades and holdings, portfolio performance, allocation, Sparpläne, debts with extra repayment, freedom number with Soll-Pfad. **Gate 3:** returns and holdings equal Portfolio Performance.

## P6 Reports und Umstellung
The 30 reports (SPEC §7), explorer, printable sheets, parallel run with reconciliation report. **Gate 4:** one month-end without difference, then switch off Actual, YNAB and PP.
