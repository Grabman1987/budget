# #486 — safe manual Dropbox scan: bounded source design

Source reviewed: `/workspace/impl-485-486-settings-navigation` at **07cd4c8984c25343dab801199ba30f0e08524448**. Read AGENTS, relevant SPEC/queue/security instructions, the implementation note, and GitHub issue #486 including the owner's Connections comment. This is design/source reconnaissance only: no repository changes, tests, executable checks, build, browser, provider operations, database operations or delivery actions.

## Decision

Implement “Jetzt abrufen” as a durable request to the **existing worker**, coordinated through the existing `payslip_scan` row. Do not create a scanner in the HTTP request process. Add a token-fenced SQLite lease to the same operational row so scheduled/manual work and overlapping worker processes share one claim protocol. No general job framework, new service, credentials UI or owner policy decision is needed.

The owner's 2026-10-16 #486 Connections comment already requests “Jetzt abrufen” for each source and one warning task per source error. This is authorization for the trigger. It does not authorize treating discovered PDFs as explicit manual uploads: preserve `source: 'dropbox'`, existing scope/dedup/review behavior, and never pass `automation: 'eligible'`. SPEC's 2026-10-21 automation directive limits that automatic-booking path to explicit manual PDF uploads.

## Existing mechanisms and gaps

- `apps/server/src/payslips/scanner.ts`: process-local `running`; persistent cursor/due time via `readPayslipScan`/`writePayslipScan`; 100-page cap; 02:30 UTC next daily scan; 15-minute retry for failures; one-minute continuation after page cap; cursor reset handling; eligible path/year/PDF filtering; hash dedupe; parser/scope full-scan triggers. An API-created scanner would bypass its process-local exclusion.
- `apps/worker/src/bank-sync-worker.ts`: one scanner, worker starts after migrations, polls every 30 seconds, runs bank sync first. The HTTP action can promise “queued,” not completion in 30 seconds. `apps/server/src/bank-sync/worker-process.ts` restarts failed worker processes.
- `packages/db/src/schema/payslip-intake.ts`: `payslip_scan` currently has only root, cursor, last/next times, counts and error class. `packages/db/src/repos/payslip-intake.ts:780` unconditionally upserts it: this must not remain the worker's unfenced write path.
- `apps/server/src/bank-sync/service.ts:632` demonstrates conditional SQLite claim + heartbeat without holding a DB transaction across network calls. Reuse that pattern, but **not** its unfenced heartbeat (`WHERE id` only): the Dropbox implementation needs an ownership token on heartbeat, progress, failure and release.
- `packages/db/src/write-lock.ts` explicitly says `writesHeld` is per process/Db handle; it cannot coordinate these processes. `app_setting` exists, but hiding a multi-field lease protocol in its arbitrary string values would not be simpler or safer than extending the operational scan row.

## Minimal persisted state and reservation

Extend `payslip_scan` with nullable `request_at`, `lease_token`, `lease_until`. A random unpredictable token is sufficient for compare-and-swap fencing; a separate integer generation is unnecessary if every protected DB mutation compares the current token. Root identity is part of every predicate. Keep existing cursor, counters, error classes and due schedule.

Use the existing `next_run_at` as the durable crash fallback: on claim set it to now + the existing 15-minute failure delay before the first await. Clear the consumed `request_at` in the same claim. If a worker dies, its cursor remains at the last committed page and the fallback ensures an automatic retry. An expired but non-null token identifies an abandoned run; a new manual request must not bypass that fallback. Existing error backoff likewise remains effective. Successful/failing completion replaces the fallback with the normal existing schedule and clears only its own token. After page-cap continuation, retain the one-minute continuation schedule.

