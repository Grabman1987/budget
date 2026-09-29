# Operations: deployment, backup, restore

Runbook for the owner. Everything here is about the production app on Fly.io. No real data, keys or tokens belong in this file or in the repo: secrets live only in Fly secrets and GitHub Actions secrets. App name `budget-fg` is a placeholder; replace it if you chose another one (also in `fly.toml`).

## 1. Architecture

```
GitHub main ──(Deploy workflow, FLY_API_TOKEN)──> Fly remote builder ──> image
                                                                          │
                     Fly machine (fra, shared-cpu-1x, exactly one)        ▼
                     ┌──────────────────────────────────────────────────────┐
  phone / desktop ──>│ docker-entrypoint.sh (root: chown /data, then `node`) │
     HTTPS, passkey  │   └─ litestream replicate -exec "node server.js"      │
                     │        ├─ server.js (Hono API + static web app)       │
                     │        └─ /data/budget.sqlite (WAL) on volume         │
                     └───────────────┬──────────────────────────────────────┘
                                     │ every second: new WAL frames (LTX files)
                                     │ daily: full snapshot, 30 days kept
                                     ▼
                         Tigris bucket (S3 compatible), prefix budget.sqlite/
```

- **One machine, one volume.** SQLite has a single writer. `fly.toml` mounts the volume `budget_data` at `/data`; never scale beyond one machine.
- **Litestream** runs as the parent of the server. It streams the WAL to Tigris continuously (loss window: about one second of writes on a crash, nothing on a clean stop). On SIGTERM it forwards the signal to the server, waits for it to exit and flushes the last frames; `kill_timeout = '30s'` in `fly.toml` gives it the time.
- **First start on an empty volume**: the entrypoint runs `litestream restore -if-db-not-exists -if-replica-exists` before the server, so a fresh volume is rebuilt from the bucket automatically. With an empty bucket (very first deploy) this is a no-op.
- **Replication switches on** when `BUCKET_NAME` is set (which `fly storage create` does) or `BUDGET_REPLICATE=1`. `BUDGET_REPLICATE=0` forces it off. Without it (local `docker run`, CI smoke test) the server just runs.
- If the restore fails for any reason other than "no backup yet" (wrong credentials, network), the container exits instead of starting an empty database over an existing backup. Fix the cause; Fly retries.
- **Second line of defence**: Fly takes daily volume snapshots (`fly volumes snapshots list`). A separate encrypted offsite copy is planned, see section 8.

Litestream is pinned to **0.5.17** in the `Dockerfile` (`ARG LITESTREAM_VERSION` plus the SHA-256 of the amd64 and arm64 tarballs, checked at build time). To upgrade: change the version, copy the two hashes from the release's `checksums.txt`, run `scripts/restore-test.sh` locally (CI does it too) and read the release notes for config changes. `litestream.yml` is the config (`/etc/litestream.yml` in the image).

## 2. Environment variables and secrets

Secrets are never written to `fly.toml`, the Dockerfile or the repo. `fly secrets list` shows names only; values cannot be read back.

