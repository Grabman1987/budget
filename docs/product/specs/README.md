# Bounded implementation specifications

These proposals follow the existing [SPEC](../../../SPEC.md), [target model](../target-model.md), [392-row matrix](../feature-matrix/features.csv) and [synthetic cases](../../research/rea/comparison-cases.md). No product behavior was implemented by this research. Each document contains the requested 15 fields, literal acceptance IDs, data/API/design boundaries, future tests and decision/stop conditions.

| Specification | Capability groups | Proposed work | Packages |
| --- | --- | --- | --- |
| [SPEC-001 Ledger assurance](SPEC-001-ledger.md) | 001, 002, 005, 006, 009 | Retain implemented envelopes/cards/transfers/debts/reconcile; prove boundaries and undo | WP-001, WP-005 |
| [SPEC-002 Targets](SPEC-002-targets.md) | 003, 004 | Weekly set-aside, monthly snooze, guarded selected funding/reset | WP-006 |
| [SPEC-003 Register](SPEC-003-register.md) | 007, 008 | Bulk date/memo/payee with field guards, preflight and one undo group | WP-007 |
| [SPEC-004 Matching](SPEC-004-matching.md) | 010, 011 | Source identity/rule provenance and ambiguity/rollback assurance; operator import only | WP-008 |
| [SPEC-005 Reports](SPEC-005-reports.md) | 014 | Existing Explorer query portability and bounded filtered CSV; retain 34 reports | WP-009 |
| [SPEC-006 Metrics](SPEC-006-metrics.md) | 015 | Explain existing denominators; optional secondary historical runway | WP-010 |
| [SPEC-007 Investments](SPEC-007-investment.md) | 016, 017, 018 | Read-only scope/method/timing/basis identity and independent comparisons | WP-002, WP-004, WP-005 |
| [SPEC-008 Valuation](SPEC-008-valuation.md) | 019 | Reuse quality/fallback/precision; later gated cross-currency posting design | WP-003, WP-011 |
| [SPEC-009 Corporate provenance](SPEC-009-corporate.md) | 020 | Paired same-security transfers with reproducible lot/pool lineage | WP-012 |
| [SPEC-010 Allocation](SPEC-010-allocation.md) | 021 | Explain/recheck existing dated exposure/target and quality-aware guidance | WP-013 |
| [SPEC-011 Recovery](SPEC-011-recovery.md) | 012, 013, 022 | Existing passkey/export/backup/offline distinctions and synthetic recovery evidence | WP-014 |

CAP-023/024 contain excluded plan-sharing/fresh-start engines and reference-host/license/evidence metadata; no product implementation is promised. Individual alternatives inside other groups may also be deferred/excluded; row decisions prevail over the table's shorthand. Existing behavior in a group is reused, not automatically rebuilt.

The [roadmap](../roadmap/README.md) separates the first read-only increment from later mutation or policy work. A specification's tests are proposed future validation, not results from this analysis. The [final review](../../research/rea/review.md) records actual research checks and repairs.
