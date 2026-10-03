# Roadmap

Packages and gates from `SPEC.md` §11. Each task below is one cloud session and one pull request. Ready-to-paste prompts: `docs/prompts/`. Tick the boxes in the PR that completes them.

Current implementation and owner/operations evidence: [`STATUS.md`](STATUS.md). Completed boxes record implementation, not full product acceptance or immunity to later defects. Next work is the ordered follow-up below; existing checklists remain the record of completed work.

Gate 1 (specification and designs accepted by the owner): **pending owner sign-off.**

Central coverage and the remaining work beyond the mockups: [FEATURES.md](FEATURES.md).
Requirement details to close before their corresponding tasks: [REQUIREMENTS-GAPS.md](REQUIREMENTS-GAPS.md).
The owner authorized completing and rolling out all agreed V1 pages/functions
on 2026-10-01. Independent implementation tasks can proceed while private-data
or device acceptance is pending; each task still needs its own reviewed PR and
passing required checks. A route, prototype or backend alone is not a completed
user workflow, and does not pass a private migration or cut-over gate.

## Current work — 2026-10-01 follow-up

Source: [`audit/2026-10-01-follow-up.md`](audit/2026-10-01-follow-up.md). First real import is **EUR only**; full FX support remains later scope. One task per branch/PR; verify each fix against an independent expected result and required checks.

Owner scope update, 2026-10-01: remove import as an app feature. Provide a fresh-step-up ZIP export of all accounts/portfolios with stored financial history; previous import UI/parser checkboxes record historical implementation, not current product scope. One-time migration remains a separate owner-authorized Codex/Claude task using existing exports and the PP file in private storage.

