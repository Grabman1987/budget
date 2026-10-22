# #520 read-only history bridge — revised source plan

Status: **PLANNING SNAPSHOT; NOT VALIDATED.** Revised 2026-10-22 after the independent [minimality review](security-transfers-520-history-plan-minimality-review.md). The bounded pure-helper correction and reader were later implemented at `3728298e267b4acad2b9ea6395c6d46eb8f539d8` and received [source-only review](security-transfers-520-history-reader-source-review.md). This plan records the reasoning before that checkpoint; it does not claim a migration, writer, API, database, tests, build, browser, product flow or Stage A runtime acceptance.

## Scope and decisive distinction

An ordinary live native `buy` has a recorded account/security/date, positive E8 quantity and cost `amountCents + feeCents`. Replaying all supported **recorded app-ledger facts** from the cost engine's zero seed can establish an app-native known-basis lot/pool under the selected existing method. It does **not** prove a physical zero holding before that history, all external broker activity, or private Gate 3 reconciliation. SPEC-009 §§3, 8, 12, 15 and `docs/product/reference-adoption.md:33-39` require selected known basis and explicit paired lineage; they do not require a new zero-opening/completeness-certificate ledger for ordinary recorded buys. Remove that proposed table and the blanket one-unit-event-per-day rule from the earlier plan.

The current data still cannot reconstruct ancestry from a nonredundant `holding` snapshot, unpaired `delivery_in/out`, ambiguous imported position, unknown basis or unsupported corporate action. These remain typed unavailable/manual, rather than being converted into invented native acquisitions. `account.openingDate/openingBalanceCents` in `packages/db/src/schema/accounts.ts` describe cash; `booking.transferId` in `packages/db/src/schema/bookings.ts` links cash transfers. Neither is security provenance. PP `crossEntry.peerUuid` can exist in staging (`packages/import-pp/src/model.ts`) but is not persisted as a trade pair by `packages/import-pp/src/mapping.ts` and `apps/server/src/imports/pp-commit.ts`; retained raw import bytes are deletable (`apps/server/src/imports/pp-staging.ts`). A trade `importKey`, note, same date or equal units is not a pair.

## Proposed pure-helper evidence vocabulary (must precede `available: true`)

`packages/domain/src/invest/security-transfer-replay.ts` currently requires `opening: 'documented-zero'` and `historyComplete: true`. A DB reader must **not** set those flags based on absence of old rows. Stage A should replace them with an explicit analytical scope, for example:

```ts
type ReplayStart =
  | { kind: 'recorded-ledger-zero-seed' }
  | { kind: 'documented-opening'; /* future, separately proven provenance */ };
type ReplayCoverage = {
  kind: 'all-supported-recorded-facts';
  through: string; // ISO day covered by the consistent repository read
};
```

The first variant means exactly the zero seed already used by `costOf`/`documentedCostOf` for a native recorded history. `all-supported-recorded-facts` means the reader loaded and classified every live recorded unit-changing fact for the selected security and connected accounts through that date, with no unsupported anchor or gap **in the app ledger**. It makes no external completeness claim. A future documented nonzero opening would require separate lot/date/basis evidence; it cannot be smuggled into this variant. Keep full-batch typed failure, amount/lineage/graph bounds and `applyAvailable: false`. The adapter may report its evidence class outward as `recorded-native`, never as broker-certified or physical-zero. Until the helper accepts this narrower contract, the adapter must return unavailable rather than falsely populating the old flags.

## Exact read-only repository adapter

Proposed location: `packages/db/src/repos/security-transfer-history.ts` (no API/barrel exposure in this plan). Use one consistent read transaction/snapshot and return a tagged result:

```ts
readKnownSecurityReplay(db, {
  securityId, sourceAccountId, destinationAccountId, asOf,
}):
  | { available: false; code: EvidenceFailure; offendingIds: string[] }
  | {
      available: true;
      evidenceClass: 'recorded-native';
      replay: KnownSecurityReplayInputV2;
      replayThrough: string; // asOf: prefix used for preview state
      fingerprintThrough: string; // latest recorded relevant date in the read snapshot
      canonical: Array<{ accountId: string; unitsE8: number; basisCents: number }>;
      factFingerprint: string;
      relevantTradeIds: string[];
      relevantPairIds: string[];
    }
```

