# Reference product research

Research date: 2026-10-15 (Europe/Vienna). Repository baseline: `01a10de8b251f3b3bb05d8a5df6ae534e7d0d631` (`origin/main`). Branch: `docs/reference-product-research-2026-10-15`. Documentation only; no product implementation, issues, pull requests, settings changes or production writes are authorized by this research task.

## Working plan and gates

| Phase | Tasks | Depends on | Verifiable exit criteria |
| --- | --- | --- | --- |
| P1 Project and tools | Read governing instructions; verify live REA; inspect actual domain, persistence, API, UI and tests; distinguish implementation from owner acceptance | None | Baseline commit, source paths, architecture, scope decisions, tools and known limitations recorded in `project-baseline.md` and `tooling.md` |
| P2a YNAB | Read-only attempt at supplied budget; official product/API research; stable feature IDs, concepts, rules and coverage audit | P1 | Inventory with sources, retrieval date, evidence status and uncertainties; privacy-safe coverage audit; all major search areas classified |
| P2b Toolkit for YNAB | Identify official source/license/commit; enumerate individual extension options and behavior; classify functional versus visual options | P2a closed | Every discovered option represented, source-linked and counted; dependency and inaccessible-runtime limits recorded |
| P2c Actual Budget | Official documentation plus pinned source/data/calculation/test review | P2b closed | Source-backed inventory, calculation/model notes, license and coverage audit |
| P2d Portfolio Performance | Official documentation plus pinned source/calculation/test review | P2c closed | Source-backed inventory, portfolio formula distinctions, license and coverage audit |
| P3 Synthesis | Deduplicate semantics; map every inventoried feature to actual project evidence and a disposition; design coherent budget/wealth model | P2d closed | Complete source-to-feature-to-disposition mapping; conflicts and prior owner decisions explicit |
| P4 Specifications | Define bounded feature groups, formulas, examples, migrations, API/UI fit, errors, acceptance cases and tests | P3 | Every recommended group has all 15 requested specification fields; precision/date/FX/rounding behavior explicit |
| P5 Roadmap and backlog | Prioritise useful increments, critical path, effort ranges and executable first-increment packages | P4 | Packages link feature IDs, specifications and acceptance IDs; estimates include uncertainty and no blanket highest priority |
| QA Independent review | Review evidence, duplicates, contradictions, architecture fit, acceptance tests and ordering; repair findings and validate links/IDs/privacy | P5 | Findings and resolutions recorded; all documentation links and cross-references checked; remaining gaps explicit |

Products are investigated and closed in the required order. Parallel work is restricted to independent questions inside the active phase. Agents return findings without editing shared files; the lead owns integration. An independent review agent checks the final tree.

## Evidence contract

- Feature IDs: `YNAB-###`, `TK-<source-option-id>`, `ACT-###`, `PP-###`; synthesis groups: `CAP-###`; specifications: `SPEC-###`; work packages: `WP-###`.
- Evidence statuses: **observed**, **source-confirmed**, **documented**, **inferred**. Documentation is not proof of behavior in the private budget or of a passing local test.
- Public product and technical documentation is recorded in English, following repository instructions. German owner updates and German product labels are retained.
- No personal budget values, account/category/payee names, private source files, tokens, screenshots of personal data or credentials enter these documents. Examples are synthetic.
- Existing `SPEC.md` and owner decisions keep precedence. Research recommendations do not silently expand V1 scope or override explicit exclusions.
- Missing access is a coverage gap, not permission to bypass authentication or claim completeness.

## Deliverables

- [Progress and resumption log](progress.md)
- [Project baseline](project-baseline.md)
- [Tool verification and constraints](tooling.md)
- Product analyses: [YNAB](ynab.md), [Toolkit](toolkit.md), [Actual Budget](actual.md), [Portfolio Performance](portfolio-performance.md)
- [Shared capability matrix](../../product/feature-matrix/README.md)
- [Target model](../../product/target-model.md)
- [Specifications](../../product/specs/README.md)
- [Roadmap and first increment](../../product/roadmap/README.md)
- [Review and limitations](review.md)
- [Independent review and resolved finding](independent-review.md)
- [Pinned source manifest](source-manifest.json), [synthetic comparison cases](comparison-cases.md) and [documentation validator](validate-research.py)

## Resume procedure

Read `progress.md`, the latest completed product's coverage gate and the next open task. Check `git status` and baseline identity before continuing. Do not restart completed research or inspect another product before the current product closes. Reuse public source checkouts and source manifests recorded in the product documents. Keep private browser content out of files and logs.
