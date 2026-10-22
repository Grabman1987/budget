# #762 exact valuation token — independent source review

Base: `706f590831ab92f28af2e7e52fd89b2915b1c87b`.
Source: `8f1475709f50b706dbcba9e12c91deefc2579cc4`.
Worktree: `/workspace/impl-762-strategy`; HEAD confirmed and working tree clean during inspection.
Scope: sole changed file `packages/db/src/repos/strategy-rebalance.ts`, compared with the actual canonical allocation, holdings, cash and FX readers. Follow-up to the remaining P2 in `762-rebalance-lifecycle-fix-source-review.md`.

Source-only: no tests, checks, compilation/build, browser, database/provider access, runtime execution or repository edits.

## Result

The remaining proposal-source P2 is closed in this exact source delta. No new actionable source defect was identified within the correction.

- The token now includes the included canonical holding values directly from `holdingValuationExportAsOf`: account/security, unitsE8, priceMicro, currency, fxRateMicro, effective price date and quality. Missing-price/FX positions are retained explicitly. The prior same-cent quote correction and units/price offset examples now change token inputs.
- The numerical facts supplement the existing selected-source date/source disclosures, exposure/config/universe and binding revision; they do not substitute a new valuation formula. GET candidate, stored proposal/current comparison and transactional review POST all use the same helper.
- Cash uses `accountBalances` and the same on-or-before FX selector as `cashValuer`, retaining native balance, native selected input and numeric rate. The p2p manual-value branch matches `allocationInputsAsOf`: latest live on-or-before manual value only when that account has no canonical holding/missing-holding position. Holding-account detection intentionally includes positions whose security is outside the allocation selection, matching the existing producer.
- Arrays of numerical position/cash facts are ordered for hashing. Missing foreign FX remains null evidence; no invented conversion or zero is introduced. The volatile request timestamp remains outside the hash.
- Actual trade capture/linking, reviewed-trade audit token, historical currency, retained request idempotency and Undo/redo behavior are not changed by this patch. In particular, the exact proposal-source check adds no quote requirement to actual linkage.

Together with the preceding correction review, all five findings from the initial lifecycle source review are source-scoped closed at `8f1475709f50b706dbcba9e12c91deefc2579cc4`. This is not runtime, concurrency, schema or financial acceptance evidence. No new owner policy decision is required.
