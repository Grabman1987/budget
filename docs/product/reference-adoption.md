# Reference adoption decisions

Owner answers on 2026-10-15 supersede conflicting recommendations in the frozen [research](../research/rea/README.md). This records accepted direction and the bounded first implementation, not delivery of the whole backlog.

## Portfolio Performance returns are the standard

The owner rejected retaining Budget's end-flow convention as default. No optional legacy return mode is planned. Daily TTWROR chains `(closing value + withdrawals) / (previous close + deposits) - 1`. Deposits fund opening capital; withdrawals occur at day end. Gross positive/negative flows must remain separate.

Literal acceptance: opening 100 EUR, deposit 100 EUR, closing 220 EUR gives **10%** (previously 20%). Opening 100, deposit 100, withdrawal 100, closing 110 gives **5%** despite zero net flow. Opening zero, deposit 100, closing 99 gives **−1%**; the first purchase fee must count.

The boundary matters. Held securities exclude their cash account: buys fund the holding; sales/dividends withdraw from it. TTWROR and XIRR include fees and exclude tax. A portfolio including cash counts external deposits/withdrawals/deliveries; trades, retained dividends and internal cash transfers remain internal, while fees/taxes lower closing value. Compare identical scopes only.

Reinvested rewards already represented as a paired buy/dividend retain both gross legs in security scope. For opening 100 EUR, a 5 EUR reinvestment/distribution and closing holdings 105 EUR, PP timing gives 4.76190476%, not the former net-flow 5%. With the same 5 EUR gain inside a 1000 EUR portfolio including cash, return is 0.5%. Actual net reward contributions remain zero; the stored reward representation is unchanged.

Actual contributions and gain remain after tax: `gain = end − start − actual contributions`. Modified Dietz remains a separately labelled approximation, never PP IRR. XIRR solves the dated actual/365 equation. PP security TTWROR removes tax in original currency before conversion; security XIRR converts net payment and tax separately. Preserve their possible cent-rounding difference using separate derived flow inputs, without rewriting bookings.

Inclusive dated class changes reassign the preceding close at the start of the effective day, in both directions. These internal classification movements are not external withdrawals. This keeps that day's market return in the class effective on that day and avoids diluting the capital that remains. Class cash gain/Dietz still use actual after-tax flows, separately from PP return flows.

First buy/delivery needs the preceding close; an earlier fee/dividend/split alone must not invent funded history. Missing capital/valuation stays a visible gap rather than a fabricated observed 0%. Average/FIFO basis preference and existing risk estimators are separate from this return-method decision. Benchmarks remain explicitly price indices. Unlinked deliveries remain external: matching date, security and amount alone do not prove an internal transfer.

A cash account without balance or transactions does not establish return history. When all investor cash flows cancel on every date, XIRR is mathematically indeterminate and stays unavailable; the solver must not report its search bound as a return. This is a validity guard, not another return method.

Evidence: [PP TTWROR manual](https://help.portfolio-performance.info/en/concepts/performance/time-weighted/) and pinned source `805c20dff5d999e987675181b4f1d82f81df10c0`: `snapshot/ClientIndex.java`, `snapshot/filter/ClientSecurityFilter.java`, `snapshot/security/IRRCalculation.java`. Benchmark-only `SecurityIndex` is not held-security performance. See [source audit](../research/rea/pp-calculations.md).

Delivery needs independent literal domain/API expectations, shared return/index agreement, repository checks and synthetic browser evidence. Private PP parity still requires aligned dates, included accounts/instruments, quotes, FX, corporate actions and tax scope. Synthetic tests do not close Gate 3.

## Cross-device Explorer views approved

Store named configurations in the authenticated app database. Persist stable ID/name, supported filter/group/sort/column/period selections, schema version and update revision; derive current results through the existing query engine. Do not save result rows or credentials inside a view.

Reuse settings/audit/undo and authenticated API. Promote valid browser-only views idempotently when no server equivalent exists. Preserve conflicts under distinct IDs instead of overwriting newer server state; require revision checks for edits. Invalid or obsolete references need an explicit unavailable/migration state, never a silently widened query. Acceptance covers two browser contexts, reload, concurrent edits, invalid input, migration and undo. WP-009 implementation remains a subsequent bounded package.

## Limited transfers approved for preparation

FX cash transfers require explicit source/destination native amounts and currencies plus the recorded agreed rate. Preserve original amounts; do not infer missing values or use a default rate of one. Separate any explicit fee from principal within the same audited action. Both legs, provenance and fee must save/undo atomically with rollback on failure. EUR valuation uses existing dated policy and must not invent income.

Security transfers initially allow only the same security with documented source lots/basis. Persist explicit pair identity and lot lineage. Conserve units and acquisition basis, retain acquisition dates and supported average/FIFO outcomes, and create no realized sale gain. A paired transfer is internal only with both sides in the measured scope; one-sided scope uses transfer-date valuation as external flow. Never infer pairing from equal amounts. Apply/undo/redo and concurrent changes need conservation/rollback proof.

Unknown basis, ambiguous legacy pairs, mergers, spinoffs and unsupported currency/basis situations remain for manual review. Preparation means this accepted posting/lineage contract and test gates. No speculative pairing migration or private-booking rewrite has run. WP-011/012 implementation and source-provenance proof remain open.

## Sequence and delivery state

1. Verify the local PP calculation correction and explanations.
2. Complete only missing M1 calculation identity/valuation facts, reusing existing controls and tests.
3. Implement Explorer persistence and selected daily-work improvements in reviewable packages.
4. Implement the limited transfer stages with explicit pairing and documented amounts/basis.

Research matrix/specifications remain historical evidence; their end-flow recommendation is superseded. Other privacy and delivery gates continue. Local implementation does not imply issue creation, PR, push, deployment or acceptance against private data.

The owner separately requested GitHub and Kanban synchronization on 2026-10-16. [Overview #508](https://github.com/Grabman1987/budget/issues/508) and the [GitHub task index](github-backlog.md) track the actual open packages. Publishing the WIP branch and tasks does not satisfy the remaining full-check, WebKit, private comparison or delivery gates.
