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

On 2026-10-20, `BUDGET_REQUIRE_AGE=1 VITEST_MAX_WORKERS=1 npm run check` passed all 569 files / 5,074 tests, followed by a successful normal `npm run build`. All 3,574 frozen source files, index and HEAD remained unchanged; source, compiled-output, process and lock guards passed. The only subsequent changes before the delivery commit are this evidence result and the matching Roadmap status. The existing unused eslint-disable warning and jsdom `scrollTo` notices remain in the original logs. Exact-head remote CI and deployed-revision verification are separate delivery gates.
