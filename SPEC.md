# Budget — Specification

Status: Gate 1 candidate; owner sign-off remains pending, 2026-10-01. App name: **Budget** (O10 decided). Private, single user. Current implementation and operational evidence: `docs/STATUS.md`.

Budget is a private household finance web app (installable PWA) that replaces YNAB (and the interim Actual-Budget cockpit) and Portfolio Performance with one app, one database and one language. Envelope budgeting at the core, a rule set of finance basics on top, full net-worth and portfolio tracking in the same ledger. Goal: not only track cash flow and wealth, but actively optimise them.

Feature-by-feature implementation coverage, including all 30 report bodies:
[`docs/FEATURES.md`](docs/FEATURES.md). Remaining requirement details and superseded
concept statements: [`docs/REQUIREMENTS-GAPS.md`](docs/REQUIREMENTS-GAPS.md).
These inventories track delivery and open acceptance; they do not change scope
or the source precedence below.

## 0. Sources of truth and precedence

When two sources disagree, the higher one wins:

1. **This file (`SPEC.md`)**: decisions, scope, architecture, acceptance criteria.
2. **`PRODUCT.md`**: product facts and all user decisions made during design (German).
3. **`DESIGN.md` + `.impeccable/design.json`**: the visual system ("Blaupause"). Replaces chapter 10 of the concept completely.
4. **`design/prototype/`**: the clickable static prototype. It is the visual and behavioural reference for every page, including the sample ledger and the calculation rules in `design/prototype/reports-core.js`. Screens: `design/screens/`.
5. **`docs/concept/produktkonzept.md`**: the original, complete concept (German). Detailed methodology, data model, KPIs, processes and migration. Still valid unless overridden above.
6. **`reference/finance-hub/`**: tested calculation modules of the old app, to be ported (not copied) to TypeScript.

The old concept's design language (Manrope, teal accent, white tiles, `03_Mockups`) is **rejected**. Do not use it.

## 1. Users and usage

- One user runs the finances of a household. Partner, friends and employer are **contacts** (no login).
- **Phone:** capture a cash payment in 10 s, see "does the month hold?" in 5 s, work the inbox.
- **Desktop:** steer: distribute money, month-end close, year planning, debts, portfolio review, reports.
- Routines: nightly sync (automatic), capture (ongoing), weekly inbox, payday distribution, month-end close, quarterly review, yearly planning, event scenarios. See concept ch. 4.

## 2. Principles (binding)

1. One question per place; every KPI has exactly one primary place.
2. Every number is explainable down to the booking (dimension chains, drill-down); nothing disappears silently; everything is undoable (audit log).
3. Capture on the phone, steer on the desktop; same sitemap and content on both.
4. Rules instead of gut feeling: rules are data with status and a concrete action.
5. Automatic where reliable; manual entry is a first-class path.
6. **Generic, not personal:** no person or provider names in code, UI texts, fixtures or docs. Persons are contacts, providers are institutions, both are data.
7. **No real financial data in the repository.** Tests and development use the synthetic sample ledger. Real data only enters the running app through the migration (P2) on the server.

## 3. Information architecture

Five main areas plus settings (profile menu). Registers are the second level; no third menu level. Details open as a side panel (desktop) or bottom sheet (phone). Every view has its own URL. Global on every page: search (Ctrl K), inbox with counter, "+ Buchung".

