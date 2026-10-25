# SPEC-011 — Recovery, export and bounded offline capture

Proposal for `CAP-012`, `CAP-013`, and `CAP-022`, owned by `WP-014`. This is an assurance and recovery specification over existing passkeys, export, encrypted backups and offline capture. It does not authorize a CRDT/E2EE rewrite or implementation scope expansion. Existing `SPEC.md` and dated owner decisions prevail.

## 1. Ziel und Problem / Goal and problem

Owners need to recover both their financial database and attached receipt files, understand the difference between an export and a restorable backup, and safely submit an offline capture after network loss or an uncertain response. The code already has passkey authentication and step-up, a user-initiated CSV ZIP, nightly age-encrypted backup, Litestream replication, restore procedures, and an IndexedDB FIFO capture queue with idempotent POSTs. The product work is to make these controls independently verifiable and their errors/recovery steps explicit, not to claim they are absent or replace their architecture.

Success means: sensitive export requires a fresh passkey step-up; an export is clearly described as non-restorable; restore guidance includes both the SQLite database and receipt bytes; the offline queue retries the same operation identity safely, preserves order and lets the owner resolve conflicts without silently dropping captures; recovery drills verify integrity and receipt retrieval.

## 2. Quellen und Referenz / Sources and reference

References YNAB-062/076/078/079/093, ACT-072–075/102, PP-071–075/100–107 and Toolkit privacy/export options in [the matrix](../feature-matrix/features.csv). Export, saved-file encryption and synchronization are deliberately distinct.

Implementation: `apps/server/src/auth/routes.ts:199-224,424-450`; `apps/server/src/api/export.ts:717-760`; `apps/server/src/backup/backup.ts`; `apps/server/src/backup/s3.ts`; `apps/server/src/api/bookings.ts:142-240`; `apps/web/src/pwa/queue.ts:12-90`; `apps/web/src/pwa/queue-store.ts:1-150`; `apps/web/src/shell/privacy-button.tsx`; `apps/web/src/router.tsx`.

Operational/product evidence: `docs/export.md` (contents, concurrency, security boundaries); `docs/ops.md:286-345` (nightly encrypted archive and restore), `docs/ops.md:245-255` (drill cadence); `docs/product/target-model.md` (“Bounded changes and data ownership”); `docs/product/feature-matrix/capabilities.csv` rows `CAP-012`, `CAP-013`, `CAP-022`; `docs/audit/2026-10-02-security-review.md` (bounded review, not blanket clearance).

Existing test files: `apps/server/src/auth/auth.test.ts`, `apps/server/src/api/export.test.ts`, `apps/server/src/backup/backup.test.ts`, `apps/web/src/pwa/queue.test.ts`, `apps/web/src/pwa/storage-protection.test.ts`, `apps/web/src/pwa/pwa.test.tsx`. Tests are present in source, but were not run for this proposal. Operational backup drills and live restore checks were not performed.

## 3. Vorgesehenes Budget / Intended Budget

This specification applies to the existing single-owner, server-authoritative Budget application. A browser may queue bounded capture operations while offline, but authoritative state changes only when accepted by the server. Existing accounts, bookings, split/transfer invariants, reconciliation locks, audit and undo remain in force. Export and backup are distinct: CSV ZIP serves owner-readable data portability; the age-encrypted operational archive plus receipt directory serves disaster recovery.

Retain current passkey login and session behavior, recovery codes, step-up for sensitive export, audit controls and privacy UI. Preserve the no-CRDT/no-local-first model and no multi-user sharing/fresh-start feature in V1. Recovery guarantees must be stated against existing actual storage and receipt boundaries, not implied from browser cache or CSV contents.

## 4. Umfang und Ausschlüsse / Scope and exclusions

Retain: fresh passkey step-up for export; authenticated no-store download; allowlisted CSV files with formula-safety handling; process limits; SQLite consistent snapshot; nightly encrypted backup including `budget.sqlite` and `receipts/`; Litestream database replication; restore runbook; indexedDB queue; UUID idempotency; uncertain-send tracking; strict FIFO; owner edit/remove/retry flow; existing privacy/security settings and token controls.

Specify and verify: distinguish export from backup, explain recovery-code limitation for step-up, prove receipt-aware restore and integrity, bound offline capture behavior and conflict handling, record drill evidence, ensure no capture disappears on crash or server rejection.

