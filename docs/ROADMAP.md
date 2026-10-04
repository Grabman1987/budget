# Roadmap

### Claude Code project automations (2026-10-04)

- [x] Preserve Impeccable configuration; add offline cross-platform formatting and protected-file hooks with synthetic stdin tests.
- [x] User-invoked PR shipping/operator skills and read-only migration/money reviewers; see [Claude Code setup](claude-code.md).
- [x] Windows full check (291 files, 2,808 tests) and build; local run used two workers and a 30-second test timeout without changing repository defaults. Delivery uses a separate git directory/bundle because the worktree commit could not create index.lock.
- [x] Linux/Windows CI; owner acceptance in the next Claude session.

### Owner directive PR3 — Allocation quality and scope (2026-10-04)

- [x] Shared explicit account/instrument policy universe; signed investment cash, scope defaults and audited editable API metadata (Drizzle 0033).
- [x] Central unclassified value/share/count and exact/estimated/incomplete valuation details; provisional rebalancing and safe rule actions, suppressed provisional/out-of-scope savings optimisation.
- [x] Distinct Umschichtungsabstand and single-class Neues Kapital bis Soll with exact integer arithmetic.
- [x] Synthetic R07/R08, inclusion/exclusion, estimate/missing-FX, formula and metadata/undo/migration/restore regressions.
- [x] Final local typecheck/lint, all 2,797 unit/API tests (load-timeout files rerun alone), production/E2E builds and 81 affected desktop/mobile browser tests; details in the contract below.
- [ ] Draft PR/CI review and owner acceptance. PR4 settings, dynamic tiers and PR5 real-iPhone panels remain separate.

Contract and pre-change matrix: [allocation quality/scope](allocation-quality-scope.md).

### Owner directive PR2 — Risk policy unification and leverage (2026-10-04)

- [x] One stored R13/R14/R15 resolver across rule evaluation, Portfolio, rebalancing, report 4.2, savings recommendations and Heute/finance check; schema defaults only for missing values.
- [x] Central kind/leverage/optional-override classification, leveraged ETF risk, distinct market/gross cents and exact weighted gross splits.
- [x] Correct R13 standard wording and stored class-band precedence, including report month ends.
- [x] Synthetic R01–R06 and audited risk-policy undo/redo; existing 1× money/region/history invariants retained.
- [x] Final local check (286 files / 2,716 tests), production/E2E builds and affected desktop/mobile browser evidence (31 passed / 4 planned skips).
- [ ] Draft PR, Linux visual/CI review and owner acceptance remain separate.

Contract and baseline matrix: [risk policy](portfolio-risk-policy.md). PR3 quality/scope, PR4 settings and PR5 mobile panels remain separate.

### Owner directive PR1 — Historical asset exposure foundation (2026-10-04)

- [x] Drizzle schema/migration and explicitly labelled legacy seed-date assumption; preserve original storage and class cents.
- [x] One dated exposure resolver across allocation, report 4.2, class performance, R13, rebalancing, savings proposals and exports; exact weighted cents and unchanged regions.
- [x] Atomic validated replacement API, dated single-class instrument save, grouped audit/undo and same-day replacement regression tests.
- [x] Synthetic A01/A02/A03/A08, full-main-schema migration, FK, repeat migration and snapshot restore coverage. A07 target-policy changes are outside PR1.
- [ ] CI review and owner pre/post-production snapshot/count/value reconciliation. No deployment or real-iPhone acceptance is claimed.