| Area | Question | Registers / views (prototype file) |
| --- | --- | --- |
| Heute | Hält der Monat? | Leitmaß "frei verfügbar bis Gehalt", pace, upcoming payments, Finanz-Check KPI, net worth (`index.html`) |
| Plan | Jeder Euro hat einen Job | Plan › Monat with views Wasserfall / Zeit / Gruppen / Klassen / Triage, Geld verteilen (`plan.html`) |
| Konten | Was ist passiert? | Übersicht, Einzelkonto with Kontostand prüfen, Alle Buchungen, Posteingang, Kontakte (`konten.html`) |
| Vermögen | Was besitze ich, was entscheide ich? | Nettovermögen, Portfolio (Soll/Ist, Rebalancing, Sparpläne), Schulden (Sondertilgung), Freiheitszahl with Soll-Pfad (`vermoegen.html`) |
| Reports | Warum und wohin, und wie haben Entscheidungen gewirkt? | Catalog of 30 reports in 5 groups (`reports.html`) |
| Einstellungen | — | Konten (terms: limits, rates, term), Kategorien, Regelwerk (stages + R01–R16), Zuordnungsregeln, Datenquellen, Anlageklassen, CSV-Export, Sicherheit (`einstellungen.html`, partly built) |

**Import/export feature scope (owner-confirmed 2026-10-01):** the application has no import feature or import UI. Provide one user-initiated ZIP download containing CSV export data for all accounts and depots. Reconfirm authentication before starting the sensitive export. The CSV ZIP is a data export, not an encrypted application backup; exclude auth/session state, secrets, audit events, import staging and raw migration data. This supersedes earlier in-app YNAB/PP and manual CSV/XLSX import requirements. See [`docs/export.md`](docs/export.md) for the file and field conventions. One-time migration remains a separate owner-authorized Codex/Claude task using existing exports and the PP file in private storage (§10).

**Vermögen decides, Reports show the effect.** No outcome/performance history on Vermögen; no decisions in Reports.

Current savings-plan slice: Portfolio supports audited schedule create/edit/end and undo/redo, with source accounts, inclusive version history and future changes shown separately from today's rate. Rates and monthly totals retain the investment account's native currency. Overlapping effective versions remain visible and make the affected current rate/total unavailable; missing account currency makes totals explicitly incomplete. Schedule saves do not create trades/bookings or send bank orders; the owner must change the bank schedule manually. Proposal/apply, execution controls and private Gate 3 acceptance remain separate work.

### Booking capture (replaces concept 7.5 item 2)
No keypad. The amount is a text field with arithmetic (`12,50+8,20`, `+ − × ÷`, German number format incl. thousands `1.576`), small operator buttons, Enter evaluates. No `eval` (strict CSP). Incomes may carry a category (default "Zu verteilen"). A transfer's counterpart is always another account.

## 4. Budget method (concept ch. 3, with overrides)

- **Envelope core:** every euro has one job; "Zu verteilen" target = 0; available rolls over; overspending must be covered (triage).
- **Income budget month (owner decision 42, 2026-10-03):** an inflow can be marked "für nächsten Monat". Cash/account/report booking dates and income labels remain unchanged; Zu verteilen and budget allocation use the following month. Defaults per payee, income category or income type apply to new owner captures, with payee precedence and a per-booking override; existing bookings are not rewritten.
- **Three classes:** Bedarf, Wunsch, Zukunft (each category belongs to one). Groups below classes; categories below groups. Target ~40 categories after migration (O3).
- **Money-flow waterfall: nine stages** (concept 3.6 + decision 28.09.2026): 1 Fixkosten und Mindestraten, **2 Laufender Monat** (variable monthly targets for Bedarf and Wunsch), 3–9 = concept stages 2–8. Plan › Monat orders by stage by default (switchable to groups, classes, time). Overspending shows as a triage bar above the unchanged table.
- **Expected payments** (versioned schedules), **contacts** with receivables (Kontoblatt per person), **sinking funds**, **savings goals**.
- **50/30/20 on assigned money** (`alloc` in `design/prototype/reports-core.js`): periodic costs, special payments and their windfall transfers count as twelfths; Bedarf + Wunsch + Zukunft + Übrig (or "aus Guthaben", negative) = 100 % of income, always.
- **Rules R01–R16** (concept 3.5) as data with thresholds, status (erfüllt / Warnung / verletzt) and action.
- **Stage model** (decision 29.09.2026): stages by net worth up to 10.000 € (Fundament), 100.000 € (Aufbau), 1 Mio. € (Freiheit). Rules per stage from *I Will Teach You to Be Rich*, *Get Good with Money*, *Your Money or Your Life*, *Everyday Millionaires* (see `design/prototype/reports-ueberblick.js` STAGES and `einstellungen.js`). Attitude: dignity, no shame; no report judges a spend as a mistake.

