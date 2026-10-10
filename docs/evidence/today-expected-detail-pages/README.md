# Today and Expected detail pages

Refs #316, #317, #328, #329, #341. Builds on PR #409's Today hints branch; integrate that dependency first.

## Scope

- `/heute/details/:kind` handles exactly liquid, invested, receivable and debt. It reuses the existing Today read model, as-of account query, grouping predicate, totals and account links. Month/period travel in the URL; other Today derivations stay inline.
- `/plan/erwartet/einnahmen` is an additional route to the existing `PlanIncomePage` and `IncomeBody`, with Expected return navigation. The existing `/plan/monat/einnahmen` entry remains. Expected detail URLs carry `monat`, `ansicht` and `art`; list history remembers selected view/kind for browser back.
- `/plan/erwartet/:id` displays the existing amount, cadence, versions and occurrences. Creation, editing, version capture, linking and deletion confirmation use FormDialog. Skip/unskip, missed and unlink remain explicit actions through the same APIs and `useBudgetWrite` audit/undo adapter. Direct navigation never changes a booking's confirmation status.
- Secondary Today content fills the width below the unchanged three answer cards.

No migrations, dependencies, money formula changes, private data, provider calls or edits to the excluded lanes. Router changes only add routes and their validation.

## Verification

Synthetic navigation/form regressions were run red before implementation. The initial JSDOM run lacked native media-query/dialog APIs; the existing test-polyfill pattern resolved that harness error. The confirmed red run failed because both triggers did not navigate and payment content was a side dialog.

Final focused unit run: **6 files / 23 tests passed** (exit 0). This includes the new navigation/dialog regression and the payment deletion return-context regression. The latter first failed because deletion discarded the originating view/filter; the final implementation preserves both.

Final Web typecheck, ESLint and Prettier on changed TypeScript/TSX/CSS, and the CSS design-scale check passed (exit 0). `npm run build:e2e` passed once; subsequent Web-only e2e-mode builds after the accessibility and return-context fixes passed (existing Rollup annotation, chunk-size and mixed-import warnings).

The standard desktop browser command initially failed before tests: tsx's `os.userInfo()` threw `ERR_SYSTEM_ERROR` / `uv_os_get_passwd` / `ENOMEM`. A standalone call reproduced the same error. Subsequent local browser verification uses an ignored process preload supplying synthetic OS metadata only for that exact error, as documented in predecessor deliveries. Assertions, production code, dependencies and CI config are unchanged by the preload.

Focused Playwright results, with one worker and port 4960:

- Desktop: the selected scenarios in `expected.spec.ts`, `heute.spec.ts` and the new `today-expected-detail-pages.spec.ts` initially had 12 passes / 1 failure, including three setup tests. Axe found an empty version-table header. After correcting it, the affected scenario passed (4 passes including setup).
- Mobile (390 px): the same selected scenarios passed, **13/13 including three setup tests**.
- Visual inspection then found the unused version-action column wrapped its label on mobile. The local Expected CSS hides this unused column; both viewport payment scenarios passed again.
- Final payment run after the deletion-context fix: **5/5 passed including three setup tests**, desktop and mobile. It covers single-occurrence skip, undo, skip/unskip, untouched next occurrence, edit cancellation/focus/reset, deletion cancellation, explicit deletion with preserved list context, and deletion undo. Navigation/reload leaves occurrences expected.

The new spec also verifies direct URLs, browser back, return links, month/period/filter context, unknown dimension rejection, retained account links, three Today cards, full-width secondary sections, Axe in light/dark mode, page overflow and new mobile targets of at least 44 px. Existing focused Expected scenarios cover version creation and explicit booking linking. Linux screenshot comparisons are skipped on Windows; the captures below were reviewed manually.

Windows Playwright left its test-server descendants holding output pipes after the tests finished. Only the four server process IDs printed by each completed run were stopped; each successful command then returned exit 0. Other jobs were left running. No test assertion was weakened and no baseline was regenerated.

## Reviewed captures

| Page | Desktop | 390 px |
| --- | --- | --- |
| Today dimension | [Light](dimension-desktop-light.png), [dark](dimension-desktop-dark.png) | [Light](dimension-mobile-light.png), [dark](dimension-mobile-dark.png) |
| Today secondary content | [Dark](secondary-desktop-dark.png) | [Dark](secondary-mobile-dark.png) |
| Expected income | [Light](income-desktop-light.png) | [Light](income-mobile-light.png) |
| Expected payment | [Light](payment-desktop-light.png), [dark](payment-desktop-dark.png) | [Light](payment-mobile-light.png), [dark](payment-mobile-dark.png) |

## Visual baseline review and owner steps

No local snapshot baseline regeneration. CI must review Expected `expected-panel-light-{desktop,mobile}-linux.png` and `expected-income-dark-{desktop,mobile}-linux.png`: they now capture detail pages. Also review Today `shell-heute-{light,dark}-{desktop,mobile}-linux.png` and downstream full-page screenshots including the expanded secondary monthly sections. Expected list `expected-light` / `expected-dark` captures should otherwise retain their existing data and table styling.

Required CI remains the final gate; full local check/full E2E were omitted per this package's memory constraint. Owner steps: review desktop/390-px detail navigation and forms, approve the affected Linux baselines, integrate PR #409 first, then this package. No keys, consents or migrations are needed. No merge or deployment performed.

## Delivery blocker

Git staging and committing were denied: `Unable to create 'C:/Users/fabia/budget/.git/worktrees/budget-pkg-l/index.lock': Permission denied`. No package commit was created. The index remains unchanged; the verified source, tests, captures and ready English PR body in `PR.md` remain in the worktree. Push/PR creation could not proceed without a package commit. No permission or sandbox workaround was attempted. The working tree is intentionally preserved and is not clean.
