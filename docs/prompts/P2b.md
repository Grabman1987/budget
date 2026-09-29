# P2b — Capture dialog (Buchung erfassen)

Paste into a new cloud session after P2a PR 1 is merged (model: Sonnet). Can run in parallel with P2c.

---

Read `CLAUDE.md`, `SPEC.md` §3 (capture), `DESIGN.md`, the booking dialog in `design/prototype/index.html#buchung` + `app.js`, `design/screens/*/buchung*.webp` and the P2b checklist in `docs/ROADMAP.md`.

Task: the fastest possible way to record money — one PR from branch `p2b-capture`, ≤ ~1.500 changed lines.

1. "+ Buchung" (top bar, floating button on the phone, shortcut `N`) opens the side panel on desktop and the bottom sheet on the phone, with its own URL.
2. Modes Ausgabe / Einnahme / Umbuchung (Konto → Konto). Fields: amount (AmountInput with arithmetic and operator buttons), account (last used first), payee with autocomplete and its default category, category (grouped, searchable, shows Available), date (today default, quick picks), memo, flag, project, receipt later.
3. Income: category optional, default "Zu verteilen"; income type when the category needs one.
4. Split: add lines, remaining amount shown live as a small Maßkette, lines can be category, contact share or transfer; save blocked until balanced.
5. Keyboard flow: Enter moves forward, Ctrl+Enter saves, Esc closes (with discard confirm if dirty); "Speichern und neu".
6. After save: toast with undo; the affected account and category values update without reload.
7. e2e for all three modes and a split on desktop and phone; axe clean.

Acceptance: `npm run check` and e2e green; screenshots desktop/phone light/dark in the PR; P2b box ticked.
