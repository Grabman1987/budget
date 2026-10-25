# SPEC-010 — Allocation assurance and explanation

Decision basis: CAP-021; WP-013. Existing dated exposure, target, allocation-universe and quality systems are authoritative. This proposal adds assurance and explanation in current rebalancing/support; it does not add another taxonomy or allocation engine.

## 1. Goal and problem

Help the owner understand when current rebalance guidance is trustworthy, what exact inputs produced it, and why recommendations are unavailable or provisional. The repository already has dated weighted security exposures, tiered class targets, a two-level class hierarchy, a scoped investment universe and missing/stale-data quality guards. Remaining work is explainability and assurance of those shared results, not new target controls. UI terms: **Umschichtungsabstand**, **Neues Kapital bis Soll**, **Datenqualität**.

## 2. Sources and reference behavior

References PP-093–095 and their taxonomy variants in [the matrix](../feature-matrix/features.csv). Budget's dated exposure and target policies have precedence over PP's taxonomy model.

Feature `CAP-021`; catalog decision: reuse dated weighted exposures, targets and provisional-data guards; retain limited hierarchy. Evidence: `packages/domain/src/wealth/allocation.ts` (`allocationStatus`, `defaultBandBp`); `packages/domain/src/wealth/asset-exposure.ts` (`splitAssetExposure`); `packages/domain/src/wealth/proposals.ts` (`rebalancingProposals`, `newCapitalToTarget`); `packages/domain/src/wealth/target-policy.ts` (`validateTargetPolicy`, `resolveTargetTier`); `packages/db/src/repos/allocation.ts` (`allocationInputsAsOf`, `portfolioAllocation`); `packages/db/src/repos/asset-exposure.ts` (`exposuresAsOf`); `apps/server/src/api/invest.ts` (`/allocation`, target/exposure APIs); `docs/allocation-quality-scope.md`; `docs/asset-exposure.md`; `docs/asset-classes-settings.md`; `docs/portfolio-risk-policy.md`; `SPEC.md` PR1–PR4 directives. Existing class groups/parents: `docs/portfolio-composition.md` and `packages/db/src/schema/invest.ts`. No independent second resolver is authorized.

## 3. Intended Budget behavior

Make each current allocation/rebalance result auditable through a compact “why” view: as-of date, investment universe and exclusions, current class value/share, effective dated exposure/target tier/band, formula and quality confidence. Explain missing/provisional/suppressed states with affected positions and links to the existing security, account, exposure or target editor. Reuse the current values and proposal DTO; no independent recalculation in UI. Respect existing quality gate: exact data permits normal guidance; estimated/unknown data is provisional; missing price/FX makes valuation unavailable and suppresses proposals; plans outside policy scope suppress redistribution.

## 4. Scope and exclusions

WP-013 covers current rebalancing and support/explanation for CAP-021 only. Preserve existing two-level class grouping, whole-universe target semantics, effective-dated exposures and class lifecycle. No new asset taxonomy, third hierarchy level, duplicate allocation settings page, target model, historical membership editor, dynamic tier mechanism, order execution, auto-trading, new risk rules or return/performance calculations. No change to inclusion defaults, thresholds, quality tolerances or target-resolution semantics. Historical allocation keeps current scope metadata limits and dated exposure/target behavior.

## 5. Flows, errors and empty states

On Portfolio allocation/rebalancing, open **Warum dieser Vorschlag?** for a class row or suppressed proposal. Show each input and link to its authoritative editor. Missing valuation displays **Nicht ermittelbar**; no fabricated tier or 0 EUR fallback. Unknown classification shows unclassified share and provisional status. When no target exists, distinguish unmanaged from managed 0%. Empty positions show no recommendation and a link to target setup; all plans outside universe show scope gate and preserve schedules. On stale data, show timestamp/source and actionable route if possible. If detailed evidence cannot be loaded, retain the already safe summary and report a German retryable error; never downgrade a blocked result to exact.

## 6. Rules and formulas

Use shared `allocationInputsAsOf(db, asOf)` and `resolvePortfolioRiskPolicy(db, asOf)`. Class value = conserved largest-remainder weighted slices of signed included position/cash values; complete weights sum 10000 bp and incomplete remainder is visibly unclassified. Target gap = `round(total × targetBp / 10000) − classValue`, labelled Umschichtungsabstand at unchanged total. Only for an underweight R13 class, new capital to target is `(total×targetBp − classValue×10000)/(10000−targetBp)`, rounded once to cents; at a 100% target, nonpositive total or nonpositive need it is unavailable. Band remains smaller of configured standard ±5 percentage points and ±25% of target unless a custom band exists. Never use rounded displayed shares for breach decisions.

## 7. Synthetic examples and edge cases

With total EUR 1,000, class value EUR 400 and 60% target, gap is EUR 200 while new capital needed is EUR 500; adding EUR 500 makes the class EUR 900 of EUR 1,500. If the total includes a signed EUR −100 broker cash balance, it remains in the universe and total; do not clip it to zero. A 60/35/5 split of EUR 1.01 yields EUR 0.61/EUR 0.35/EUR 0.05; unknown remainder is retained and sums conserve cents. At an inclusive EUR 10,000 tier boundary, select the lower tier. If one position lacks FX or price, the whole recommendation is suppressed; if one cent is unclassified, result is provisional. A historical exposure change reallocates sleeves, never creates return.