| Name                                      | Kind                 | Purpose                                                                                                                                                             |
| ----------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BUDGET_SETUP_TOKEN`                      | **secret**           | One-time token that permits registering the first passkey. Unset = bootstrap disabled. Long random value (section 3).                                               |
| `BUDGET_ORIGIN`                           | `fly.toml` `[env]`   | Exact public origin, `https://budget-fg.fly.dev`. Required in production; used for WebAuthn and the CSRF origin check.                                              |
| `BUDGET_RP_ID`                            | `fly.toml` `[env]`   | WebAuthn relying party id, `budget-fg.fly.dev`. Defaults to the host of `BUDGET_ORIGIN`. Changing it invalidates every registered passkey.                          |
| `BUDGET_TRUST_PROXY`                      | `fly.toml` `[env]`   | `1` behind the Fly proxy so the `Fly-Client-IP` header is used for rate limits.                                                                                     |
| `DATA_DIR`                                | image / `fly.toml`   | Directory of the volume, `/data`. The entrypoint chowns it to `node`.                                                                                               |
| `DATABASE_PATH`                           | optional             | Database file, default `$DATA_DIR/budget.sqlite`. Leave unset in production: with replication on the entrypoint refuses any other path.                             |
| `PORT`                                    | image / `fly.toml`   | HTTP port, `3000` (matches `internal_port`).                                                                                                                        |
| `WEB_DIR`                                 | image                | Built web app, `/app/web`.                                                                                                                                          |
| `BUDGET_MIGRATIONS_DIR`                   | image                | SQL migrations applied at start, `/app/drizzle`.                                                                                                                    |
| `BUDGET_DEBUG_API`                        | dev only             | `1` enables a read-only debug endpoint. **Must stay unset in production.**                                                                                          |
| `NODE_ENV`                                | image                | `production`.                                                                                                                                                       |
| `BUCKET_NAME`                             | **secret** (by Fly)  | Tigris bucket. Its presence turns replication on.                                                                                                                   |
| `AWS_ENDPOINT_URL_S3`                     | **secret** (by Fly)  | Tigris endpoint, `https://fly.storage.tigris.dev`.                                                                                                                  |
| `AWS_ACCESS_KEY_ID`                       | **secret** (by Fly)  | Bucket access key. Litestream reads it directly.                                                                                                                    |
| `AWS_SECRET_ACCESS_KEY`                   | **secret** (by Fly)  | Bucket secret key. Litestream reads it directly.                                                                                                                    |
| `AWS_REGION`                              | secret (by Fly)      | Set to `auto` by Fly; `litestream.yml` hard-codes `auto`, so it is not used.                                                                                        |
| `LITESTREAM_ACCESS_KEY_ID` / `..._SECRET_ACCESS_KEY` | optional override | Litestream's own names; only needed if you want keys different from the `AWS_*` pair.                                                                     |
| `BUDGET_REPLICATE`                        | optional             | `1` force replication on, `0` force off, unset = on iff `BUCKET_NAME` is set.                                                                                       |
| `BUDGET_MAINTENANCE`                      | temporary            | Any value: machine and volume stay up, but server and Litestream do not run (section 5).                                                                            |
| `LITESTREAM_CONFIG`                       | optional             | Config path, default `/etc/litestream.yml`.                                                                                                                         |

`fly storage create` sets exactly the five Fly-side secrets `BUCKET_NAME`, `AWS_ENDPOINT_URL_S3`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`. Check with `fly secrets list --app budget-fg` after creating the bucket; if Fly ever changes these names, adjust `litestream.yml` and this table.

The Tigris bucket can also hold receipts and payslips (SPEC section 9). Litestream only writes below the prefix `budget.sqlite/`; give receipts another prefix and never run lifecycle rules that delete under `budget.sqlite/`.

## 3. First deploy checklist

Run in PowerShell (or any shell) from the repo folder. Do the steps in this order.

1. **App and volume**

   ```
   fly apps create budget-fg
   fly volumes create budget_data --app budget-fg --region fra --size 1
   ```

2. **Object storage** (creates a private bucket and sets the five secrets on the app)

   ```
   fly storage create --app budget-fg
   fly secrets list --app budget-fg
   ```

   Expect `BUCKET_NAME`, `AWS_ENDPOINT_URL_S3`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` in the list.

3. **Setup token.** Generate a long random value, keep it in your password manager, then set it. Do not put it in chat, a file in the repo or a command you paste elsewhere.

   ```
   # bash / WSL / macOS
   openssl rand -base64 32
   # Windows PowerShell
   $b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)

   fly secrets set BUDGET_SETUP_TOKEN="<the value>" --app budget-fg
   ```

   (With no machine yet Fly stages the secrets; they apply at the first deploy.)

4. **Non-secret settings in `fly.toml` `[env]`**: `BUDGET_ORIGIN = 'https://budget-fg.fly.dev'`, `BUDGET_RP_ID = 'budget-fg.fly.dev'`, `BUDGET_TRUST_PROXY = '1'` (with your app name). The server refuses to start in production without `BUDGET_ORIGIN`.

