# P2d — YNAB import with mapping

Paste into a new cloud session after P1f-3 is merged (model: **Opus** — parser, reconciliation, money). PR 1 can start before P2a–P2c; PR 2 needs P2a PR 1 and P2c PR 1.

---

Read `CLAUDE.md`, `SPEC.md` §10, **`docs/migration/ynab-export.md` (binding)**, `docs/data-model.md` and the P2d checklist in `docs/ROADMAP.md`.

**Privacy:** you never get the real export. Build and test everything against a synthetic export you generate in exactly the documented format (BOM, CRLF, quoting, CESU-8 emoji, `€`-amounts, splits, transfer pairs incl. categorised off-budget legs, starting balances, balance adjustments, hidden categories, credit card payment group, future-dated uncleared rows, negative Available). Never add logging of row contents.

Two PRs from `main`, each ≤ ~1.500 changed lines (synthetic fixture files excluded), one branch each:

PR 1 `p2d-parser` — `packages/import-ynab` (pure, no DB):
1. `packages/fixtures`: generator for a synthetic YNAB export (≥ 3 years, ≥ 10 accounts, ≥ 40 categories, all edge cases above), deterministic by seed; writes the two TSV files byte-exact in YNAB's format.
2. Decoder with CESU-8 surrogate repair; strict TSV parser with row numbers in errors; amount and date parsers.
3. Model builder: accounts (with heuristic proposals), split grouping, transfer pairing, plan rows; typed result + list of problems.
4. Mapping document: zod schema (start month, accounts incl. skip, n:1 category mapping or `drop`, re-categorisation rules with global `rules_from` and optional per-rule `from`, payee merge/contact links, name cleanup, derived expected payments) and a function `applyMapping(raw, mapping) → target model`.
5. Reconciliation: recompute balances per account and month, Activity/Available per target category and month, Zu verteilen per month; compare with the export per `docs/migration/ynab-export.md` §Import run and checks; report as data.
6. Tests: round trip on the synthetic export with identity mapping = 0 difference everywhere; n:1 merges keep Available exact; rules after `rules_from` keep totals; broken inputs give precise errors.

PR 2 `p2d-wizard` — server and UI:
1. Raw staging tables per import run (from P1f-3), upload endpoint (multipart, both TSVs, size limit 20 MB, step-up required), stored only in the DB, deletable per run.
2. Wizard in Einstellungen › Datenquellen › YNAB-Import: upload → accounts → categories (target structure side by side with YNAB, counts and yearly sums per target, drag YNAB categories onto targets, create/merge/drop) → rules (preview of affected bookings) → payees → start month (default 01.10.2023, opening balances and opening Available per `docs/migration/ynab-export.md`) → dry-run report → commit. Mapping can be exported/imported as JSON for the owner's private copy.
3. Commit in one transaction as one import run (source `migration`), reversible as a whole; idempotent re-import of a newer export with a change report.
4. Reconciliation report page (Gate 2) with every difference by account/category and month; printable.
5. e2e with the synthetic export: full import, re-import without changes, undo of the run.

Acceptance: `npm run check` and e2e green; P2d boxes ticked except the owner's box.
