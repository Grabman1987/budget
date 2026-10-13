## Summary

Future captures and recurring payments now appear above account history in a remembered `Kommend · N` section, followed by today’s cash balance. The next unbooked occurrence has a repeat icon, payment-detail link and explicit book/skip actions; future captures retain their normal editor and have a calendar icon. Upcoming rows show muted date hints, signed amounts and per-account projected balances in Account and All Bookings views.

`Jetzt buchen` creates and links one capture atomically with grouped undo/redo, rejects duplicate or unavailable occurrences, and preserves category/contact/cent invariants. Read-only matching is shared with the account preview to avoid double-counting unlinked captures. This small shared extraction remains in the Konten lane; no migration or dependency was added.

Refs #453

## Validation

- Focused typechecks for Web, Server, DB and Domain; changed-file ESLint/Prettier, CSS scale and diff whitespace checks passed.
- 38 affected unit/API tests passed, including native-currency projections, linked/unlinked deduplication, capture rollback and grouped undo/redo.
- One E2E build plus scoped bundle rebuilds after corrections; only `register-upcoming.spec.ts` was run, with one worker at port 5060. Final desktop and mobile runs each passed 5 tests (2 scenarios and 3 setup tests). Scenarios cover dialog-created weekly repetition, +14-day capture, exact-cent balances, inline date editing/undo, book/skip/undo, detail navigation, collapse persistence, 201 far-future captures, light/dark Axe, 44px actions and 390px overflow/text width.
- Full local check and full E2E suite intentionally omitted under this package's memory exception. CI is the final gate.
- [Synthetic screenshots and evidence](docs/evidence/register-upcoming/README.md). No local snapshot baselines were regenerated; no existing account-register baseline was found. Shell and expected-payment baselines remain unchanged.

## Owner steps / limits

- Local delivery is blocked before commit: Git cannot create the worktree index lock (`Permission denied`), and the required push attempt failed with `SEC_E_NO_CREDENTIALS`. No new commits or PR exist; changes remain unstaged and the index is empty. Restore Git metadata write access and GitHub authentication, then stage/commit, push this branch and create this normal PR.
- Review the synthetic desktop/mobile evidence and verify the register on a physical phone and desktop after required CI passes.
- No credentials or migration steps are needed. No merge or deployment was performed.
- Existing schedule materialization horizon is retained. Cross-currency occurrences cannot guess native cash: projection shows `Saldo offen`, and capture uses the existing dialog with the actual FX amount.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
