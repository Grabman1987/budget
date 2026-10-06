# Contact write-off evidence

The contact list and statement offer “Ausgleichen” for nonzero EUR balances. The
ordinary confirmed zero booking uses the shared contact statement and booking
validation. Credit becomes current-month Zu verteilen; debt forgiveness becomes
expense-category activity. Deletion and grouped undo restore the balance.

Cashless credit retains its chosen income type (default Sonstiges) but appears
separately from household income and capital returns. The minimal shared read-model
changes also exclude it from income-based allocation and rule inputs.

Review images use synthetic fixtures only; no screenshot baselines were regenerated.

- [Desktop, light](contact-write-off-desktop.png)
- [Desktop, dark](contact-write-off-desktop-dark.png)
- [Mobile, light](contact-write-off-mobile.png)
- [Mobile, dark](contact-write-off-mobile-dark.png)

The standard local browser bootstrap encountered Windows `os.userInfo()` /
`uv_os_get_passwd ENOMEM`. Browser checks use an ignored config with the existing
per-test isolated-ledger fixture; assertions and the CI configuration are unchanged.
The full check uses an ignored process-local preload supplying a synthetic OS
identity only for that specific host lookup failure. Production sources
and dependencies are unchanged by these tooling helpers.

Owner/device acceptance and the complete CI jobs remain integration gates.

Verification on the delivered source tree:

- Focused API/domain/read-model/dialog checks: 7 files, 72 tests passed.
- One complete `npm run check`: typecheck and lint passed; 341/343 files and
  3,225/3,227 tests passed. The only failures were 5-second timeouts in
  `auth.test.ts` (bounded foreign-origin audit) and `pp-migration.test.ts`
  (whole-run revert/recommit), exit 1.
- Only those two files were repeated with `--maxWorkers=1 --testTimeout=30000
  --hookTimeout=30000`: 2 files / 70 tests passed, exit 0. No assertions changed.
  `VITEST_MAX_WORKERS` did not limit this Vitest version during the full run.
- Final contact browser checks: 4/4 passed at 1440 desktop and 390 mobile,
  including existing repayment/allocation/undo, long-name overflow and the new
  write-off paths; light/dark Axe had no serious or critical findings.
- E2E and production builds passed, exit 0. Final changed CSS/e2e formatting and
  e2e ESLint checks passed, exit 0; CSS has no ESLint configuration.

The new list action exposed mobile overflow with long contact names. Allowing those
names to wrap removes the overflow and the resulting modal click-coordinate error;
the existing repayment test remains intact and adds a page-width assertion.
