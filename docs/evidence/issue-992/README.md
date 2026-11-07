# Issue #992: calm Plan and register

Local CLI implementation and independent agent review. All screenshots use a disposable synthetic ledger with the redesign enabled. No financial calculations, ledger writers, migrations, locking rules or production data changed.

Fully covered categories have neutral empty tracks. Underfunded and overspent categories retain their warning colours. The new attention filter uses existing need and overspending helpers; it preserves matching groups and the existing URL filter behaviour. The month header collapses on downward scrolling and expands on upward scrolling. Reconciled register rows use secondary text colour; missing expense categories remain prominent, including incomplete splits.

## Verification

- `npm run typecheck`: passed.
- Changed-file ESLint, Prettier and CSS scale checks: passed.
- Focused Vitest: 45 tests passed across `plan-filters-589`, `plan-redesign`, `plan-page-head`, `booking-table-581`, `depot-category` and `balance-adjustment-rta`, with `VITEST_MAX_WORKERS=1`.
- Redesign ON E2E build and OFF web build: passed. OFF output was kept separate from the tested ON bundle.
- `e2e/issue-992-plan-calm-focus.spec.ts`: 20 cases passed with one worker, covering desktop Chromium (1440 px) and mobile Chromium (390 px), both light and dark. Checks cover neutral tracks, hover, filter counts and persistence, scroll direction, register states and locks, mobile text overlap, scoped Axe checks, unchanged budget/account responses and no UI API writes.
- The final local run used an ignored configuration that retained the existing browser profiles, timeouts and isolated-ledger fixture, while omitting unused global servers and setup dependencies to reduce memory pressure. No repository configuration or timeout was changed.
- **iPhone WebKit remains unverified locally.** Repeated runs exceeded the existing 30-second timeout, including an isolated run before Plan finished loading; available host memory fell to about 78 MB. The spec remains enabled for the configured WebKit profile in CI. Chromium phone-width evidence is not a WebKit or physical-device acceptance claim.
- Independent review covered the final product diff and all changed tests, with no outstanding findings. Existing financial and security expectations remain intact; no tests were skipped and no screenshot baselines were regenerated.

## Test changes

| File | Reason and coverage impact |
| --- | --- |
| `apps/web/src/budget/plan-filters-589.test.ts` | Covers the attention union, ordering, deduplication and URL validation using existing financial inputs. |
| `apps/web/src/budget/plan-redesign.test.tsx` | Covers attention filtering and reset without writes, plus downward/upward scrolling and jitter. |
| `apps/web/src/ledger/booking-table-581.test.tsx` | Covers ON/OFF checked-row styling and incomplete split warnings while retaining lock and amount expectations. |
| `e2e/issue-481-reduced-motion-theme.spec.ts` | Updates only the fully funded pill colour expectation from primary to secondary ink for the authorized neutral presentation. |
| `e2e/issue-992-plan-calm-focus.spec.ts` | Adds focused browser coverage and synthetic screenshots for the five changed surfaces. Cases are separated by surface to retain the existing timeout. |

## Screenshots

Screenshots were visually inspected for the intended states, readable warnings and mobile overlap. These are review evidence, not replacement snapshot baselines.

| Surface | Desktop light | Desktop dark | 390 px light | 390 px dark |
| --- | --- | --- | --- | --- |
| Plan | [PNG](desktop-plan-light.png) | [PNG](desktop-plan-dark.png) | [PNG](mobile-plan-light.png) | [PNG](mobile-plan-dark.png) |
| Attention filter | [PNG](desktop-attention-light.png) | [PNG](desktop-attention-dark.png) | [PNG](mobile-attention-light.png) | [PNG](mobile-attention-dark.png) |
| Compact month header | [PNG](desktop-compact-light.png) | [PNG](desktop-compact-dark.png) | [PNG](mobile-compact-light.png) | [PNG](mobile-compact-dark.png) |
| All bookings | [PNG](desktop-bookings-light.png) | [PNG](desktop-bookings-dark.png) | [PNG](mobile-bookings-light.png) | [PNG](mobile-bookings-dark.png) |
| Account register | [PNG](desktop-account-light.png) | [PNG](desktop-account-dark.png) | [PNG](mobile-account-light.png) | [PNG](mobile-account-dark.png) |
