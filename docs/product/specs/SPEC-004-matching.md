# SPEC-004 — Source matching and review

Proposal for `CAP-010` and `CAP-011`, owned by `WP-008`. This is a bounded product specification grounded in target model and observed source behavior; it does not authorize implementation or widen current import scope. Existing `SPEC.md` and dated owner decisions prevail.

## 1. Ziel und Problem / Goal and problem

Owners need reliable linkage between imported bank transactions and existing bookings, and predictable categorization suggestions, without duplicate postings or silent merges. The current system already has a bank-sync inbox, strict source keys, candidate matching, operator YNAB migration, payee aliases, bounded assignment rules, audit groups, and undo. The gap is assurance and clarity around identity, re-import, ambiguous candidates, and rule provenance; this specification makes those contracts explicit and testable rather than proposing a new general import product.

Success means: a repeated source row is not duplicated; one clearly unique booking match can be linked under the existing narrow rule; any ambiguous match stays reviewable; an owner can see why a rule suggested an action; a reviewed batch either commits in full with one audit group or has no effects.

## 2. Quellen und Referenz / Sources and reference

Reference records YNAB-052–058, ACT-050–071 and PP-059–067 in [the matrix](../feature-matrix/features.csv) retain separate file-import, provider and manual-review boundaries. Their matching windows/defaults are not substituted for Budget's current rule.

Primary implementation: `packages/domain/src/bank-sync.ts:56-109,178-202`; `apps/server/src/bank-sync/service.ts:64,119-190,202-230,710-770`; `apps/server/src/api/bank-sync.ts` (preview/apply handlers); `apps/server/src/imports/staging.ts:24-38,130-203`; `apps/server/src/imports/commit.ts:324-422,477-500,801-845`; `packages/domain/src/assignment-rules.ts:28-117,160-205`; `packages/db/src/repos/assignment-rules.ts`; `apps/server/src/api/assignment-rules.ts`.

Product evidence and constraints: `docs/product/target-model.md` (“Bounded changes and data ownership”); `docs/product/feature-matrix/capabilities.csv` rows `CAP-010` and `CAP-011`; `docs/migration/ynab-export.md` (“Identity”, dry-run/commit, revert); `docs/ops.md` operator-only migration procedure. Relevant UI destinations are Konten and the existing bank-sync inbox; migration remains an operator workflow, with no in-app file-import screen.

Existing tests to extend or use as contracts: `packages/domain/src/bank-sync.test.ts`, `packages/domain/src/assignment-rules.test.ts`, `apps/server/src/api/bank-sync.test.ts`, `apps/server/src/api/assignment-rules.test.ts`, `apps/server/src/imports/commit.test.ts`, `apps/server/src/imports/imports.test.ts`, `apps/server/src/imports/jobs.test.ts`. Their presence is evidence of test code only; none were run for this proposal.

## 3. Vorgesehenes Budget / Intended Budget

This proposal targets the existing single-owner Budget ledger, current server-authoritative bank sync and operator YNAB migration. It does not introduce another ledger or categorization engine. A source transaction may link to one existing booking; a new bank transaction without a unique match remains a normal pending booking subject to existing assignment and audit rules. Source IDs, account identity, import keys, booking IDs, deletion state, reconciliation state and audit history stay the system of record.

For operator migration, preserve the current explicit YNAB mapping/review workflow and strict source identity. In-app file upload/import remains out of scope. No new bank provider, generic integration API, YNAB-compatible public API or cross-user migration is implied.

## 4. Umfang und Ausschlüsse / Scope and exclusions

Retain: source-specific bank consent, encrypted provider credentials, durable fetch cursor, the 21-day overlap fetch window, source IDs, bank inbox, strict matching, exact aliases, bounded rules, review preview, atomic apply, import idempotency, soft deletion, reconciliation lock, audit and undo. Retain the operator-only YNAB parser, dry-run, mapping and atomic reversible run.

Specify and verify: stable key precedence; narrow auto-link criteria; ambiguity behavior; source revision handling; re-import and tombstone behavior; rule evaluation and rule provenance; batch preview invalidation and all-or-nothing application; actionable safe errors.

