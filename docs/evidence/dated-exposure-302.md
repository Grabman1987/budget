# Issue #302 — dated historical class exposure regression

**Focused API coverage passed.** The prepared isolated regression passes against the #295/main baseline; it adds coverage but does not establish or claim a calculation defect. No formula or production source was changed.

The full check used baseline `cd73289b3a8dedffd5e5c11d451b88152000f0b2`. Afterward, the branch was fast-forwarded to its main merge `273d86036efa6985e7e6ad1bf8962aeac9d9170a`; both baseline trees are `a8cb0304ff7084d546c681d26cb1fdad102aca88`, and the tested API-file SHA-256 stayed `DF0309AA7D399B3F32DFA74EBA31139C1331ABCFCB5F8E78FC774F278D76096C`. Independent source review and the lead's literal calculation, final diff and actual-log review found no remaining task finding. PR checks and live delivery remain pending.

## Contract and source inspected

Issue [#302](https://github.com/Grabman1987/budget/issues/302) asks whether historical class results respect effective-dated exposure and explicitly says unclear labels alone do not establish a formula bug. The test calls the real `/api/portfolio?period=YTD&view=securities&history=performance` endpoint from `apps/server/src/api/portfolio-performance.test.ts:277-338`.

- `packages/db/src/repos/asset-exposure.ts:28-59` loads dated versions; line 47 applies `validFrom <= day`, inclusive of the effective date.
- `packages/db/src/repos/portfolio-performance.ts:25-28,52-58` resolves and splits each valued position-day using that day's exposure.
- `packages/db/src/repos/portfolio-performance.ts:60-84,98-124` detects changes between adjacent days and inserts the value transfer as a dated internal flow before calculating class histories.
- Existing API coverage at `apps/server/src/api/portfolio-performance.test.ts:73-93,120-139` checks class returns and historical month-end values; it did not previously give one holding two effective exposure versions.

## Independent literal case

The isolated fixture keeps security `a` as the only holding and deletes its synthetic trade/cashflows plus security `b`'s holding and prices. The EUR position is worth 10,000 cents at 2025-12-31, 11,000 cents at 2026-01-31, and 12,100 cents at 2026-02-28. Exposure is 50/50 A/B from 2025-12-31 and 0/100 from 2026-02-01.

Hand calculation: each class owns 5,000 → 5,500 cents over January, so each has a +10% January contribution. On February 1, the carried 11,000-cent position is split 5,500/5,500; the change moves A's 5,500 cents to B without return. B then moves 11,000 → 12,100 by February 28, another +10%. Expected API literals: A/B ending values 0/12,100 cents; month-end index levels A 110/110 and B 110/121; window TTWROR A 0.10 and B 0.21; class ending values sum to 12,100 cents. Dates, integer-cent endpoints, and monthly periods are asserted exactly; dimensionless index/return values use `toBeCloseTo`.

## Verification boundary and next step

The test file was formatted without changing its prepared assertions. The first focused run, `npx vitest run apps/server/src/api/portfolio-performance.test.ts -t "dated exposure versions"`, passed: 1 test passed, 10 skipped, exit 0, with `VITEST_MAX_WORKERS=1`; see `C:\Users\fabia\AppData\Local\Temp\budget-dated-exposure-302-api-focused-1008.log`. Then the complete portfolio-performance API test file plus the exposure repository tests passed: 2 files / 19 tests, exit 0; see `C:\Users\fabia\AppData\Local\Temp\budget-dated-exposure-302-focused-regressions-1008.log`. The full `npm run check` passed at the frozen source: 378 test files / 3,492 tests, exit 0; see `C:\Users\fabia\AppData\Local\Temp\budget-dated-exposure-302-full-check-1008.log`. `npm ci` and scoped ESLint/Prettier/diff checks also passed. The branch is `codex/dated-exposure-302-1008` at baseline `cd73289b3a8dedffd5e5c11d451b88152000f0b2`. No calculation defect was reproduced and no production formula was changed. Broader portfolio redesign and unrelated UI labels are out of scope.