5. **Deploy token for GitHub**

   ```
   fly tokens create deploy --app budget-fg
   ```

   Copy the output straight into GitHub: repo **Settings > Secrets and variables > Actions > New repository secret**, name `FLY_API_TOKEN`. Nowhere else.

6. **First deploy** (single machine, because the volume is single-attach)

   ```
   fly deploy --ha=false
   fly machine list --app budget-fg      # exactly one machine
   fly status --app budget-fg
   fly logs --app budget-fg              # look for "replicating to" (type=s3)
   ```

   From then on every merge to `main` deploys via `.github/workflows/deploy.yml`.

7. **Check health and replication**

   ```
   curl -fsS https://budget-fg.fly.dev/health
   fly ssh console --app budget-fg -C "litestream ltx -config /etc/litestream.yml -level all /data/budget.sqlite"
   ```

   The second command lists LTX files with creation times; at least one (the first snapshot) must exist within a minute of start. If `fly ssh console` sessions do not carry the app's environment on your setup, open a shell and check `printenv BUCKET_NAME` before concluding anything.

8. **First passkey**, phone first (the device you will always carry):
   1. Open `https://budget-fg.fly.dev` in the phone browser. With no passkey registered the app shows the setup step.
   2. Enter the `BUDGET_SETUP_TOKEN` value, name the device, confirm the passkey prompt (Face ID, fingerprint or the password manager).
   3. The app shows **ten recovery codes once**. Store them offline (password manager entry plus a printout). Each works once.
   4. On the desktop: open the same URL. The browser cannot log in yet, so on the phone go to **Einstellungen > Sicherheit**, add a passkey (needs a fresh step-up confirmation) and complete the prompt on the desktop, or use a recovery code on the desktop and add its passkey from there.
   5. When at least two devices work, remove the bootstrap token: `fly secrets unset BUDGET_SETUP_TOKEN --app budget-fg`. The server only accepts it while no passkey is active, but an unset token also removes the temptation to keep it around.

9. **Prove restore works before real data arrives**: run section 4's drill once (`scripts/restore-test.sh` locally, then a real restore of the fresh bucket into a temp file).

## 4. Restore

All procedures use the Litestream binary inside the image (`/usr/local/bin/litestream`, config `/etc/litestream.yml`) or a copy on your own machine. Use `-dry-run` first to see the plan without writing.

Verify every restored file before trusting it:

```
# on the machine (no sqlite3 CLI in the image; better-sqlite3 is there)
cd /app && node -e "const D=require('better-sqlite3');const d=new D(process.argv[1],{readonly:true});console.log(d.pragma('integrity_check',{simple:true}), d.pragma('journal_mode',{simple:true}))" /data/restore/budget.sqlite
# on your machine
sqlite3 budget-restored.sqlite 'PRAGMA integrity_check;'    # must print: ok
```

### 4.1 Lost or corrupt volume: latest state (automatic)

The entrypoint restores by itself when the volume has no database.

```
fly machine list --app budget-fg                    # note the machine id
fly machine stop <machine-id> --app budget-fg
fly machine destroy <machine-id> --app budget-fg
fly volumes list --app budget-fg                    # note the old volume id
fly volumes destroy <old-volume-id> --app budget-fg
fly volumes create budget_data --app budget-fg --region fra --size 1
fly deploy --ha=false
fly logs --app budget-fg                            # restore, then "replicating to"
curl -fsS https://budget-fg.fly.dev/health
```

Alternative when the old volume is only damaged: `fly volumes snapshots list <volume-id>` and `fly volumes create budget_data --snapshot-id <id> ...` restores Fly's own daily snapshot (up to a day old); Litestream then continues from that state.

### 4.2 Point in time (undo a bad import or a deleted month)

Non-destructive first: restore into a side file and look at it, production keeps running.

```
fly ssh console --app budget-fg
# inside the machine; time is UTC, RFC 3339
mkdir -p /data/restore
litestream restore -config /etc/litestream.yml -dry-run -timestamp 2026-10-05T14:30:00Z -o /data/restore/budget.sqlite /data/budget.sqlite
litestream restore -config /etc/litestream.yml -timestamp 2026-10-05T14:30:00Z -o /data/restore/budget.sqlite /data/budget.sqlite
# verify (see above), then copy rows out or download it:
exit
fly ssh sftp get /data/restore/budget.sqlite ./budget-pit.sqlite --app budget-fg
```