Root subsequently reserved **0052_payslip_scan_coordination**. Author in `/workspace/impl-486-manual-scan`, branch `codex/impl-486-manual-scan`, based on **d6cb8e1c0555196c5dcdefa01784f621a4a0d521** (#519), which inherits the complete prior migration chain. Explicit dependencies: #604/0048 → #607/0049 → #514/0050 → #519/0051 → #486/0052. The inspected settings branch ends at 0047 and is not the schema implementation base. Root reported inventory confirmation that no 0052 exists; this reviewer did not apply any migration.

Exact additive schema paths: `packages/db/src/schema/payslip-intake.ts`, `packages/db/drizzle/0052_payslip_scan_coordination.sql`, `packages/db/drizzle/meta/_journal.json`, and `packages/db/drizzle/meta/0052_snapshot.json`, following the inherited migration metadata conventions. Nullable defaults preserve existing scan rows. Rollback compatibility does **not** make an old worker lease-aware: operational delivery must stop old worker processes before exposing the new trigger; routine restart/migration startup sequencing should guarantee that.

## Claim/request protocol

1. `POST /api/payslip-intake/scan`: strict empty request body; configured root/credentials come only from server configuration. In one short transaction initialize the singleton row if absent, then coalesce an existing pending request or active lease. Otherwise record `request_at`. Do not clear the cursor, change parser/scope markers, reset retry delay or start provider I/O. Return 202 with `queued`/`running`, or an actionable configured/backoff/busy status. Repeated pending/running requests do not enqueue additional work. No browser-provided root, cursor, schedule, password or force flag.
2. Both scheduled and manually requested work enter `PayslipScanner.tick` through the same conditional claim. Re-read authoritative due/root/request state inside claim; do not rely on a preceding read. Claim only when ownership is absent/expired and the run is due, full-scan-required, or manually requested, subject to the existing failure/abandoned-run retry boundary. Snapshot the current request, root, scope start and parser version. On root change, reset its cursor only while acquiring ownership; a stale worker from another root cannot update the new row.
3. Set a bounded lease (the existing bank pattern's two-minute TTL/30-second heartbeat is a reasonable technical starting point), renew only `WHERE id/root/token match AND lease_until > now`. A failed or zero-row renewal means ownership is lost; stop scheduling work, discard late results and do not “renew” an already expired lease. Each worker token is unique.
4. Fence cursor/count/schedule writes and release using the same token/root predicate, including the retry/catch/finally paths. Persist a page's next cursor only after all files on that page are handled under ownership. Retryable failures retain the previous cursor as today. An old worker must never overwrite the new owner's progress or clear its lease.
5. Keep request admission idempotent while active. Do not admit a second pending request during a run and then accidentally delete it on completion. The simple coalescing rule above avoids a request-generation counter. If later requirements allow “run again after this run,” add explicit generation semantics then.

## Fencing must cover intake effects, not only the cursor

A heartbeat alone is insufficient: a worker can pause during download/parsing, lose its lease, then resume. Recheck ownership after each await and before the next provider call. More importantly, check the lease token **in the same short DB transaction** as every scanner-triggered durable effect:

- `PayslipIntakeService.ingest` currently awaits evaluation and receipt storage before `stagePayslip`; add an internal optional scanner ownership context, checked in the staging transaction. Manual upload callers retain their current behavior.
- `PayslipIntakeService.reparse` must fence the `replaceParsedPayslip` transaction after parsing. Preserve its pending-state guard; do not overwrite a concurrent owner confirmation.
- Fence `reevaluatePayslipIntake`, generic source warning insertion, scan-start/parser markers and progress writes. Add a small optional transaction guard/context to the existing repository operations rather than duplicating intake writers. Lease loss must use a distinct control outcome so the scanner's generic error catch does not write a provider warning or backoff as a stale owner.
- Source-warning dedupe should check-and-insert in the fenced transaction, retaining one open `payslip-source` task and existing generic redacted text.

No SQLite transaction spans network, PDF extraction or filesystem awaits. A stale worker may finish an already-started read-only provider request or content-addressed receipt write; it must not commit intake/audit/marker changes. Existing receipt hash storage and intake unique SHA/content-hash constraints remain the idempotency foundation. This design promises one accepted writer/progress owner, not that lease expiry can retroactively cancel a network request. Preserve existing receipt orphan handling and retention; no cleanup/deletion policy change belongs here.

The current scanner writes `payslip.scan.start` **before** the full listing succeeds, despite its repository comment describing the last complete listing. Move that completion marker into the fenced full-list completion transaction, alongside the parser-version completion marker. Otherwise a crash can falsely mark a necessary full scan as complete. Preserve the old full-list restart/cursor-reset semantics when a listing fails.

## Endpoint security, status and exact files

`apps/server/src/app.ts:171` applies origin checks to state-changing API requests and a session guard to `/api/*`; its write-hold middleware also protects mutations. Keep those paths. Recommend passing the existing `passkeyGate` from `apps/server/src/api/index.ts` to the **new trigger only**, consistent with `/sources/crypto/refresh`; do not weaken or reclassify other payslip routes. No fresh step-up or credential return is needed. Source status remains an authenticated read. Handle SQLite contention as retryable/busy and expose only generic errors; never return paths, cursors, tokens, provider bodies, document text or secrets.

Implementation files:

- `packages/db/src/schema/payslip-intake.ts`, reserved SQL/journal/snapshot: additive lease/request columns.
- `packages/db/src/repos/payslip-intake.ts`: enqueue/claim/renew/fenced-progress/release helpers, scanner transaction guard, completion markers. Existing `repos/index.ts` already exports this module.
- `apps/server/src/payslips/scanner.ts`: shared admission, heartbeat, fenced page execution and loss-of-ownership exit.
- `apps/server/src/payslips/service.ts`: optional internal guard at scanner ingest/reparse commit boundaries, preserving manual upload/automation paths.
- `apps/server/src/payslips/source-warning.ts`: atomic scanner-fenced dedupe as needed.
- `apps/server/src/api/payslip-intake.ts`, `apps/server/src/api/index.ts`: POST trigger and safe `queued/running/manualAvailable/retryAt` status projection; no provider/scanner construction in the route.
- `apps/worker/src/bank-sync-worker.ts`: only minimal scheduling/wiring if required; existing 30-second polling suffices. A separate payslip timer is optional latency work, not necessary for safe enqueue.
- Later bounded UI integration belongs in `apps/web/src/reports/payslip-intake.tsx` (`SourceStatus`/Connections card): one trigger, disabled/pending state, query invalidation/polling and honest queued/running feedback. Coordinate that file with the root; do not touch the other agent's preference forms.
- `docs/implementation/settings-485-486-NOTVALIDATED.md`: update the known coordination gap and retain unvalidated status.

Crash/retry source acceptance scenarios, for later authorized validation: competing claims across two DB connections; duplicate clicks; worker crash before first page, during parse and after page commit; expired worker resuming after a replacement claim; heartbeat DB contention; root change; partial-page retry and cursor reset; full-scan completion-marker failure; concurrent owner intake decision; scheduled/manual scans never invoke upload automation. These are requirements only; none was executed here.