## 5. Data model and invariants (concept ch. 5)

Entities: Konto (with role: Budget-Konto / Rücklage / Anlage / Schuld, and terms: credit line, overdraft limit, rates, term, fees), Buchung with Anteile (splits), Umbuchung, Empfänger, Kategorie/Gruppe/Klasse, Envelope-Monat (assigned, activity, available), Erwartete Zahlung (versioned), Kontakt with Forderungskonto, Sparziel, Wertpapier/Produkt, Trade, Bestand, Kurs (source per price), Wechselkurs, Anlageklasse with Soll-Allocation, Regel + Regelergebnis, Posteingang-Eintrag, Zuordnungsregel, Bank-Verbindung, Beleg (object storage), Änderungsprotokoll, Gehaltszettel (payslip lines), Projekt (side income: income and costs), Geplantes Ereignis (forecast events).

Invariants (binding):
- Amounts are integers in cents. Sum of splits = booking amount. A transfer = exactly two bookings.
- Nothing is hard-deleted; every change is logged and undoable.
- Imports are idempotent (dedupe keys; see `reference/finance-hub/bank-sync-dedupe.mjs`).
- Start date 01.10.2023 with opening balances; price history complete, also before.
- Foreign currency: keep original amount and currency; convert with the ECB reference rate of the booking date; a bank deviation becomes a foreign-exchange fee.
- Net worth, returns and rule status are identical on every page (one calculation per figure, shared domain functions).
- Contact receipts default to the oldest open outlay first; the user may edit allocation before saving. Cash, allocation and excess contact credit are one audited, undoable action. Excess is a negative contact balance owed to the contact, never income or a gift.
- Zero-balance contacts hide from the normal overview; retained identity and ledger history remain selectable. A new nonzero balance restores visibility.
- Derived contact receivables and credit do not enter net worth. Actual account balances and investment holdings remain its valuation sources: an outlay lowers cash/net worth until actual repayment. Explicit receivable accounts keep ordinary account valuation.

## 6. KPIs and calculations

27 KPIs, each with one formula, one target and one primary place: concept ch. 8. Additional calculation rules fixed in the prototype (port them 1:1, with tests):

| Rule | Reference |
| --- | --- |
| 50/30/20 as twelfths (`alloc`) | `reports-core.js` |
| Net worth from the ledger: own contribution = income − consumption + regular principal; market = Σ product market moves | `reports-core.js` |
| Portfolio: TTWROR, IRR (Modified Dietz annualised > 12 months), volatility, max drawdown, Sharpe (2.5 %), beta vs world index | `reports-portfolio.js` `stats()` |
| One cost basis / gain / fund cost per product (`costOf`, `gainOf`, `terOf`) used everywhere | `reports-core.js` |
| Liquidity forecast day by day: fixed costs on due days, variable plan linear, salary at month end, periodic costs from reserves, sweep above buffer keeps planned expenses of the next 4 months, planned events, levers, 10 % buffer, verdict | `reports-zukunft.js` |
| Dimension chains must add up as displayed (largest-remainder rounding) | `reports-core.js` `balanceChain` |
| Diverging heat per row vs row average; neutral within 8 %; direction per row (spend: low is good; income, savings, returns: high is good; projects vs 0) | `reports-core.js` `heatAttr` |
| Freiheitszahl with Soll-Pfad to a goal year and required saving rate | `vermoegen.js` `renderFreedom` |
| Debt payoff with extra repayment | `vermoegen.js`, `reference/finance-hub/debt-*.mjs` |

## 7. Reports (catalog, decided 29.09.2026)

