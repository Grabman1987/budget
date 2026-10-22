# Existing metric and allocation explanations — NOT VALIDATED

Refs #518 and #521. Source-only work based on portfolio checkpoint ce1e67b17a930d3441e827359f1adf5efcb38303, under the owner implementation-only direction of 2026-10-22. The newer five portfolio registers and their source remain intact.

## #518: bounded existing-definition correction

Adopted the final explanation from e763c894 and 2de6820a. The concrete ambiguity was the difference between amount weighting within an aged outflow and equal weighting of the last up to ten aged outflows. The report now states both, positive opening-balance eligibility, exclusion of internal budget-account transfers, unavailable history and each plotted point's as-of boundary. A target age no longer claims that current bills are paid from last month's income.

The source inventory preserves these distinct existing contracts:

| Metric | Existing source and meaning |
| --- | --- |
| Geldalter | `packages/domain/src/kpi/age-of-money.ts`: FIFO inflow lots; amount-weighted age within each eligible outflow, then an equal average over up to ten aged outflows. `packages/db/src/repos/report-tables.ts` supplies positive opening balances and excludes internal budget-account transfers; points use month end or today in the current month. |
| Sparquote | `apps/web/src/reports/savings-report.tsx` already explains income excluding capital returns, net category refunds, and Bedarf plus Wunsch consumption. Its dimension chain supplies earned income, consumption and saved amount from the existing savings projection; no denominator changed. |
| Pace | `packages/domain/src/kpi/pace.ts` and the existing Heute explanation retain the selected-month Bedarf/Wunsch plan, dated fixed costs and variable spending model. This is a spending/plan comparison and projection, not aged-outflow history. |
| Frei bis Gehalt | `packages/domain/src/kpi/free-until-payday.ts` retains Bedarf/Wunsch envelope availability less eligible still-open outflows before payday. It remains separate from each category's Verfügbar. |
| Kontoprognose | Existing scheduled/event-based forecast and its own read horizon remain the forward-looking source for upcoming account coverage; no money-age or runway result replaces it. |

No accepted unanswered user question establishes a need for an additional numeric runway. Its need, optional scope and acceptance remain a product decision under #518; no new range/runway figure, 90-day calculation, API or persistence was added. This bounded explanation does not establish completion of all SPEC-006 acceptance items or dependency gates.

## #521: existing projection provenance

Adopted the scoped provenance from b5158ef6, excluding its unrelated net-worth wording change. The two additive read-only metadata hunks were explicitly authorized for this package: they use the existing loaded effective exposure map and selected held-security universe, including positions with missing prices/FX. Security IDs are deduplicated; cash receives no fabricated security exposure. Missing version, missing completeness and stored incomplete exposure stay distinct.

The existing allocation disclosure now identifies as-of date, effective exposure date/source/stored completeness, supplied target version, active stage and resolved custom/standard band. It explicitly separates stored exposure completeness from actual classification/valuation quality and discloses that current account scope/cash mappings/risk parameters lack a historical membership version. Existing financial fields and quality/proposal gates are unchanged; no new resolver, order action, provider access or monetary calculation was introduced. New free-text metadata uses the current subscribed privacy masking.

## Remaining acceptance

No tests, new tests, existing-test edits, typechecks, builds, browser/Axe/screenshots, CI, PR, merge or deployment were performed. Same-date allocation/report equality, missing/null/false provenance, signed cash, scope exclusions, quality suppression, privacy interaction, keyboard/mobile layouts and regression/Undo evidence remain deferred. Source progress is not complete or LIVE acceptance; both issues remain open. Feature-branch push workflows were inspected; no PR was created.

The [independent source review](explanations-518-521-SOURCE-REVIEW.md) of `e52447882b1def73d3ec9cced5d777c417bf7a35` against `ce1e67b17a930d3441e827359f1adf5efcb38303` found no concrete issue in the bounded five-path delta. It does not establish runtime behavior, financial equality, privacy interaction or completion of the remaining #518 product scope. Status remains NOT VALIDATED / NOT LIVE.

## #521 valuation-cause links — source checkpoint 2026-10-22

The remaining accepted #521 disclosure scope now lists the existing affected IDs by cause: missing quote, missing FX for a security or account, estimated valuation, and stale valuation. Security names use the existing `view.names.securities` data and `maskMoneyText`, linking to the existing instrument detail route. Missing-FX accounts use the exact `view.quality.missingFxAccountIds` IDs and the existing account detail route with a generic action label because this view does not carry account display names. The disclosure adds no amount, calculation, API field, or quality gate; existing quality totals and decisions remain unchanged.

This is an unreviewed, source-only checkpoint. **NOT VALIDATED / NOT LIVE.** No tests, test edits, checks, typecheck, build, browser, CI, PR, merge, or deployment were performed. The earlier independent review covers only its pinned five-path delta and does not review this correction.

## #521 AppLink destination correction

An independent review of the valuation-cause links found that `AppLink` does not accept a router `params` prop. The five affected-entity links now form their existing concrete route using `encodeURIComponent(id)`, matching established package call sites; route targets and quality IDs are unchanged. This is a bounded link-construction correction only. It remains **NOT VALIDATED / NOT LIVE** pending an independent exact-delta source review. No tests, checks, typecheck, build, browser, CI, PR, merge or deployment were performed.

## #521 AppLink destination correction — independent source review

The exact correction source `b7239d229414b7ca6d6673e8e266ad8fbb0ac460` was independently reviewed against `dea1e99ffdf46cc44d756b4fb24a2a5837429ea0`. The unsupported `params` props are removed from all five links and the P2 is closed in this bounded delta; the archived report is `explanations-518-521-allocation-links-fix-source-review.md`. No other finding was identified in the correction. This source review is not a compiler or runtime check. The package remains **NOT VALIDATED / NOT LIVE**.
