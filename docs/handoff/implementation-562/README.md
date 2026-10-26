# Bank review list preparation (#562)

This branch adds read-only suggestion labels to the inbox list response. It reuses the existing guarded candidate match and assignment-rule readers. One eligible merge is shown first, then one available rule. Multiple possible bookings, a transfer candidate, multiple rules, or failed preparation say “Vorschlag prüfen”; the existing category fallback remains “Zu verteilen” and requires review. The UI shows the prepared choice on each row without opening it. “Übernehmen” continues to open the shared booking dialog; only its existing explicit action writes. “Nicht übernehmen”, bulk actions, confirmation, audit, locks, cents and Undo code are unchanged.

The response also reports resolved and total retained bank candidates for the selected source/account, or all candidates in the global view. The progress bar uses these stored facts. A resolution increases the numerator and existing Undo reverses it; no session state or new persistence was added. This is a cumulative count, because the data model has no weekly review batch identity. A new category prediction beyond existing assignment rules would need a product policy; none was inferred.

## Test changes and evidence

- `packages/db/src/repos/inbox-bank-account-724.test.ts`: retains the original exact bank candidate field comparison while separately checking the added suggestion, adds literal account-scoped progress and dismissal/Undo expectations, and covers unique versus competing synthetic merge targets with a no-write state comparison. The test file passed: 3 tests.
- `apps/web/src/inbox/account-bank-review-724.test.tsx`: supplies the new read field in its synthetic candidate fixture and checks 0/1 → 1/1 around the existing confirmation flow. The test file passed: 10 tests.
- Scoped Prettier and ESLint passed for changed source/test files; `git diff --check` passed. Node 22.23.3 was used. No existing API test or protected financial oracle was changed.

The required three-transaction browser sequence with Undo after each action, desktop/390/WebKit light/dark, Axe, touch targets, screenshots, exact-head CI, independent final-diff review and publication remain for integration. Source checks here do not establish live acceptance.
