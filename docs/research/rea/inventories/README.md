# Source feature inventories

Canonical CSVs use UTF-8 and one row per researched feature or discovered extension option. IDs remain stable even when several rows map to one shared capability; duplicates are linked rather than renumbered away.

| Column | Contract |
| --- | --- |
| `id` | Stable product-prefixed identifier |
| `name`, `description` | Original concise description of source behavior, not an implementation promise |
| `user_problem`, `benefit` | Addressed problem and user value; analyst interpretation unless explicitly sourced |
| `source_url`, `source_locator` | Supporting primary source and section, symbol, metadata key or line range |
| `retrieved_at`, `version` | Date and immutable source commit or documented release where available |
| `evidence_status` | `observed`, `source-confirmed`, `documented`, or `inferred` |
| `uncertainty` | Unverified details, restrictions or explicit none within the inspected boundary |

Source-confirmed means a definition/implementation was read, not that browser behavior was executed. Documented means official public help/API describes it. Inferred means an analyst conclusion still needing validation. A private login redirect is observed access evidence, not observed financial behavior.

Product analyses contain model, rules, workflow, coverage and license context. [The matrix](../../../product/feature-matrix/README.md) gives a disposition to every row and links equivalent observations to capabilities. Recommended groups link to [specifications](../../../product/specs/README.md) and [work packages](../../../product/roadmap/README.md).

Inventories: [YNAB](ynab.csv), [Toolkit options](toolkit.csv), [Actual Budget](actual.csv), [Portfolio Performance](portfolio-performance.csv). Counts and validation results are in the [review](../review.md); unavailable/private surfaces remain in product coverage sections.
