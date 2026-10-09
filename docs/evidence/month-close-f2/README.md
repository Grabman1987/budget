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

| View   | Desktop                                                             | Phone                                                             |
| ------ | ------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Plan   | [light](desktop-plan-light.png) / [dark](desktop-plan-dark.png)     | [light](mobile-plan-light.png) / [dark](mobile-plan-dark.png)     |
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

## Linux preflight — 2026-10-09

GitHub Actions run [37874069963](https://github.com/Grabman1987/budget/actions/runs/37874069963)
passed on the Linux preflight. The verified task parent was
`400dc4ff91f8dc2890ae692a19bbf13c66c514ad`; helper commit
`017af6dea4bb221bd59ba2663922ea07219ae345` contains only workflow changes. The
application source was unchanged by that helper.

The focused gate covered four files and 24 tests in 6.64 seconds. The full gate
covered 382 files and 3,519 tests in 149.57 seconds; TypeScript, lint and format
were green. Production and E2E builds passed. The desktop/mobile browser run
reported five passes, including three setup cases, in 33.3 seconds. The eight
current screenshots below were generated from that preflight and reviewed by
the lead reviewer without substantive findings. SHA-256 values identify the copied artifacts.

| View   | Desktop                                                                                       | Mobile                                                                                      |
| ------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Plan   | [light](current-1009/desktop-plan-light.png) / [dark](current-1009/desktop-plan-dark.png)     | [light](current-1009/mobile-plan-light.png) / [dark](current-1009/mobile-plan-dark.png)     |
| Review | [light](current-1009/desktop-review-light.png) / [dark](current-1009/desktop-review-dark.png) | [light](current-1009/mobile-review-light.png) / [dark](current-1009/mobile-review-dark.png) |

| Screenshot                 | SHA-256                                                            |
| -------------------------- | ------------------------------------------------------------------ |
| `desktop-plan-light.png`   | `A0F95A20FDC4E94CF7BDBC747064BECBC7AB7CD683B6A36E2ECF603A236B5CB8` |
| `desktop-plan-dark.png`    | `E655520BC2E42F816C08F966B73786AFFEEA223E2BA3E9B9C5AD3768BBDF37DA` |
| `desktop-review-light.png` | `BDFE9A161D717D90F4139EB2A8486952C7BF6A1DC825E19646DBA9AA19669751` |
| `desktop-review-dark.png`  | `C668BCACBC95E6EBF969974B0CA2E620B976338CEBACD81A6A14A651F623934B` |
| `mobile-plan-light.png`    | `8EB79839F81A66554D7DDC11448BBB27DED05DB603473D5206EF00DAE69123B8` |
| `mobile-plan-dark.png`     | `720AE354AB1000B0FA792175A0D495E9F3825F7A6C057749F240695F90A9509D` |
| `mobile-review-light.png`  | `3AA13FE594C4E52EAE75CDD225B68C6BAE101504C7DC4819C1ECEF94FACB6E30` |
| `mobile-review-dark.png`   | `6F98E69982E32FFC0BE95059AF5BEC93DD75B64E4A47FCFAC7509D2CBB119266` |

This was a Linux preflight, not a local full #243 verification. Real financial
comparison, owner Gate 4 and physical iPhone Safari acceptance remain open.