`litestream ltx -config /etc/litestream.yml -level all /data/budget.sqlite` shows which transaction ids and times exist; `-txid <hex>` can replace `-timestamp`. History reaches back 30 days (`snapshot.retention` in `litestream.yml`). Delete `/data/restore` afterwards; the volume is small.

To **replace the live database** with such a state (rollback), use maintenance mode so nothing writes meanwhile:

```
fly secrets set BUDGET_MAINTENANCE=1 --app budget-fg      # machine restarts, server and Litestream stay off
fly ssh console --app budget-fg
mkdir -p /data/old
for f in budget.sqlite budget.sqlite-wal budget.sqlite-shm budget.sqlite-litestream; do [ -e "/data/$f" ] && mv "/data/$f" /data/old/; done
litestream restore -config /etc/litestream.yml -timestamp 2026-10-05T14:30:00Z /data/budget.sqlite
# verify integrity here, exit
fly secrets unset BUDGET_MAINTENANCE --app budget-fg      # normal start: chown, no restore needed, replication resumes
```

Keep `/data/old` until you are sure (the bad state is evidence and a fallback), then remove it. Replication continues in the same bucket prefix: the rolled-back state becomes the new latest and earlier states stay restorable by timestamp.

### 4.3 Restore on your own machine (bucket still intact, Fly unavailable)

Install the same Litestream version from the GitHub release (Windows and Linux builds exist), get bucket name, endpoint and keys from the Tigris dashboard (`fly storage dashboard <bucket>`) and export them as `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in your session only:

```
litestream restore -o ./budget-restored.sqlite "s3://<bucket>/budget.sqlite?endpoint=fly.storage.tigris.dev&region=auto"
sqlite3 ./budget-restored.sqlite 'PRAGMA integrity_check;'
```

Add `-timestamp <utc>` for a point in time. To put that file on a new volume: run 4.1 first with `BUDGET_MAINTENANCE=1` set, `fly ssh sftp shell` to upload it to `/data/budget.sqlite`, then unset the flag (the entrypoint chowns it).

### 4.4 Drills

- `scripts/restore-test.sh` (also CI job `restore-test`): no cloud, proves the pinned binary can back up and restore a WAL database. Set `LITESTREAM_BIN` if it is not on `PATH`.
- Quarterly: restore the real bucket into a temp file (4.2 side file or 4.3), run `PRAGMA integrity_check`, compare a row count with the app. A backup that was never restored is not a backup.

## 5. Maintenance mode

`fly secrets set BUDGET_MAINTENANCE=1` restarts the machine into an idle state: volume mounted and owned by `node`, no server, no Litestream, health check failing (the site is down). Use it for offline surgery over `fly ssh console`, then `fly secrets unset BUDGET_MAINTENANCE`. Do not leave it on.

## 6. Routine checks

| What                     | Command                                                                                               | Healthy                                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| App up                   | `curl -fsS https://budget-fg.fly.dev/health`; `fly status --app budget-fg`; `fly checks list`          | 200, one machine `started`, check `passing`                                                                 |
| Replication state        | `fly ssh console --app budget-fg -C "litestream status -config /etc/litestream.yml"`                  | database `ok`, local txid advancing after writes, small WAL size                                            |
| Replication lag / recency | `fly ssh console --app budget-fg -C "litestream ltx -config /etc/litestream.yml -level all /data/budget.sqlite"` | newest `created` within seconds of your last write (no writes = no new files; a daily snapshot still appears) |
| Litestream errors        | `fly logs --app budget-fg`                                                                            | no repeated `error` lines from litestream (credentials, endpoint)                                           |
| Volume space             | `fly ssh console --app budget-fg -C "df -h /data"`                                                    | far below 1 GB                                                                                              |
| Backup tooling           | CI job `restore-test` green on every PR                                                               | green                                                                                                       |

Weekly glance at the two commands with output is enough; there is no automatic alerting yet.

## 7. Key rotation and access hygiene

