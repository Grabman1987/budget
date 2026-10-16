# Reference-to-Budget capability assessment

Research baseline `01a10de8`, 2026-10-15. [392 source records](../../research/rea/inventories/README.md) are assessed individually in [features.csv](features.csv), grouped into [24 capabilities](capabilities.csv). The source inventory is authoritative for description, precise source/version/evidence and uncertainty. The matrix adds actual Budget evidence, disposition, difference, decision and downstream specification/package. It is not a feature-completion or runtime-parity score.

## Reading the matrix

| CSV status | Requested disposition | Meaning |
| --- | --- | --- |
| `present` | vorhanden | Relevant behavior exists in inspected baseline code; edge cases and private acceptance may still be open |
| `partial` | teilweise vorhanden | Core exists but a named variant, workflow or assurance/disclosure is missing |
| `missing` | fehlt | Named behavior not found in the reviewed paths; no universal absence claim beyond that boundary |
| `different` | bereits anders gelöst | Budget deliberately solves the problem with another model, policy or design; replacement is not implied |
| `deferred` | bewusst zurückgestellt | Useful only after a dependency or explicit scope/owner decision; reason recorded |
| `not-useful` | für unser Produkt nicht sinnvoll | Reference-host administration, conflicting heuristic, research metadata or a feature without a useful Budget problem |

Evidence paths refer to files in the pinned Budget tree, optionally followed by a named symbol. A schema or endpoint is evidence of implementation, not a passing production acceptance. `spec_id` and `work_package_id` link recommended retention/assurance/extensions. A dash means the source alternative is excluded/deferred and has no implementation promise. A capability can contain both retained behavior and excluded variants.

## Consolidation without erasing differences

- YNAB card/payment aliases 009/080 share CAP-002; reconciliation 039/050 and adjustment 040/051 share CAP-009; schedule 032/061 share CAP-004. These remain evidence records, not duplicated roadmap items.
- ToolkitReports is the parent switch; its nine report implementations share report/forecast capabilities. Do not count parent, switches and routes as separate new report engines.
- Toolkit visual controls retain their registry variants/defaults and hidden state in the source inventory. A hidden control is not assumed active; host-specific color/row-height/font choices do not become Budget's design backlog.
- Actual envelope versus tracking modes are distinct mathematical models. Budget retains envelope budgeting and its own plan-versus-actual reports; it does not gain a second engine by changing a display preference.
- YNAB card reserves and Actual ordinary negative accounts are alternative budgeting treatments. Budget's existing card reserve remains authoritative.
- PP quote-only SecurityIndex/endpoint IRR and held-security cash-flow IRR are different scope paths. A benchmark price curve does not replace holdings performance.
- PP daily inflow timing, security-level tax treatment and missing-FX fallback differ from Budget. The matrix preserves these differences; a source implementation is not a desired default.
- Native cash, consolidated valuation, money age, cash runway, liquidity forecast, envelope availability, cost basis and returns are separate capabilities and dimensions. Their names are not aliases.

## Recommended boundary

The [target model](../target-model.md) preserves one ledger and explicit calculation identity. The [specifications](../specs/README.md) cover retained financial invariants, target/preview improvements, register bulk work, matching, reports, metric definitions, investment interpretation, valuation/FX, corporate provenance, allocation and recovery. The [roadmap](../roadmap/README.md) gives each group a bounded package; the first increment is read-only financial transparency plus independent synthetic evidence.

Explicitly excluded from V1: multi-user/multiple-plan engines, general in-app file import, wholesale upstream compatibility, a second theme/component system, arbitrary query/script execution, and automatic bank orders. Deferred after separate decisions: an alternate PP timing method, unrestricted corporate-action/tax workflows, broad dashboard builders, stochastic forecasts and specialized bond accruals. The later cross-currency transfer proposal requires an approved posting/rounding contract before implementation; existing rejections stay in force.

The final [review](../../research/rea/review.md) records counts, structural checks, independent findings, repairs and evidence limitations. Consult row-level decisions before treating a whole group as missing or ready to implement.