Exclude: in-app file-import UI, new bank connectors, fuzzy auto-merge, generic scripting or arbitrary regex, silently applying learned rules, changing the four-day bank auto-link window, deleting or restoring tombstones on absence/presence alone, overriding reconciled rows, and replacing source identity with guessed payee/date/amount equality. No implementation changes are authorized by this staged spec.

## 5. Ablauf, Fehler und leere Zustände / Flows, errors, empty states

1. Fetch source pages using existing account consent and cursor. On an initial or incremental fetch, overlap from `bankFetchFrom`: use `fromDate` initially, otherwise 21 days before the last successful sync timestamp/date. Advance the persisted watermark only after the account’s stage commits.
2. Derive a stable source key. Prefer a provider reference only when unique in the fetched batch. Otherwise use the normalized fallback fingerprint and occurrence ordinal described in §6.
3. Find an existing source row/booking by source account and key. Identical re-delivery is a no-op. If the provider revises an item that is already recorded or resolved, surface a warning for owner review; do not silently rewrite the booking.
4. Find possible existing bookings in the same account, currency and amount. Auto-link only when exactly one eligible booking exists inside the current four-calendar-day window. If none match, create the existing unchecked/pending booking and leave it for normal review. If more than one matches, keep the bank item open with the ambiguity note and require an explicit choice.
5. Before a multi-row apply, preview every selection, source revision, target booking and rule effect. If any selected item is stale, no longer open, ambiguous in a way that prevents safe apply, reconciled, or invalid, reject the batch with an actionable row-level reason. Apply all accepted rows, aliases/rules and audit group in one DB transaction, or apply none.
6. For migration, parse/dry-run and map first; validation errors prevent commit. Report absent historical rows for confirmation. Only explicit `deleteMissing` may soft-delete absent migration-owned rows. Revert remains limited to the latest run and reverses its audit group; it does not erase history.

Empty states must state whether there are no new source rows, no candidates, or no remaining review items. Provider throttling/cooldown and temporary failures must keep the cursor at its last committed point and preserve retryability. A failed atomic batch must not leave partial booking, alias, rule, cursor or audit writes.

## 6. Regeln und Formeln / Rules and formulas

**Bank identity.** `bankTransactionKeys(rows)` uses a unique provider reference as the preferred key when it occurs once in the batch. Otherwise its fallback identity is a deterministic fingerprint over `(date, amountCents, currency, memo.trim())` plus a 1-based occurrence ordinal among identical rows. This retains two identical purchases as two entries. Do not remove the ordinal or dedupe only on amount/date/payee.

**Auto-link.** `BANK_AUTO_LINK_DAYS = 4`. Eligibility requires same account, currency and exact signed cents; date distance is at most four calendar days. Only one eligible candidate auto-links. More than one candidate is ambiguous and stays open. The review-suggestion window in `bankMatches()` is wider (five days) and suggestions are never confirmation. The wider window must never be reused as the auto-link threshold.

**Cursor overlap.** `bankFetchFrom(fromDate,lastSyncAt)` returns initial `fromDate`, or an incremental start 21 days before the watermark to pick up late-posting transactions. Commit the cursor only with a successfully committed account stage.

**Operator migration identity.** Current `importKey` is a hash of file kind, account, date, payee, category, memo, amount and occurrence index among identical rows (see `docs/migration/ynab-export.md`, Identity). Re-importing the same export leaves data unchanged. On a matching live key only eligible status/flag changes update; changed hash fields require review of the new/missing identities. Absence is not deletion consent. For a literal example, two same-account purchases on `2026-10-01` for `-1250` cents with equal payee/category/memo receive occurrence ordinals 1 and 2 and therefore remain distinct.

Precisely, `commit.ts` updates status/flag on a matched live, non-reconciled key; changing a field that participates in the hash creates another identity and requires the existing reconciliation/report process. It is not an in-place general revision merge. Fallback bank identity is reliable only within the stable source batching/ordering contract: changed pagination, duplicate-reference sets or ordinal populations can change identities. Add adversarial redelivery/reordering tests and surface uncertainty; do not claim universal provider idempotency or silently rewrite existing stored keys.

