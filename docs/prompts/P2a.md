# P2a — Accounts and bookings

Paste into a new cloud session after P1f-3 is merged (model: Sonnet; Opus if the transfer/split invariants get tricky).

---

Read `CLAUDE.md`, `SPEC.md` §3–§6, `docs/data-model.md`, `.impeccable/surfaces/` for Konten, `design/prototype/konten.html` + `konten.js` (run `npm run proto`), `design/screens/*/konten*.webp` and the P2a checklist in `docs/ROADMAP.md`.

Task: the ledger becomes usable — accounts and bookings end to end (API, repositories, UI). Two PRs from `main`, each ≤ ~1.500 changed lines, one branch each:

PR 1 `p2a-api` — server:
1. Hono routes + zod validation for accounts (create, edit, close/reopen, sort; type, on-budget, currency, credit limit, terms), bookings (create/edit/delete with splits and transfers, status pending/confirmed/reconciled, flag, memo, payee), payees (create, rename, merge). All writes through the existing repositories with audit entries and group undo.
2. Query endpoints: account list with balances (today, cleared, uncleared), booking list with cursor pagination, filter (account, date range, category, payee, status, flag, text) and sort.
3. Reconciliation: "Kontostand prüfen" — owner enters the bank balance; the server computes the difference, proposes "doppelt" (likely duplicates) and "fehlt" candidates, and on confirm marks bookings `reconciled`, stores a reconciliation snapshot and optionally creates the Ausgleich booking.
4. Tests for every invariant (split sum, transfer legs, reconciled bookings locked unless explicitly unlocked, undo).

PR 2 `p2a-ui` — web:
1. Konten › Übersicht, Einzelkonto (balance line chart, booking list with status and flags, inline edit), Alle Buchungen (filters as URL params, search, multi-select for category/flag/status/delete with undo toast), Kontostand prüfen flow — all as in the prototype and `design/screens` (desktop 1440 and phone 390, light and dark).
2. TanStack Query with optimistic updates and rollback; empty, loading and error states per `DESIGN.md`.
3. e2e: create account, book, split, transfer, reconcile with Ausgleich, undo; axe clean.

Use only synthetic data (fixtures). UI German (de-AT), code English, integer cents.

Acceptance: `npm run check` and e2e green; screenshots in the PR description; P2a boxes ticked.
