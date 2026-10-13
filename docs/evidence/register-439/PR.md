Account history stopped at the current month, and Save stayed pending until active read models had refetched. The register now scrolls through the existing cursor pages to the oldest booking, and a successful write settles before background reads finish.

Refs #439

- Account and All Bookings use automatic older-page loading with a manual accessible fallback. Search and filters continue to run over the entire ledger. The current-month figure remains independent of loaded history.
- Replace the correlated running-balance query with one chronological account pass. This minimal shared DB change preserves opening-date rules, same-day ordering, filters, FX and integer-cent balances. It remains O(n) per account page.
- Restart cursor lists at the first page after writes/undo instead of refetching every older page. Inactive valuations remain stale until their next visit; visible financial figures still refresh in the background.
- Add duration-only Server-Timing to POST/PATCH and a <500 ms regression on 10,000 synthetic bookings. Final measured POST: **21.7 ms server / 23.3 ms request**; PATCH: **20.6 ms server / 21.2 ms request**. An earlier loaded run measured 48.5/31.8 ms server time.
- Weekly/monthly credit-card recurrence already works on this base. The new real-dialog tests prove schedule account/category/next date, visibility in Plan and Heute, and subsequent PATCH without a duplicate schedule. Existing shared undo, rollback, idempotency and locks remain covered; no speculative recurrence rewrite.

Validation: web/server/DB typechecks; changed-file ESLint/Prettier; **83 affected unit tests passed**; one E2E build plus a final web-only rebuild after a cache-review correction. Only `e2e/register.spec.ts` ran with one worker: **desktop 6 passed / mobile 390 px 6 passed** (each includes three setup tests and three package scenarios), with light/dark Axe, overflow and mobile 44 px load targets. The package memory override replaces the full local check; CI remains the final gate.

Browser measurements include click scheduling and the dialog exit animation. Final desktop weekly/monthly POST: **175–269 ms response / 594–705 ms dialog hidden**; PATCH: **299–343 ms response / 711–756 ms dialog hidden**. These small dialog fixtures are separate from the 10,000-row server fixture. The spec records server timing and refetch paths; the controlled client test proves Save resolves while reads remain blocked and protects refresh of visible wealth. No wealth endpoint is requested from the register. Full measurements: [evidence](https://github.com/Grabman1987/budget/blob/feat/register-infinite-save-speed/docs/evidence/register-439/README.md).

Synthetic screenshots: [desktop oldest booking](https://github.com/Grabman1987/budget/blob/feat/register-infinite-save-speed/docs/evidence/register-439/desktop-account-history.png), [390 px oldest booking](https://github.com/Grabman1987/budget/blob/feat/register-infinite-save-speed/docs/evidence/register-439/mobile-account-history.png), [weekly payment on Heute](https://github.com/Grabman1987/budget/blob/feat/register-infinite-save-speed/docs/evidence/register-439/mobile-today-weekly.png).

Visual baselines: no register-list baseline exists; no baseline is regenerated or proposed for replacement. Existing expected-payment, net-worth and Heute baselines remain CI review surfaces. No new dependency, migration, private data, provider call, automatic booking, merge or deployment.

Owner steps: after CI/integration, review scrolling and weekly/monthly card capture on desktop and a physical phone; confirm the next payment/account/category in Plan and Heute. After saves the history reload starts at the newest page. No keys or consents are needed.

Delivery note: the local Git index write was denied (`index.lock: Permission denied`), so this text and the verified changes are prepared but uncommitted. Commit/push and PR creation require a session with normal Git index access. No restriction was bypassed.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