Every report answers one question with one fixed chart form (grammar: concept 9.2/9.3 and DESIGN.md), unfolds to the booking, and reads the same ledger.

1. **Monat und Einkommen:** 1.1 Monats-One-Pager (printable A4 sheet), 1.2 Gehaltsreport (payslip lines, payout per month and year, yearly salaries with growth, collective raise vs step raise, "Gehaltszettel hinzufügen": PDF upload to object storage or line-by-line entry with check), 1.3 Einnahmen, 1.4 Geldfluss (Sankey via one income pool), 1.5 Jahresansicht (with previous year), 1.6 Kategorieübersicht, 1.7 Sparquote und Geldalter, 1.8 Gesamttabelle (CSV), 1.9 Projekte und Nebeneinkünfte.
2. **Ausgaben und Plan:** 2.1 Ausgabenanalyse, 2.2 Budgettreue incl. 50/30/20, 2.3 Verträge und Abos (terms, notice, USD), 2.4 Persönliche Inflation, 2.5 Empfänger-Analyse, 2.6 Bank- und Zinskosten (credit lines incl. overdraft and card).
3. **Zukunft und Vermögen:** 3.1 Liquiditätsprognose (planned events, levers, 6-month outlook, verdict), 3.2 Cashflow-Verlauf, 3.3 Vermögensverläufe, 3.4 Jahresvorschau Zahlungen, 3.5 Sparziele.
4. **Portfolio:** 4.1 Depots im Vergleich, 4.2 Allocation (sunburst class/product and region/product, Soll/Ist over time), 4.3 Einzahlungen und Wert, 4.4 Rendite und Kennzahlen (benchmarks, asset classes side by side, heatmap), 4.5 Kosten, Steuern, Erträge (KESt 27.5 %, latent tax). Products open a panel with daily price history.
5. **Überblick:** 5.1 Jahresreport (2 printable sheets), 5.2 Finanz-Check-Verlauf (stages + R01–R16), 5.3 Explorer (pivot, saved views), 5.4 Kontakte-Abrechnung (one ledger per person), 5.5 Zeitraumvergleich.

Report 5.4 currently provides a fixed all-time EUR overview and selected person ledger with shared running balances, credit and source drilldown. Retained balanced histories remain selectable; pending source bookings are explicitly included under the existing contact statement predicate. Unsupported foreign-currency reads are wholly unavailable. Sending, duplicate settlement controls and monthly selectors are outside this slice; owner/private acceptance and other report bodies remain open.

## 8. Design system (binding)

`DESIGN.md` is the contract: blueprint world (blue ink on drafting film; dark = classic blueprint), Archivo + Barlow Semi Condensed (self-hosted), title block (Schriftfeld), registers, dimension chains (Maßkette) for every lead figure, parts lists (Stückliste) with positions, revision tables for findings, ISO line types (solid = actual, dashed = plan/forecast, dash-dot = previous/benchmark), hatching only for classes and committed money, debts as dashed outline, elevation marks only in charts. **Red only for action needed.** Pastel green/red only for heatmaps and signed changes (decision 29.09.2026).

UI language German (de-AT): `1.234,56 €`, real minus `−`, incomes with `+`, KPIs without cents, lists with cents. Touch targets ≥ 44 px, reduced motion respected, full dark mode, colour never the only signal.

Build pages to match `design/prototype/` and `design/screens/`. When in doubt, open the prototype (`npx serve design/prototype` or `python -m http.server -d design/prototype`) and compare.

## 9. Technical architecture