**Rules.** Existing rule predicates are bounded and evaluated by pure domain functions. Conditions must be valid under the current schema; the regex dialect deliberately rejects dangerous constructs and does not expose arbitrary code. Split action weights are integer basis points summing exactly `10,000`; e.g. 6,000/4,000 on `1,000` cents allocates 600/400 cents. Invalid sum, empty/invalid target, unsafe expression, or invalid amount yields validation error before apply. Rounding is deterministic largest-remainder allocation, preserving the exact signed total. Rules can suggest and be explicitly confirmed; they do not bypass ambiguous source matching or reconciliation locks.

## 7. Beispiele und Randfälle / Examples and edge cases

- A unique provider reference fetched twice: same source key, second fetch is no-op.
- Two identical card purchases with no unique provider reference in one page: fallback ordinals differ; both are retained.
- One existing `-12.50 EUR` booking on the same account, dated three days from the bank row: eligible for auto-link only if it is the sole candidate.
- Two same-amount, same-currency bookings within four days: ambiguity note, open inbox item, owner chooses. Never choose the closest by fuzzy confidence.
- Same amount and date but different currency or account: not a match.
- Candidate at five days: may appear as a review suggestion only; no auto-link.
- Provider repeats a key with changed description after a booking is recorded: warning/review, no silent mutation.
- An import key exists on a soft-deleted booking: preserve tombstone; do not resurrect on re-import. A missing export row stays report-only until explicitly confirmed for deletion.
- A reconciled booking differs from incoming migration data: do not mutate it through routine import; present the conflict for operator resolution.
- Rule split 33.33%/33.33%/33.34% (3333/3333/3334 bp) of 100 cents yields exact cents by deterministic remainder; total remains 100. A total weight of 9,999 is rejected.
- A stage/batch with one stale revision among several candidates: reject the whole apply, refresh preview, and preserve all prior rows unchanged.

## 8. Modell und Migration / Model and migration

Prefer existing schema and APIs. No migration is required for this spec unless implementation discovery proves a missing field; any such additive migration must be isolated, reversible, and preserve existing primary IDs and import/source keys. Keep the current `bankSync` link/candidate source identifiers and booking `importKey`; keep source-scoped payee aliases and rule IDs. Keep soft-deleted rows as tombstones and keep reconciled status/explicit unlock semantics. Do not collapse source identity into a new generalized matching table.

Import dry-run/staging may retain source rows and mapping versions under the existing run lifecycle; deletion of staging data follows its existing cleanup function. Do not log raw bank rows, names or account numbers. Audit the actual committed deltas and the owner/reason, not private provider payloads. Re-import/revert must remain idempotent under the current database transaction and “latest import run only” recovery rule.

## 9. Schnittstellen / Interfaces

Reuse the current authenticated bank-sync review and apply routes in `apps/server/src/api/bank-sync.ts`, provider service in `apps/server/src/bank-sync/service.ts`, assignment-rule API in `apps/server/src/api/assignment-rules.ts`, and operator migration task interfaces in `apps/server/src/imports/*`. No public API clone or generic “import any file” endpoint is added. Any changed payload remains schema-validated and version/revision guarded.

Preview response should expose safe row identity, candidate count/IDs needed by the owner UI, match reason, source revision, intended action, rule provenance and row-level error codes. Do not return provider credentials or include raw personal data in error details. Apply must require the preview’s expected source and booking revisions and return a conflict requiring refresh when stale. Errors distinguish `ambiguous`, `stale_revision`, `reconciled_locked`, `source_changed`, `request_limit`, and validation failure without disclosing secret or account data.

## 10. Navigation und Gestaltung / Navigation and design

Keep existing Konten route and bank-sync inbox/review destination, along with current German labels and design tokens. Make the match reason and source provenance available in the review detail; distinguish “Vorschlag” from “automatisch verknüpft” and “bestätigt”. Show the same-account/currency/amount/date evidence without dumping raw provider fields. Provide explicit owner actions to select a candidate, leave unmatched, or dismiss/resolve according to current source lifecycle.

Operator migration remains documented and command-driven; it does not become a visible app route. Keep keyboard and touch access, privacy toggle, and existing semantic status colors. The UI should state that a suggestion has no effect until confirmed, and that a bulk apply is atomic.

## 11. Datenschutz, Sicherheit und Leistung / Privacy, security and performance