Exclude: CRDT, full local-first authority, end-to-end encrypted sync redesign, multi-user collaboration, offline portfolio import/trading, generic synchronization API, export of auth tokens/secrets/audit/import staging/provider configuration, new passkey scheme, and guaranteeing recovery from browser storage eviction. No deployment, cloud/bucket access or live restore is part of this proposal.

## 5. Ablauf, Fehler und leere Zustände / Flows, errors, empty states

**Export:** owner opens the existing export control; if step-up freshness is insufficient, ask for passkey authentication. After successful fresh verification, generate a consistent SQLite snapshot, render only allowlisted UTF-8 CSV files, package ZIP, stream with no-store headers, and clean temporary files on response completion/cancel. Throttle concurrent requests. Recovery-code-only sessions cannot satisfy step-up. If export limit is reached, return the existing 429 response and a retryable message; never return a partial archive as success.

**Backup and restore:** nightly backup writes an age-encrypted archive containing the database and receipt files. A failed job creates/updates one urgent inbox item and retries per runbook. Restore into an isolated staging location, decrypt with the owner’s offline private key, integrity-check, restore database and matching receipt directory together, then verify receipt downloads before returning service. Preserve the pre-restore files for rollback. Litestream/PITR is database-only and cannot restore receipt bytes.

**Offline capture:** write capture locally before POST, with one idempotency key and canonical payload. Before sending, persist that delivery is uncertain. On response loss, network failure, server 5xx or idempotency conflict, keep the same key/body and mark the reason; retry only that same head item. Success removes it and permits the next FIFO item. A permanent validation/reconciliation/deleted-entity conflict remains visible and blocks later captures until the owner edits or removes it. Do not silently skip or reorder.

Empty states should distinguish “nothing queued,” “waiting for network,” “login required,” “needs owner correction,” “export unavailable due to concurrency,” and “backup/restore requires operator action.” A browser queue is not a backup: storage deletion or device loss may lose unsent operations, so show whether pending captures remain before the owner clears site data or changes device.

## 6. Regeln und Formeln / Rules and formulas

**Passkey step-up.** Export requires a passkey session plus fresh step-up. Existing auth comments/contracts use a five-minute freshness window. Recovery-code sessions do not qualify. Keep existing cookie flags and auth rate limits; do not downgrade to a normal login or recovery session for export.

Freshness is enforced by `config.stepUpMinutes` in `auth/routes.ts`, not a new hard-coded five-minute constant. Tests use the configured boundary; five minutes is the reviewed documentation/default example. Existing deployment configuration remains authoritative.

**Export bounds.** One inflight export per owner/database and process-wide maximum two, as documented in `docs/export.md`; over-capacity returns German 429. Use one consistent DB snapshot; include only the allowlisted source CSVs. No credentials, session/auth state, audit events, import staging, or opaque provider config. ZIP is not a restorable backup.

**Backup retention and consistency.** Follow `docs/ops.md` section 8 exact current retention: newest 30 daily copies plus first copy of each of newest 12 months. Keep private age key offline. Restore both DB and receipt bytes from the same archive. Keep Litestream as the separate DB-only recovery path; never represent it as receipt-complete.

**Idempotent capture.** `apps/server/src/api/bookings.ts` hashes canonical request JSON. Same `Idempotency-Key` + same request hash returns the prior saved response; same key + different request hash returns `409 idempotency_conflict`. The client must therefore retain both key and original request body for any uncertain result; an edited capture is a new request only after the owner resolves the uncertain one. `Idempotency-Key` format currently accepts 16–80 permitted characters.

**FIFO.** Queue operations are serialized under the existing queue lock. The head item blocks later entries when rejected or uncertain; accepted response removes it. Do not claim a numeric maximum unless a separate source contract establishes one; “bounded queue” refers to the existing controlled capture scope, not an invented item count.

## 7. Beispiele und Randfälle / Examples and edge cases