The reader must:

1. Read the live security, source/destination and all accounts reachable through **explicit** same-security pair links; check account eligibility, EUR account cost currency, same-owner scope and reconciliation locks. Read the persisted `investmentPreferences` method (unset preference is average), never the unrelated FIFO default on `costOf`. Bound accounts/events by the existing pure replay limits.
2. Read all live trades and holdings for those account/security positions from the beginning of the recorded ledger through the **latest currently recorded relevant event** in the same snapshot, not a truncated page or only the current balance. Classify every unit-changing row, including the suffix after `asOf`; use the prefix through `asOf` for the requested preview state and canonical comparison. Accept validated native buys/sells with exact stored ID/date/signed E8/gross/fees/taxes and the canonical settlement/trade rules (`packages/db/src/repos/trades.ts`, `packages/domain/src/invest/trade-rules.ts`). Inspect and explicitly ignore validated zero-unit `dividend`, `interest`, `fee`, `tax` for **basis replay**; they remain real cash facts elsewhere. Fail on unsupported kind, negative inventory, overflow, deleted/changed evidence conflict, or unestablished opening ancestry. No caller fragments or entered basis become authoritative.
3. Read actual 1:1 pair relations **once the SPEC-009 relation exists**. Validate both distinct live `delivery_out/in` IDs, security/day/currency/accounts, opposite equal E8 units, unique leg membership and pair order. An unpaired delivery is unavailable even if notes, PP UUIDs, amounts or dates match. Before any pair relation exists, the native buy/sell subset is still readable; any historical delivery makes the affected scope unavailable.
4. Check `holding` snapshots against the native replay and the selected method. A nonredundant snapshot/anchor or unknown-basis legacy holding blocks provenance. A numeric match can corroborate a native result but does not prove physical opening or original cross-account ancestry. Do not use a snapshot as an acquisition leaf. Independently compare native-only replay units and basis **per account** with the canonical `documentedCostOf`/position projection for the same selected method and no effective anchor (`packages/db/src/repos/portfolio-summary.ts` `effectiveSnapshots`/`positionCost`). If they disagree, return `canonical_conflict`; do not choose one silently. Once explicit pairs exist, account-local canonical delivery replay is not an independent lineage oracle: compare unit conservation and total basis, then have the canonical position path consume the shared cross-account replay before claiming per-account post-pair agreement. Never compare a derived value to itself as if independent corroboration.
5. Return `ReplayStart: recorded-ledger-zero-seed` and `ReplayCoverage: all-supported-recorded-facts` only after these checks. Feed the selected method and real rows into the pure replay. Revalidate the pure result's account units/basis against the independent native projection where available; make every failure typed with no partial preview.

`EvidenceFailure` should distinguish unsupported snapshot/opening, unpaired or inconsistent delivery, unknown basis, split/corporate-action gap, ambiguous pair order, currency/account/lock, canonical conflict, arithmetic/scope limit and stale facts. It must not turn absence of source rows into an assertion about the external broker.

### Same-day order, including paired transfers

`packages/db/src/repos/trades.ts` and `packages/db/src/repos/portfolio-summary.ts` read native trades by `(date, id)`; `packages/domain/src/invest/cost.ts` applies buy/delivery-in first on a day and preserves that input order within rank. For native buys/sells, assign unique pure-replay `sequence` positions from **that deterministic app cost order** (per account for cost; one stable global merge for replay). Multiple buys/sells on one day are allowed. This is the application's reproducible analytical order, **not** broker execution time. Check that FIFO/average outcomes and the canonical per-account projection agree; a same-day case that cannot be reconciled fails instead of redefining the cost engine.

