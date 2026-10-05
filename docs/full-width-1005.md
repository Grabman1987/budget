# Full page width — owner feedback 2026-10-05

Pages use `--page-max: none` from the shared UI layout tokens. The shell and top bar,
Heute, contacts, data-source sections and development pages share that limit. Plan,
accounts, wealth, settings and report frames inherit the shell width. Existing
desktop gutters and phone breakpoints remain.

Heute details, account overview rows, wealth panels and catalog assemblies use
`auto-fit/minmax`. Allocation puts its composition charts beside the source tables
from 1440 px. Numeric portfolio columns keep their natural width and right alignment;
names absorb the remaining table space.

Time charts already measure their containers with `useElementWidth`: their SVG
viewBox width follows the container, while their pixel heights and label sizes stay
fixed. Heute uses 330/232 px, net worth 320 px, allocation history 280 px and
performance 260 px. Sunbursts already stop at 380 px. The net-worth chart container
also has a 400 px height ceiling.

Intentional local widths remain: explanation paragraphs (at most 72 ch), profile
and investment forms (640 px), bank picker (520 px), authentication, dialogs and
side panels. The 860 px limits in `onepager-report.css` and `jahresreport-page.css`
belong to the paper sheets, not the page shell; A4 print rules are unchanged.

## Verification

`e2e/full-width.spec.ts` checks both the main and actual body widths of Heute, Plan
and Allocation at 1920 px (at least 1500 px). Its viewport sweep covers 390, 1280,
1440, 1920 and 2560 px, page overflow and overlapping grid items across the affected
areas, including the paper reports. Screenshots are evidence only, not baselines.

Local attempt (2026-10-05): all workspace typechecks completed. `npm run check`
then aborted during lint with Node's "Zone Allocation failed - process out of
memory" (exit 134); unit tests were not reached. The E2E build completed. The
production build failed with `UNKNOWN: unknown error, realpath` while resolving
`@tanstack/query-core/build/modern/utils.js`. The isolated browser run
passed the 1920 px width contract and the 1280 px sweep. It found overlapping
empty phone Plan cells and clipped desktop table headers; minimal CSS fixes are
included, but their rerun and the remaining viewport matrix are still pending.
Test startup also required a temporary bundled synthetic seeder and independent
ports/databases because `tsx` failed in `os.userInfo()` with ENOMEM and existing
test databases were locked. These local helpers are ignored build artifacts.

The GitHub CLI reports an invalid token. The worktree also refuses writes to
`index.lock`, `COMMIT_EDITMSG` and `HEAD.lock`; normal commits and a separate-index
commit attempt were blocked. Delivery requires writable Git metadata and passing
checks before PR creation.
Linux visual comparison and owner acceptance remain separate gates. No baselines
were regenerated locally. Expected affected committed desktop baselines:

- `shell.spec.ts`: `shell-reports-light-desktop-linux.png` (catalog columns).
- `networth.spec.ts`: `vermoegen-netto-{light,dark}-desktop-linux.png` (panel grid).
- `components.spec.ts`: `bauteile-{light,dark}-desktop-linux.png` (full-width dev page).

The committed phone baselines retain their layout rules. Wide desktop evidence for
Heute, Plan, accounts and portfolio reports also needs visual review.

## Owner steps

Review the wide desktop and 390 px phone layouts, approve Linux baseline changes
in the existing CI workflow, and merge only after required checks pass. No keys,
consents, migrations or real data are needed.