- An owner starts export after a passkey step-up within five minutes: the export proceeds; after freshness expires, require new verification.
- Recovery code signs in while the registered passkey is unavailable: ordinary session remains usable under current rules, but export must fail closed pending a passkey step-up.
- Two export requests compete for one owner/database: only one proceeds; a process at global cap returns 429 and no truncated ZIP.
- A streamed export is canceled: temporary snapshot/archive files are removed on cancellation/completion.
- A nightly archive contains `budget.sqlite` plus a receipt: restoring DB only via Litestream leaves receipt bytes missing; restore receipt-aware age archive and verify download.
- A capture POST commits on server but response is lost: retry same key and same bytes returns prior response, yielding exactly one booking.
- A client accidentally reuses a key with edited amount: server returns `idempotency_conflict`; keep item reviewable, do not rotate key and resend silently.
- First queued item fails due to `reconciled_locked`: keep it and block later entries; owner must use authorized unlock or edit/remove operation, with the current explicit unlock guard.
- Browser restarts while an item is uncertain: IndexedDB retains key/body/uncertain state and resumes retry after authentication/network return.
- Queue is empty: no background retry should be implied; service-worker sync is a wakeup path for an open/recovered context, not the source of truth.
- Backup decryption/integrity/receipt check fails: stop restore, preserve current files and escalate to operator recovery; never overwrite the only known-good copy.

## 8. Modell und Migration / Model and migration

No business schema migration is proposed. Reuse existing sessions, passkeys/recovery codes, auth audit, export request limiter, idempotency records, IndexedDB queue store, SQLite snapshot, backup archive format and receipt directory. If a drill ledger is needed, use a private operational checklist/runbook or existing non-sensitive audit mechanism; do not persist owner financial rows or secrets as test fixtures.

Queue item identity must continue to include exact immutable request key/body and state (`uncertain`, reason, attempts as presently modeled). Do not store provider credentials or passkey material in the queue. Backup archive must pair a database snapshot with the receipt files from the same backup boundary. Do not change export CSV schema in this slice. Any future backup format migration needs dual-format restore verification and a separately approved retention/rollback plan.

## 9. Schnittstellen / Interfaces

Reuse `exportRoutes` in `apps/server/src/api/export.ts`, existing auth middleware from `apps/server/src/auth/routes.ts`, booking create idempotency in `apps/server/src/api/bookings.ts`, queue helpers in `apps/web/src/pwa/queue.ts` and `queue-store.ts`, and existing backup scripts/runbook. Add no new public sync or restore endpoint in this work package. User-facing export stays an authenticated download; restore remains a privileged operator procedure.

Use existing error codes: `401`/login-required, `429`/rate-limited, `409 idempotency_conflict`, `reconciled_locked`, validation error and deleted-entity conflict. Client messages should be actionable and localized but must not expose server internals, request bodies or secret details. Step-up requests use current `/step-up/options` and `/step-up/verify` auth routes. Runbook commands and logs must be redacted and must not contain tokens, private keys, financial data or full receipt content.

## 10. Navigation und Gestaltung / Navigation and design

Keep the existing export action in its current owner-facing location and the “Einstellungen > Sicherheit” destination for passkeys/recovery codes, as referenced by `docs/ops.md`. Keep `privacy-button.tsx` and router structure in `apps/web/src/router.tsx`; preserve the existing privacy toggle and accessible German de-AT UI. Add a concise notice beside export clarifying “CSV export, not a backup” and a link to recovery guidance, without exposing operational bucket details in public UI.

Queue states should be visible from the existing capture/review surface and use separate plain labels: offline, sending/uncertain, needs correction, reconciled lock, and complete. Never render a queued capture as server-confirmed until a successful response is stored. Keyboard/touch accessibility and existing 44px touch targets remain applicable. Keep the recovery procedure in operator documentation, not a user-facing self-service restore route.

## 11. Datenschutz, Sicherheit und Leistung / Privacy, security and performance

Require the existing passkey session, fresh step-up, CSRF/origin controls, `no-store`, safe ZIP handling and rate limits. Maintain Secure/HttpOnly/SameSite cookie policy, recovery-code hash storage, and auth audit aggregation/redaction. Do not broaden export contents. The security review dated 2026-10-02 is bounded evidence and records an open S09 development dependency advisory; it is not blanket approval or proof of current runtime state.

Browser queue data is sensitive financial data: keep IndexedDB access under existing protection/owner session handling; never put it in logs, URLs, telemetry, analytics or service-worker caches. Communicate storage-loss boundary accurately. Retry only serialized queue head and avoid unbounded background requests. Export has one-per-owner and process-wide two-worker limit; snapshots/files are cleaned after stream lifecycle. Backup calls use documented bounded S3 timeouts/body/list limits and fail closed. Private decryption keys stay offline; no production tokens, bucket access, deployment or live private data are needed for acceptance.

