# Migration 47 independent source correspondence review

Verdict: CLEAR by source inspection for this narrow migration scope, after two author corrections. No SQL execution, database opens, tests, installs or repository changes by reviewer. Runtime and rollback validation remain pending.

Reviewed HEAD cadfd183a53bf9ea99ddc5918fefb76c1f7b328f plus final 23-path manifest 58dfc242fa056fe780bb7ad1b8856476afa15c89f9b0a9d59d0fac512d55b1fb. All declared paths matched current byte hashes and modes. Financial/business behavior remains the whole financial reviewer's scope.

## Corrected findings
1. Initial SQL used inline UNIQUE for statement_automation_run.key, while Drizzle schema/snapshot declared statement_automation_run_key_unique. Author changed this to an explicit identically named UNIQUE INDEX. Correction diff 9a9cdcb24e5b21e865ff263cbd4b06f5785756bb30eaf53a5b7f00d3772125ea; corrected SQL SHA256 28e240ee96b8b23d2ee8759f216851749a950a1c649ef901bd1b74a4b6f51608. Resolved.
2. Initial rollback contract required only a caller transaction and deferred FKs despite rebuilding legacy settlement with a self-FK. Existing forward migrator explicitly documents FK-off before transaction as the safe rebuild protocol. Author now documents disposable-copy-only FK-off before BEGIN, whole-script transaction, precommit foreign_key_check and finally restore enforcement. Executable guard rejects FK-on before legacy drops; final zero-count guard checks pragma_foreign_key_check before script completion. Exact rollback-only delta in 741-rollback-copy-protocol-source/delta.diff. Resolved by source inspection; no observed runtime failure or rollback success claimed.

## Preservation and metadata
- Forward copy explicitly retains all 25 settlement columns, including identity, provenance, supersession, transfer/booking links and timestamps/deletion state. Existing four partial unique indices are recreated unchanged. Bonus/config/delivery tables are not rebuilt or removed.
- Snapshot 47 prevId matches snapshot 46 id. No existing table is removed; only settlement changes (nullable reference and new partial issued-identity index). Exactly three automation tables are added. Other snapshot sections are preserved except expected snapshot ids.
- Journal retains its complete prior prefix and appends only idx47/tag0047_statement_automation/when1792510000000. Rollback deletes that exact timestamp.
- New table column types/nullability/defaults/check expressions, FK targets and index predicates correspond to schema/snapshot. Bonus reference remains NOT NULL despite shared acceptedSource reference becoming nullable for settlement.
- Forward runner disables foreign_keys before migrating, checks foreign_key_check afterwards and finally restores enforcement (packages/db/src/client.ts).
- Rollback refuses any automation config/run/row, including soft-deleted rows, retained config/row audit history, and any null-reference or machine-origin settlement. Durable run rows survive financial Undo, so ordinary machine history remains guarded. It copies all legacy columns and restores original NOT NULL reference plus four indices. No silent history loss found in normal application paths inspected.

Required later validation: upgrade an actual through46 synthetic copy with populated legacy supersession chains and financial/receipt/delivery/audit rows; prove exact retained rows and FK integrity; rollback copy with no47 data; verify populated, soft-deleted and history-only47 guards reject atomically; verify FK enforcement restored on success and failure. This review does not execute or substitute for that validation.