Use existing passkey session, CSRF/origin protections, encrypted provider secrets, source consent and rate limits. Do not add authorization surfaces. Current bank manual sync has a 15-minute cooldown and maximum four manual requests per account per day; provider pagination can also trigger `request_limit`. Respect the existing retry scheduler and provider-specific caps; no YNAB/API rate limits are applicable to Budget endpoints.

Matching should remain bounded by the fetched page/staged batch and indexed account/source keys. Avoid pairwise fuzzy matching across all ledger history. Batch preview must avoid N+1 reads and must fit existing API request limits; keep the all-or-nothing transaction small enough for SQLite. Regex stays on the safe bounded dialect and input-size limits. Errors and logs contain codes and safe counts only, never row data, names, tokens, or credentials. Import raw staging is private owner data and is removed through existing retention/cleanup lifecycle. Respect `docs/export.md` export boundaries and audit redaction.

## 12. Abhängigkeiten / Dependencies

Reuse SQLite/Drizzle transactions, Hono schema validation, pure `packages/domain` matching/rule functions, existing bank provider adapters and consent store, assignment-rule repository, audit/undo path, and existing React Konten review components. Do not introduce a fuzzy matching library, scripting runtime, new bank provider, separate event bus, sync engine or new import SDK. Use existing source-specific error mapping and retry worker. No third-party implementation or product behavior is assumed.

## 13. Abnahme / Acceptance

- `AC-004-01`: Given a unique provider reference delivered twice, verify one source identity and no duplicate booking; assert stable source key and no second financial delta.
- `AC-004-02`: Given two identical rows without unique references, verify occurrence ordinals keep both and re-delivery of the same ordered batch adds neither again.
- `AC-004-03`: Verify exact amount/account/currency plus one unique candidate at 0–4 calendar days auto-links; a 5-day candidate does not auto-link.
- `AC-004-04`: Verify two eligible candidates remain open with an ambiguity reason and no mutation until explicit owner selection.
- `AC-004-05`: Verify late-posting row inside the 21-day overlap is found; a failed stage does not advance the watermark.
- `AC-004-06`: Verify a provider revision to an already-resolved row produces a safe warning and does not rewrite its booking.
- `AC-004-07`: Verify a same-export YNAB re-import is a no-op; missing row is report-only; confirmed `deleteMissing` soft-deletes; a tombstoned key is not resurrected; latest-run revert is reversible and audited.
- `AC-004-08`: Verify migration validation error blocks commit and transaction failure rolls back all rows, mappings, cursor and audit mutations.
- `AC-004-09`: Verify rule split weights must total 10,000 bp; valid largest-remainder splits sum exactly to signed cents; unsafe regex and invalid targets fail before write.
- `AC-004-10`: Verify stale source/booking revisions and reconciled targets reject a complete multi-row apply with zero partial updates; valid apply creates one audit group.
- `AC-004-11`: Verify response/log snapshots contain no provider secret, raw account number, payee or memo in errors and telemetry.

## 14. Tests und Validierung / Tests and validation

The named test files in §2 exist in the source tree. This proposal has not run them and their presence does not satisfy acceptance. Implementing WP-008 should add independent domain boundary tests and API/database transaction tests for the acceptance cases, using synthetic accounts, source records and balances. Exercise success, duplicate delivery, ambiguity, stale revision, rollback, tombstone, reconciled lock, malformed payload and privacy-safe errors. Validate the UI review flow manually with synthetic data after API tests; do not use production bank access or customer data for acceptance. Run repository-required lint/type/test/CI gates when implementation is authorized and record exact commands/results then.

## 15. Offene Entscheidungen und Empfehlung / Open decisions and recommendation

Recommendation: preserve the current four-day unique exact-match rule, five-day suggestion window, stable source keys and all manual-review boundaries. Do not change auto-link heuristics without a measured synthetic/owner review showing a concrete reduction in correction burden. Keep file import operator-only and retain current YNAB deletion/revert semantics.

Open owner decision before any broadened behavior: whether a future source-specific confidence/review explanation should expose more match factors in UI, and whether provider revision warnings need an explicit “accept source correction” action. Neither is required for this slice. Stop implementation if a proposal needs fuzzy auto-merge, silent tombstone resurrection, raw personal data in logs, partial bulk commit, new provider scope, or a change to reconciled/undo semantics; return for a separate owner decision.
