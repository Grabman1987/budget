# SPEC-009 — Paired security transfers and corporate-action provenance

Decision basis: CAP-020; WP-012. This is a bounded proposal for matching two existing delivery legs. It does not approve generic corporate-action processing or tax policy.

## 1. Goal and problem

Let an owner move the same security between two accounts while retaining acquisition history. Separate `delivery_out` and `delivery_in` trades currently describe unit movements, but the evidence reviewed does not establish a paired-transfer identity or atomic basis handoff. A plain sale/buy would fabricate proceeds, realized gain and potentially a portfolio contribution. UI label: **Wertpapierübertrag**; transfer record **Übertrag**.

## 2. Sources and reference behavior

Source features PP-048–050/053 in [the matrix](../feature-matrix/features.csv) distinguish actual paired transfers, existing splits and unestablished general corporate-action handling. PP's model is a reference, not a tax-basis specification for Budget.

Feature `CAP-020`; catalog decision: reuse splits/deliveries, propose atomic basis-preserving transfers and reviewed corporate events. Evidence: `packages/domain/src/invest/trade-rules.ts` (`unitsRuleViolation`, `moneyRuleViolation`, `settlementCents`); `packages/domain/src/invest/cost.ts` (average/FIFO pools); `packages/db/src/repos/trades.ts` (trade, settlement and split transaction). Existing split coverage: `packages/domain/src/invest/series.ts`, `packages/domain/src/invest/cost.test.ts`. Baseline: `SPEC.md` §5, §10; `docs/trades-execution.md`; `docs/asset-exposure.md`. This spec does not assert broker, custodian, tax, or jurisdiction behavior.

## 3. Intended Budget behavior

Provide a preview and a single audited action to connect an outgoing delivery to an incoming delivery. Move the selected remaining basis and original acquisition dates into the destination under the selected existing cost method. A linked transfer is internal to total-portfolio scope and contributes zero external flow; no settlement booking, cash, fee, tax, gain, or envelope activity is synthesized. Actual broker-posted fees remain ordinary source facts only if explicitly captured. Reuse the existing trade editor, portfolio detail and audit/undo paths.

## 4. Scope and exclusions

WP-012 covers one-to-one, same-owner, same-security, same-currency transfers with known and representable units/basis; partial transfers are in scope. Quantity ratio is exactly 1:1 and source/destination must differ. Existing splits are assured and retained. General spin-offs, mergers, stock dividends, return of capital, tender/exchange offers, wash-sale rules, tax-lot elections, cross-currency transfers and arbitrary multi-leg events are deferred until allocation rules and jurisdiction are approved. No generic action wizard or invented instrument equivalence.

## 5. Flows, errors and empty states

From a security holding, choose **Übertrag erfassen**, destination account/security, date, units and optional source reference; preview source lots/pool and destination result; confirm once. Validate available units at the date, destination eligibility, duplicate pair and basis conservation. Unknown basis, nonrepresentable basis, insufficient units, existing reconciliation lock, mismatch, or changed source state blocks apply with a German field-level explanation and no writes. Unknown basis can be recorded as an explicitly unresolved transfer only after owner decision; initial recommendation is stop. Undo/redo acts on the grouped transfer. Empty holdings show the existing zero-position state; no action is offered.

## 6. Rules and formulas

For transferred units `q`, consume lots in existing FIFO order or proportionally from the existing moving-average pool; do not silently switch method. FIFO destination fragments retain each source lot's acquisition date and allocated basis; average destination basis equals transferred fraction of pool basis. Source remaining basis + destination transferred basis = pre-transfer basis, to the cent, with deterministic largest-remainder allocation. Source units decrease by `q`; destination units increase by `q` adjusted only by an explicitly selected conversion ratio (conversion events are out of scope initially). Sum of security market value may change solely from quotes/FX, not from the transfer operation. No buy/sell cash formula runs.

## 7. Synthetic examples and edge cases

Example: 10 units have FIFO lots 4 @ EUR 40 and 6 @ EUR 72; transfer 5 units. FIFO carries EUR 40 + 1/6 of EUR 72 = EUR 52 basis and original dates to destination; source retains 5 units/EUR 60. A 50% transfer of a moving-average pool with EUR 102 basis carries EUR 51 and leaves EUR 51. A 3-unit transfer from a EUR 1.00 indivisible pool must follow explicit cents rounding and conserve EUR 1.00; if the transfer basis cannot be represented under policy, block. Repeated confirmation with the same idempotency key must not duplicate either leg. Corporate splits remain separate zero-cash unit-ratio events and must not be reinterpreted as transfers.

## 8. Model and minimal migration

Add one small transfer relation linking exactly one outgoing and one incoming delivery, same security/currency, date, positive units and optional source reference, with unique live leg membership. Additive migration leaves historical unpaired deliveries unchanged and never rewrites original acquisitions. The relation supplies authoritative lineage; a nullable group ID alone is insufficient to carry FIFO dates/basis through today's independent delivery replay.

