# Liquidity navigation and account horizon

Scope: Refs #283, Refs #290, Refs #291, Refs #292. Synthetic data only.

The existing Plan year link was conditional on events and included the report number. Plan now exposes the existing report in its shared registers. Upcoming account labels now link to the existing account route with a validated due date, horizon and lever selection; browser back and reload retain the context.

The account preview retains its pending-booking matching, native-currency handling, day-based settings and shared cash engine. Its opt-in liquidity mode uses the common calendar horizon, scheduled occurrence adapter (including date shifts, effective versions and EUR income pauses), event recurrence helper and report lever engine. Only EUR budget accounts offer that mode. Variable household spending and unassigned events/payments are not apportioned; their exclusions mark the preview partial. The native preview remains available for every supported account.

The report's verdict still uses the original six-month low. Its exact deciding day is now returned alongside the existing month and amount; the sentence states that date and the existing verdict end. The chart horizon and the verdict horizon remain distinct and labeled.

## Regression evidence

- RED: 3 new assertions failed and 20 existing tests passed. The missing account link, missing horizon preview and missing verdict day were independently reproduced.
- GREEN: 4 affected files / 29 tests passed. A subsequent expanded API run passed 12 tests, including a paused receipt, applicable future-payment lever, variable-plan exclusion and unsupported account validation.
- Literal transfer case: 30,003 cents leave one synthetic account and enter the second on the same date. The unassigned 20,002-cent event changes the household forecast but is excluded from either account; no read books or distributes it.
- Browser coverage checks Plan navigation, due-date context, chosen horizon, reload/back, explicit partial-projection copy, 44px selector, accessibility and overflow in light/dark at desktop 1440px and mobile 390px.

## Final local verification

- TypeScript: `npm run typecheck -w @budget/web -w @budget/server -w @budget/db -w @budget/domain`, exit 0. Scoped ESLint and Prettier, exit 0; `git diff --check` clean.
- Final domain/API/DB run: 3 files / 28 tests passed. The Heute component worker did not start within the fork startup deadline under machine load; no component assertions ran in that attempt. The unchanged component file then passed separately: 2 tests, thread pool, 60-second test deadline, exit 0. Combined affected coverage: 4 files / 30 passing tests.
- `npm run build:e2e`, exit 0; final web-only E2E rebuild after the touch-target correction, exit 0. Warnings concern dependency annotations, mixed static/dynamic imports and bundle size.
- Browser: 3 desktop and 3 mobile cases passed. The initial default run found occupied unused auth port 4883; importing the global config also attempted to remove a database held by those test servers. Final runs used an untracked, independent config with the same Chromium viewports and the specs' existing isolated-ledger fixture. Application, bootstrap, API and SQLite stayed real; assertions were unchanged. No shared Playwright configuration was changed.

Captures: [desktop light](liquidity-navigation-283-292/desktop-account-light.png), [desktop dark](liquidity-navigation-283-292/desktop-account-dark.png), [mobile light](liquidity-navigation-283-292/mobile-account-light.png), [mobile dark](liquidity-navigation-283-292/mobile-account-dark.png).

Visual review found crowded month-axis labels in the existing mobile `BalanceChart` when historical and forecast months are combined. A bounded follow-up should thin mobile ticks without changing points or low calculations. The tested date context, forecast end and exclusion copy remain readable; no horizontal page overflow was observed. Extending the common horizon beyond EUR budget accounts also remains open; those accounts keep their existing native day preview.

Affected existing baselines, for CI/owner review only: `shell-heute-light-desktop-linux.png`, `shell-heute-light-mobile-linux.png`, `shell-heute-dark-desktop-linux.png`, `shell-heute-dark-mobile-linux.png`. Plan register views also change, but do not have matching committed Plan baselines in this checkout.

The owner explicitly excludes the full local check and full E2E suite because other jobs share this machine. CI is the final gate. No visual baseline is regenerated.
