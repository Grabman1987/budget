# #520 persistence and read projections — independent source review

- Base: `f25067da1214b2d2199a80bf3a857545f46e28a5`.
- Reviewed head: `be9d6e9e331da033edf0aa4c4427cc6bcf61c223`.
- Worktree: `/workspace/impl-520-transfer-persistence`; head confirmed unchanged and worktree clean at the end of reading.
- Scope: all 10 files in this delta, their position/valuation/flow/report callers, migration metadata and existing audit discovery. Inherited pure replay and unrelated inherited migrations were read where necessary, not re-certified.
- Method: source and read-only Git inspection only. No tests, checks, build, browser, database, migration, provider or runtime operations. No product edits. Applied the repository's budget-security-review profile; SPEC and the reviewed writer-plan addendum provide the financial contracts.

## Findings

### P2 — Mixed depot totals still classify an internal pair as two external gross flows

`packages/db/src/repos/portfolio.ts:1144–1197` decides inclusion only from the trade rows selected by this individual call. It does not receive the complete measured securities universe. `portfolio-depots.ts:138–163` deliberately splits a mixed selection into a securities call for brokerage/crypto accounts and a depot call for the remaining investment accounts; the latter accounts' held securities still enter the same total (`portfolio-depots.ts:196–220`). A valid pair from brokerage A to another eligible, off-budget EUR investment account B is therefore one-sided in each call even when A and B are both in the total. The two calls emit an equal withdrawal and deposit. Concatenating these retains gross flows under the PP convention; it does not make an internal transfer disappear.

Synthetic reasoning example: opening total 10,000 cents, closing total 11,000 cents, internal transfer valued at 5,000 cents. Correct daily return is 10%. These spurious gross flows instead produce `(11000 + 5000)/(10000 + 5000)-1`, about 6.67%. Same-type brokerage pairs are correctly removed; the defect is the existing mixed comparison composition. These account types are not excluded by the new reader's eligibility checks.

Minimal correction: give pair classification an explicit full set of accounts whose **security holdings** enter this measured value, shared by both calls. Remove an included pair before either branch aggregates. Do not indiscriminately treat every cash-only reference account as included securities. Keep true one-sided selections external and old unpaired deliveries unchanged.

### P2 — Missing one-sided transfer valuation aborts the whole report instead of its affected return

`portfolio.ts:1181–1184` throws `PriceUnavailableError` or the FX error while deriving one-sided flow value. `portfolio-depots.ts::inputOf` has no scoped catch/result, so a missing historical transfer-date quote in just one account column aborts `depotComparison`, including the otherwise evaluable internal total and all other columns. The existing API handler maps the price error to a whole-response 503 (`apps/server/src/api/http.ts:121`); it does not produce an unavailable return field. Other flow consumers also receive exceptions. This confirms the author's flagged seam.

Minimal correction: propagate typed, scoped flow unavailability (reason, relevant date/security/account) to return/contribution consumers. Retain current positions, known basis, unaffected columns and a computable two-sided total; explicitly mark only figures requiring that boundary valuation unavailable. Never substitute zero, execution/cost proxy or fetch a provider. Also handle missing dated FX and report the selected affected account, rather than always the outgoing account. This is the existing writer-plan contract, not a new product decision.

### P2 — Adjacent tombstone's external leg and audit revision are absent from CAS evidence

The reader collects both legs in `legRows`, but only live pairs expand `accountSet` (`security-transfer-history.ts:130–163`). `allTrades` then covers that live component only. The fingerprint includes adjacent pair rows but its trade facts/revision keys come solely from `allTrades` (`:296–326`).

Example: deleted pair A→B remains adjacent to input A/C, but no live pair connects B. Its incoming leg in B can change, or change and be undone, without changing this fingerprint. The immutable pair row and A's leg stay identical. The plan explicitly requires both adjacent tombstoned leg identities and latest audit revisions, precisely because a removed edge must not erase stale-state evidence.

Minimal correction: add both legs of every adjacent pair, including external tombstoned legs, to a deduplicated fingerprint-evidence set and revision keys. Keep economic component expansion restricted to live pairs; no need to replay an unrelated external component solely to bind its leg. Bound these evidence reads and preserve an explicit missing-row representation/rejection. The current slice has no writer, so this is an incomplete reader CAS contract rather than an assertion that a stale apply is currently reachable.

### P2 — Migration 0053 has no successor schema snapshot

The commit adds SQL, rollback, schema and journal idx 53, but no `packages/db/drizzle/meta/0053_snapshot.json`. The inherited latest snapshot is `0052_snapshot.json` (ID `34bf324a-c41c-460b-a484-4634f4e3675e`); it has no new relation. `packages/db/package.json` still uses `drizzle-kit generate`, whose schema diff starts from persisted snapshots. Leaving metadata at 0052 makes a later generation see `security_transfer_pair` as newly added again rather than already represented by 0053.

Minimal correction: add the exact 0053 successor snapshot with `prevId` pointing to 0052, preserving the entire inherited schema and adding only the new relation/index/check/FK metadata. Keep SQL triggers in the migration as required. This does not require executing generation or a database operation during the current source-only work. The reserved migration number itself is correct, and the rollback appropriately refuses to discard even tombstoned pairs.

### P2 — Global limits can disable unrelated native positions and empty report scopes

`portfolio.ts:1148–1150` reads/caps every live pair in the entire database before checking whether any selected trade belongs to a pair. Once 1,001 pairs exist anywhere, even a report for another security or an empty selection throws. Similarly `pairedRecordedPositionAsOf` caps all same-security pairs before checking account/date relevance (`security-transfer-history.ts:29–43`): 501 pairs in disjoint accounts make a completely native position with no paired history return unavailable rather than the documented `null` fallback. The main reader also caps all same-security pairs before component selection (`:130–132`), including unrelated tombstones.

Minimal correction: scope indexed pair lookup to selected leg identities for flows and to account-adjacent pairs during bounded component discovery. Apply limits to the relevant component/evidence actually required, not the whole unrelated store. Preserve bounded work and typed unavailability for a genuinely oversized affected component. Ordinary unpaired history should retain the existing calculation.

## Source observations and boundaries

The additive relation avoids mutable basis balances and inferred pairing. Same-role unique indexes plus cross-role membership triggers retain ownership through tombstones. It is exported through the schema barrel and therefore discoverable by generic audit metadata. The immutable-field trigger, journal slot and rollback are present; no migration was applied.

The reader enforces live eligible off-budget EUR accounts, opposite equal units, zero money, no settlement booking, explicit pair membership and full suffix replay. Reconciliation and account closure remain prospective write blockers. Persisted creation order orders same-day pairs; native buys remain first; interacting same-day sales/splits conservatively return unavailable. Position basis and realized gain use shared replay; the valuation override requests average cost. Both-included pairs within a single flow selection are correctly removed before gross aggregation, with no required market quote.

Existing import/trade/account/security mutation and grouped Undo guards are explicitly absent from this slice, as are writer/apply/API activation. They remain implementation work before pair creation is enabled, not hidden completed guarantees and not a demand for another owner approval. This review does not claim those paths are safe to activate merely because the relation now exists.

Outcome: **five actionable P2 findings; not source-clear at this pinned head**. All corrections fit the established bounded contract; no unresolved owner financial policy decision was identified. Runtime acceptance and migration/rollback verification remain unperformed.