## 8. Model and migration

No schema migration is expected: migration 0033 already supplies minimal current allocation scope; 0031 dated exposure history; 0035 dated target policies/tiers; 0038 class parents/empty-group marker. Reuse existing `security_exposure_version`, `security_asset_exposure`, `asset_target_version`, and allocation membership columns. Prefer an expanded read-only explanation DTO derived from existing rows; persist no duplicate calculation, cached explanation or historical membership claim. If support telemetry needs a durable owner note, treat that as a separate decision, not a side effect of viewing this result.

## 9. API and domain interface

Continue `GET /api/portfolio/allocation` and existing report 4.2 read models. If current response lacks provenance details needed for explanation, add optional read-only `explanation` fields: `asOf`, `scopeSummary`, `exposureSource/validFrom/completeness`, `targetVersion/tierIndex`, `bandRule`, `qualityReasons[]`, and calculation identifiers. Derive them server-side from the same loaded projection; domain calculation remains the single source of amounts. Validate query dates and retain current auth/origin policy. Do not create a second endpoint with separate inclusion or target logic. Any added DTO is additive and must preserve old consumers.

## 10. Navigation and design

Keep current `/vermoegen/portfolio` allocation and rebalancing destination, shared `/einstellungen/anlageklassen` target/exposure ownership and existing detail links. Add a disclosure in the relevant proposal row or detail page, not a second permanent panel or another settings screen. German de-AT labels distinguish “Umschichtungsabstand” from “Neues Kapital bis Soll”, “unverwaltet” from 0%, and “provisorisch” from “nicht verfügbar”. Show amount, formula and input chain in a compact dimension-chain treatment; charts remain supplementary. Preserve current desktop/mobile layouts, keyboard use, color-independent quality icons and exact EUR amounts.

## 11. Privacy, security and performance

Read-only view uses existing authenticated APIs and does not reveal raw import files, provider credentials, private data outside this user's session or arbitrary SQL. Respect current session/origin guards. Do not log per-position financial detail. Load provenance in the same bounded query/read model where practical; avoid per-row N+1 calls and avoid recalculating holdings/FX. Cap explanation reasons to relevant IDs and paginate/aggregate if needed. A missing or stale quality fact must fail closed to provisional/unavailable. No provider calls or background refresh on opening explanation.

## 12. Dependencies and reuse

Reuse the current domain, repository, allocation-quality projection, effective exposure and target-policy resolvers, target editor, instrument exposure editor, shared report-4.2 projections and design primitives. No new dependency, provider, state store, taxonomy service or sidecar portfolio engine. Coordination with WP-012 is limited to ensuring paired transfers remain internal flows and feed existing positions/exposure resolution; do not make allocation dependent on the future feature.

## 13. Acceptance criteria

- **AC-010-01** Explained amounts exactly match existing allocation/rebalance DTOs for the same `asOf`; there is no second calculation path.
- **AC-010-02** Explanation identifies effective exposure date/source/completeness and effective target version/tier/band, including inclusive tier boundaries.
- **AC-010-03** Unknown classification and estimated/stale valuation remain provisional; missing price/FX remains unavailable and suppresses recommendations.
- **AC-010-04** Signed included cash and exclusions match `allocationInputsAsOf`; debt/card/receivable cannot enter by corrupted metadata.
- **AC-010-05** UI distinguishes target gap from new contribution with the EUR 1,000 example and accurately states no order executes.
- **AC-010-06** Existing two-level hierarchy, dated historical exposure and target policy are reused; no duplicate taxonomy/settings control is present.
- **AC-010-07** Explanation failure never converts an unavailable or provisional result into exact guidance.

## 14. Independent tests and validation

Domain regression tests use literal cent/basis-point inputs for rounding, signed cash, incomplete exposures, target gap versus contribution, 100% target, zero/nonpositive total and inclusive tiers. Repository tests compare the explanation's values/reasons with `portfolioAllocation` and report 4.2 projections across as-of dates, current-scope exclusion and missing/stale/estimated price/FX. API tests cover authorization, invalid dates, additive DTO compatibility and typed unavailable states. Browser tests inspect links, reason copy, no-order statement, keyboard/mobile access, and exact/provisional/unavailable distinctions. Existing `asset-exposure`, `target-policy`, `allocation-quality`, `portfolio-allocation`, `asset-classes-settings` and report 4.2 suites remain independent. These are proposed tests; none were run for this specification.

## 15. Open decisions, recommendation and stop condition

Recommend implementing explanation fields only after a response-contract comparison proves the current allocation DTO cannot already explain each row; some source details may already be visible in the UI. Reuse existing visible links and quality presentation before adding UI. Owner should choose whether “why” is inline disclosure or a deep-linked detail and approve wording for one-cent provisional exposure. Stop if implementation needs a second taxonomy, a new financial formula, relaxed quality guard, historical membership certainty unsupported by schema, or edits to target/exposure policy beyond current owner directives. No cross-product behavior or PP parity is inferred.