- [x] Record owner-confirmed retirement of the prototype-only Fly app; keep the versioned prototype and leave legacy staging unchanged.
- [x] Align README, PRODUCT, SPEC and cloud setup with implementation and acceptance status.
- [x] Record no-import app scope and CSV-only export contract.
- [x] Select and document local project skill profiles for concise communication, existing-design UI review, verified delivery and security review; see [`skills.md`](skills.md). Original upstream packages/commands are not installed by these adaptations.
- [x] Remove app upload/wizard/import-report entry points and obsolete import navigation; provide a step-up authenticated ZIP of allowlisted account, ledger and portfolio CSVs. Migration engine/server modules remain for the separate private transfer task.
- [ ] Verify deployed commit, health, phone/desktop passkeys, recovery and real encrypted restore (owner/runbook; deployed status alone is insufficient).
- [x] Intended pinned-browser Linux CI, including full E2E and visual comparisons, passed for the updated A09 tree ([CI run](https://github.com/Grabman1987/budget/actions/runs/36884718261)); no existing baselines changed. The local mobile Regelwerk difference is byte-identical on the reviewed unchanged parent; this does not claim the entire local browser suite is green or replace owner design acceptance.
- [x] A07 exact lead amounts: format once and split for display; literal expected-value tests plus rendered cents/grouping/sign boundaries on all three pages, desktop and mobile. Pinned-browser visual acceptance remains a CI requirement.
- [x] A06 categorized income: allocation/rules include allowed income categories; distinguish transfers, refunds and contact repayments.
- [x] A01 trade settlement integrity: generic update/delete/bulk/reconcile/undo cannot detach a trade from its cash flow.
- [x] A08 booking currency invariant: amount/currency match account, original currency explicit; shared contract in create/update/transfers/import.
- [x] A05 payment lifecycle: edit/delete/rematch/undo recompute status, links, amounts and related totals.
- [x] A03 EUR-first guard: unsupported on-budget foreign currencies never enter EUR sums silently; create/update/import/existing accounts covered.
- [x] A03 account overview aggregation: keep native balances in the account DTO and expose shared EUR account/total values; overview totals, changes and closed residuals use the shared valuation, with explicit missing-rate behavior.
- [ ] Follow-up FX detail acceptance: individual account tables, charts and reconciliation still use native amounts; make those views explicit and consistent with the overview's EUR valuation.
- [x] A04 persisted Gate-2 reconciliation: each mapped account/month-end and category checked; structural missing-account/currency/opening-data differences reported explicitly; one-cent added/missing/changed/deleted cases detected, including non-budget and closed accounts.
- [ ] Separate agent-assisted EUR migration/Gate 2 after corrections and operational acceptance; establish private file access and transfer procedure; never commit exports/mapping or include them in CI/logs.
- [x] A02 investment costs use historical account-currency FX at each trade/snapshot date; current price valuation, fees/income and typed missing-rate behavior are consistent before Gate 3.
- [x] A09 realized gains persist independently of live holdings and later snapshots; moving average is the default, FIFO is persisted via Einstellungen › Depots & Kryptos; source transactions and broker-withheld taxes are preserved.
- [x] A10 broker/risk aggregation preserves account/institution for securities at multiple brokers. Both portfolio summaries and rule inputs use account ownership, retaining one security/class total and the existing Crypto/P2P limits; six independent synthetic regression cases verified.
- [x] Missing-quote browser scenario uses a fresh real server, database and passkey session per test attempt; desktop/mobile, repeats and retries cannot share unpriced holdings. Existing valuation, history, undo/redo and accessibility assertions remain unchanged.
- [x] Manual-price API writes have an atomic user audit group, support insert/update undo and redo, and refuse stale undo conflicts; refreshes retain their external-series behavior and manual-price protection. The complete wealth capture UI remains open.
- [x] First successfully stored network quotes record their actual write timestamp atomically; seeds/imports, failed/empty fetches and protected manual rows do not claim a refresh. Unchanged reruns retain the same history. Initial manual-entry time and live-source acceptance remain separate.
- [ ] Live adapter validation and complete manual valuation workflows before accepting those wealth workflows.

After EUR acceptance: complete Heute/contacts/inbox daily workflows, PP commit/matching and Gate 3, remaining wealth/source/report/PWA scope and Gate 4. Prototype-host removal is separate from retiring still-used finance tools.

## Future feature candidates — owner inspirations

Backlog: [`inspirations.md`](inspirations.md). These are possible later improvements, not accepted implementation scope. The ordered audit corrections, EUR migration and operational/product gates retain priority. All six source links are collected; source contents remain unreviewed because access is policy-blocked.

- [x] Create a durable collection of owner-submitted inspiration links with stable IDs, access status and existing feature overlaps.
- [ ] Review I01–I06 when source access or excerpts are available; extract specific useful interactions before scheduling implementation.
- [ ] Evaluate multiple goals per category (I02) against P3.4 savings goals, including allocation without double counting.
- [ ] Evaluate distribution preview in a side panel (I03) against the existing waterfall/rules; bank reconnect reminders depend on P4 connections and reliable expiry data.
- [ ] Evaluate debt-payoff strategy comparisons (I04/I06) against existing debt/Sondertilgung scope, shared calculations and explicit assumptions. Plannrr (I05) needs a demo or description first.

## P1 Fundament

### P1a — Repo scaffold and stack spike (`docs/prompts/P1a.md`)
- [x] npm workspaces: `apps/web`, `apps/server`, `packages/domain`, `packages/db`, `packages/ui`, `packages/fixtures` (worker later)
- [x] TypeScript strict, shared tsconfig, ESLint, Prettier, Vitest; `npm run check` = typecheck + lint + unit tests
- [x] `apps/server`: Hono app with `/health`, serves the built web app, strict CSP (`script-src 'self'`), HSTS
- [x] `apps/web`: Vite + React + TanStack Router + Query, one route rendering "Budget" in the blueprint fonts
- [x] `packages/domain/money`: cents type, de-AT formatter (`1.234,56 €`, real minus, sign option, no-cents option), arithmetic amount parser (`12,50+8,20`, `1.576`, `× ÷`, no eval) with tests ported from `design/prototype/app.js` behaviour and `reference/finance-hub/money-input.mjs`
- [x] `npm run proto` serves `design/prototype` on port 5180
- [x] Playwright set up (`npm run test:e2e`) with one smoke test
- [x] Dockerfile (Node 22, multi-stage), `fly.toml` (region `fra`, volume mount `/data`, app name from env/placeholder)
- [x] GitHub Actions: `ci.yml` (check + e2e on PRs), `deploy.yml` (on push to `main`: `flyctl deploy --remote-only`, skipped when `FLY_API_TOKEN` is not set)
- [x] Chart spike: render the Heute pace chart and one Sankey from prototype data with own SVG + d3-scale/d3-shape; note the decision in `docs/adr/0001-charts.md`

### P1b — Design tokens and blueprint primitives (`docs/prompts/P1b.md`)
- [x] Tokens from `.impeccable/design.json` / `DESIGN.md` → CSS custom properties + Tailwind theme; light and dark (`prefers-color-scheme` + manual toggle), print tokens
- [x] Self-hosted fonts from `design/prototype/fonts/`
- [x] Primitives in `packages/ui`: TitleBlock (Schriftfeld), Registers, DimensionChain (inline, with balancing of rounded parts), PartsList (Stückliste with groups and positions), RevisionTable, AmountInput (uses domain parser), Segmented, Switch, SidePanel / BottomSheet, Toast with undo, Status stamps, class swatches (need/want/future hatching)
- [x] Chart primitives: axis/graticule, line (solid/dashed/dash-dot), bars around zero, step line, band, elevation mark
- [x] Dev page `/dev/bauteile` showing every primitive in light and dark
- [x] Own regression baselines for every primitive on `/dev/bauteile` (light and dark, 1440 and 390): screenshots of our own output, **not** a comparison with `design/screens`
- [x] Title block, register row and shell chrome compared with crops of `design/screens` (masked text; `e2e/reference.spec.ts`, audit D9)
- [x] Keep the topbar geometry comparison on the prototype’s explicit nine-item fixture; real zero/error/live inbox counts remain independently tested. Reuse retry-aware account/payee names in ledger browser tests so retained partial attempts do not cause ambiguous selectors or duplicate-name conflicts. Capture instrument screenshots after Undo/Redo checks so capture time does not consume the toast lifetime. No reference images, masks or tolerances changed.
- [ ] Primitives without a matching crop in `design/screens` (amount field, panels, toast, revision table, parts list, charts, drawn Maßkette) are not compared with the prototype yet

### P1c — App shell and routing (`docs/prompts/P1c.md`)
- [x] Desktop: sidebar "Planliste" 01–05 with collapse, top bar (search Ctrl K, Posteingang with counter, + Buchung), theme toggle, profile
- [x] Connected global search: session-protected queries (2–200 characters), at most five results each for bookings/payees/categories/accounts/contacts, existing destinations with reload-safe booking/contact links, loading/empty/retry states, Ctrl K/arrow/Enter/Escape and mobile bottom sheet; synthetic API/browser verification. Owner acceptance remains open.
- [x] Mobile (< 768 px): header, tab bar, floating + button; same routes and order
- [x] Routes for all areas and registers (SPEC §3) with placeholder pages built from TitleBlock + Registers; every view has its own URL
- [x] Side panel (desktop) / bottom sheet (phone) pattern wired to a route param
- [x] Shell regression screenshots at 1440 and 390 (own baselines, `e2e/shell.spec.ts`)
- [x] Shell compared with `design/screens` (layout, not data): sidebar, top bar, title blocks and register rows at 1440, phone header at 390 (`e2e/reference.spec.ts`; the phone title strip and register row are not compared because they differ on purpose: labels are shown, 44 px touch targets)

### P1d — Database, fixtures and domain core (`docs/prompts/P1d.md`)
- [x] Drizzle schema v1 for the entities in SPEC §5, migrations, repositories; soft delete; audit log with undo; idempotency keys for imports
- [x] `packages/fixtures`: deterministic TypeScript port of the sample ledger generator in `design/prototype/reports-core.js` producing real bookings (not monthly sums) for Okt 2023 – 17.09.2026
- [x] Dev seed script loads the fixtures into SQLite
- [x] Domain: account balances from bookings, envelope month (assigned / activity / available, rollover), `alloc` (50/30/20 as twelfths), net worth series
- [x] Tests reproduce prototype figures (e.g. net worth 17.09.2026 = 84.730 €; August 2026 allocation Bedarf/Wunsch/Zukunft/Rest as in the One-Pager)

### P1e — Passkey login, security, deploy (`docs/prompts/P1e.md`)
- [x] SimpleWebAuthn registration and login, several passkeys, ten recovery codes, session cookie (HttpOnly, SameSite=Strict, 30 days), step-up for sensitive actions
- [x] First-device bootstrap via one-time setup token from an environment secret; no open registration
- [x] Rate limiting on auth endpoints; audit of logins
- [x] Litestream backup to object storage (config + restore instructions in `docs/ops.md`)
- [ ] Operational acceptance: target reported deployed; compare `/health` revision with the successful deployed CI SHA, then verify phone/desktop login, recovery and real encrypted restore (owner checklist in `docs/ops.md`)

## P1f Audit fixes (`docs/audit/2026-09-29-p1-audit.md`)

Order: P1f-1 → first deploy (after P1f-2 B1–B3) → P1f-3 before P2; P1f-4 in parallel. B5 (encrypted backup) before any real data.

### P1f-1 — Deploy, CI and build (`docs/prompts/P1f-1.md`)
- [x] A1 deploy only after green CI on `main`, `workflow_dispatch`, branch protection documented
- [x] A2 actions pinned to SHAs, token only in the deploy step
- [x] A3 `--ha=false`, single-machine guard, first-deploy order in docs
- [x] A4 lockfile in sync (jsdom)
- [x] A5 `BUDGET_REPLICATE=1`, health grace period
- [x] A6 rollback runbook, additive migrations rule, Litestream commands verified
- [x] A7 Windows paths (`fileURLToPath`), `.npmrc ignore-scripts`, engines, working `npm run dev`, e2e container
- [x] A8 Dependabot, digest pins, unused deps, SIGTERM
- [x] A9 README/SPEC drift

### P1f-2 — Auth and backup (`docs/prompts/P1f-2.md`)
- [x] B1 audit-log flood bounded
- [x] B2 recovery sessions revocable, "Alle anderen Sitzungen beenden"
- [x] B3 body limit
- [x] B4 recovery codes with pepper
- [x] B5 client-side encrypted backup (**blocker for real data**)
- [x] B6 rate limiter IPv6 /64 and capped
- [x] B7 low-severity hardening
- [ ] B8 second, independent storage target for the encrypted backup with its own credentials (owner decision 29.09.2026: yes, later; until then monthly manual download per `docs/ops.md`)

### P1f-3 — Data model and domain (`docs/prompts/P1f-3.md`, before P2)
- [x] C1 envelope rollover per concept §5.3
- [x] C2 "Zu verteilen" by on-budget status
- [x] C3 income categories and income types
- [x] C4 split-level transfers, idempotent transfer import
- [x] C5 one opening-date rule
- [x] C6 account type and on-budget flag
- [x] C7 foreign-currency fields
- [x] C8 undo keeps invariants
- [x] C9 extended CHECK enums
- [x] C10 holdings per account, FIFO, FX, cash-flow returns
- [x] C11 read models, Vienna date module, rounding
- [x] C12 cheap model gaps
- [x] C13 stronger figure tests and fixture coverage
- [x] C14 model needs of the YNAB import (card payment kind, flag, staging tables, mapping per run)

### P1f-6 — Credit card overspending by YNAB's rule (owner decision 30.09.2026)
- [x] Funded card spending, credit vs cash overspending, covering later in the month, refunds and payments in `budgetMonths` (`cardRule: 'ynab' | 'concept'`, default `'ynab'`); worked examples and the P2d export cases in `docs/migration/ynab-export.md`

### P1f-4 — Frontend (`docs/prompts/P1f-4.md`)
- [x] D1 PartsList keyboard
- [x] D2 toast live region and in-dialog
- [x] D3 route titles, search params, panel state
- [x] D4 page frame as in the prototype
- [x] D5 full Maßkette primitive
- [x] D6 dev routes not in production
- [x] D7 AmountInput a11y
- [x] D8 details as listed for PR 1, `eslint-plugin-jsx-a11y`, axe on every route
- [x] D8 remainder: TitleBlock "Stand" long/short pattern (`StandValue`)
- [x] D8 remainder: ElevationMark shelf under the label, Sankey class nodes not solid for want/future (P1f-5)
- [x] D9 honest visual comparison against `design/screens`
- [x] D10 phone layout: bottom padding under tab bar and + button, title-block fields with label, header title, register scroll cue, recovery-code sheet (owner screenshots)

Process from P1f on: one branch per task, PRs ≤ ~1.500 changed lines, tick only what the repository proves.

### P1f-5 — Prototype fidelity (owner review 30.09.2026, side by side with `design/prototype`)
- [x] Theme button as in the prototype: names the target ("Dunkle Blaupause" with moon / "Heller Zeichenfilm" with sun), follows the system until the first switch
- [x] Phone title strip compact as in the prototype: values only, labels kept where the value alone is ambiguous (Einnahmen, Bank-Sync); no empty strip
- [x] Reports catalog as in the prototype: Stand and Datenbasis, one table with quiet assembly rows, chart form in technical caps, Steuerung with print mark, row chevron, whole row clickable; stacked rows on the phone
- [x] Motion as in the prototype: solid chart lines plot in 900 ms (optional 260/520 ms stagger), annotations fade in (500 ms after 380 ms); the Maßkette plots only its result line
- [x] ElevationMark shelf under the label; Sankey want/future nodes hatched with outline


### Plan year follow-up — read-only overview (2026-10-02, PR #133)
- [x] Connect Plan › Jahr to all twelve existing budget-month reads; category and group detail, signed assigned/activity annual sums and December available balance (never sum rollover balances).
- [x] Sticky category column on desktop; all metrics, month selector and category annual values on a 375px phone, with read-only year navigation.
- [x] Independent literal domain regression cases and real-server Playwright behaviour tests; no schema or financial mutations.
- [ ] Owner visual/device acceptance and the remaining annual scenarios/editing workflow.

## P2 Kern und Migration

Starts after P1f-3 is merged. Source: YNAB export (`docs/migration/ynab-export.md`); Actual is not migrated. YNAB's categories and habits are evaluated and adapted via an owner-approved mapping, not copied. The export and mapping stay in the owner's authorized private migration environment, never in the repo, CI or logs. No app import UI. **Gate 2:** balances per account and month match YNAB to the cent; Available per target category matches the mapped YNAB categories before the rules month.

Order: P2a → P2b and P2c in parallel → P2d (parser can start right after P1f-3) → owner's import on the deployed app (after P1f-2 B5).

### P2a — Accounts and bookings (`docs/prompts/P2a.md`)
- [x] API and repositories: accounts (type, on-budget, terms, closed), bookings with splits and transfers, payees; validation, audit, undo (`docs/api-ledger.md`, PR `p2a-api`)
- [x] Konten › Übersicht, Einzelkonto (balance line, bookings, flags, status), Alle Buchungen (filter, search, bulk edit) (PRs `p2a-ui`, `p2a-ui-2`)
- [x] Kontostand prüfen with "doppelt" / "fehlt" and Ausgleich booking (reconciliation snapshot) (PRs `p2a-api`, `p2a-ui-3`)
- [x] P2a review follow-ups (PR `p2a-followups`):
  - [x] Tests: undo and redo of a transfer edit, redo of a transfer, single-leg undo refused
  - [x] Payee merge skips reconciled bookings unless unlocked, reports `skipped`
  - [x] Opening balance/date locked once a Kontostand prüfen is stored, unless unlocked
  - [x] Check day at most today (Europe/Vienna); future bookings are never stamped
  - [x] `createApp` refuses the ledger without auth
  - [x] Einzelkonto: month bounded to its last day, "Weitere Buchungen laden" instead of a cut at 200
  - [x] Account sort in one transaction
  - [x] UI: failed "Wiederholen" toast, bulk delete confirmation, "Umbuchung (beide Seiten)", URL filters validated like the server
  - [x] Moving a booking to an account in another currency is refused (the cents would change meaning)

### P2b — Capture dialog (`docs/prompts/P2b.md`)
- [x] Buchung, Split, Umbuchung (Konto → Konto) on desktop panel and phone sheet; amount field with arithmetic; payee autocomplete with default category; keyboard flow; undo toast (PRs `p2b-capture`, `p2b-capture-form`, `p2b-capture-split`)

### P2c — Categories and Plan › Monat (`docs/prompts/P2c.md`)
- [x] Einstellungen › Kategorien: groups, classes, kinds, stages, targets, hide, merge (with re-assignment of bookings), drag sort, split-off, monochrome emoji icons (PR `p2c-categories-ui`)
- [x] Budget API: month summary, assign, move, cover overspending through `budgetMonths` (cardRule `'ynab'`); categories API incl. merge and split-off; property tests stock = flow and merge keeps totals (PR `p2c-categories`)
- [x] Plan › Monat: waterfall with 9 stages, views (Stückliste, Zeit, Triage), Geld verteilen, overspending and card payment per concept §5.3 (cash overspending red, credit overspending as new card debt; PR `p2c-plan`)

- [x] P2c review follow-ups (API, domain, fixtures): Decken from "Zu verteilen" capped unless confirmed (`allowNegative`), card payment keeps kind and card, split-off only on live bookings and stores the new category's target, waterfall ties by group then category order, fixture targets without double counting (periodic 2026 amount on its due day, several dates as a monthly twelfth), sample plan funded by R03, tests for merge undo (tree, targets, opening envelopes, payees) and card rule (rollover, two cards)
- [x] P2c review follow-ups (UI):
  - [x] Decken from "Zu verteilen": "Nur x decken" or the explicit "Trotzdem ganz decken (Zu verteilen wird negativ)"; a refusal shows as a toast
  - [x] Assign fields: the pre-filled (also negative) figure is absolute; + / − is relative only when typed first; Enter or Escape never commit twice or on Escape
  - [x] Card payment: kind and card read-only
  - [x] Merge: never into income or card payments; notes for a hidden target and an overspent source
  - [x] Zeit view: periodic and by-date targets due on their own day
  - [x] Sorting: repeated ↑ / ↓ builds on the last move (focus stays); phone ↑ / ↓ buttons, one undo per move

### P2d — YNAB import with mapping (`docs/prompts/P2d.md`)
- [x] Parser for Register.tsv / Plan.tsv incl. CESU-8 emoji repair, splits, transfer pairing; synthetic fixture export in the real format
- [x] Mapping document (zod schema), `applyMapping` to the target model (opening balances and Available at the start month, n:1 merges, drop, rules), source-to-mapped-target reconciliation — `packages/import-ynab`; persisted account/month checks remain open in A04
- [x] Import review follow-ups: all bracket-note forms, cash advance (card → budget account) in `budgetMonths`, scheduled rows after the export date, one `card_payment` target per on-budget card, Ready to Assign from the export's own budget status, rules never on transfers or tracking accounts, problems by index/hash, account proposals (closed, paid-off loan), trimmed account names, hidden categories under their original group, split payees, start-month income, hand-computed card expectations; deployed owner-import acceptance remains below
- [x] Raw staging, dry run with side-by-side structure, commit as one reversible import run, idempotent re-import (PR `p2d-wizard`)
- [x] Import wizard in Einstellungen › Datenquellen (step-up), reconciliation report page (Gate 2) (PR `p2d-wizard-2`)
- [ ] Owner: category evaluation and mapping done, real import on the deployed app, Gate 2 report without difference

## P3 Planung und Steuerung
Expected payments, contacts with receivables, savings goals, rule set R01–R16 + stages, Heute page, Posteingang basics.
- [x] P3.3 `p3-kpi-domain`: pure KPI, pace, free-until-payday and liquidity-forecast functions in `packages/domain/src/{kpi,forecast}`
- [x] Shared budget/category/goal/inbox write toasts report refused undo/redo and connection failures in German; rejected actions preserve stored/query state, successful audited chains retain refresh behavior
- [x] P3.4 `p3-goals`: savings goals domain (`packages/domain/src/goals`), repo and `/api/goals` (audit, undo, adopt as category target), Plan › Sparziele page (parts list Offen/Erreicht, bars, panel)
- [x] P3.5 `p3-rules-api`: rule engine `packages/domain/src/rules` (R01–R16 with zod params, `evaluateRule`, Finanz-Check summary), `ruleInputs` / `evaluateRules` / `financeCheck` read models, `ensureDefaultRules` at start, stage checklist with owner confirmation, additive `rule` migration, `/api/rules`
- [x] P3.7 `p3-regelwerk-ui`: Einstellungen › Regelwerk (`apps/web/src/rules`): stage checklist in three columns with owner confirmation of non-computable items, rules R01–R16 with typed threshold panel (status, next step, undo), switches and thresholds as audited PATCH with undo toast
- [x] P3.9 `p3-heute-api`: `GET /api/heute?period=month|payday&month=` (one request: stand, lead with chain and drill-down, balance actual and forecast with salary jump and low point, pace, pinned envelopes, upcoming 14 days, Finanz-Check, net worth with delta and 12 month ends, last bookings, next steps), `packages/domain/src/heute`, `heute` read model, `category.pinned_at` (migration 0010) with `PATCH /categories/:id {pinned}`, pinned fixtures
- [x] P3.10 `heute-page`: Heute wired to its read model (month/payday URL, lead drill-down, balance and pace, pinned envelopes, upcoming payments, Finanz-Check, net worth, latest bookings and next steps); capture/budget/rule edits and undo/redo refresh Today, actions open the source month or uncategorized bookings through today, mobile urgent step follows the lead. Browser coverage includes capture/undo/redo, actual navigation, negative lead in both themes, retry, empty states and settled chart endpoints; owner visual acceptance remains pending.
  - [x] Owner follow-up 2026-10-02: payday selection disabled outside the current month, URL/month fallback, Austrian business-day 15th planning rule, and month-specific Decken in multi-month plans; [behavior and calendar contract](month-navigation.md).
  - [ ] Follow-up delivery acceptance: full check, desktop/mobile browser evidence and owner device review (PR #132).

- [x] Expected payments (P3.2): schedule domain (due dates, Austrian business days, versions, occurrences, matching), `date_shift` migration, repositories with audit and undo, `/api/expected`
- [x] P3.6 `p3-expected-ui`: Plan › Erwartet (next 90 days by week, Verträge und Abos / Alle parts list with monthly and yearly sums and original currency, payment panel with fields, versions, occurrences, link/unlink/missed), "Als erwartete Zahlung anlegen" on a booking, Einnahmen panel on Plan › Monat (`/api/expected/income`)

### P3 — Contact statements and settlement (owner decisions 2026-10-01)

- [x] Pure actual contact statement and oldest-outlay-first repayment allocation, editable before saving; expected occurrences excluded
- [x] Audited atomic settlement API with persisted excess contact credit, whole-action undo/redo and dependency checks (including forced undo)
- [x] Konten › Kontakte: nonzero overview, balanced-history toggle, contact creation, Kontoblatt and actual EUR cash repayment with editable allocation
- [x] Synthetic acceptance: 30 + 70 outlays / 40 repayment, edited allocation, 100 owed / 120 receipt / 20 credit, balanced history retained, cash-only net worth through outlay/receipt
- [ ] Owner review of the contact workflow on the deployed app; foreign-currency contact statements remain outside this bounded EUR slice

### P3 — Posteingang basics

- [x] Actual queue and shell counter: one task per due nonzero unclassified budget booking plus unresolved stored warnings; no sample counter or legacy summary double count
- [x] Konten › Posteingang and global desktop/mobile panel: categorize in the existing booking editor, confirm pending bookings, acknowledge stored warnings with audited undo/redo
- [x] Shared ledger invalidation refreshes the queue, count and Heute reads after mutations/undo; safe empty/error/loading states and keyboard/touch actions
- [ ] Bank/assignment suggestions and source repair workflows; acknowledging a warning does not repair its source
- [ ] Independent review, CI and owner acceptance of this workflow on the deployed app

### Y21 — Receipts

- [x] Content-addressed volume storage (`RECEIPTS_DIR`), additive receipt metadata and n:m booking links; audited upload/link/unlink/remove and guarded undo/redo
- [x] Session/origin guards, 15 MiB file limit, magic-byte MIME allowlist, JPEG/PNG/WebP metadata removal and safe authenticated download/thumbnail responses
- [x] German booking Beleg section and capture-first Posteingang list with explicit later booking assignment; no automatic booking
- [x] Nightly encrypted archive includes retained receipt blobs; legacy DB-only backup retention preserved; restore runbook and metadata limits in [receipts](receipts.md)
- [x] Synthetic file/API/encrypted-restore tests, additive migration upgrade preserving legacy links, and scoped browser checks with desktop/mobile light/dark [visual evidence](evidence/receipts/README.md)
- [ ] Owner: real-phone camera capture, directory/space checks and encrypted DB-plus-receipt restore after deployment; independent review/CI acceptance

## P4 Datenquellen
Enable Banking adapter, worker with nightly run and catch-up, inbox items, assignment rules and source status in Einstellungen › Datenquellen. Manual file imports are excluded from app scope; all-account/depot CSV export is available as a step-up authenticated ZIP.

### P4.1 — PSD2 bank sync into the inbox
- [x] RS256 adapter, step-up/session-bound consent, encrypted session/account identifiers, owner-selected EUR account mapping.
- [x] Booked transaction staging and balance warnings, reference/fallback deduplication, explicit confirmation with audit/undo; no automatic bookings.
- [x] Separate nightly worker on the same volume, catch-up, durable leases/backoff, queued manual refresh and consent reminders.
- [x] Datenquellen status/mapping UI and owner setup in `docs/DATA_SOURCES.md`; synthetic HTTP, domain, workflow and browser tests.
- [x] Review corrections: changed-reference updates/warnings, duplicate-reference fallback, isolated account failures, 21-day overlap and durable four-request/day limit; tolerant rows/undated balances, stable balance warnings, redacted auth/config failures, callback pruning and versioned encryption.
- [ ] Owner: register application, configure secrets, connect accounts, reconcile the first run and demonstrate 14 stable nights.
- [ ] Assignment-rule engine, ambiguous history changes and transfer matching remain separate acceptance work.

## P5 Vermögen
Price history (yfinance + Ariva, source per price), ECB rates, trades and holdings, portfolio performance, allocation, Sparpläne, debts with extra repayment, freedom number with Soll-Pfad. **Gate 3:** returns and holdings equal Portfolio Performance.

### P5.0 — Shared wealth arithmetic correctness
- [x] Exact half-up rounding for odd divisors and divisor one, including signed ties, single-month annualisation and zero progress; no extra cent or basis point from the rounding offset.

### P5.1 — Market data: price and FX sources behind adapters (`docs/market-data.md`)
- [x] `packages/market`: Yahoo chart (daily close, unadjusted by default, adjusted per security), Ariva CSV fallback (flag, off), ECB SDMX (inverted on integers), deterministic fixture sources; decimals parsed to micro-units without floats; fixed-text errors without URLs
- [x] Migration on `security`: `fallback_quote_id`, `quote_exchange`, `prices_enabled`, `quote_adjusted`
- [x] Jobs `refreshPrices` / `refreshFx` (backfill, fallback, manual prices protected, `stale_value` inbox item per security and error class), in-process daily timer `BUDGET_MARKET_DAILY=1`
- [x] Live prices in production: Ariva (public HTML table, verified live; CSV needs a login) as primary source, CoinGecko as the primary crypto source (cryptocalc fallback for coins without a coin id), Yahoo last resort; `security.quote_url` / `coingecko_id`; nightly 02:30 Vienna run (previous day's close, ECB in the same run) with catch-up; `market_run` log behind "Stand ... Kurse"; `fly.toml` switches (`docs/market-data.md`)
- [x] Daily sample prices (seeded Brownian bridge through the month-end prices) and a daily USD rate series; parity figures unchanged
- [x] API: `POST /market/refresh`, `GET /securities/:id/prices`, `PUT /securities/:id/prices/:date`, `GET /fx`
- [ ] Owner: Yahoo symbol, Ariva id and exchange per real security, adjusted or not as in PP, Ariva access (see `docs/market-data.md`)

### P5.10 — Portfolio Performance XML parser (`docs/migration/pp-export.md`)
- [x] `docs/migration/pp-export.md`: client version and scales, securities and prices, account and portfolio transaction types, units (fee, tax, gross value, forex), cross entries, XStream references, taxonomies, mapping table
- [x] `packages/import-pp`: XXE-safe XML reader (no DTD, size and depth limits), reference resolver, model builder with path-addressed problems, mapping to securities, prices, investment accounts, trades and bookings; integer conversion only
- [x] Synthetic PP file generator `packages/fixtures/src/pp` (`npm run fixtures:pp`, XStream shape, byte-stable); round trip ledger → XML → parse keeps trades, prices and holdings/cost (P5.2 functions)
- [x] P5.11 (operator CLI, no import UI by owner decision): mapping document, security matching, commit with one transaction per run, revert, `migrate-pp-cli.js`, Gate 3 report as data (`docs/ops.md` §13)
- [ ] Gate 3 stays open for the owner: real-data comparison with PP's own returns, cash-flow reconciliation, missing recent trades
### P5.2 — Performance: valuation series and portfolio performance (no UI)
- [x] `invest/series.ts`: daily valuation per position (units, carried-forward price, FX of the day, one rounding), cash flows of the "securities only" and "depot incl. reference account" views, semantics documented
- [x] `invest/performance.ts`: `periodWindow`, TTWROR over daily sub-periods, XIRR and the prototype's Modified Dietz, volatility, max drawdown, Sharpe (2,5 %), beta, best/worst month, share of positive months
- [x] `invest/cost.ts`: one `costOf` (FIFO default, average), `gainOf`, `terOf`, realised gains, income and fund costs of 12 months
- [x] Read models `valuationSeries`, `cashSeries`, `portfolioFlows`, `netWorthDaily` (own vs market); property tests against `holdingValuesAsOf` / `netWorthAsOf` on random days
- [x] Tests: prototype PERF per period, hand-computed Portfolio Performance cases, sample-ledger figures (+38,2 % since Oct 2023)

### P5.4 — Vermögen frame and Nettovermögen (`docs/api-ledger.md`, section Wealth)
- [x] API `GET /wealth/networth?period=` (daily series, bars per week up to 3M else per month, chain Anfang + Eigenleistung + Markt = jetzt, composition per account) and `GET /wealth/stand`; pure `netWorthWindow` / `bucketNetWorth` in `packages/domain/ledger`
- [x] Vermögen frame: Stand ("Do 17.09.2026 · Kurse 06:30"), Zeitraum 1M 3M YTD 1J 3J Alles in `?zeitraum=` (default YTD, kept between the registers), registers
- [x] Page `/vermoegen/nettovermoegen`: head with change, figure, daily line (plots 900 ms), own bar band (Eigenleistung ink, Markt pale), legend, Maßkette, "Woraus es besteht" (debts dashed); two columns on desktop, stacked on the phone
- [x] Tests: window/bucket unit tests, API tests (jetzt = Konten net worth = 84.730,00 EUR, chain adds up for every period), e2e on the sample server, layout comparison with `vermoegen-netto`, own baselines (Linux), axe
- [x] Stand shows the timestamp after the first successful network price write (`price_audit.ts`); seed/import prices without recorded fetch remain unstamped. Failures, manual protection, fallback, repeated refresh and transactional rollback have regression coverage.
### P5.5 — Invest API: securities, trades, savings plans, asset classes, portfolio summary (no UI)
- [x] Migration 0008 (additive): `savings_plan` (rows end and restart on a change, `valid_to` inclusive)
- [x] Repos: securities (ISIN unique, delete refused while in use), asset classes with versioned targets (sum = 10 000 bp per `valid_from`), trades of all kinds with unit sign rules and idempotent `import_key`
- [x] Every trade has a settlement booking on the investment account (buy -(amount + fee), sell amount - fee - tax, dividend/interest as income Kapitalerträge), one audit group per trade, undo
- [x] Domain `invest/savings-plan.ts` (`plannedExecutions`, `matchExecutions` +-3 days with fee tolerance, `planChanges`) and `invest/trade-rules.ts`; apply of a proposal ends and restarts rows from the next execution day and opens the inbox item "Sparplan bei der Bank ändern"
- [x] `/api/securities`, `/api/asset-classes` (+ `/targets`), `/api/trades`, `/api/savings-plans` (+ `/executions`, `/proposal`, `/apply`), `/api/portfolio?period=&view=`
- [x] Depot view: a plain booking on a reference account is an external flow (inflow = Einlage, outflow = Entnahme); interest, dividends, fees and taxes stay performance
- [x] Sample savings plans; tests incl. the 17.09.2026 portfolio figures of the prototype

### Missing-quote valuation guard
- [x] Explicit nullable current account/position values and missing-price metadata; known basis and CSV rows retained. Numeric helpers and held-day history reject missing quotes rather than inventing zero or gains; genuine domain zero quotes and zero units remain valid.
- [x] Today keeps budget/upcoming/bookings usable, with unavailable finance-check/net-worth sections and German reasons.
- [ ] Partial-history charts and separately available legacy summary fields; independent financial review and private reconciliation remain required.

### P5.6 — Current portfolio positions and instrument detail
- [x] `/vermoegen/portfolio`: original lead/chain and class-grouped positions, shared server value/basis/gain/shares, per-broker ownership and explicit unknown price/FX/basis; read-only instrument detail in `?produkt=` with actual account navigation
- [x] Manual quote capture with date/source/currency, exact micro precision, existing audited price API and undo; literal projection/mutation tests and desktop/mobile light/dark browser evidence
- [x] Basic instrument creation/editing (name, kind, currency, ISIN, symbol, existing asset class), empty-portfolio entry and instruments without holdings; existing audited API/undo, dirty/pending-save guards, validation and reload/error states. Source/cost settings and broker ownership are preserved.
- [x] Current-only class allocation/rebalancing hints using shared risk calculation, original Soll/Ist bands and revision rows; audited dated target editor and basic class creation with undo/redo, unknown/nonpositive valuation and dirty/pending navigation guards
- [x] Instrument metadata and manual quote forms protect dirty edits during browser Back and route changes; pending writes reject navigation, successful creation opens the saved instrument, and explicit close/discard prompts only once. Native unload protection remains browser-controlled.
- [x] Manual buy/sell creation and editing plus source trade history, including instruments without current holdings; exact units, account-currency gross/fees/withheld tax, atomic settlement and group undo/redo. Shared basis/valuation and per-broker ownership remain authoritative; no new oversell policy.
- [x] Savings-plan schedule list/create/edit/end in native investment-account currency; today's effective rate separated from future versions, source/history, inclusive end date, audited undo/redo, quote-independent reads and dirty/pending navigation protection. Saving schedules creates no trades, bookings or bank orders; changes at the bank remain manual.
- [ ] Trade deletion and capture of other trade kinds, extended instrument/source management and deletion, savings-plan proposal/execution UI and performance/report bodies remain later slices; owner design acceptance and Gate 3 private reconciliation remain open

### P5.7 — Current debts and unpersisted monthly repayment model
- [x] Schulden overview/chain from shared nullable current account values, actual account drilldown/history, explicit unsaved native-currency assumptions and existing server payoffPlan; typed limits/unknown states, no payment or contract writes
- [x] Literal projection/FX/safety/session/origin tests and desktop/mobile light/dark original-prototype geometry and browser evidence
- [ ] Persisted per-loan payment terms/scenarios, variable conditions, multi-loan strategies and connected debt/card rules remain later; private contractual reconciliation is open

### P5.8 — Freiheitszahl: forecast from today
- [x] Connected current R16 expense/investment sources and configurable multiple; explicit unknown quote/FX and short-history annualisation, original lead/chain/quarter progress and source navigation.
- [x] Explicit unsaved saving assumption and 5 % real-return default; shared monthly projection with +100 EUR comparison, bounded numeric errors, desktop/mobile light/dark and accessible values.
- [ ] Historical Soll-Pfad, chosen goal year and persisted assumptions await separate owner decisions; the complete freedom workflow and private acceptance remain open.


## P6 Reports und Umstellung
### P6 — Static PWA baseline
- [x] Build-versioned static shell cache, install manifest/icons derived from the existing brand mark, offline fallback and opt-in update prompt. API/auth/export/health are network-only.
- [x] Offline reload has no financial figures; a connection loss retains unsaved form state and shows an offline/stale-data notice.
- [ ] D07 offline booking persistence, retry/idempotency and conflict decisions, physical phone installation/passkeys and Gate 4 acceptance remain separate.

### Report 5.4 — Kontakte-Abrechnung
- [x] Fixed all-time EUR report with shared replay running balances/credit chain, nonzero overview, balanced history/deep links, per-person ledger/stair chart, pending metadata and real booking/contact source navigation. No sending/settlement duplication or month selector; unsupported currency makes the entire read unavailable.
- [ ] Independent financial review, owner design acceptance and private contact-ledger reconciliation; other report bodies and Gate 4 remain separate.

The 30 reports (SPEC §7), explorer, printable sheets, parallel run with reconciliation report. **Gate 4:** one month-end without difference, then retire remaining finance tools, including YNAB and PP. The prototype-only host was retired independently of this gate.

### P6.3 — Einzahlungen und Wert
- [x] `/reports/peinzahlungen`: opt-in monthly and calendar-year series from the existing securities valuation and flow read, with exact start + net flows + residual value change = end conservation; no duplicate valuation or flow formula.
- [x] Match the original report body with period control, value/cumulative-net-flow lines, monthly value-change bars and year rows. Label the securities-only scope and stored flow semantics; do not infer savings-plan or R12 attribution.
- [ ] Depot-inclusive flows and source-linked savings-plan/R12 attribution remain open until the source model supports them.

### P6.1b — Monthly table reports (1.5 to 1.8)
- [x] `GET /api/report-tables/months`: one read of the monthly ledger facts (income by type, spending and assigned per category from the shared budget calculation, Geldalter and net worth per month end); every figure is derived in `packages/domain/src/report-tables`.
- [x] `/reports/jahresansicht`, `/reports/kategorien`, `/reports/sparquote`, `/reports/gesamttabelle` with the prototype's sections, heat grid, previous-year comparison, Ist/Plan chart, Sparquote/Geldalter charts and CSV of the displayed table.
- [x] Owner decision 02.10.2026: Kapitalerträge are a visible memo row and never part of Einnahmen, Sparquote or income comparisons; Erstattungen (owner decision 29.09.2026) reduce the spending of the refunded category (payee's default category) in the month of the refund, only a refund without a category stays a labelled row.
- [ ] Owner/private acceptance against the real ledger; month-end net worth is withheld as a whole when a price or rate is missing.

### P6.4 — Rendite und Kennzahlen
- [x] `/reports/prendite`: selected-period summary from `GET /api/portfolio` in securities-only view (TTWROR, existing annualized metrics, netflows, period gain and end value) plus separately labelled lifetime realized gain/completeness; no new financial formula.
- [x] Suppress all report figures when the legacy portfolio summary returns `valuation_unavailable`; keep documented zero gains distinct from unavailable basis and preserve gains when open positions are empty.
- [x] Focused invest API cases, synthetic browser edge fixtures and read-only sample-ledger browser coverage on desktop/mobile; accessibility and horizontal overflow checked in light/dark mode. Evidence: [report 4.4](evidence/report-4.4.md).
- [ ] Benchmark comparison, asset-class comparison and monthly heatmap from the prototype; depot-inclusive view and owner acceptance remain outside this first report body.

### P6.5 — Empfänger-Analyse
- [x] `/reports/empfaenger`: connected closed-month recipient activity from shared budget `splitEffect` and Bedarf/Wunsch category rules, with explicit unclassified outflow disclosure and stable-ID/null-payee grouping
- [x] Signed refunds, distinct qualifying booking counts, live booking statuses, account opening dates, clamped 3J/all-history ranges and read-only recipient booking drilldown; no parent-amount duplication or purchase attribution
- [x] Literal API/domain boundaries and sample-backed desktop/mobile light/dark browser evidence; see [report 2.5 scope](payee-analysis-report.md)
- [ ] Full report-catalog acceptance, private-data reconciliation and any broader all-outflow report remain open

### P6.3.4 — Jahresvorschau Zahlungen (first source slice)
- [x] `/reports/vorschau`: twelve full future months from live stored expected-outflow contracts and all live amount versions, using the existing shifted due-date rules. Read-only `GET /api/expected/year-preview` requires a session and never materialises, matches or refreshes occurrences.
- [x] One pure projection feeds lead, chart and twelve-month payment calendar. Preserve native amount ranges/currencies, display unavailable contract amounts explicitly and overlay stored status/links once per payment/date. Linked actual bookings retain their own currency and remain separate from contract projection.
- [x] Literal domain/API cases, audited-write query invalidation and synthetic desktop/mobile light/dark browser evidence. See [report 3.4](evidence/report-3.4.md).
- [ ] Full original source coverage: independent investment savings plans, other future ledger transfers and their cross-source identity/dedup contract; no inferred category funding. Owner acceptance remains open.

### Security review — 2026-10-02

- [x] Time-bounded server source review, API no-store, production origin validation, debug authentication guard and safe unexpected/bulk errors; synthetic regressions and desktop/mobile browser checks. See [security audit](audit/2026-10-02-security-review.md).
- [x] S06-S08: default-off/non-production HTTP importer gate, per-owner/process export admission through stream cleanup, S3 full-request timeout and bounded/sanitized provider errors. Operator CLIs unchanged; synthetic regressions.
- [ ] S09: supported stable drizzle-kit upgrade remains unavailable (latest 0.31.11 retains vulnerable transitive esbuild); dependency unchanged, schema generation checked. Production verification and encrypted restore remain separate; no security certification claimed.

### P6.3.5 — Sparziele-Fortschritt (first source slice)
- [x] `/reports/sparziele`: stored goals at the existing API's server month; reuse progress, needed rate, last-three-month rate, forecast/status and bar geometry without a new money formula. Category sources mean month-end Available; account sources mean native cash balance, not securities value.
- [x] Guard unique live EUR sources; missing/deleted/dual/foreign/shared sources retain identity/date but no financial figures or status. Combined goal/category/account reads suppress cached figures during loading or failed refresh; no sums across goals.
- [x] Source table, read-only detail and filtered source-booking/Plan drilldowns; literal API/read-only and write/undo/redo refresh checks, real synthetic API browser, keyboard/Axe and desktop1440/mobile390 light/dark evidence. See [report 3.5](evidence/report-3.5.md).
- [ ] Original emergency-fund reach, Tagesgeld split, independently allocated money per goal, linear Soll path and owner acceptance remain open; I02 source allocation is not resolved by these guards.