Scope, baseline matrix and operational gate: [historical asset exposure](asset-exposure.md). PR2 risk, PR3 quality, PR4 settings and PR5 mobile primitives remain separate.

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
- [x] Follow-up FX detail implementation: account lead reuses the overview's EUR value; native cash, booking/running balances, daily charts and reconciliation show explicit currency and dated EUR valuations with stored rate provenance. Shared conversion/formatting, missing-rate states, native audited reconciliation/undo and synthetic unit/API/desktop/mobile coverage; see [currency contract and evidence](fx-account-detail.md).
- [ ] FX detail owner design/device acceptance and private native/EUR reconciliation; pinned Linux CI remains required before merge.
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
- [x] Y14: category/month event calendar, audited side-panel create/edit/switch-off/remove and undo/redo; once/monthly/quarterly/yearly/specific-month recurrences shared by report 3.1 and R07.
- [x] Unsaved selected-event mit/ohne scenarios: stored monthly Zu verteilen plus cumulative future event delta, month comparisons and December stock; no booking, assignment or extrapolated income.
- [ ] Owner visual/device acceptance of the annual planning workflow.

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

Expected payments, contacts with receivables, savings goals, rule set registered rules (`RULE_CODES`) + stages, Heute page, Posteingang basics.
- [x] P3.3 `p3-kpi-domain`: pure KPI, pace, free-until-payday and liquidity-forecast functions in `packages/domain/src/{kpi,forecast}`
- [x] Shared budget/category/goal/inbox write toasts report refused undo/redo and connection failures in German; rejected actions preserve stored/query state, successful audited chains retain refresh behavior
- [x] P3.4 `p3-goals`: savings goals domain (`packages/domain/src/goals`), repo and `/api/goals` (audit, undo, adopt as category target), Plan › Sparziele page (parts list Offen/Erreicht, bars, panel)
- [x] P3.5 `p3-rules-api`: rule engine `packages/domain/src/rules` (registered rules (`RULE_CODES`) with zod params, `evaluateRule`, Finanz-Check summary), `ruleInputs` / `evaluateRules` / `financeCheck` read models, `ensureDefaultRules` at start, stage checklist with owner confirmation, additive `rule` migration, `/api/rules`
- [x] P3.7 `p3-regelwerk-ui`: Einstellungen › Regelwerk (`apps/web/src/rules`): stage checklist in three columns with owner confirmation of non-computable items, rules registered rules (`RULE_CODES`) with typed threshold panel (status, next step, undo), switches and thresholds as audited PATCH with undo toast
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

### UX quick wins (`feat/ux-quick-wins`)

- [x] Device privacy toggle in header/profile and keyboard shortcut; monetary display/input/chart masking without changing stored values
- [x] Capture category available amount: retained existing grouped picker, warning ink and regression coverage
- [x] One authenticated storage-persistence request per device; status in Einstellungen › Sicherheit
- [x] Plan › Monat uncategorized/pending inflow, outflow and net row with booking links; no duplicate budget deduction
- [x] Rest verteilen fills an active populated split line with integer-cent remainder
- [x] Today attention links for overspending, monthly funding, inbox and sequential payment cover; hidden when empty
- [x] Mobile regression fixes: attention follows the urgent lead, privacy moves into the keyboard-accessible profile menu, and loaded zero account changes use the shared amount mask
- [x] Validated `/erfassen` draft links, safe login continuation, normal explicit save and documentation
- [ ] Delivery checks, draft PR and owner desktop/phone acceptance

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
- [x] Owner decision 41: BOOK transactions become unchecked, uncategorized bookings immediately; PDNG remains a candidate until confirmed. Per-connection confirmation-first override, stable-reference promotion/deduplication, bank balance warnings and separate replayable ledger audit; no automatic categorization or distribution.
- [x] Separate nightly worker on the same volume, catch-up, durable leases/backoff, queued manual refresh and consent reminders.
- [x] Datenquellen status/mapping UI and owner setup in `docs/DATA_SOURCES.md`; synthetic HTTP, domain, workflow and browser tests.
- [x] Review corrections: changed-reference updates/warnings, duplicate-reference fallback, isolated account failures, 21-day overlap and durable four-request/day limit; tolerant rows/undated balances, stable balance warnings, redacted auth/config failures, callback pruning and versioned encryption.
- [ ] Owner: register application, configure secrets, connect accounts, reconcile the first run and demonstrate 14 stable nights.
- [x] Assignment-rule engine and Einstellungen › Zuordnung: all/any payee/raw-text/regex/signed-amount/account/direction conditions; payee/category/percent-split/memo/flag/transfer actions, history preview, ordering, enable/disable, audit/undo and learn-from-confirmed-bank-row.
- [x] Source-specific bank payee cleanup and learned raw-to-payee aliases; raw evidence retained through memo edits, merge references updated with undo. Automatic rules prepare assignments; bank staging never posts without owner confirmation.
- [x] Explicit transfer actions preserve booking identity, pair unambiguous same-day/same-currency/opposite-amount bank candidates, and attach later bank evidence to generated counterparts without posting twice; ambiguous matches roll back. See [limits and validation](assignment-rules.md).
- [ ] Ambiguous bank history changes, broader transfer matching (including different posting days), and private owner/device acceptance remain separate work.
- [x] Bank follow-ups: closest +/-5-day manual-booking merge preserving memo/splits, confirmed mirror/selected-booking transfers with original dates, dated bank balance on Konten and guarded one-click reconciliation lock; grouped audit/undo, synthetic unit/API and isolated desktop/mobile coverage. Migration `0024_bank_followups` stores balance observations.
- [x] Einstellungen › Zuordnungsregeln merges the bank assignment rules and payee cleanup with the income budget-month defaults on one route (`/einstellungen/zuordnung`); migration `0032_assignment_rules`.

