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