Extend one shared cross-account cost replay: process acquisition, disposal and paired-transfer events deterministically by date and existing stable order; resolve the source's remaining fragments/pool immediately before transfer; move those fragments with their original acquisition order/dates to destination; account-local subsequent sales consume that derived queue under the selected method. Amount/basis comes from replay, not caller-entered destination purchase value. No duplicated mutable lot balances are persisted. A proposed backdated change affecting later transfers must revalidate the entire affected lineage and either remain consistent or fail atomically. Detect cycles/insufficient same-day source units; same-day transfer edges use persisted creation order. Snapshots and unpaired deliveries require explicit known-basis provenance. If this minimal relation cannot support reproducible replay, stop and revise the design before implementation; do not disguise a new lot ledger as one nullable field.

## 9. API and domain interface

Proposed authenticated transfer preview/apply routes under the existing investment API accept one security ID, source/destination account IDs, transfer date and positive integer units; return eligible units, selected cost method, derived fragment allocation, basis confidence and validation issues. Exact route names follow the current API namespace at implementation. Apply accepts preview identity plus idempotency key, re-reads and validates the affected lineage under one repository transaction, creates paired delivery trades/relation and group audit event. Domain function `planSecurityTransfer(input, costMethod)` is pure and returns legs/basis allocation or typed error. Return group ID; undo uses existing audit route. Never let caller submit authoritative basis fragments.

## 10. Navigation and design

Add the action inside the existing portfolio security detail/trade flow, using **Wertpapierübertrag** and a review step with source lots, destination, units, dates and basis. Show “keine Barbewegung” and “keine realisierte Rendite” in preview. Desktop and phone use existing responsive form patterns; confirmation remains a form dialog, no new permanent side panel. Error language is German (de-AT), exact currency/unit precision and accessible labels. Do not add corporate-action menu items until a specific reviewed event is approved.

## 11. Privacy, security and performance

Use existing authenticated session, origin checks, server schemas, repository validation, audit and CSRF protections. Treat broker references as owner financial data; do not log payloads or add external services. Revalidate preview on apply, transactionally lock/update both legs and audit event, and prevent stale/duplicate submissions. Compute only affected lots; bound lot count and use integer arithmetic. No network lookup or quote dependency for basis transfer. Existing reconciliation locks require explicit unlock before modifying locked source history.

## 12. Dependencies and reuse

Reuse SQLite/Drizzle, Hono/Zod, existing trade validation, `cost.ts` FIFO/average logic, transaction and audit repositories, undo/redo, and current portfolio UI. No new package, provider, import UI, market data fetch, booking type engine or tax engine. Add only the relation needed to prove paired provenance. Do not alter cost-method defaults or return formulas.

## 13. Acceptance criteria

- **AC-009-01** A known-basis FIFO transfer preserves lot acquisition dates and basis across source/destination; source plus destination units and basis reconcile exactly.
- **AC-009-02** Moving-average partial transfer conserves cents and uses existing selected method; no silent method switch.
- **AC-009-03** Paired legs commit atomically, are linked/audited, and undo/redo restores exact rows and basis.
- **AC-009-04** Total-scope cash, realized gain, external contribution and envelope activity remain unchanged; security-only scope treats movement consistently with existing flow policy.
- **AC-009-05** Unknown basis, partial-unit mismatch, duplicate pair, locked source or concurrent change produces no partial write and an actionable German error.
- **AC-009-06** Existing split records keep zero cash and correctly scaled units/basis; no duplicate split action is introduced.

## 14. Independent tests and validation

Add literal domain cases for FIFO/average, partial units, cent remainder, negative/zero units and unsupported conversion ratio. Repository tests must inspect actual persisted trade legs, group uniqueness, source snapshots, audit group and exact undo/redo rows after injected failure at every write point. API tests cover invalid IDs, authorization/origin, stale preview, retries and reconciliation locks. UI tests cover preview, no-cash disclosure, errors, keyboard and phone layout. Existing split and portfolio return suites run independently; test total-scope invariance with synthetic ledger facts. None of these proposed tests were run for this specification.

## 15. Open decisions, recommendation and stop condition

Recommend same-owner, same-security, same-currency 1:1 transfers with known basis and no cash legs. The owner accepts that bounded design before WP-012 starts; unknown-basis and conversion events remain rejected, not unresolved branches inside the first implementation.

Within WP-012's 6–12-day estimate, **stage A is the pure replay contract and its independent tests**, before persistence/UI mutations. The implementer supplies literal cases for (1) FIFO 4 units/40.00 plus 6/72.00 transferring 5 → transferred basis 52.00, source 60.00 with acquisition dates retained; (2) average 10 units/102.00 transferring 5 → 51.00 each; (3) fractional units/cent residual conservation; (4) unknown basis, insufficient units and same-day lineage cycle → typed rejection; (5) backdated edits affecting a later transfer → consistent full replay or atomic rejection. A reviewer confirms AC-009-01/02 and the failure constants against the stated cases. That documented passing contract is stage A's exit criterion and permits the same package's stage B (relation/transaction/API) and stage C (UI/undo/integration). It is not an extra unestimated prerequisite.

Source fees actually posted remain separate ordinary facts; basis capitalization beyond current rules, unknown-basis acceptance, conversion ratios and general spin-off/merger/tax allocation require a later owner decision. Stop if units/basis cannot be conserved, an unapproved tax assumption is needed, a lock would be bypassed or history must be rewritten. A failed stage A revises the design/estimate before financial mutation work.
