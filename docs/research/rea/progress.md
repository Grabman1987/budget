# Research progress

## Current state

- **State:** complete — research, comparison, specifications, roadmap and independent review verified; documentation saved locally on the named branch.
- **Done:** P1–P5 and QA; live REA 6.5.0 verified; four analyses, 392 assessed records, 24 capabilities, eleven specifications and fourteen work packages.
- **Open:** no research tasks. Private/operational acceptance and future implementation remain outside this completed analysis.
- **Blocked:** none. Authenticated YNAB observation is closed; external/private acceptance remains outside this task.

## Task ledger

| Task | State | Result / next action |
| --- | --- | --- |
| P1.1 Instructions and baseline | done | `AGENTS.md` → `CLAUDE.md` → `SPEC.md`; current baseline `01a10de8` |
| P1.2 REA live verification | done | Live MCP call succeeds; no active target; actual provider limits to be recorded |
| P1.3 Domain/data inventory | done | Agent findings integrated into project baseline; comment/default and valuation-policy inconsistencies recorded |
| P1.4 APIs/integrations/tests | done | Connected APIs, jobs, auth/export/migration and CI examined; tests not claimed run |
| P1.5 Design/product scope | done | Agent/lead verified navigation overrides, reusable components and actual 34-report catalog |
| P2a YNAB | done | Authenticated supplement complete: ten observation records; 99 inventory rows; no financial/settings writes or personal artifacts |
| P2b Toolkit | done | 107 definitions (100 active/seven hidden), nine report subfeatures, defaults/variants, algorithms/review/license and coverage audit |
| P2c Actual | done | 93 source-linked records; calculations, ledger/sync/import, reports, licenses and demo limits documented |
| P2d Portfolio Performance | done | 84 canonical records, three source audits, formula/FX/scope distinctions, license and execution gaps integrated |
| P3 Shared matrix and target model | done | All 392 records mapped once to 24 capabilities; source variants, exclusions and actual Budget paths retained; coherent target model and 16 synthetic cases |
| P4 Specifications | done | Eleven groups, each with all 15 fields; lead repaired weekly calendar, protected bulk effects, CSV contract and security-transfer lineage design |
| P5 Roadmap/backlog | done | Four implementation increments; 14 linked packages; five concrete M1 packages, effort uncertainty and conditional policy gates |
| QA Review and repairs | done | Fresh reviewer P2 gate ambiguity repaired and rechecked; canonical trace/source/link/privacy/dependency checks pass |

## Session log

2026-10-15: Final independent review complete and its P2 SPEC-009/WP-012 gate ambiguity repaired; targeted recheck confirmed closure. Lead final trace audit aligns quality/scale with WP-003 and keeps conditional cross-currency posting at WP-011; all deferred/not-useful alternatives have no implementation promise. Full documentation validator passes with 392 rows, 24 capabilities, 11 specifications and 14 packages. Public-source path/anchor checks pass. No product code, private financial data, issues, PRs, settings, push or deployment were produced. Final local commit/save records the versionable research tree.

2026-10-15: P5 closed. Roadmap distinguishes assurance, daily steering, reusable analysis and provenance-sensitive transfers. M1 packages WP-001–005 are concrete, source/spec/acceptance-linked and preserve financial defaults. No issues/PRs/settings or product code created. Final independent review starts on the integrated documentation tree.

2026-10-15: P4 closed. Three scoped agents contributed seven specifications; lead authored four and reviewed every contribution. Corrected April/May weekday example (Fridays), avoided target-kind CHECK rewrite via nullable cadence intent, blocked implicit counterpart effects in bulk edits, fixed precise filtered CSV units/empty metadata, and expanded paired-transfer design beyond an insufficient nullable group ID. All eleven documents have exactly the requested 15 ordered sections. Existing behavior is retained; no product functions implemented.