SPEC-009 §8 also requires persisted creation order for same-day pair edges. A prospective minimal pair relation must carry a durable, unique pair creation ordinal/order on that security/day; replay multiple same-day pairs in that recorded order and reject cycles/insufficient source units. Interleaving a pair with native buys/sells on that same day is accepted only when their relative position is established from persisted facts **and** agrees with canonical cost semantics, or when the alternative positions provably produce the same relevant units, basis and lineage. The first bounded reader can return `ambiguous_pair_order` for mixed pair/native days lacking that proof; it must **not** reject multiple native unit events merely because they share a date. Backdated/future same-day writes must invalidate a previous preview or fail if the order becomes material and unprovable. Avoid treating lexical IDs, import UUIDs or second-resolution timestamps as broker chronology.

### Fingerprint, CAS and later events

Compute a server-side deterministic fingerprint of sorted, normalized live trade facts (including IDs, amounts, dates, fees/taxes, write revisions/deleted state), relevant holdings, accounts/currency/lock state, selected method and pair rows/order for the **full affected lineage through `fingerprintThrough`**, plus reader scope/version. Both preview prefix and fingerprint suffix come from one consistent read: `replayThrough = asOf` gives the immediate-before-transfer state, while `fingerprintThrough` is the latest currently recorded relevant event date, even when later than `asOf`. A preview is a snapshot of those facts, not an authorization token; no private broker payload belongs in logs. At future apply, one transaction must reread the affected history through the then-latest event, recompute and compare the **same full-scope** fingerprint (including the boundary/version), replay the proposed transfer and its later suffix from the start, and reject stale/locked/invalid outcomes before any write. An asOf-only hash must never be compared against a latest-history apply hash. The current pure helpers and this plan keep `applyAvailable: false`; this paragraph defines a future CAS contract, not an apply implementation.

## Persistence boundary and acceptance gap

Only SPEC-009 §8's small audited relation linking the two delivery legs is the prospective new provenance model for this bounded native path. It must make each live leg unique, retain pair identity and same-day pair order, and participate in grouped audit/undo/redo and transactional revalidation. No new zero/completeness certificate table, mutable lot balances, inferred legacy pair migration, writer or route is proposed here. Existing ordinary trade/snapshot/import writers would later need to invalidate stale previews and enforce pair-leg integrity, but that is future implementation after Stage A executable acceptance.

`split` is a **known acceptance gap**: the canonical average/FIFO engine already conserves basis while scaling units (`packages/domain/src/invest/invest.ts`), and SPEC-009 AC-009-06 preserves that behavior. The current pure `security-transfer-replay.ts` rejects split. A buy/sell/pair-only source slice may be staged, but full SPEC-009 completion must extend/reconcile split ancestry or give a typed unavailable result for positions containing splits; no new split action or tax policy is implied. Nonredundant snapshots, unpaired legacy deliveries, unknown/null basis and other corporate actions remain fail-closed pending actual provenance. Existing owner approval of same-security known-basis scope and source-cent residual handling remains in force; no new financial-policy decision is needed for this reader.

## Next unblocked source work

First revise the pure replay type/guards to encode recorded-ledger scope honestly. Then implement the read-only diagnostic/native projection and canonical per-account comparison behind a repository-only boundary; keep `available: false` where any recorded fact is unsupported and do not expose an API/apply path. The small pair relation and its order/transaction design follow SPEC-009 Stage A acceptance; legacy evidence is a separate manual/private reconciliation matter. Runtime contract cases, repository integration, split acceptance, CAS/apply, UI and AC validation are **open**, not claimed by this source plan.

References: `docs/product/specs/SPEC-009-corporate.md` §§3, 8, 12, 15; `docs/product/reference-adoption.md:33-39`; `SPEC.md` §10; `docs/trades-execution.md`; `packages/domain/src/invest/{cost,invest,security-transfer-replay}.ts`; `packages/db/src/{schema/invest,repos/trades,repos/portfolio-summary,repos/investment-preferences}.ts`; PP paths above.
