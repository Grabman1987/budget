# Plan panels #323–#327

Category names link to `/einstellungen/kategorien/:id`. The detail reuses existing
category editing, merge and split actions. Category/group inputs use FormDialog;
the list's edit shortcut remains available. Hidden-category selection lives in the
URL and survives detail/back navigation.

Plan and report names link to the same `/plan/sparziele/:id` history page. It reuses
the existing source-availability checks, figures and history chart. Selected-month
figures and source links retain `monat`; `quelle=report` supplies the direct-link
return destination. The existing history API remains current-month based and its
stand is labelled separately. Goal create/edit and year event create/edit use
FormDialog. The year comparison remains inline.

No schema, provider, booking, money calculation or audit/undo API changes. No wish
purchases are imported. Shared changes are limited to route/search/history/scroll
registration and an optional `E2E_SAMPLE_PORT` setting: port 4884 was already in
use by another local process, so verification kept main port 4881 and used sample
port 4911.

## Verification

- `npm ci --cache .npm-cache --no-audit --no-fund`: exit 0, 506 packages.
- New tests were red before implementation: category/goal desktop side forms,
  and an August request incorrectly returning September figures.
- Web `tsc`: exit 0 after correcting the navigation callback and test option types.
- Affected Vitest files: 5 files, 19 tests passed, exit 0 (`--maxWorkers=1
  --hookTimeout=60000`). The initial red run also hit the unchanged setup hook's
  short timeout under machine load.
- ESLint on changed TypeScript/TSX files: exit 0.
- `npm run build:e2e`: exit 0. A subsequent web-only e2e build includes the reused
  detail-card padding. Existing dependency annotation/chunk-size warnings remain.
- Desktop: 14 distinct functional cases passed across the focused matrix,
  corrected-report rerun (5/5 including setup), and final category/detail run
  (7/7 including setup). The two initial report failures were test migration
  defects: PowerShell-piped Unicode text and a stale button/dialog selector;
  literal money/unknown-source assertions were retained.
- Mobile 390 px: 17/17 passed including three setup cases, exit 0. This gives 28
  distinct functional viewport cases. Axe, page overflow, dialog cancellation,
  focus and audit/undo checks passed; existing 44 px touch-target rules apply.
- Changed-file Prettier and `git diff --check`: exit 0 after formatting the
  corrected report selector assertion.

The browser commands used `E2E_PORT=4881 E2E_SAMPLE_PORT=4911
E2E_START_TIMEOUT=300000`, `--workers=1`, desktop/mobile projects, and
`--timeout=90000`. Only these changed specs ran: `categories`, `goals`,
`goals-progress-report`, `plan-panels`, `plan-year-events`. The existing goal
pixel-baseline cases were excluded with `--grep-invert 'baseline and axe'`.
The package instruction excludes the full check/full e2e suite; CI is the final gate.

Browser coverage includes direct/missing detail links, breadcrumb/back and browser
back, list scroll/hidden selection, selected month and report return, Escape/focus,
dirty event cancellation, failed event writes, create/edit/delete, category merge,
goal adoption and undo/redo. All data is synthetic.

## Captures and remaining gates

- [Category desktop](category-detail-desktop.png)
- [Goal desktop](goal-detail-desktop.png)
- [Event form desktop](event-form-desktop.png)
- [Category phone 390](category-detail-mobile.png)
- [Goal phone 390](goal-detail-mobile.png)
- [Event form phone 390](event-form-mobile.png)

No snapshot baselines were regenerated. Review the four existing
`e2e/goals.spec.ts-snapshots/sparziele-{light,dark}-{desktop,mobile}-linux.png`
baselines because goal names now use links. Category/year/report specs generate
evidence captures rather than committed pixel baselines.

CI and Linux visual review are the final gates. Owner desktop/phone review and
physical Safari acceptance remain open. No keys, consents or migration steps are
required; do not merge before the required CI checks pass.

## Delivery blocker

Normal `git add` failed with permission denied creating
`.git/worktrees/budget-pkg-n/index.lock`. The normal commit attempt consequently
had no staged files; no commit was created. No alternate index/ref or sandbox
workaround was used. The standard index is unchanged and the implementation,
tests, captures and PR body remain as working-tree changes.

The requested `git push -u origin HEAD` also failed with
`SEC_E_NO_CREDENTIALS`. Normal `gh pr create` failed with HTTP 401 (authentication
required). No PR was opened and nothing was merged. From an authorized terminal,
stage/commit this package, push the branch, and create the normal PR with the
requested title and [prepared English body](PR.md). The clean-working-tree and
committed-PR-body delivery requirements could not be satisfied in this sandbox.
