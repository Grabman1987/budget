# Independent final review findings

Review date: 2026-10-15. Baseline: `01a10de8b251f3b3bb05d8a5df6ae534e7d0d631`; branch: `docs/reference-product-research-2026-10-15`. This review is documentation-only and was written to the requested staging directory. It does not alter the research checkout.

## Findings

### P2 — SPEC-009 leaves the approved transfer slice behind an undefined pre-implementation proof gate

**Location:** `docs/product/specs/SPEC-009-corporate.md`, §4, §6–8, §13–15; `docs/product/roadmap/work-packages.csv`, WP-012.

**Evidence:** §4 includes partial transfers; §6 specifies FIFO and average-pool allocation; §7 gives both a partial FIFO example and average-pool example; §8 specifies shared replay; and AC-009-01/02 require FIFO/average partial-transfer conservation. WP-012 consequently scopes 6–12 days for cross-account FIFO/average lineage replay after design acceptance. However, §15 recommends assessing “partial and average-pool semantics with synthetic evidence before implementation” without defining what evidence closes that gate, who accepts it, or whether it is a prerequisite or part of WP-012. This makes the implementation boundary and estimate unclear despite the rest of the spec defining those semantics.

**Recommended repair:** State whether independent synthetic contract cases are the design-acceptance gate before WP-012, or are the first task within WP-012. If they are a prerequisite, define the exact cases and the exit decision in §15 and the roadmap dependency/estimate; otherwise remove the pre-implementation wording and make the cases explicit acceptance tests. Keep unknown basis, fee/tax attribution, and corporate-action policy as separate gates already listed.

## Review coverage and limits

Read the governing `AGENTS.md`, `CLAUDE.md`, leading `SPEC.md` and `DESIGN.md`; the research README/progress/review; target model; feature-matrix documentation and CSVs; all 11 specifications; roadmap README and all 14 package rows; source manifest, inventories, and targeted source audits/calculation notes. Confirmed public source checkout HEADs match the manifest for Toolkit (`631c9147`), Actual (`d5d6035a`), and Portfolio Performance (`805c20df`). The read-only documentation validator completed with 392 inventory records, 392 matrix rows, 24 capabilities, 11 specifications, 14 work packages, and no errors.

Independently recalculated the literal weekly weekday and investment-flow examples during review. No product tests, upstream code, credentials, private financial files, production services, or external writes were used. Static review does not prove live behavior or private-data parity; the listed source/runtime and operational gaps remain applicable.

## Finding resolution: SPEC-009 proof-gate ambiguity — closed

Rechecked the amended `SPEC-009` §15 and WP-012 row. The owner decision now explicitly accepts the bounded known-basis, same-security/currency, 1:1 design before WP-012. Stage A is the pure replay contract and independent literal cases inside WP-012's existing 6–12-day estimate, with reviewer confirmation of AC-009-01/02 before the same package proceeds to persistence/API and UI/undo stages. The failure action is scoped to revising the design/estimate before financial mutation work. This resolves the unclear gate and estimate boundary; I found no residual finding in this targeted recheck.
