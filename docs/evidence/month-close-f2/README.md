# Month close F2 evidence

All accounts, categories, transactions and amounts in these captures are synthetic.
The isolated ledger clock is 2026-10-02; the flow closes September and plans October.

`e2e/month-close.spec.ts` passed on Desktop Chrome (1440 × 900) and Mobile Chrome
(390 × 844): **2 passed**. Each run walks all five steps, assigns the next-month
pool to zero, undoes the entire planning step, reapplies, saves the close marker,
reloads and resumes through the existing search entry. Booking count stays unchanged.
Both new views pass light/dark Axe and horizontal-overflow checks; the phone
continuation is sticky and does not overlap the capture button.

The eight `desktop-*.png` / `mobile-*.png` captures show plan and review in light
and dark. They were visually inspected; no screenshot baselines were regenerated.
Full-page phone captures include the viewport-fixed footer/navigation at the
capture viewport boundary.

| View | Desktop | Phone |
| --- | --- | --- |
| Plan | [light](desktop-plan-light.png) / [dark](desktop-plan-dark.png) | [light](mobile-plan-light.png) / [dark](mobile-plan-dark.png) |
| Review | [light](desktop-review-light.png) / [dark](desktop-review-dark.png) | [light](mobile-review-light.png) / [dark](mobile-review-dark.png) |

## Local verification

The final code passed all workspace typechecks, ESLint, Prettier, production and
E2E builds. The final browser run passed both projects (**2 passed in 40.5 seconds**).
A prior full unit gate with the standard five-second test deadline completed:
**355 files passed / 3 failed; 3,299 tests passed / 7 failed, of 3,306 total**.
Every failure was `Test timed out in 5000ms`: the foreign-origin auth load test,
five PP-migration tests and the existing quick-assignment test. No result
assertion failed; all F2 tests and the manual-value series regression passed.
The subsequent safety fixes add two domain test cases and preserve all prior
assertions. The focused domain/API/component/manual-value run passed **28 tests**.

During this run the host had as little as 7,172 KiB free of 8,205,160 KiB physical
memory. The final complete gate passed with **358 files / 3,308 tests, exit 0**
(unit duration 451.32 seconds), using two threads, filesystem module cache,
test isolation intact and a host runner deadline of 30 seconds:
`npm run check -- -- --pool=threads --fsModuleCache --testTimeout=30000`
(`VITEST_MAX_WORKERS=2`). Test cases, counts, money/security assertions and the
repository's CI configuration are unchanged. The default-deadline failure is
retained here rather than presented as a passing run.

No source changes followed this gate. The final production build exited 0;
both final browser projects exited 0. Documentation and synthetic screenshots
were recorded afterward and `git diff --check` passed.

## Local Windows runner

Production and E2E builds passed. Browser verification uses the existing isolated
ledger fixture with one worker and an ignored local Playwright configuration
without the unrelated shared seed servers. The restricted host returns `ENOMEM`
from `os.userInfo()`; an ignored preload supplies synthetic OS metadata only for
that exact error. Neither product code nor test assertions are changed by this
runner adaptation. The longer runner timeout accommodates host memory pressure.

Physical-phone acceptance, Linux CI and the owner's private Gate 4 comparison
remain separate. No keys, consents or real provider calls are needed for F2.
