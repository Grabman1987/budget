# Warenkorb settings — 2026-10-06

One inclusion choice per category, plain current-effect copy, optional official price groups with automatic CPI selection, autosave/undo and collapsed payee exceptions. API, data model and domain rules are unchanged.

Verification:

- `VITEST_MAX_WORKERS=1 npm run check -- -- --testTimeout=60000 --hookTimeout=60000`: all workspace typechecks, ESLint and Prettier passed; 353 test files / 3,274 tests passed. The single worker and longer deadlines accommodate local memory contention; test assertions are unchanged.
- `npm run build` and `npm run build:e2e`: passed.
- Basket, VPI, inflation explorer, personal inflation report and settings navigation browser specs, desktop/mobile: 22 passed, 7 expected viewport-specific skips (`--workers=1 --timeout=120000`).
- Seven synthetic page tests cover class selection switching to CPI, shares, invalid input, removal, save failure, existing twelve-month averages and optimistic exception rollback. New failure cases were verified red before fixing.
- Browser assertions cover autosave/reload/undo, light/dark accessibility, no horizontal overflow and controls at least 44 px high at phone widths. The open price-group block is also checked at 375 px.

Review images use synthetic data only; no visual baselines were regenerated:

- [Desktop, light](desktop-light.png) / [dark](desktop-dark.png).
- [375 px, light](mobile-375-light.png) / [dark](mobile-375-dark.png).
- [390 px with official price groups, light](mobile-390-vpi-light.png) / [dark](mobile-390-vpi-dark.png).

Open: CI, PR review and owner acceptance on a phone. No new keys, consents or migration required.