| Layer | Choice |
| --- | --- |
| Language | TypeScript (strict), Node 22 LTS (cloud default; concept said 24, 22 is fine); `engines`: `^22.14.0 \|\| ^24.0.0` |
| Repo | npm workspaces monorepo (layout below) |
| Frontend | React, Vite, TanStack Router + Query, Tailwind (theme only) with tokens generated from DESIGN.md, own accessible primitives in `packages/ui` on native elements (`<dialog>` panels); Radix is not used |
| Charts | **Own SVG components** on d3-scale/d3-shape, ported from the prototype (the blueprint grammar is custom). Apache ECharts only if the P1 spike shows a clear need (proposed change to O1, confirm in P1a). |
| Backend | Hono + zod (request validation on the server today; schemas move to a shared package when a client form needs the same rules, from P2), REST/JSON |
| Database | SQLite (WAL) with Drizzle ORM and migrations |
| Backup | Litestream to object storage + nightly age-encrypted copy |
| Receipts / payslips | Object storage, reference in DB |
| Jobs | Separate worker process with schedule and catch-up of missed runs (P4) |
| Auth | Passkeys via SimpleWebAuthn, several devices, ten recovery codes, HttpOnly SameSite=Strict session cookie (30 days), step-up for export, bank connection, new passkeys |
| Security | Strict CSP (`script-src 'self'`), HSTS, no `eval` |
| Hosting | Fly.io, region `fra`, own app (not the old cockpit), volume for SQLite, deploy via GitHub Actions |
| Tests | Vitest (domain, API), Playwright (E2E and visual comparison against `design/screens`) |

```
apps/web          React PWA (pages, routes, offline queue for bookings)
apps/server       Hono API, auth, static hosting
apps/worker       nightly jobs (P4)
packages/domain   pure TS domain logic: money, dates, ledger, envelopes, rules, forecast, performance — no DB, 100 % unit-tested
packages/db       Drizzle schema, migrations, repositories
packages/ui       tokens + blueprint primitives: TitleBlock, Registers, DimensionChain, PartsList, RevisionTable, AmountInput, charts
packages/fixtures synthetic sample ledger (port of design/prototype/reports-core.js) for tests, dev seed and visual tests
```

Data sources (P4): Enable Banking (PSD2, JWT RS256, booked balances, consent warning 14 days before the 180-day expiry), crypto read API, prices daily via yfinance with fallback Ariva (source stored per price, failures to the inbox), ECB exchange rates (full history), manual valuations. Manual file imports are excluded from the application feature scope; see §3 and the separate migration workflow in §10. Provider-specific code lives in adapters named generically in the domain.

**Bank posting (owner decision 41, 2026-10-03):** fetched BOOK transactions count immediately in account balances as unchecked (`pending`, "vorgemerkt") bookings without a category or income type, shown in Posteingang. PDNG transactions remain candidates until explicit owner confirmation. Each connection can retain the old confirmation-first policy; the default is immediate BOOK posting. No category or envelope assignment is automated. Preserve source identities, deduplication, audit and deleted-booking tombstones.

## 10. Migration (concept 11.4)

The app import feature is removed by the decision in §3. One-time migration remains a separate owner-authorized Codex/Claude task using the already existing exports and PP file in private owner storage (decision 2026-10-01). Do not recreate an import UI to fulfill it; file access and the target data-transfer procedure must be established for that task.

Source is the **YNAB export** (Register.tsv + Plan.tsv); Actual Budget was only an interim tool and is not migrated. Format, quirks and checks: `docs/migration/ynab-export.md`.

**First real import: EUR only** (owner decision 2026-10-01). Full foreign-currency support remains in scope; until implemented, unsupported foreign-currency budget accounts must be rejected or explicitly reported as unsupported, never silently summed as EUR.

**Valuation availability:** Nonzero held units need a stored security quote on or before the valuation day. A missing quote is unavailable, never a zero market value or an acquisition-cost proxy. Account/current-position reads retain holdings and known acquisition basis with nullable value/gain and explicit missing-price or FX reasons. Numeric history/performance endpoints reject any unpriced held day with typed `valuation_unavailable` (503); later quotes do not backfill earlier values or create a market gain from zero. Today keeps budget, upcoming payments and bookings usable and explains unavailable finance-check/net-worth sections. Partial historical charts and independently available fields of the legacy aggregate summary remain follow-up scope. Zero-held positions need no quote; the pure valuation preserves genuine zero quotes without changing the positive-price storage/API rule.