## 12. Abhängigkeiten / Dependencies

Reuse WebAuthn/passkey libraries and existing auth middleware, SQLite backup/read-only snapshot path, CSV/ZIP export code, S3/age backup tooling, IndexedDB queue store, service-worker wakeup, audit logging and existing design system. No CRDT, new encryption protocol, local database authority, background sync vendor, storage SDK, cloud bucket or third-party authentication service is introduced. Existing dependency advisory follow-up remains under its own tracked security process; this spec does not assert its resolution.

## 13. Abnahme / Acceptance

- `AC-011-01`: Verify export with a fresh passkey step-up succeeds; expired step-up and recovery-code-only session fail closed with no archive bytes.
- `AC-011-02`: Verify export contains exactly documented allowlisted CSV files, formula-safe values, UTF-8, no auth/secrets/audit/staging/provider config, and `no-store` headers.
- `AC-011-03`: Verify one-per-owner and process-wide concurrency bounds; excess response is 429 with no partial ZIP and temporary files are cleaned after success, cancellation and error.
- `AC-011-04`: Verify consistent export snapshot while synthetic writes occur and validate generated ZIP/CSV without using personal data.
- `AC-011-05`: Verify same key/body retry after simulated committed-response loss yields one booking and prior response; same key with changed request returns `409 idempotency_conflict`.
- `AC-011-06`: Verify client persists uncertain flag before send and keeps identical key/body across offline, 5xx and lost-response retry; success removes only head item.
- `AC-011-07`: Verify FIFO blocking and owner correction/removal for validation, reconciled-lock and deleted-entity conflicts; later captures are never silently reordered or dropped.
- `AC-011-08`: Verify restart/reload preserves queued synthetic capture and reason, while empty queue shows no pending work; test service-worker wakeup as optional rather than authoritative.
- `AC-011-09`: In an isolated disposable environment, restore an age-encrypted synthetic archive containing DB and receipt; integrity-check and verify receipt retrieval before declaring recovery successful.
- `AC-011-10`: Verify DB-only restore is explicitly marked incomplete when receipt bytes are unavailable; stop and preserve current state on decrypt/integrity/receipt mismatch.
- `AC-011-11`: Verify diagnostic errors/logs/telemetry contain no request body, tokens, recovery codes, private keys, financial values or receipt contents. Authenticated owner UI may show its required values under existing amount privacy; the intentional protected financial audit retains its before/after facts.
- `AC-011-12`: Verify documented retention labels match the current nightly archive behavior and drill evidence records date, archive identity, integrity and receipt checks without secrets.

## 14. Tests und Validierung / Tests and validation

The test files in §2 exist, but this proposal has not run them. WP-014 should add independent tests for export authorization/content/cancellation/concurrency, request idempotency, queue crash/retry/conflict/FIFO, and backup archive restore including receipt bytes. Use synthetic database and disposable temporary directories/throwaway age keys. Separately perform an operator-run restore drill only in an isolated test environment with explicit backup fixture; record evidence without copying private keys or owner data into the repository. Tests and code inspection do not prove a real backup is current or that production restore succeeds. Follow repository CI/security gates when implementation is authorized; do not access production or deploy as part of this spec.

## 15. Offene Entscheidungen und Empfehlung / Open decisions and recommendation

Recommendation: keep the existing API, server-authoritative capture queue and offline-only private backup key. Treat CSV as portability and encrypted DB-plus-receipts archive as recovery. Add the UI distinction and independent acceptance/drill evidence through `WP-014`; do not create a self-service restore endpoint or change auth/crypto architecture in this slice.

Open operational question: confirm with the owner/operator who holds the offline private key and who records the periodic decrypt/restore evidence; this is a runbook ownership decision, not a code blocker for acceptance tests. Open product question: whether to show a non-sensitive pending-capture count warning before clearing local browser data.

Stop if an implementation requires relaxing fresh passkey step-up, exporting secrets/audit/staging, silently dropping or reordering queued financial captures, treating DB-only restore as receipt-complete, putting private keys in server/repository/browser code, or introducing CRDT/E2EE scope. Any such change requires a separate explicit owner decision and security review.
