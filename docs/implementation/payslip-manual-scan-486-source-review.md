# #486 manual Dropbox scan — independent source review

Reviewed commit **04f8ab9aa9942aa382a4e67e65ce148f2a28e8dd** against **d6cb8e1c0555196c5dcdefa01784f621a4a0d521**, in `/workspace/impl-486-manual-scan`. Scope: the 13 changed files, their relevant scanner/service/repository/auth/worker/UI callers, migration ancestry, and the prior `486-manual-scan-design.md`. This is a pinned source review. No tests, executable validation checks, build, type checking, browser, database, migrations, provider operations, CI or delivery actions were performed. No repository files were changed.

## Findings requiring bounded correction

### P2 — schedule retry/continuation from completion, not tick start

`apps/server/src/payslips/scanner.ts:223,229,237,248` calculates retry, page-cap continuation and the next daily slot from the `now` captured at the beginning of `tick`. Provider calls, PDF parsing and up to 100 pages can outlive the one-minute continuation or 15-minute retry interval; heartbeat renewal deliberately permits a long run. A failure after 15 minutes therefore publishes a deadline already in the past and the next worker tick/manual request can immediately resume, bypassing the promised backoff. The page-cap case has the same defect after just one minute. A scan crossing the daily scheduling boundary can also choose an elapsed daily slot.

Minimal correction: sample the current clock when scheduling each completion/failure/continuation and feed that time to the existing interval and daily-slot helpers. Preserve the existing durations and schedule semantics. Claim-time crash fallback remains relative to claim time; it serves a different purpose. If `lastScanAt` is intended to describe progress/completion, likewise avoid repeatedly writing the tick-start time as current progress.

### P2 — mismatched interrupted full-scan identity can reuse the wrong cursor

`packages/db/src/repos/payslip-intake.ts:858–878` treats a matching `fullScanKey` as an interrupted full scan, but ignores a non-null *mismatching* key when the last-completed scope/parser markers happen to match the current configuration. Example: scope A was completed; scope changes to B and a full scan stops partway through; scope changes back to A before resumption. `stale` and `parserStale` are now false, `continuingFull` is false, and `full` becomes false. The claim clears `fullScanKey` but retains B's partial cursor, so it neither restarts A nor honestly completes the interrupted scan.

Minimal correction: a non-null in-progress key that differs from the current key must force a fresh full scan and null cursor, even when completed markers match. Keep matching-key continuation and its delay. Root changes already force this reset. Include changes to/from a null scope in the identity handling rather than relying solely on `stale`'s non-null condition.

### P2 — preserving the mounted form breaks config Undo synchronization

`apps/web/src/reports/payslip-intake.tsx:762` now keeps the source form mounted during refetch, which usefully preserves drafts during the new 30-second polling. However, `PayslipSourceForm` at lines 951 onward initializes its account/payee/wage-type state from `initial` only once (including lines 960–961), with no synchronization when persisted config actually changes. The existing `useBudgetWrite` save/Undo/Redo path invalidates `['payslip-source']`. Save B, then Undo to A: the server and refreshed props are A, but the form remains B; it can misrepresent the selected automation payee/mappings and a subsequent save silently reapplies B. Previously the fetching transition remounted the form.

Minimal correction: retain mounting/drafts for status-only polls, but reconcile actual persisted config changes, including Undo/Redo, with form state. A stable key or explicit synchronization based on the persisted config identity/content is sufficient if it does not reset drafts whenever unrelated scan status changes. Do not key the form to the entire polling response.

### P2 — old-root statistics are presented as the configured source's scan

`apps/server/src/api/payslip-intake.ts:127–153` correctly checks root identity for `dropboxConnected`, but returns `lastScanAt`, counts and error class from the singleton scan row regardless of the configured root. Moreover, claim replacement at `packages/db/src/repos/payslip-intake.ts:870–878` changes `root` and clears the cursor/error without clearing old-root `lastScanAt/filesFound/errors`. After configuration changes, the Connections card therefore shows the previous source's date/counts, and even a root-filtered DTO would retain them after the new root is claimed until its first progress commit.

Minimal correction: hide root-specific historical statistics/errors while persisted and configured roots differ, and reset those fields when claim ownership replaces the root. Keep the global active-lease/backoff admission rules; filtering presentation must not permit overlapping work or bypass an abandoned worker's delay. The API does not expose the root path or secrets; this is a status correctness defect, not a credential disclosure.

## Source conclusions outside those findings