**Investment cost method (owner decision 2026-10-01):** moving average acquisition cost is the application default; FIFO is selectable in Einstellungen › Depots & Kryptos and applies consistently to remaining basis and realised gains. Broker-provided acquisition amounts, execution amounts, fees and already withheld taxes are source data; preserve them and reconcile the app's analytical figures against the broker statements during private migration. Do not calculate or book tax withholding again. Known realised gains survive later holding snapshots, including a zero position; missing historical basis is not invented. A method switch recalculates analytical figures without rewriting source transactions. This is not acceptance of tax-reporting parity; Gate 3 still needs independent reconciliation with full source history.

YNAB's structure is evaluated and adapted, not copied: raw import → owner-approved mapping (accounts, n:1 category merges, re-categorisation rules from a chosen month, payees → contacts, bracketed notes → expected payments) → target model. Records start on **01.10.2023** (owner decision 29.09.2026) with the balances of that day; accounts closed before are skipped; the start month stays configurable. Then workspace mapping (persons → contacts and expected payments, debts → credit accounts, goals, receipts), later trades/holdings and price history from Portfolio Performance (P5) → parallel run over one month-end with a reconciliation report → cut-over when all differences are 0 €. **Real exports and mappings may be processed only in the owner's authorized private migration environment; they are never committed or included in CI or logs.**

## 11. Packages and gates

| Package | Content | Done when |
| --- | --- | --- |
| **P1 Fundament** | Monorepo, stack spike, passkey login, DB schema v1, design tokens + blueprint primitives, app shell (sidebar, registers, title block, mobile tab bar), CI, deploy to a new Fly app | See `docs/ROADMAP.md` P1 checklist; the shell matches `design/screens/desktop/heute.webp` in layout and tokens |
| **P2 Kern und Migration** | Accounts, bookings, capture, categories, Plan › Monat; separate one-time agent-assisted migration, no app import feature | **Gate 2:** balances per account and month match YNAB to the cent; Available per target category matches the mapped YNAB categories before the rules month |
| **P3 Planung und Steuerung** | Expected payments, contacts, savings goals, distribute money, rule set + stages, Heute | Heute and Plan match the prototype with real data |
| **P4 Datenquellen** | Enable Banking, nightly run, inbox, assignment rules; authenticated ZIP download with CSV data for all accounts and depots | Nightly run stable for 14 days; complete export download accepted |
| **P5 Vermögen** | Price history, portfolio, returns, allocation, debts, freedom number | **Gate 3:** returns and holdings equal Portfolio Performance |
| **P6 Reports und Umstellung** | 30 reports, explorer, printable sheets, parallel run with reconciliation | **Gate 4:** one month-end without difference, then retire remaining finance tools, including YNAB and PP |

**Gate 1 acceptance criterion:** this spec, PRODUCT.md, DESIGN.md and the prototype are accepted by the owner. The criterion is not yet confirmed as passed.

The former Fly app was used only for the prototype and removed by the owner on 2026-10-01. Its removal does not pass a financial migration gate; the versioned prototype remains the design reference.

## 12. Not in V1

Tax filing, AI advice or AI categorisation (AI-assisted planning is a later goal), vehicle and real-estate valuation, multi-user and partner linking, native app, compatibility with Actual.

## 13. Open items

- Private account/category/instrument inventory and approved migration mapping (O3/O7); source access and the actual transfer/reconciliation remain open.
- Receipt object storage and the later independent second encrypted-backup target must be established for their workflows. Existing backup code and a verified deployment do not prove receipt storage or a real restore.
- Feature-specific completion and remaining requirements are tracked in `docs/FEATURES.md` and `docs/REQUIREMENTS-GAPS.md`; the selected SVG/d3 chart approach is recorded in §9 and ADR 0001.
