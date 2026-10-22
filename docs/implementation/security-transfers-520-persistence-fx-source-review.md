# #520 historical-FX report fallback — independent source review

Base: `e73ab07c1d58442c6d645a5ef7558169bf4a7e96`.
Reviewed head: `f7a9bb946ed03e241d8b7cc871936d83e3df3866`.
Worktree: `/workspace/impl-520-transfer-persistence`; clean and pinned at review completion.

Scope: complete 14-file correction delta, relevant shared valuation/TER helpers and consumers of changed nullable DTO fields. Source reading and read-only Git only; no tests, checks, compiler/build, browser, database, provider operations or product edits. This is follow-up to `520-persistence-fix-source-review.md`.

## P2 — DepotColumn retains the removed, narrower reason type

`packages/db/src/repos/portfolio-depots.ts:48` still declares:

```ts
returnUnavailable: SecurityTransferFlowUnavailableReason | null;
```

The delta removes the import of `SecurityTransferFlowUnavailableReason` and imports `PortfolioReturnUnavailableReason` instead. The former name is now unresolved in this module. Moreover, the returned depot and total DTOs now legitimately carry `missing_valuation_fx`, which belongs to the wider union. Re-adding the old import alone would leave the DTO inconsistent with its new producer.

Minimal correction: change `DepotColumn.returnUnavailable` to `PortfolioReturnUnavailableReason | null` and update its comment to cover historical valuation as well as boundary flow. This is directly visible from the source; no compiler was run.

## Financial/source assessment of the remainder

The prior historical-FX P2 is addressed by the implementation, subject to the DTO type correction above:

- `valuationSeriesRead` catches only `ExchangeRateUnavailableError`. Unsupported evidence, range/precision and other errors still propagate. No valuation or return formula changes, provider request, invented quote or zero substitution is introduced.
- Portfolio summary obtains current positions/basis before the fallible historical series. A failed series leaves performance/history/contributions unavailable with the distinct historical-valuation reason. It does not finish/publish a partially collected valuation-provenance result.
- TER recovery calls the same valuation reader for the twelve dates used by the existing TER convention (including today's partial-month mark). A missing required mark leaves TER and dependent totals/rates null. Recovered maps become authoritative only after all required marks succeed; zeros before recorded portfolio history or for absent positions keep the existing semantics. Booked fees remain independent. The normal available-series path still uses its original month-end figures and domain fund-cost helper.
- Depot comparison retries canonical valuation per account when the whole series fails. Healthy accounts retain actual historical arrays. An affected account uses a separate current-day read only for its current value; no current-day number is filled across missing history. Any affected account leaves the total return/index unavailable. Current total is the sum of current account values. If today's value itself cannot be established, the existing error still propagates rather than manufacturing a current value.
- Allocation retries per product, retains healthy product returns and current allocation, and derives allocation history independently from dated allocation inputs. Only the typed historical FX failure becomes its unavailable reason.
- The costs DTO carries unknown TER through combined costs, cost rate and net income as null. The changed UI avoids arithmetic/formatting on those null fields and suppresses the dimension chain when an operand is unknown. Bank-cost reporting marks fund costs unavailable when the required TER is unknown. The available-data arithmetic is unchanged.
- Shared German copy distinguishes a missing transfer quote, missing transfer FX and missing historical valuation FX. The fallback does not change the previously established Whole Picture *flow* invariant; unrelated historical valuation consumers were not claimed repaired.

Outcome: **one actionable P2 DTO/type defect; no additional financial/source defect found in this bounded delta**. The earlier eager-series missing-FX path is now handled in the reviewed report scopes. No runtime, typecheck, migration, writer/Undo/apply or activation claim is made. No new owner product decision is needed.

## Exact correction follow-up — source-clear within this reviewed scope

Reviewed `e812fb40aac58905869b76b91950b3dc351ccba6` against `f7a9bb946ed03e241d8b7cc871936d83e3df3866`. The only product change updates `DepotColumn.returnUnavailable` to the imported `PortfolioReturnUnavailableReason | null` and clarifies its comment. This agrees with both account/total producers and includes `missing_valuation_fx`; no stale old reason-type reference remains in the module. The other changes archive the preceding report and explain its limitation.

The sole remaining P2 is closed. No further actionable issue in this exact correction. Together with the preceding full and correction source reviews, there is no open finding in the bounded persistence/read-projection/reporting slice at this head. The worktree was clean and pinned to the reviewed full SHA. No tests, checks, compiler/build, browser, database or migration operations were performed. This is source-scoped clearance only; writer/grouped Undo/apply, runtime acceptance and activation remain outside it.
