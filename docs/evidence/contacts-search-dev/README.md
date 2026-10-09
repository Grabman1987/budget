# Contacts, search and developer surfaces

Scope: #321, #322, #338, #339 and #340 on `codex/pkg-m-contacts-search-dev-1009`, based on the #406 inbox work. This package moves presentation/navigation only and preserves the existing financial and search providers.

Contact statements reuse ContactBody at `/konten/kontakte/:id`. The `verlauf=1` context is retained across direct links, reload, back links and browser history. Legacy `?kontakt=` links still work. Creation uses FormDialog with explicit cancellation and input focus after the native dialog opens. Repayment/allocation and cashless settlement continue through their audited, undoable APIs.

Search uses `/suche` with a bounded query and the existing validated internal `von` return URL. Existing static/dynamic results, recent ranking, privacy masking, errors/retries and keyboard selection are reused. Opening directly after navigation reads the router's current location and focuses after navigation completes. The dev detail route is registered only under the existing dev/e2e guard; real shared panel callers remain.

## Verification

- Web TypeScript, changed-file ESLint, Prettier and `git diff --check` passed.
- Four affected Vitest files: **49 passed**. RED reproduced the old contact button, missing Ctrl-K navigation and two invalid capture-account contexts before their fixes.
- `npm run build:e2e` passed once. Two web-only rebuilds followed concrete browser-discovered context/focus corrections; the server build was not repeated. Existing dependency annotation and bundle-size warnings remain.
- The full `npm run check` and full E2E suite were deliberately not run under the owner's parallel-job/memory exception. CI is the final gate.

The selected desktop matrix printed 14 successful cases including three setup cases, one mobile-only skip, and two new-case readiness failures. Both new cases then passed in the focused desktop rerun (five successful cases including setup). The selected 390px matrix printed 20 successful cases including setup; the remaining long-form scroll test still searched for the removed detail-demo “Fertig” button. It now checks the last input and the sticky save button, preserving the scroll-lock/overflow assertions. Its focused mobile rerun printed four successful cases including setup.

Local Windows Playwright processes did not finish teardown after printing all selected case results and were interrupted before starting the next run. These are successful individual browser-case observations, not a claimed exit-zero E2E command. CI must provide the clean end-to-end gate.

The first browser startup failed before tests: Windows sandbox `os.userInfo()` reproducibly returned `uv_os_get_passwd / ENOMEM` in tsx. Browser runs use a temporary OS preloader outside the repository that falls back only for that exact error, with a synthetic identity. No application or test assertion was bypassed. This is local harness evidence, not physical iPhone Safari acceptance.

Browser-discovered defects were corrected: numeric-string URL serialization lost overview history, React autofocus occurred before showModal, and an immediate Ctrl-K could use the previous rendered route. Test readiness now waits for refreshed results after reload and for completed form saving before checking the new contact. Financial assertions were retained.

## Review and remaining gates

No Linux pixel baseline was regenerated locally. Affected gallery baselines are `bauteile-light-desktop-linux.png`, `bauteile-dark-desktop-linux.png`, `bauteile-light-mobile-linux.png` and `bauteile-dark-mobile-linux.png`. Shell/application captures containing the desktop search control also change. The synthetic evidence images below are review captures, not baseline replacements.

| Surface | Desktop 1440 | Phone 390 |
| --- | --- | --- |
| Contact statement | [Desktop](desktop-contact-page.png) | [Phone](mobile-contact-page.png) |
| New contact form | [Desktop](desktop-new-contact-form.png) | [Phone](mobile-new-contact-form.png) |
| Search, light | [Desktop](desktop-search-page-light.png) | [Phone](mobile-search-page-light.png) |
| Search, dark | [Desktop](desktop-search-page-dark.png) | [Phone](mobile-search-page-dark.png) |

Required CI, Linux visual review, #406 integration, deployment and owner/device acceptance remain open. No private financial data, real provider API, secret, dependency or migration was used. The prepared English PR body is [PR.md](PR.md).

## Publication blocker

Staging failed because Git could not create `C:/Users/fabia/budget/.git/worktrees/budget-pkg-m/index.lock` (Permission denied; no existing lock). No commit could be created. `git push -u origin HEAD` failed with Windows schannel `SEC_E_NO_CREDENTIALS`. The requested normal `gh pr create` returned HTTP 401 (Requires authentication). No permission or authentication workaround was attempted. The working files remain available for review; the index is unchanged and the working tree contains the package changes.
