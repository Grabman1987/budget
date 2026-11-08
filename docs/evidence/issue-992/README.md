# Issue #992: calm Plan and register

Local CLI implementation and independent agent review. All screenshots use a disposable synthetic ledger with the redesign enabled. No financial calculations, ledger writers, migrations, locking rules or production data changed.

Fully covered categories have neutral empty tracks. Underfunded and overspent categories retain their warning colours. The new attention filter uses existing need and overspending helpers; it preserves matching groups and the existing URL filter behaviour. The month header collapses on downward scrolling and expands on upward scrolling. Reconciled register rows use secondary text colour; missing expense categories remain prominent, including incomplete splits.

## Verification

### PR #996 iPhone toolbar clearance repair

Merged `origin/main` at `2dfb7891`; the register-test conflict retains both the
incomplete-split checks and the new phone date-group checks. Inspected both failed
jobs in run `42427950185` using `gh run view --job <id> --log-failed`:
`128570964809` failed the toolbar/header bound; `128575435749` failed the aggregate
because of that browser shard.

Classification: product defect. Scrolling back to the toolbar expands the month
lead, but native scroll alignment reserved only its compact 104px height. The
toolbar overlapped the expanded header by 31px. The first target-margin repair
passed Chromium but the same WebKit bound failed again in run `42481324865`:
native WebKit alignment did not apply that margin. The final repair publishes the
existing expanded measurement to root scroll padding and removes it on unmount.
The root reserves at least the compact height; desktop and OFF styling retain
their previous rules. The existing unit checks measurement and cleanup.
All three failed jobs in that run were inspected with `gh run view --log-failed`:
Chromium `128734540503`, WebKit `128734540632` and aggregate `128739653076`.

That run also exposed the merge interaction with the new phone details button:
the warning overflowed its metadata width in Chromium and WebKit. Missing-category
rows now reclaim unused amount-column space using its intrinsic content width,
preserving exact amounts, right alignment, full warning text and 44px controls.
The unchanged warning-bounds checks pass locally in both Chromium phone themes.

The original `plan-compact-grid.spec.ts` bound remains unchanged. The existing
`issue-992-plan-calm-focus.spec.ts` scroll cases additionally check native alignment
of the toolbar, distribution summary and month-close link after expansion in both
themes. No financial oracle, tolerance, timeout or screenshot baseline changed.
Independent local agent review approved the repair and merge resolution.

Initial target-margin revision validation: ON E2E build and separate OFF web build passed. The
original compact-grid spec passed on desktop and phone Chromium; the added scroll
regression passed in both phone Chromium themes. WebKit completed all new bounds
in the dark case before timing out on the existing last-category click; other
local attempts timed out before the bounds or failed the earlier disclosure check.
Host memory fell below 100 MB. These are local limitations, not a WebKit pass.
Each invocation ran one spec with `--workers=1`; the ignored local adapter omitted
only unused global servers, retaining the isolated fixture and browser settings.
After the root-padding change, a local WebKit attempt stalled at initial grid
loading with about 20 MB free memory, before reaching any changed layout.
The original compact-grid spec passed on phone Chromium with the final root
padding, including the unchanged geometry, cent totals, menu and selection checks.
The focused phone Chromium dark scroll case also passed; the light case completed
its layout checks but timed out on the final unchanged budget-response read.
Required CI remains the complete WebKit gate.

### PR #996 repair after #985

Merged `origin/main` at `606b97cb` and retained the one-line category/hint layout,
short hint copy and continuous group frame. The newer quiet funded tracks and
pills, row hover, attention filter and register dimming remain.

Inspected every failed job in CI run `42408418407` using `gh run view --log-failed`:

- Chromium 1/5 and WebKit 1: theme expectation drift. The token check already
  used secondary ink, but the literal expected colours still described the old
  funded pill. Both now assert the intended colour in both themes and viewports.
- Chromium 1/2/4/5/6/8: Plan action/scroll stability defects. Collapsing the lead
  changed document height near the bottom, reversing the observed scroll
  direction and repeatedly reopening it. Reserve the expanded grid row, including
  compact browser-back restoration. The collapsed background does not receive
  pointer events; its visible controls and disclosures remain interactive.
- Chromium 4/8: the quiet-bar selector also hid the neutral today marker. Hide
  only the spent fill, retaining the existing marker and tooltip.
- Chromium 6 and WebKit 2: wrapping uncategorised mobile metadata violated the
  existing two-line register density. Keep the warning visible, let account text
  truncate, omit ancillary note text there, and visually abbreviate incomplete
  split metadata while preserving its full screen-reader description.
- Aggregate `check`: failed because the browser shards failed; static, unit,
  Docker, restore, Windows and visual jobs passed in that run.

Repair test changes are limited to the theme colour migration, reserved-height
unit assertions, and existing #992 browser cases for bottom-scroll actionability,
reduced-motion style, pointer events and visible warning bounds (including an
incomplete split). Financial response equality, no-write assertions, timeouts and
all existing checks remain. Independent local agent review approved the repair.
The screenshots below predate this merge; they are historical implementation
evidence, not screenshots of the repaired revision.

Repair screenshots: [compact desktop Plan](repair-desktop-compact-light.png) and
[mobile booking warnings](repair-mobile-bookings-light.png), both inspected using
synthetic fixtures. The mobile image includes an incomplete split and a checked
booking; warning text remains fully visible within the second line.

Focused repair browser evidence (`--workers=1`, one spec per invocation):

- `contact-rename-plan-plus`: both desktop cases passed, including the previously
  failing category creation and Undo flow.
- `issue-481-reduced-motion-theme`: both Chromium desktop/phone cases passed.
  Local WebKit expired during accessibility evaluation or shell interaction;
  its former colour assertion was not the failure.
- `issue-992-plan-calm-focus`: all 20 Chromium desktop/mobile cases passed across
  focused runs. The new warning-bounds regression first reproduced real clipping;
  after prioritising the warning, all six mobile register/attention cases passed.
  One earlier mobile dark reload timeout passed unchanged on that focused retry.
- `issue-581-account-register`: all four Chromium mobile and iPhone WebKit cases
  passed, including density, exact cents, Undo and reconciled locks.
- `plan-detail-pages`: all four desktop/mobile cases passed, including restoration
  of the prior scroll position after browser Back.
- `issue-981-plan-grid`: local desktop attempts reached both widths but expired
  during browser evaluation under host memory pressure (about 420 MB free RAM).
  No assertion or timeout was changed. The complete spec remains a CI gate.

Local adapters omitted only unused global servers and setup dependencies for the
isolated-ledger/sample specs. Browser profiles, timeouts, fixtures and production
ON bundles were unchanged. No full local E2E suite or baseline regeneration ran.

Final focused Vitest passed all 49 tests in `plan-model`, `plan-redesign`,
`plan-filters-589` and `booking-table-581` with `VITEST_MAX_WORKERS=1`. Redesign ON
E2E build and the OFF production web build both passed; OFF output stayed separate
from the tested ON bundle.

### Original implementation

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
