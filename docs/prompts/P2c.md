# P2c — Categories and Plan › Monat

Paste into a new cloud session after P2a PR 1 is merged (model: **Opus** for PR 1 — envelope rules; Sonnet for PR 2). Can run in parallel with P2b.

---

Read `CLAUDE.md`, `SPEC.md` §4–§6, `docs/concept/produktkonzept.md` §5 (method, 9 stages, card payment, rule set), `design/prototype/plan.html` + `plan.js`, `.impeccable/surfaces/` for Plan, `design/screens/*/plan*.webp` and the P2c checklist in `docs/ROADMAP.md`.

Task: envelope budgeting in the app. Two PRs from `main`, each ≤ ~1.500 changed lines, one branch each:

PR 1 `p2c-categories` — categories and budget API:
1. Einstellungen › Kategorien: groups and categories with an optional emoji icon (rendered **monochrome** in blueprint ink: self-hosted Noto Emoji font subset, OFL, plus `font-variant-emoji: text`; never colour emoji), class (Bedarf/Wunsch/Zukunft), kind (incl. income and card payment), stage 1–9, target (amount, rhythm, due), hide/unhide, drag sort, **merge** (moves all splits and budget months into the target category, one undoable audit group) and split-off (move selected bookings by filter). Categories are expected to be reorganised when the YNAB data arrives — make restructuring cheap and safe.
2. Budget API: assign / move money between categories and from "Zu verteilen", month summary (Zu verteilen, assigned, activity, available per category and group), overspending handling and card-payment moves per concept §5.3 using the domain functions from P1f-3.
3. Property tests: Zu verteilen stock formula = flow formula for random ledgers; merge keeps all totals.

PR 2 `p2c-plan` — Plan › Monat UI:
1. Waterfall order with the 9 stages, month switcher, Stückliste view (groups, Assigned / Activity / Available, pace bar for targets), Zeit view, Triage as a state bar above the unchanged table — exactly as in the prototype.
2. Geld verteilen: ghost values from targets, "Alle Ziele füllen" per stage in waterfall order, manual edit with AmountInput, undo.
3. Overspent categories in red only where action is needed; card payment envelope visible under its account.
4. e2e: assign, move, cover overspending, month rollover; axe clean; screenshots desktop/phone light/dark.

Synthetic data only.

Acceptance: `npm run check` and e2e green; P2c boxes ticked.