- **Tigris keys**: in the Tigris dashboard (`fly storage dashboard <bucket>`) create a second access key with read/write on the bucket, set it as `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` (`fly secrets import` reads `NAME=value` lines from stdin, which keeps values out of your shell history), wait for the restart, check `litestream ltx` shows new files, then delete the old key in the dashboard.
- **Fly deploy token**: `fly tokens list --app budget-fg`, create a new one (`fly tokens create deploy --app budget-fg`), replace the GitHub secret `FLY_API_TOKEN`, then `fly tokens revoke <id>` for the old one. Rotate at least yearly and whenever a laptop is lost.
- **Setup token**: only relevant while bootstrapping. Set a fresh value when you need to bootstrap again (section 9), unset it afterwards.
- **Passkeys and sessions**: revoke lost devices in **Einstellungen > Sicherheit**. Regenerate the ten recovery codes after using one or when the printout may have been seen.
- Fly and GitHub accounts are the trust root (they can reach the volume and the secrets): keep two-factor authentication on for both.

## 8. Planned follow-up: nightly age-encrypted copy (SPEC section 9)

Not implemented. Goal: a backup that survives loss of the Fly account, the Tigris bucket or a bad Litestream state, and that a stolen bucket key cannot read.

- A job in `apps/worker` (P4 scheduler with catch-up) at night: take a consistent snapshot with the SQLite backup API (`better-sqlite3` `db.backup()` or `VACUUM INTO`), never copy the live file.
- Encrypt with `age` to the owner's **public** key(s) (`age -r age1...`). Only the public key is on the server; the private key stays offline in the password manager plus a paper copy. The server cannot decrypt its own backups.
- Upload to a **different provider or account** than Tigris (for example a second S3-compatible bucket), or let a machine of the owner pull it. Credentials for that target are separate secrets, write-only if the provider allows.
- Retention: 30 daily, 12 monthly, prune by the job. Name files by UTC date.
- Monitoring: the run writes its result and size to the inbox (Posteingang) so a missed night is visible; failures never block the app.
- Drill: twice a year decrypt one file with the offline key and run `PRAGMA integrity_check`.

## 9. Lost all passkeys

Order of attempts, least invasive first.

1. **Recovery code.** On the login screen choose the recovery-code login and enter one of the ten codes (single use). Then add a new passkey in **Einstellungen > Sicherheit**, revoke the lost devices and regenerate the recovery codes.
2. **No code left: re-run the bootstrap** by deactivating the old credentials in the database. Whoever can do this already controls your Fly account, so treat it as an owner-only procedure. It needs no maintenance mode: SQLite allows a second short writer and Litestream sees the change through the WAL.

   ```
   # 1. Mark the moment (UTC) in case something goes wrong; the bucket has full history.
   # 2. Set a new setup token (the app restarts):
   fly secrets set BUDGET_SETUP_TOKEN="<new long random value>" --app budget-fg
   # 3. Deactivate passkeys, sessions and unused recovery codes (rows are kept for the audit trail):
   fly ssh console --app budget-fg
   cd /app && node -e "
   const D = require('better-sqlite3');
   const db = new D('/data/budget.sqlite');
   db.pragma('busy_timeout = 5000');
   const now = new Date().toISOString();
   db.transaction(() => {
     for (const sql of [
       'update passkey set revoked_at = ? where revoked_at is null',
       'update auth_session set revoked_at = ? where revoked_at is null',
       'update recovery_code set revoked_at = ? where revoked_at is null and used_at is null',
     ]) console.log(sql.split(' ')[1], db.prepare(sql).run(now).changes);
   })();
   db.close();
   "
   exit
   ```

   The app now has zero active passkeys, so the setup screen accepts the token again. Register a new passkey (section 3, step 8), store the new recovery codes, then `fly secrets unset BUDGET_SETUP_TOKEN --app budget-fg`.

   Notes: only `revoked_at` is set; no financial data is touched. If the statements fail because a table name differs (schema changed), read `packages/db/src/schema/auth.ts` and adapt, do not delete rows. To undo a mistake, restore a point in time (4.2).
3. **Database itself lost too**: restore first (section 4), then step 2.
