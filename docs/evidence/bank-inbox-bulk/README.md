# Bank inbox package — #424

Bank candidates and unchecked bank bookings render compactly. Native details mount assignment and match queries only when opened. Preparation never confirms a row. The compact summary retains prepared suggestions after collapse; untouched rows explain that suggestions load on opening.

Selection applies to loaded bank rows, capped at 100 per request. The dialog snapshots selected prepared suggestions and counts skipped rows. Unprepared rows cannot be confirmed in bulk. One endpoint reuses existing resolve, delete, merge, assignment and candidate-confirm paths in one SQLite transaction and one audit group. Stale previews fail atomically. Candidate revisions are checked before any row learns an alias, preventing the batch's own learning from invalidating later rows.

The source view sorts and filters by transaction date before pagination; warnings use their creation date. Controls persist in the URL. Balance mismatch references link to the account. No migration or dependency. Minimal shared changes: optional preparation callback in assignment review and optional audit group injection into bank confirmation.

## Verification

- Red: bulk tests returned 404, date-filter test returned three rows instead of two, and the 65-row component test found immediately mounted forms.
- Initial green: 22 affected component/API tests passed.
- One E2E build passed. Existing Rollup annotation, mixed static/dynamic import and large-chunk warnings remain.
- TypeScript checks passed for web, server and db. Changed-file ESLint and Prettier checks passed; git diff --check passed.
- Six affected server/DB test files passed (108 tests); the expanded assignment API file passed again (22 tests). The 65-row component regression passed separately (1 test, threads pool). Fork-worker startup timed out under machine load; the isolated threads rerun passed.
- All five changed desktop browser scenarios passed across targeted runs. All five mobile scenarios passed at 390px; the final Playwright report records status passed and no failed tests. The initial default four-server setup failed before tests with ENOMEM. The existing isolated configuration, one worker and a 120s per-test timeout completed successfully.
- A real desktop touch-target failure exposed 34px warning actions. Their minimum size was corrected to 44px, then both failing desktop scenarios passed. The scoped web/server rebuild also passed.
- Memory override: no full local check or full E2E suite. CI is the final gate.

## Visual evidence

Browser evidence: [desktop light](desktop-light.png), [desktop dark](desktop-dark.png), [mobile light](mobile-light.png), [mobile dark](mobile-dark.png). Checks cover horizontal page scroll, 44px controls/checkbox labels and Axe. Baselines are not regenerated. Review inbox, global inbox and month-close inbox baseline changes in CI.

## Delivery limitation

Commit creation was blocked: Git could not create `C:/Users/fabia/budget/.git/worktrees/budget-r3/index.lock` (permission denied). No commit, push or PR was created, and no sandbox workaround was attempted. The index is unchanged; implementation and evidence remain in the worktree. The prepared PR body is [PR.md](PR.md).

## Owner acceptance

Commit the preserved changes, push this branch and open the prepared PR from an environment with Git-index write access. Await CI and review on a phone: open rows, select prepared suggestions, inspect the count preview, confirm explicitly, and try Undo. No provider calls, keys, consent changes or migrations are required.