2026-10-15: P3 closed after three scoped matrix contributions and lead corrections. Matrix covers every inventory ID once; all cited Budget files exist. Corrected false equivalences involving PP native file formats, security transfer provenance, plan-generated executions, Actual tracking/hold/template engines and export recovery. Preserved read-only clipboard meaning, existing arithmetic and differing average denominators. Separate FX-gain attribution deferred for missing source provenance. Source-path check: 246 pinned primary paths and line anchors resolve in the public clones; 146 primary URLs are live documentation. Two overlong Actual line ranges repaired.

2026-10-15: Portfolio Performance gate closed after three source audits and lead review. Quote-only SecurityIndex was explicitly separated from actual held-security IRR (PP-019); missing-FX parity and before-first quote/rate behavior remain reference differences, not desired defaults. Canonical CSV contains 84 rows including one evidence-boundary metadata record. Four-product research is closed in the required order; all 392 records now enter synthesis.

2026-10-15: Portfolio Performance official repository and manual identified. Public source clone is read-only. The source adds local REST/MCP surfaces that must not be assumed present in downloaded 0.89.0. Daily return timing differs materially from Budget; preserve explicit methods and existing owner decisions. Agents cover calculations, transaction/import model and reports/settings independently.

2026-10-15: Actual gate closed at `d5d6035a8f5867717a80635d270fbe64e370ea08`, package 26.10.0. Three reviews integrated into 93 records. Live-documentation/source drift on bank refresh and root MIT/core ISC mismatch retained. Disposable demo observed startup only. No upstream code/test execution or private data access. Portfolio Performance begins.

2026-10-15: Toolkit gate closed at source commit `631c914714e747e0b4478e3ac521057761622bcd`, package 3.23.0. Static enumeration reconciles every settings file and generated list. Source algorithms and independent compatibility/design review retained; no extension installed or upstream code executed. 116 inventory rows distinguish definitions from report subfunctions and hidden controls. Actual begins only after this closure.

2026-10-15: Authenticated YNAB supplement closed. Inspected Plan/grid, category inspector, views, Auto-Assign disclosure, RTA breakdown, Recent Moves, Reflect/reports, all/single/card/loan account surfaces and plan-format controls. Only generic labels/structure persisted; settings cancelled and Plan restored. No numerical parity or mutation behavior claimed. Toolkit resumes.

2026-10-15: Owner supplied an authenticated YNAB tab in Codex. Browser binding now succeeds. Reopened YNAB before substantive Toolkit analysis; raw browser content and private identifiers remain outside repository artifacts. Only generic observed controls/workflows will be recorded, without screenshots or financial values.

2026-10-15: Read the owner's attached research brief. The chat folder is a concept export, not a Git checkout. Located the actual repository, preserved its unrelated untracked UI configuration, fetched the remote, and created the sibling `budget-reference-research` worktree from current remote main. No private financial files were opened. No product code changed.

## Assumptions and constraints

2026-10-15: P2a closed with 95 source-linked inventory rows and coverage audit. Controlled REA browser reached sign-in; no private financial surface observed. Independent reviewer spot-checked primary sources, identified two fixable documentation defects and alias pairs; defects repaired, aliases retained for synthesis.

2026-10-15: P1 gate closed. Three agents returned independent read-only domain/data, API/tests and UI inventories. Actual code is substantially beyond initial roadmap phases; older documentation counts/statuses are not reliable implementation indicators. Browser inventory timed out; this does not establish absence of an authenticated session. REA provider limits and privacy rules recorded in `tooling.md`.

- The task's request for agents authorizes scoped delegation. Repository rules require English technical documentation and synthetic examples.
- Work remains local and versionable on the named branch. The owner explicitly excludes issues, PRs and repository setting changes.
- Existing integration adapters, operator-only migration and financial gates are evaluated as implemented code versus accepted behavior separately.
- Actual source checkouts and browser observations, if available, are supplementary to public official sources. No production write or source-to-production transfer occurs.