### Crypto read source (P4/P5)
- [x] Read-only current public API adapter; env-only key, paged resumable operation inbox, provider-ID deduplication and explicit investment/cash mappings.
- [x] Native balance warnings, audited page/cursor writes, existing nightly timer hook and step-up protected manual fetch/full replay in Datenquellen. See [owner setup and limitations](crypto-read-source.md).
- [x] Review fixes: mapping-independent acknowledgement/current display, row quarantine and categorized failures, tolerant balance reads with independent operations progress, unchanged-difference acknowledgement and bounded cursor history.
- [x] Automatic reconciliation of source operations against the existing ledger (trades, cash bookings, deliveries, informational stake moves), applied while staging and via the audited, undoable "Abgleich neu ausführen" in Datenquellen; summary erfasst / fehlt / ohne Zuordnung / informativ. See [Ledger reconciliation](crypto-read-source.md#ledger-reconciliation-abgleich).
- [ ] Owner key setup, private reconciliation and 14-day nightly acceptance; dedicated P4 worker and automated posting remain separate (the matcher never creates bookings or trades).
### Owner decision 42 — Income for the following budget month
- [x] Persisted per-inflow "für nächsten Monat" option in desktop/mobile capture and editing; retain cash date, category and income type, defer Zu verteilen across month/year boundaries through the shared budget calculation.
- [x] Einstellungen › Zuordnungsregeln: defaults per payee, income category or income type, specific precedence and explicit per-booking override. Apply to new owner captures/classification only; retain existing history. Audited rules and booking changes with undo/redo, bounded API validation and rejected transfer/contact/mixed-spend shapes.
- [x] Cash-flow/income reports keep booking dates; budget 50/30/20 uses the assigned month. Synthetic domain/API tests and fixed-clock isolated desktop/mobile browser scenarios cover save, edit, override, undo/redo, accessibility and both themes. Changed files, checks and the open Windows full-check blocker: [decision evidence](evidence/owner-decisions-41-42.md).
- [ ] Owner acceptance on actual bank feeds and the first month-end; ambiguous source identity changes still require manual review.

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
- [x] Audited trade deletion with linked cash settlement and undo/redo; capture/edit of dividend/distribution, interest, fee/tax, deliveries and signed split deltas using the shared holdings/cost/cash rules. Synthetic unit/API and desktop/mobile light/dark keyboard/browser coverage.
- [x] Due monthly savings execution proposals in Heute/Posteingang, including overdue months; owner-entered actual units/gross/fees, atomic buy/settlement/audit confirmation, stale/duplicate guards and monthly identity across schedule versions with deletion/undo/redo. Schedule saves and proposals never book money automatically. See [workflow and owner steps](trades-execution.md).
- [ ] Extended instrument/source management and deletion, rate-optimisation proposal/apply UI and remaining performance/report bodies; owner design acceptance and Gate 3 private reconciliation remain open

### P5.7 — Current debts and unpersisted monthly repayment model
- [x] Schulden overview/chain from shared nullable current account values, actual account drilldown/history, explicit unsaved native-currency assumptions and existing server payoffPlan; typed limits/unknown states, no payment or contract writes
- [x] Literal projection/FX/safety/session/origin tests and desktop/mobile light/dark original-prototype geometry and browser evidence
- [x] Per-loan payment terms live in Einstellungen › Konten; on top: dated rate changes (variable conditions, versioned, audited, undoable, used by the payoff schedule), persisted scenarios per loan (one-off and recurring Sondertilgung, rate change, higher installment) compared with the baseline (payoff month, interest, interest saved, months earlier; shared integer-cent domain calculation, migration 0033) and an avalanche/snowball comparison for two or more debts (credit cards with a balance included) with an extra monthly amount; decision support only, no payments or bookings; German UI, light/dark, desktop/phone (form dialogs per docs/mobile-panels.md). Limits: monthly model, no prepayment penalties, strategies use the rate in force at the model start.
- [ ] Connected debt/card rules and private contractual reconciliation remain later

### P5.8 — Freiheitszahl: forecast from today
- [x] Connected current R16 expense/investment sources and configurable multiple; explicit unknown quote/FX and short-history annualisation, original lead/chain/quarter progress and source navigation.
- [x] Explicit unsaved saving assumption and 5 % real-return default; shared monthly projection with +100 EUR comparison, bounded numeric errors, desktop/mobile light/dark and accessible values.
- [ ] Historical Soll-Pfad, chosen goal year and persisted assumptions await separate owner decisions; the complete freedom workflow and private acceptance remain open.


## P6 Reports und Umstellung
### Planning income and shared report ranges — 2026-10-03
- [x] Plan › Monat: expected household income versus all envelope monthly target requirements, source label, surplus/gap and keyboard-accessible unfunded-category details; reuse target/carry calculations and stored monthly holds. Live dated schedules take precedence; without schedules use the median of the preceding three complete months (before today for future planning). Missing amounts/currency/history remain unavailable. The existing payday rule defines a date, not a salary amount.
- [x] Shared quick choices on every implemented selectable period report, including Explorer saved views: current/previous month, 3/6/12 complete months, current/previous calendar year, all, custom inclusive calendar months. Legacy period URLs and segmented controls remain supported; partial current months stop at today. Month/year-only, fixed-source and forecast reports keep their existing controls.
- [x] Optional dotted linear fit of displayed actual time-series values, default off, URL-backed; no fit of forecasts, missing values or single points. Desktop/mobile light/dark, keyboard/Axe, synthetic fixed-clock unit/API/E2E evidence.
- [ ] Owner design acceptance; orchestrator review/commit/PR and pinned Linux CI. No migration or automatic booking. No existing Linux screenshot baseline is expected to change: modified report/Plan tests capture evidence images, while shell baselines show the unchanged report catalog/Heute. See [scope, checks and changed files](evidence/income-targets-report-ranges.md).

### P6 — Static PWA baseline
- [x] Build-versioned static shell cache, install manifest/icons derived from the existing brand mark, offline fallback and opt-in update prompt. API/auth/export/health are network-only.
- [x] Offline reload has no financial figures; a connection loss retains unsaved form state and shows an offline/stale-data notice.
- [x] Y26/D07: IndexedDB capture queue with local edit/delete, Heute/Konten counts, cold offline capture from minimal form choices, FIFO online/focus/manual retry and atomic API idempotency (migration 0022). Retain session/reference conflicts; uncertain delivery must be checked before editing/deleting. Synthetic unit/API and desktop/mobile offline browser coverage.
- [ ] Physical phone installation/passkeys and Gate 4 acceptance remain separate. Month-close write locks have no current server model; the queue retains/explains typed lock rejections when provided, without inventing a month-close policy.

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
- [x] Owner-selected benchmark security persisted via audited app_setting with undo/redo; stored-price comparison over the same period, explicit quote/FX gaps, historical asset-class comparison and accessible monthly returns heatmap. Shared TTWROR/Modified Dietz, synthetic domain/API/browser evidence; see [report 4.4 extension](../docs/performance-report.md).
- [ ] Depot-inclusive performance view, owner design acceptance and private performance reconciliation remain open.

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

### Y22a — Automatic payslip intake
Owner setup and limits: [payslip intake](payslip-intake.md); synthetic browser evidence: [verification](evidence/payslip-intake/README.md).

- [x] Optional recursive Dropbox scan with dynamic year folders, durable incremental cursor, content-hash/SHA-256 deduplication and shared manual PDF upload.
- [x] Server-only PDF password, bounded extraction, Austrian wage-line adapter with owner code mappings, separate reimbursements and signed tax/SV corrections; warning/retry, cent check and separate bonus/pension document handling.
- [x] Audited draft/receipt/inbox staging and owner confirmation/rejection, live salary-booking suggestions, grouped undo/redo and encrypted receipt-backup reuse; source status and setup documentation.
- [ ] Owner verification of private layouts/mappings, live read-only Dropbox authorization and encrypted restore after deployment.

### Y22 / Reports 1.2 and 1.9 — Captured payroll and side projects
- [x] PR #139 review fixes: separate tax-free reimbursements, signed SV/Lohnsteuer corrections with exact net conservation and signed ratios, live payslip-position deduplication including undo/redo, salary-split payout linkage and retained archived project choices. Synthetic domain/API/migration and desktop/mobile browser regressions; details in [payroll report scope](payroll-projects.md).
- [x] Manual EUR payslip capture/edit/remove: base gross plus typed additional earnings, SV-DN, captured Lohnsteuer, other deductions, controlled net; regular, 13th/14th and other special payments. Existing payout booking and optional stored receipt reference; no tax calculation or automatic booking.
- [x] Drizzle migrations, shared zod validation, header/line savepoint and audit group, soft deletion and grouped undo/redo. Combined payout links compare salary/special splits with the captured salary net sum, excluding reimbursements.
- [x] `/reports/gehalt`: monthly gross-to-net chain, deduction ratios, recorded calendar-year totals, same-month/kind prior-year comparison, fourteen recorded salary positions, missing-month chart gaps and payout consistency warnings/source links.
- [x] `/einstellungen/projekte`: create, rename, archive/reactivate and undo/redo; retained project attribution/history, active-only new booking attribution. `/reports/projekte`: closed-month split-level income/cost/result, signed refunds, prior-period comparison, monthly results and booking drilldown; side income stays a distinct household income type without adding project profit again.
- [x] Final local typecheck/lint/full unit and API suite (223 files, 2,166 tests), production build and four synthetic desktop/mobile browser scenarios; light/dark Axe and overflow checks. Local worker/timeout settings and screenshots: [verification evidence](payroll-projects.md#verification-evidence).
- [ ] Separate receipt object-storage/upload workflow, collective/step-raise metadata and inflation comparison, project hours/hourly rates; owner design/private-data acceptance and Gate 4 remain open.

### Owner configuration and Einstellungen › Konten — 2026-10-03
- [x] Owner-config extension (2026-10-04): create securities, merge crypto mappings, re-categorise live splits; dependency order, one audit group per run, dry-run/undo and synthetic amount/balance regressions. Details: [ops](ops.md) §12.6.
- [x] Operator command `owner-config --file <json> [--dry-run]` (profile, rules, category stages, expected payments with skipped occurrences, bulk "vorgemerkt" to "bestätigt", security quote settings, asset class names): audited per entry, undoable, idempotent, exit code 3 on skips; schema in [ops](ops.md) section 12.6.
- [x] Einstellungen › Konten: accounts grouped like the sidebar, rename and retype, order, close/reopen, terms by type; loan terms (fixed or variable interest, installment, term start/end, original amount) read by the Schulden calculator (pre-filled) and the Kosten report (installment wins over expected payments). Drizzle migration 0030. Fix: an account edit that does not name the opening balance no longer resets it to 0.
- [ ] Owner acceptance of the page and of the private owner-config file on the server.

### Report and KPI correctness audit - 2026-10-03

Scope and shared definitions: [report correctness](report-correctness.md).

- [x] Explicit split-level loan fee attribution; opening, disbursement, principal and transfers excluded.
- [x] Project reports use the shared legacy/calendar range parser, including partial current months.
- [x] Nonpositive/cancelled assignment plans retain absolute deviation without misleading percentages.
- [x] Pace counts fixed/expected payments once and hides first-week/planless forecasts.
- [x] R08 missing-debt-rate guard and recorded minimum repayments; shared R07 chart horizon/low; monthly R01 units.
- [x] Shared household classification for yearly/overview/table/cashflow totals and Plan year summary.
- [x] Mobile Heute safe space and bounded project settings table; synthetic regressions.
- [ ] Owner design/private-ledger acceptance and pinned Linux visual CI; no private-data access, migration or deployment in this task.

### Report 3.6 — Vermögen & Schulden
- [x] `/reports/vermoegen-schulden`: assets and debts at every month end (`GET /api/assets-debts-history?period=`, default `Alles`), net worth line, header with Nettovermögen / Vermögenswerte / Schulden / Veränderung im Zeitraum (EUR and %), month selection (`?monat=`) with the accounts behind the month.
- [x] One valuation: months are read with `netWorthAsOf` (same as Vermögen › Nettovermögen); pure split in `packages/domain/src/ledger/assets-debts.ts`; estimated/missing prices flag the month and show `ValuationHint`.
- [x] Domain unit tests (loans, credit cards, negative cash accounts, zero start), API tests (controlled accounts, equality with `/api/wealth/networth`, valuation quality, no accounts), Playwright desktop/mobile with axe light/dark and overflow checks.
- [ ] Owner design acceptance on real data.
### Owner directive PR4 — Asset class settings (2026-10-04)

- [x] Replace `/einstellungen/anlageklassen` placeholder; shared server values/quality, desktop table/mobile stacked rows and URL-driven PanelHost details.
- [x] Create/rename/order, safe archive/restore and dated instrument-editor reuse; German field errors and audit/undo/redo.
- [x] One Settings target editor linked from Portfolio; complete exact-100% versions, unmanaged/null versus managed zero, standard/custom bands and optional label/reason.
- [x] Editable investment-sum tiers in the shared risk resolver; signed cash, inclusive cent boundaries and independent report month-ends.
- [x] Atomic replacement target version plus retirement, current/future/tier/history/cash dependency guards; undo cannot bypass them.
- [x] Drizzle-generated additive 0035, representative-main migration/backup regression, complete-policy ZIP export and release note.
- [x] Final local check/build and page-specific desktop/mobile/WebKit acceptance evidence (304 suites / 2922 unit tests; 95 browser tests).
- [ ] PR/CI review, Docker/encrypted restore gates, real-iPhone owner checklist and production reconciliation/deployment.

Contract and baseline matrix: [asset-class settings](asset-classes-settings.md).