- Request admission is a short durable transaction on the existing singleton row; repeated queued/running requests coalesce. HTTP does not create a scanner or call Dropbox. The existing worker remains the execution owner.
- Random tokens, root matching and unexpired lease checks fence renewals and protected transactions. Intake staging, reparse replacement, reevaluation, warning insertion and progress/completion markers use the transaction guard. No reviewed SQLite transaction spans provider/PDF/filesystem awaits. Under WAL, a read snapshot that loses a write race fails rather than committing a stale guarded write. Runtime contention and crash behavior remain unvalidated.
- Late awaited provider/PDF results cannot commit intake state after lease loss through the reviewed service paths. Content-addressed receipt writes already in flight may finish; the implementation does not claim cancellation or change receipt retention. A lost lease is distinct from a source failure and does not publish stale warnings/progress.
- Successful full completion writes scan-start/parser markers together with fenced progress; page-cap continuation preserves its full-scan identity. The mismatch defect above is the remaining identified scope-transition gap.
- New POST `/scan` receives the existing passkey-session gate, and existing application middleware supplies session, same-origin mutation protection and write-hold rejection. It accepts only an empty strict object and server-derived root/configuration. Recovery-only sessions cannot use the new trigger. Status remains an authenticated read. Responses contain no lease token, cursor, credentials, document content or provider payload.
- Scanner ingest retains `source: 'dropbox'` and never requests manual-upload automation. Existing review/idempotency behavior and upload authorization paths remain separate. The UI promises queued/running work rather than a completed scan.

## Migration and inheritance review

Reserved `0052_payslip_scan_coordination` is additive: SQL and schema add the same four nullable text columns (`request_at`, `lease_token`, `lease_until`, `full_scan_key`) to `payslip_scan`. The journal appends index 52 with timestamp `1792560000000`; no earlier migration is rewritten.

Compared the textual 0052 snapshot against inherited 0050 (0051 has no snapshot). The only schema changes are the four scan columns and the `transfer_fx` table introduced by inherited 0051, with its fields/defaults, primary/foreign key, three uniqueness indexes, distinct-booking check and JSON validity check matching 0051 SQL/current schema. No unrelated 0050 schema is removed or altered. Snapshot `prevId` points to the actual available 0050 snapshot; the documentation discloses that inherited gap. Dependencies remain #604/0048 → #607/0049 → #514/0050 → #519/0051 → #486/0052.

The rollback is explicitly disposable-copy only, requires stopped workers/transactional use, and guards against later migrations or pending/leased/in-progress state before removing the columns. It is not a claim of production downgrade safety or migration-journal repair. No migration, rollback, schema generator or startup sequence was executed. Deployment must replace old unfenced workers before exposing this trigger; old binaries do not gain lease awareness from nullable columns.

## Disposition

Request the four bounded source corrections above, then review their precise delta. No additional owner financial/product/retention decision is needed. This report provides no runtime, database-application, provider, browser or release approval claim.

## Follow-up: correction delta independently reviewed

Reviewed **04f8ab9aa9942aa382a4e67e65ce148f2a28e8dd..9664552b062391c070ca8315286ff71a2b631063**, pinned Git source, on 2026-10-22. Scope was the six-file correction delta and relevant existing config/read/write callers. **All four findings above are addressed in source; no further actionable issue was identified in this bounded delta.**

- Retry and page-cap deadlines now use `Date.now()` at the write site; the next daily slot uses a fresh `Date`, and progress timestamps likewise use current time. Claim-time crash fallback remains unchanged.
- A non-null mismatching full-scan key now sets `interruptedDifferentFull`, forcing a full scan with a null cursor, including the completed-A/partial-B/return-to-A scenario and in-progress null/non-null scope transitions. Matching-key continuation and its existing delay are preserved. Root replacement additionally clears its previous timestamp and counts.
- `PayslipSourceForm` is keyed only by serialized persisted config. Status-only refetches keep the same key and drafts; actual config changes returned after Save/Undo/Redo change the key and reinitialize the form. The existing config getter returns stable parsed persisted data, and the existing write/undo/redo hook invalidates the source query. No entire-response key or polling-driven unconditional reset was added.
- Status hides historical timestamp/counts/error class when the persisted root differs from the configured root. Global running/queued/backoff calculations and request admission remain independent of that presentation filter, so this correction does not admit overlapping scans or bypass retry delay.

This delta adds no migration/schema changes and does not alter endpoint authorization, lease predicates, intake transaction fences or automation eligibility. The original migration source conclusions therefore remain applicable without a new executable migration claim. The archived original review correctly describes the original pinned checkpoint; the NOTVALIDATED note describes the corrections and still disclaims runtime validation.

Limits: source inspection only; no tests, type/build checks, browser, database/migration, provider or CI operations; no repository modifications. This closes the four source findings, not runtime acceptance or deployment gates.
