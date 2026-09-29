# P1d — Database, fixtures and domain core

Paste into a new cloud session after P1a is merged; it can run in parallel with P1b/P1c (model: Opus recommended for the schema and the fixture port).

---

Read `CLAUDE.md`, `SPEC.md` §4–§6, concept chapter 5 (`docs/concept/produktkonzept.md`, sections 5.1–5.3), and the P1d checklist in `docs/ROADMAP.md`. The calculation reference is `design/prototype/reports-core.js`; older tested logic is in `reference/finance-hub/` (see its README).

Task: the data foundation.

Scope (P1d checklist):
1. Drizzle schema v1 in `packages/db` for the entities in SPEC §5 (accounts with role and terms, bookings with splits and transfers, payees, categories/groups/classes, envelope months, expected payments with versions, contacts, savings goals, products/trades/holdings/prices with source, FX rates, rules and results, inbox items, audit log, payslips, projects, planned events). Amounts as integer cents; soft delete; audit log with undo; idempotency keys for imports. Migrations and repositories with tests on an in-memory SQLite.
2. `packages/fixtures`: a deterministic TypeScript port of the sample ledger in `design/prototype/reports-core.js`. It must produce individual bookings (with payees, splits, transfers) for 01.10.2023 – 17.09.2026, plus products with monthly prices, so that aggregates equal the prototype. Keep all names synthetic (as in the prototype).
3. Dev seed script: `npm run db:seed` loads the fixtures into `./data/dev.sqlite`.
4. `packages/domain`: account balances from bookings, envelope month (assigned, activity, available, rollover, overspending), `alloc` (50/30/20 as twelfths, always 100 %), net worth series (own contribution vs market), cost basis/gain/TER per product.
5. Tests that reproduce prototype figures: net worth on 17.09.2026 = 84.730 €; August 2026 allocation Bedarf 54 %, Wunsch 33 %, Zukunft 26 %, aus Guthaben −13 % (One-Pager); portfolio TTWROR last 12 months +12,4 %, since Okt 2023 +38,2 %.

Out of scope: API endpoints beyond a read-only `/api/debug/summary` for the seed check; UI.

Acceptance: `npm run check` green; seed runs in a clean checkout; the figure tests pass; boxes ticked; PR describing schema decisions (diagram in Mermaid welcome).
