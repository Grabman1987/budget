# Read-source inbox summary (#437)

All fixtures and captures use synthetic data. No private files or provider APIs were accessed.

## Behavior

The shared stored-task SQL predicate excludes `ref_type = 'read_source'` except titles starting exactly with `Quellsaldo`. Inbox pages, lightweight badges, navigation and Heute therefore retain the same decision count. Separate SQL summaries count unresolved source movements once per source, independently of inbox period filters and pagination. Bank-specific inboxes do not display unrelated source summaries.

The existing crypto source section is linked at `/einstellungen/datenquellen#crypto-source-title`. It reuses the inbox read/display/actions through a source-filtered query, with title filtering before 100-entry pagination and whole-source title counts. Title groups expand to the original source details and acknowledgement action. Resolution and undo use the unchanged audited write path. Reading either view does not modify stored items, trades or bookings.

The existing API still constructs the selected read model before slicing. This change does not claim database pagination or a performance benchmark. No migration or dependency was added.

## Verification

- TDD red run: the API returned source movements as inbox decisions; source/title filtering and summaries were missing. The web summary test had no rendered links. All failed for the intended missing behavior.
- Focused Vitest: **4 files / 51 tests passed**. Files: server inbox API, DB inbox repository, source refresh persistence and web source summaries.
- TypeScript: DB, server and web package checks passed.
- Changed-file ESLint/Prettier and `git diff --check` passed.
- `npm run build:e2e` passed once. Web-only e2e-mode rebuilds after copy corrections also passed, with existing Rollup annotation/mixed-import/chunk warnings.
- Scoped browser verification: **14 functional scenarios passed across desktop/mobile** (7 per viewport). The mobile package run finished with **10 passed**, including 3 setup tests. The initial desktop run passed 6 scenarios; the new scenario exposed a test pagination assumption after undo. Resolving the only item on page 2 removes that page; undo restores the item and makes page 2 available through the existing load-more action. The corrected test verifies all 101 rows after reloading that page. Its focused desktop rerun finished with **4 passed**, including 3 setup tests.
- New-flow coverage includes summary-only inboxes, retained balance warnings, source links, whole-title counts, title filtering, 101 movements across network pages, resolve/undo, light/dark Axe (no serious/critical violations), desktop 1440 px and mobile 390 px without horizontal page scroll. The source summary's mobile touch target and existing group/filter controls are at least 44 px.

The first normal browser startup failed before assertions because Windows `os.userInfo()` returned `uv_os_get_passwd / ENOMEM`. A standalone Node call reproduced it. The retry uses an ignored process-local preload supplying synthetic OS metadata only for that exact error. Application code, dependencies, test assertions and CI configuration are unchanged by this fallback. The local runner also stalled while terminating its Windows web-server processes; only the four servers started by each completed run were stopped, allowing Playwright to finish normally with exit 0.

The full local check and full E2E suite were intentionally omitted under the owner's parallel-job override. CI remains the final gate. No snapshot baseline was regenerated; the touched specs produce capture-only evidence and do not use snapshot baselines.

## Captures

- Inbox: [desktop](inbox-desktop.png), [mobile](inbox-mobile.png).
- Source movements: [desktop light](source-desktop-light.png), [desktop dark](source-desktop-dark.png), [mobile light](source-mobile-light.png), [mobile dark](source-mobile-dark.png).

## Owner steps

After CI and deployment, review the reduced inbox count, retained balance warnings, summary link and source movement actions on desktop and phone. No new key, consent, environment setting or migration is required. This task does not merge or deploy.

## Delivery blocked in this session

`git add` and `git commit` both failed because the shared worktree Git directory refused creation of `index.lock` (`Permission denied`). No task commit was created; HEAD remains the supplied base `7e6aef91`. The index is unchanged, and the verified changes and evidence remain unstaged in the working tree. A clean working tree cannot be supplied without discarding the implementation.

The explicitly requested `git push -u origin HEAD` also failed: Windows Schannel reported `AcquireCredentialsHandle / SEC_E_NO_CREDENTIALS`. No alternate Git directory, credential route or publication workaround was used. No remote task changes or PR were created. The ready English PR body is in [PR.md](PR.md).

Owner delivery step: restore normal write access to the shared worktree Git metadata and GitHub credentials, then commit these files, push `feat/inbox-read-source-summary` and open the normal PR using the prepared title/body. Keep CI as the merge gate.
