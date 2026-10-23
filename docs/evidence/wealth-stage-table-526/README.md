# Wealth-stage table (#526)

The existing editor now exposes all stages together. Percentage cells, stage boundaries and names remain ordinary editable fields; phone layout uses the same fields in one card per stage. Options preserve unmanaged targets and custom bands. Hidden class columns do not remove saved targets.

## Browser captures

All captures use synthetic data and canonical Playwright 1.64.1 / WebKit 27.2. Desktop contexts use a 1440 × 900 CSS viewport with DPR 1 and a fine pointer; phone contexts use 390 × 844 with DPR 3 and a coarse pointer. These are browser-emulation results, not physical-iPhone certification. The phone images show the first card after the keyboard interaction and do not claim to show every stage at once.

| View | Light | Dark |
| --- | --- | --- |
| Desktop | [Light](desktop-light.png) | [Dark](desktop-dark.png) |
| Phone | [Light](phone-light.png) | [Dark](phone-dark.png) |

The first browser attempt passed nine cases and failed two desktop geometry checks because a new helper counted unpainted controls inside closed details. The helper now uses the same `checkVisibility()` predicate as Playwright; the 44px requirement, viewport bounds, row/field assertions and financial expectations are unchanged. The corrected canonical run passed all eleven tests (six new cases, two existing regressions and three setup cases), without skipped, flaky or retried cases. Both themes passed Axe, keyboard and layout checks; dated save, real Undo and stale-account-scope conflict cases passed. The unchanged 166-file E2E build was reused after its bytes and modes were verified before and after the run.

The coordinator adapted the existing asset-settings tests solely to open the new disclosures and select explicit table rows. Original amounts, boundaries, dates, scope, conflict, archive and Undo expectations remain; this follows the owner's decided-UI test policy and received independent whole-diff review.

## Full validation

On 2026-10-20, `BUDGET_REQUIRE_AGE=1 VITEST_MAX_WORKERS=1 npm run check` passed all 569 files / 5,074 tests, followed by a successful normal `npm run build`. All 3,574 frozen source files, index and HEAD remained unchanged; source, compiled-output, process and lock guards passed. This full run preceded the initial delivery commit; only the evidence result and Roadmap status changed before that commit. The existing unused eslint-disable warning and jsdom `scrollTo` notices remain in the original logs. Exact-head remote CI and deployed-revision verification are separate delivery gates.

## CI-driven test correction

Initial PR head `d015dbe6` exceeded the unchanged 5-second limit in the new combined draft-status component test. GitHub's annotation establishes the timeout, not the precise awaited operation. The test entered 31 characters into the controlled seven-stage editor. Its two scenarios now run independently and paste the same complete name/date literals through the normal input path; exact value assertions also ensure the future date is actually applied without a prior name edit masking its status. All prior saved-version/status/no-write assertions remain, and no timeout or existing test changed. The corrected component suite passes seven cases (23.12 seconds overall); Web typecheck, changed-file lint and formatting pass. Product files and all browser evidence remain unchanged. The 569-file / 5,074-test full result above belongs to the preceding test version; final exact-head CI validates this correction.

A second CI head (`4005e770`) hit the same limit in the new custom-band-to-static case. An unchanged isolated local run took 4,452 ms. Pasting the same `3,00` input with an exact value assertion, scoping the unchanged visible-role checkbox query to its label, and reusing the already verified live Save button reduced the observed case to 3,332 ms. All seven cases pass together; Web types, lint and formatting pass again. Every original interaction, the complete literal PUT expectation and the other six cases remain; no time limit or visibility/pointer check was relaxed. Fresh CI still determines delivery readiness.
