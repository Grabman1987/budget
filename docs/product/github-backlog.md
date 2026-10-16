# Reference adoption: GitHub execution index

The owner requested GitHub and Kanban synchronization on 2026-10-16. [Overview #508](https://github.com/Grabman1987/budget/issues/508) tracks all 14 research work packages in [Budget – Arbeit](https://github.com/users/Grabman1987/projects/1). Existing unrelated cards and delivery statuses are retained.

## Current implementation and gates

Branch: `feat/reference-adoption-m1`. The branch contains the research baseline and the PP calculation/explanation correction. It is a WIP snapshot, not an approved PR, merged change, deployment or private financial acceptance. See the [adoption contract](reference-adoption.md) and [verification evidence](../evidence/reference-adoption/README.md).

Only WP-002 is **In Arbeit**. The overview and other packages are **Warteschlange**; no new card is **CI / Review** without an actual PR or **Live** without deployment proof. Existing local work in WP-004/005 is documented without closing those broader packages.

Required next gates: a single all-green exact-head full check, clean final WebKit glossary/wealth checks, required CI and independent review, serial integration, then private holdings/return comparison. The earlier full run and later targeted correction are recorded separately. No passing final WebKit run is claimed.

## Package index

| Package | GitHub task | Priority | Prerequisites |
| --- | --- | --- | --- |
| WP-001 | [#509 Financial boundary evidence](https://github.com/Grabman1987/budget/issues/509) | P0 | Existing implementation audit |
| WP-002 | [#510 PP standard and result identity](https://github.com/Grabman1987/budget/issues/510) | P0 | WP-001; existing local PP correction |
| WP-003 | [#511 Valuation quality and lossless scales](https://github.com/Grabman1987/budget/issues/511) | P0 | WP-001 |
| WP-004 | [#512 Calculation and quality explanation](https://github.com/Grabman1987/budget/issues/512) | P1 | WP-002, WP-003 |
| WP-005 | [#513 Technical verification and readiness](https://github.com/Grabman1987/budget/issues/513) | P0 | WP-004; full M1 acceptance remains open |
| WP-006 | [#514 Weekly targets, snooze and funding preview](https://github.com/Grabman1987/budget/issues/514) | P1 | WP-005 |
| WP-007 | [#515 Guarded bulk date/memo/payee](https://github.com/Grabman1987/budget/issues/515) | P1 | WP-005 |
| WP-008 | [#516 Matching/source ambiguity assurance](https://github.com/Grabman1987/budget/issues/516) | P1 | WP-005 |
| WP-009 | [#517 Cross-device Explorer views and filtered CSV](https://github.com/Grabman1987/budget/issues/517) | P2 | WP-005; DB persistence approved |
| WP-010 | [#518 Metric explanations and optional runway](https://github.com/Grabman1987/budget/issues/518) | P3 | WP-005, WP-009; numeric runway needs a distinct accepted need |
| WP-011 | [#519 Limited explicit FX transfers](https://github.com/Grabman1987/budget/issues/519) | P2 | WP-003, WP-008; unsupported fee/spread cases remain manual |
| WP-012 | [#520 Known-basis same-security transfer lineage](https://github.com/Grabman1987/budget/issues/520) | P2 | WP-001, WP-002, WP-003; stage A conservation before persistence |
| WP-013 | [#521 Allocation explanation assurance](https://github.com/Grabman1987/budget/issues/521) | P2 | WP-002, WP-003; coordinate PR #507 |
| WP-014 | [#522 Offline/export/receipt-aware recovery](https://github.com/Grabman1987/budget/issues/522) | P1 | WP-001 |

Each issue includes current state, a first bounded step, acceptance checklist, specification/acceptance IDs, prerequisites and exclusions. Historical effort ranges are planning estimates, not delivery promises. Before coding, narrow a broad package to a single reviewable work session and split stages where needed.

## Existing owner acceptance and parallel work

- Keep [holdings comparison #355](https://github.com/Grabman1987/budget/issues/355) and [return comparison #356](https://github.com/Grabman1987/budget/issues/356); no duplicate Gate 3 task is created. The latter needs identical dates, account/security scope, flows, quotes, FX and tax basis after technical readiness. Private data never belongs in GitHub. No new owner answer is required for current technical work.
- Coordinate SPEC/ROADMAP/product-document integration with [PR #505](https://github.com/Grabman1987/budget/pull/505) and allocation/wealth scope with [PR #507](https://github.com/Grabman1987/budget/pull/507). This synchronization does not merge or alter either PR.
- Existing catalog/navigation work such as [#487](https://github.com/Grabman1987/budget/issues/487) remains separate. Historical report-count/navigation recommendations are not authority to reverse newer owner decisions.
- The [research roadmap and CSV](roadmap/README.md) stay a dated proposal. Current owner decisions supersede its old return default and undecided storage wording; an unchecked GitHub task is not an implemented feature.
