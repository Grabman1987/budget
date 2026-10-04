---
name: live-op
description: Perform an explicitly approved audited operator change on a Fly production app.
argument-hint: <app> <command> <private JSON file> <expected changes>
disable-model-invocation: true
user-invocable: true
---

# Audited production operator change

Use `$ARGUMENTS` only as context. First confirm owner approval for the exact app,
command, input digest, expected counts/values and recovery plan. Existing explicit
approval for that scope is sufficient; invocation alone without those details is
not approval for an unspecified production write. Prepare a reviewable dry-run plan
before requesting final approval. Read SPEC.md, docs/ops.md and the command's schema
and audit/savepoint implementation. Never call real providers, invent expectations,
or copy private inputs/results into the public repo, commits, PRs or CI logs.
Keep keys in environment variables / Fly secrets; document names only.

Use an authorized private working directory outside the repository for transfers
and evidence. Examples below use placeholders, never owner names, app identifiers,
local private paths or financial values. Select the same production machine/volume
for every command, and confirm the deployed revision supports the requested CLI.

## Shell preparation

Use `fly ssh console -a <app> -C '<remote command>'` and `fly ssh sftp get/put -a
<app> ...`. Remote commands run in Linux even when the local terminal is Windows.
For Git Bash set `export MSYS_NO_PATHCONV=1` before Fly commands so `/data` and `/app`
are not converted to Windows paths. In PowerShell, use `$env:MSYS_NO_PATHCONV='1'`;
PowerShell has no MSYS path conversion, but this is useful for child Git Bash calls.
Pass `NODE_OPTIONS=--max-old-space-size=220` **inside the remote command** for Node
backup and migration processes on small machines; a local variable is not propagated
through SSH. In PowerShell use literal single-quoted remote strings to preserve
remote `$DATA_DIR` / `$DATABASE_PATH`; in Git Bash likewise quote for the remote shell.
Use `/app` as the remote cwd so better-sqlite3 resolves from the installed app.

## Disk and backup gate

1. Run `df -h /data` on the target. Inspect the database, WAL and `pre-*.sqlite`
   sizes and filesystem free bytes. Reserve enough room for the online backup,
   compression/transfer scratch, input and expected WAL growth. Stop if insufficient.
2. Keep **at most two `pre-*.sqlite` backups** on the server, including the one about
   to be created. Preserve the newest known-good backup. Before creating another,
   archive older backups until at most one remains. For each older backup: gzip to
   a temporary remote `.gz` without deleting the sqlite source (`gzip -c`), record
   `sha256sum <archive>`, then `fly ssh sftp get -a <app> <remote-archive>
   <private-local-archive>`. Compare local SHA-256 (`sha256sum` in Git Bash/Linux or
   `Get-FileHash -Algorithm SHA256` in PowerShell) to the remote digest; also verify
   the gzip stream (`gzip -t`, or private Node zlib decompression on Windows).
   Only after equality and successful decompression delete the exact archived
   source and remote gzip. Never delete based on filenames alone, a failed download
   or an unverified digest. If space cannot accommodate compression, stop for an
   owner-approved alternative. Do not remove Litestream/encrypted backups.
3. Create a unique `pre-<operation>-<timestamp>.sqlite` with better-sqlite3's online
   `.backup()`, using the app's actual `DATABASE_PATH` (or its documented
   `$DATA_DIR/budget.sqlite` default). Never copy a live WAL database with cp.
   Example **remote** Node code (use an authorized temporary `.cjs` script if shell
   quoting is inconvenient; resolve dependencies from the installed app):

   ```js
   const { createRequire } = require('node:module');
   const Database = createRequire('/app/migrate-cli.js')('better-sqlite3');
   const path = require('node:path');
   const source = process.env.DATABASE_PATH ?? path.join(process.env.DATA_DIR ?? '/data', 'budget.sqlite');
   const db = new Database(source, { readonly: true, fileMustExist: true });
   db.backup('/data/pre-<operation>-<timestamp>.sqlite')
     .then(() => db.close())
     .catch(() => { db.close(); process.exitCode = 1; });
   ```

   Run with the remote heap limit, await exit 0, verify the backup exists, and
   perform read-only integrity/FK checks on the backup. Record digest and baseline
   counts/values privately. If backup fails, stop before any production write.

## Input and execution gate

1. Capture independent before counts, native-currency balances and dated portfolio
   values/quality flags. Record the owner's intended deltas and reconciliation date.
   If concurrent writes or market refreshes prevent a meaningful comparison, stop
   and agree a controlled observation window; never stop services without approval.
2. Ensure `/data/migration` contains no other operation's input. Create it with
   owner-only permissions (`umask 077`), upload the exact JSON with
   `fly ssh sftp put -a <app> <private-local-json> /data/migration/input.json`, and
   compare its local SHA-256 with remote `sha256sum /data/migration/input.json`.
   Stop on mismatch; do not print file content. Set remote file permissions to 600.
3. Run this **remote** command from `/app`:

   ```sh
   env NODE_OPTIONS=--max-old-space-size=220 node /app/migrate-cli.js <command> --file /data/migration/input.json --dry-run
   ```

   Add `--details` only when the command supports it and the private operator
   terminal is authorized to display sensitive details. Exit 3/skips, unexpected
   creates/updates/deletes, ambiguous matches, invariant/validation errors, or counts
   different from approved expectations are a stop even if some entries would succeed.
   Commands such as `book`/`move-money` may add again on replay: only proceed with
   a command/input whose stable identity makes this operation idempotent, or stop
   and prepare an idempotent supported path. Do not assume every CLI is replay-safe.
4. Present the verified dry-run counts/digest and expected values to the owner if
   approval for this exact result is still missing. With approval, repeat the exact
   command without `--dry-run`; preserve private output and audit group IDs. Stop
   on errors/skips and reconcile any partial audited application before retrying.
5. Re-run the **same input as a dry run**: require all entries unchanged (or the
   command's documented equivalent), zero new writes and zero skips. Otherwise
   stop and report the idempotency failure; never blindly run it again for real.
6. Compare after counts, balances, split/transfer totals and portfolio values with
   the independent before snapshot plus approved deltas. Preserve valuation-quality
   flags and currency/date semantics. An unexplained value change is a stop; discuss
   the audited undo/recovery path, never restore a backup over production blindly.
7. After reconciliation, remove only this operation's input and temporary scripts.
   Confirm `/data/migration` is empty, then remove the directory with `rmdir`.
   On failure, secure/remove sensitive staging when safe and report any retained
   staging privately. Retain the verified pre-operation backup (max two) and private
   audit/reconciliation evidence. Report only generic counts/status publicly.
