Today now reminds the owner to check stale accounts and includes planned one-off events in “Was steht an?”.

Refs #428

- Derive Heute and Posteingang hints from the latest reconciliation day, or value date for P2P/other assets. The inclusive default is 35 days; never checked accounts count from opening. Closed, empty and future-opening accounts are ignored.
- Reuse the existing account reconciliation/value dialogs through validated account deep links. Add an audited 1–365-day preference in Einstellungen › Profil with undo.
- Show enabled one-off plans from today through day 35, ordered by date with signed integer-cent amounts and links to the existing Plan › Jahr editor. Recurring-payment horizons remain unchanged. No bookings are created automatically.

No migration or dependency was added. Minimal shared changes extend the existing display-setting endpoint/form and account search validation. Inbox reminders are derived hints, separate from the persisted decision count.

Validation follows the package-specific memory exception; CI remains the final gate:

- Typechecks passed for domain, db, server and web.
- Changed-file ESLint/Prettier and `git diff --check` passed.
- Five affected Vitest files: 48 tests passed, one worker.
- One `npm run build:e2e` passed (existing build warnings remain).
- Desktop: existing modified specs passed, 20 passed including setup and 1 expected viewport skip; corrected new spec rerun passed, 4 passed including setup.
- Mobile, three modified specs at 390px: 21 passed, 1 expected viewport skip. New scenarios include light/dark Axe checks, no horizontal page scroll and 44px touch targets.

Synthetic screenshots and detailed evidence: [README](https://github.com/Grabman1987/budget/blob/feat/stale-account-reminder/docs/evidence/account-reminders-428/README.md).

Existing baselines were not regenerated. Review the four `e2e/shell.spec.ts-snapshots/shell-heute-{light,dark}-{desktop,mobile}-linux.png` baselines in pinned Linux CI. CI and owner visual/device acceptance remain open.

The final deep-link eligibility guard also permits explicit receivable accounts to use the existing server-supported reconciliation form. Fresh web typecheck/lint/format checks cover that adjustment; the local browser build/captures exercise checking and manually valued accounts and precede this guard adjustment. CI must verify the final tree under the one-local-build constraint.

Owner steps: review the reminders, event dates/amounts and both forms on desktop and a physical phone; optionally change the default under Einstellungen › Profil; review affected Linux baselines. No keys, consents, migrations or provider setup are needed.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
