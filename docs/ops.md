# Operations: deployment, backup, restore

Runbook for the owner. Everything here is about the production app on Fly.io. No real data, keys or tokens belong in this file or in the repo: secrets live only in Fly secrets and GitHub Actions secrets. App name `budget-fg` is a placeholder; replace it if you chose another one (also in `fly.toml`).

## 1. Architecture

```
GitHub main ──(CI green, then Deploy workflow, FLY_API_TOKEN)──> Fly remote builder ──> image
                                                                          │
                     Fly machine (fra, shared-cpu-1x, exactly one)        ▼
                     ┌──────────────────────────────────────────────────────┐
  phone / desktop ──>│ docker-entrypoint.sh (root: chown /data, then `node`) │
     HTTPS, passkey  │   └─ litestream replicate -exec "node server.js"      │
                     │        ├─ server.js (Hono API + static web app)       │
                     │        │   └─ import-worker.js (import tasks, thread) │
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
- **Replication is mandatory in production**: `fly.toml` sets `BUDGET_REPLICATE = '1'`. If `BUCKET_NAME` is missing the container exits at start with a clear message instead of running without backup. `BUDGET_REPLICATE=0` forces it off (local `docker run`, CI smoke test); unset means "on iff `BUCKET_NAME` is set".
- If the restore fails for any reason other than "no backup yet" (wrong credentials, network), the container exits instead of starting an empty database over an existing backup. Fix the cause; Fly retries.
- **Auth audit** (`auth_event`): failures anyone can trigger (foreign origin, rate limit, failed login) are merged into one row per kind and client per 10 minutes with a counter, and capped overall; details are cut to 100 characters; rows older than 180 days are deleted at start and daily. A flood cannot fill the volume.
- **Second line of defence**: Fly takes daily volume snapshots (`fly volumes snapshots list`), and the server writes a nightly **age-encrypted copy** to `encrypted/` in the bucket that only the owner's offline key can open (section 8).

Litestream is pinned to **0.5.17** in the `Dockerfile` (`ARG LITESTREAM_VERSION` plus the SHA-256 of the amd64 and arm64 tarballs, checked at build time). To upgrade: change the version, copy the two hashes from the release's `checksums.txt`, run `scripts/restore-test.sh` locally (CI does it too) and read the release notes for config changes. `litestream.yml` is the config (`/etc/litestream.yml` in the image).

## 2. Environment variables and secrets

Secrets are never written to `fly.toml`, the Dockerfile or the repo. `fly secrets list` shows names only; values cannot be read back.

| Name                                      | Kind                 | Purpose                                                                                                                                                             |
| ----------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BUDGET_SETUP_TOKEN`                      | **secret**           | One-time token that permits registering the first passkey. Unset = bootstrap disabled. Long random value (section 3).                                               |
| `BUDGET_PEPPER`                           | **secret**           | HMAC key for recovery-code hashes and the IP hashes in the auth audit. **Required in production** (the server refuses to start without it), at least 32 characters; 32 random bytes, base64 (section 3 step 3). Changing it invalidates all recovery codes (section 7). |
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
| `BUCKET_NAME`                             | **secret** (by Fly)  | Tigris bucket. Required because `BUDGET_REPLICATE=1`; without it the container refuses to start.                                                                    |
| `AWS_ENDPOINT_URL_S3`                     | **secret** (by Fly)  | Tigris endpoint, `https://fly.storage.tigris.dev`.                                                                                                                  |
| `AWS_ACCESS_KEY_ID`                       | **secret** (by Fly)  | Bucket access key. Litestream reads it directly.                                                                                                                    |
| `AWS_SECRET_ACCESS_KEY`                   | **secret** (by Fly)  | Bucket secret key. Litestream reads it directly.                                                                                                                    |
| `AWS_REGION`                              | secret (by Fly)      | Set to `auto` by Fly; `litestream.yml` hard-codes `auto`, so it is not used.                                                                                        |
| `LITESTREAM_ACCESS_KEY_ID` / `..._SECRET_ACCESS_KEY` | optional override | Litestream's own names; only needed if you want keys different from the `AWS_*` pair.                                                                     |
| `BUDGET_BACKUP_RECIPIENT`                 | secret               | age public key(s) (`age1…`, comma-separated) for the nightly encrypted copy (section 8). **Required in production** with a bucket. The private key never goes to Fly. |
| `BUDGET_AGE_BIN`                          | optional             | Path of the `age` binary, default `age` (installed in the image).                                                                                                  |
| `BUDGET_REPLICATE`                        | `fly.toml` `[env]`   | `1` in production (backup is mandatory). `0` force off (local, CI), unset = on iff `BUCKET_NAME` is set.                                                            |
| `BUDGET_MAINTENANCE`                      | temporary            | Any value: machine and volume stay up, but server and Litestream do not run (section 5).                                                                            |
| `LITESTREAM_CONFIG`                       | optional             | Config path, default `/etc/litestream.yml`.                                                                                                                         |

`fly storage create` sets exactly the five Fly-side secrets `BUCKET_NAME`, `AWS_ENDPOINT_URL_S3`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`. Check with `fly secrets list --app budget-fg` after creating the bucket; if Fly ever changes these names, adjust `litestream.yml` and this table.

The Tigris bucket can also hold receipts and payslips (SPEC section 9). Litestream only writes below the prefix `budget.sqlite/`; give receipts another prefix and never run lifecycle rules that delete under `budget.sqlite/`.

## 3. First deploy checklist

Run in PowerShell (or any shell) from the repo folder. **Do the steps in this order.** The first deploy is always manual (`--ha=false`, step 5); the GitHub token is created only afterwards (step 7), so no automatic run can create a second machine (a second machine means a second, diverging database).

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

   Expect `BUCKET_NAME`, `AWS_ENDPOINT_URL_S3`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` in the list. `BUDGET_REPLICATE = '1'` in `fly.toml` makes the app refuse to start without them.

3. **Setup token.** Generate a long random value in your password manager (32 random bytes, base64), then hand it to Fly **through stdin** so it never lands in the shell history, a file or the process list. Do not put it in chat or in the repo.

   ```
   # bash / WSL / macOS: prompts silently, then pipes to Fly
   read -rs token && printf 'BUDGET_SETUP_TOKEN=%s\n' "$token" | fly secrets import --stage --app budget-fg; unset token
   # Windows PowerShell 5.1: generates the token, copies it to the clipboard (paste it into the
   # password manager, then clear the clipboard) and sets it without printing it. Do not pipe into
   # `fly secrets import` there: PowerShell prepends a BOM and Fly rejects the name.
   $r = [Security.Cryptography.RandomNumberGenerator]::Create(); $b = [byte[]]::new(32); $r.GetBytes($b); $t = [Convert]::ToBase64String($b); Set-Clipboard $t; fly secrets set --stage "BUDGET_SETUP_TOKEN=$t" --app budget-fg; Remove-Variable r,b,t
   ```

   `--stage` stores the secret without restarting anything; it applies at the first deploy.

   **Pepper** (`BUDGET_PEPPER`, required): generated on the spot and piped straight to Fly, nobody ever needs to see it. It is not needed for a restore (only recovery codes depend on it; after losing it, regenerate the codes).

   ```
   # bash / WSL / macOS
   printf 'BUDGET_PEPPER=%s\n' "$(openssl rand -base64 32)" | fly secrets import --stage --app budget-fg
   # Windows PowerShell 5.1 (`RandomNumberGenerator.Fill` does not exist there; no pipe, see above)
   $r = [Security.Cryptography.RandomNumberGenerator]::Create(); $b = [byte[]]::new(32); $r.GetBytes($b); fly secrets set --stage "BUDGET_PEPPER=$([Convert]::ToBase64String($b))" --app budget-fg; Remove-Variable r,b
   ```

   **Backup key**: generate the age key pair offline (section 8.1) and stage its public key: `fly secrets set --stage BUDGET_BACKUP_RECIPIENT=age1... --app budget-fg`. The server does not start in production without it. On Windows a terminal opened before `winget install` does not know `age` yet: open a new one, or call `"$env:LOCALAPPDATA\Microsoft\WinGet\Links\age-keygen.exe"` directly.

4. **Non-secret settings in `fly.toml` `[env]`** are already committed: `BUDGET_ORIGIN = 'https://budget-fg.fly.dev'`, `BUDGET_RP_ID = 'budget-fg.fly.dev'`, `BUDGET_TRUST_PROXY = '1'`, `BUDGET_REPLICATE = '1'`. With another app name change origin, RP id and `app` together, before the first passkey exists. The server refuses to start in production without `BUDGET_ORIGIN`.

5. **First deploy, by hand** (single machine, because the volume is single-attach)

   ```
   fly deploy --ha=false
   fly machine list --app budget-fg      # exactly one machine
   fly status --app budget-fg
   fly logs --app budget-fg              # look for "replicating to" (type=s3)
   ```

6. **Check health and replication**

   ```
   curl -fsS https://budget-fg.fly.dev/health
   fly ssh console --app budget-fg -C "litestream ltx -config /etc/litestream.yml -level all /data/budget.sqlite"
   fly ssh console --app budget-fg -C "litestream status -config /etc/litestream.yml"
   ```

   `ltx` lists LTX files with creation times (levels 0, 1 and 9 appear within seconds of the first sync); `status` shows the database as `ok`. If `fly ssh console` sessions do not carry the app's environment on your setup, open a shell and check `printenv BUCKET_NAME` before concluding anything.

7. **Only now connect GitHub** (sections 10 and 11 explain the settings): create the deploy token and store it as the `FLY_API_TOKEN` secret of the GitHub Environment `production`, restrict that environment to `main`, then set the branch protection.

   ```
   fly tokens create deploy --app budget-fg | Set-Clipboard     # PowerShell; macOS: | pbcopy
   ```

   The token goes to the clipboard and is never printed (a printed token ends up in terminal scrollback and screenshots; if that happens, create a new one, update GitHub and `fly tokens revoke` the old ID). Paste it straight into GitHub: repo **Settings > Environments > production > Environment secrets > Add secret**, name `FLY_API_TOKEN`. Nowhere else. From then on every green CI run on `main` deploys via `.github/workflows/deploy.yml` (section 10).

8. **First passkey**, phone first (the device you will always carry):
   1. Open `https://budget-fg.fly.dev` in the phone browser. With no passkey registered the app shows the setup step.
   2. Enter the `BUDGET_SETUP_TOKEN` value, name the device, confirm the passkey prompt (Face ID, fingerprint or the password manager).
   3. The app shows **ten recovery codes once**. Store them offline (password manager entry plus a printout). Each works once.
   4. On the desktop: open the same URL. The browser cannot log in yet, so on the phone go to **Einstellungen > Sicherheit**, add a passkey (needs a fresh step-up confirmation) and complete the prompt on the desktop, or use a recovery code on the desktop and add its passkey from there.
   5. When at least two devices work, remove the bootstrap token: `fly secrets unset BUDGET_SETUP_TOKEN --app budget-fg`. The server only accepts it while no passkey is active, but an unset token also removes the temptation to keep it around.

9. **Prove restore works before real data arrives**: run section 4's drill once (`scripts/restore-test.sh` locally, then a real restore of the fresh bucket into a temp file), and decrypt the first encrypted copy once (section 8.3, steps 1 and 2).

## 4. Restore

All procedures use the Litestream binary inside the image (`/usr/local/bin/litestream`, config `/etc/litestream.yml`) or a copy on your own machine. Use `-dry-run` first to see the plan without writing.

`fly ssh console` opens a **root** shell. Anything that writes below `/data` (restore, node scripts) must run as the user `node`, otherwise the files end up owned by root and the server, which runs as `node`, cannot open them. Define this helper once per shell session (`setpriv` is part of the image; the entrypoint uses it the same way):

```
as_node() { setpriv --reuid=node --regid=node --init-groups "$@"; }
```

Verify every restored file before trusting it:

```
# on the machine, after defining as_node (above); no sqlite3 CLI in the image, better-sqlite3 is there
cd /app && as_node node -e "const D=require('better-sqlite3');const d=new D(process.argv[1],{readonly:true});console.log(d.pragma('integrity_check',{simple:true}), d.pragma('journal_mode',{simple:true}))" /data/restore/budget.sqlite
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
as_node() { setpriv --reuid=node --regid=node --init-groups "$@"; }
as_node mkdir -p /data/restore
as_node litestream restore -config /etc/litestream.yml -dry-run -timestamp 2026-10-05T14:30:00Z -o /data/restore/budget.sqlite /data/budget.sqlite
as_node litestream restore -config /etc/litestream.yml -timestamp 2026-10-05T14:30:00Z -o /data/restore/budget.sqlite /data/budget.sqlite
# verify (see above), then copy rows out or download it:
exit
fly ssh sftp get /data/restore/budget.sqlite ./budget-pit.sqlite --app budget-fg
```

`litestream ltx -config /etc/litestream.yml -level all /data/budget.sqlite` shows which transaction ids and times exist; `-txid <hex>` can replace `-timestamp`. History reaches back 30 days (`snapshot.retention` in `litestream.yml`). Delete `/data/restore` afterwards; the volume is small.

To **replace the live database** with such a state (rollback), use maintenance mode so nothing writes meanwhile:

```
fly secrets set BUDGET_MAINTENANCE=1 --app budget-fg      # machine restarts, server and Litestream stay off
fly ssh console --app budget-fg
as_node() { setpriv --reuid=node --regid=node --init-groups "$@"; }
as_node mkdir -p /data/old
# The metadata folder starts with a dot: /data/.budget.sqlite-litestream (checked with Litestream 0.5.17).
for f in budget.sqlite budget.sqlite-wal budget.sqlite-shm .budget.sqlite-litestream; do [ -e "/data/$f" ] && as_node mv "/data/$f" /data/old/; done
as_node litestream restore -config /etc/litestream.yml -timestamp 2026-10-05T14:30:00Z /data/budget.sqlite
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
- Twice a year: decrypt one encrypted copy with the offline key (section 8.3). CI decrypts a test copy with a throwaway key on every PR.

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
| Encrypted copy           | `fly logs --app budget-fg` (search `Encrypted backup`); Posteingang | one `uploaded` line per night, no open "Verschlüsselte Sicherung fehlgeschlagen" item |
| Backup tooling           | CI job `restore-test` green on every PR                                                               | green                                                                                                       |

Weekly glance at the two commands with output is enough; there is no automatic alerting yet.

## 7. Key rotation and access hygiene

- **Tigris keys**: in the Tigris dashboard (`fly storage dashboard <bucket>`) create a second access key with read/write on the bucket, set it as `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` (`fly secrets import` reads `NAME=value` lines from stdin, which keeps values out of your shell history), wait for the restart, check `litestream ltx` shows new files, then delete the old key in the dashboard.
- **Fly deploy token**: `fly tokens list --app budget-fg`, create a new one (`fly tokens create deploy --app budget-fg`), replace the GitHub secret `FLY_API_TOKEN`, then `fly tokens revoke <id>` for the old one. Rotate at least yearly and whenever a laptop is lost.
- **Setup token**: only relevant while bootstrapping. Set a fresh value when you need to bootstrap again (section 9), unset it afterwards. Always through stdin (`fly secrets import`, section 3 step 3), never as a command-line argument.
- **Pepper** (`BUDGET_PEPPER`): rotate only when the Fly secrets may have leaked. A new value (same command as section 3 step 3, without `--stage`) restarts the app and **invalidates all recovery codes**: log in with a passkey right after and regenerate the codes in **Einstellungen > Sicherheit**. Audit IP hashes from before and after are no longer comparable; nothing else changes.
- **Passkeys and sessions** in **Einstellungen > Sicherheit** (each needs a fresh passkey confirmation):
  - *Passkey entfernen* ends every session of that device **and every session opened with a recovery code** (those belong to no device, so they are ended too), except the one you are using.
  - *Wiederherstellungscodes neu erzeugen* invalidates the old codes and ends every session opened with one of them, except the one you are using. Do it after using a code and whenever the printout may have been seen.
  - *Alle anderen Sitzungen beenden* signs out every other browser and every recovery-code login; only the current session stays. Use it after a lost or shared device, or when the session count shown there is higher than your devices.
  - A new login in the same browser replaces that browser's previous session.
- Fly and GitHub accounts are the trust root (they can reach the volume and the secrets): keep two-factor authentication on for both.

## 8. Nightly age-encrypted copy (SPEC section 9)

A second, independent backup next to Litestream: once a night the server takes a consistent snapshot, encrypts it on the machine with [age](https://age-encryption.org) to the owner's **public** key and uploads it. Only the public key is on the server, so neither the server, nor Fly, nor whoever holds the bucket keys can read the copies. The private key exists only offline with the owner.

**How it runs** (`apps/server/src/backup/`, in the server process):

- Every 15 minutes (first check 2 minutes after start) the server checks whether today's copy (UTC) exists. It runs after 02:00 UTC, or at once when the newest copy is more than 26 hours old (catch-up after downtime).
- `VACUUM INTO` writes a transaction-consistent snapshot into a private temp folder while the app keeps working. Hash-referenced receipt files (including soft-deleted rows for undo) are verified and copied into `receipts/`; a TAR with `budget.sqlite` and `receipts/` is sealed with `age --encrypt -r <recipient>`. All plaintext is removed before upload. Missing/corrupt receipt files fail the backup.
- Upload to the same Tigris bucket under **`encrypted/budget-YYYY-MM-DD.tar.age`** (Litestream only uses `budget.sqlite/`). Retention: the newest 30 daily copies plus the first copy of each of the newest 12 months; the job deletes older ones and never touches other keys.
- Result in the log: `Encrypted backup uploaded: encrypted/budget-… (N bytes)`. A failure logs `Encrypted backup failed: …` (no secrets), puts one urgent item into the **Posteingang** ("Verschlüsselte Sicherung fehlgeschlagen") and retries an hour later; the next success resolves the item. The app never waits for the backup.
- `BUDGET_BACKUP_RECIPIENT` is **required in production** once a bucket is configured: without it the server refuses to start.

What it protects against: a stolen bucket key or Fly account reading the data, a broken Litestream state, a bad point-in-time history. It lives in the same bucket, so it does **not** survive the loss of the Tigris bucket itself: pull a copy to your own machine once a month (section 8.3).

### 8.1 Generate the key pair (owner, once, offline)

On your own computer, never on the Fly machine, never in the repo or CI. Install age: Windows `winget install --id FiloSottile.age` (or the release zip from github.com/FiloSottile/age), macOS `brew install age`, Debian/Ubuntu `sudo apt install age`.

```
age-keygen -o budget-backup-key.txt
# prints: Public key: age1...   (the public key is also in the file, line "# public key:")
```

1. Copy the **whole content** of `budget-backup-key.txt` (three lines, the secret line starts with `AGE-SECRET-KEY-1`) into a secure note in your password manager, entry "Budget backup key".
2. Print it once and store the paper with the recovery codes (fire-proof place, not with the laptop).
3. Delete the file (`del budget-backup-key.txt` / `rm budget-backup-key.txt`) and empty the recycle bin. Losing both copies makes every encrypted backup unreadable; the server cannot help.

### 8.2 Hand the public key to the app

The public key is not secret, but it is kept out of the repo like everything account-specific:

```
fly secrets set BUDGET_BACKUP_RECIPIENT=age1... --app budget-fg   # add --stage before the first deploy
fly logs --app budget-fg      # "Encrypted backup on (1 recipient(s))", about 2 minutes later "Encrypted backup uploaded: encrypted/budget-YYYY-MM-DD.tar.age"
```

Several recipients (e.g. a second key kept only on paper) are separated by commas; each can decrypt on its own. Rotating the key: generate a new pair (8.1), set the new public key, keep the old private key as long as copies encrypted to it exist (up to 12 months).

### 8.3 Restore from an encrypted copy

1. **Download** a receipt-aware copy from the Tigris dashboard (folder `encrypted/`), or with the AWS CLI and bucket keys in your session only:

   ```
   aws s3 ls s3://<bucket>/encrypted/ --endpoint-url https://fly.storage.tigris.dev
   aws s3 cp s3://<bucket>/encrypted/budget-YYYY-MM-DD.tar.age . --endpoint-url https://fly.storage.tigris.dev
   ```

2. **Decrypt and extract** on the owner's machine with the offline key in a temporary file:

   ```
   age --decrypt -i budget-backup-key.txt -o budget-restored.tar budget-YYYY-MM-DD.tar.age
   mkdir budget-restored
   tar -xf budget-restored.tar -C budget-restored
   sqlite3 budget-restored/budget.sqlite 'PRAGMA integrity_check;'
   rm budget-backup-key.txt
   ```

3. **Restore both DB and receipts** only when the live files are lost or wrong. In maintenance mode, move the existing DB/WAL/SHM and receipt directory aside, upload the archive privately to the volume, extract into a staging directory, and restore **both** `budget.sqlite` and `receipts/` before leaving maintenance mode. Preserve previous files for rollback, ensure ownership by the server user, and restore to `RECEIPTS_DIR` if overridden. Verify receipt downloads afterward. Never extract the owner's private backup inside the public repository. See [receipts](receipts.md) for directory, retention and metadata limits.

Older `.sqlite.age` copies contain only the DB: decrypt with `age --decrypt -i budget-backup-key.txt -o budget-restored.sqlite <copy>.sqlite.age`, check integrity and restore as in section 4.3. Retention recognizes both formats. Litestream's point-in-time and automatic empty-volume restores also restore **only the DB**; they cannot replace lost receipt bytes. After volume loss, use the paired encrypted archive. The independent second backup target remains open.

**Restore test in CI**: `apps/server/src/backup/backup.test.ts` generates a throwaway age key pair for the test, backs up the synthetic ledger to a local fake S3 endpoint, downloads and decrypts the copy, checks `PRAGMA integrity_check`, every table count, retained receipt bytes and SHA-256, and shows that another key cannot decrypt it. The `check` job installs age and sets `BUDGET_REQUIRE_AGE=1`, so the test cannot silently skip. It never sees the owner's key.

**Drill**: twice a year download one copy, decrypt it with the offline key (both the password-manager copy and the paper, typed in) and run `PRAGMA integrity_check`; verify receipt hashes and open/download a restored synthetic receipt.

## 9. Lost all passkeys

Order of attempts, least invasive first.

1. **Recovery code.** On the login screen choose the recovery-code login and enter one of the ten codes (single use). Then, in **Einstellungen > Sicherheit** on that device: add a new passkey, remove the lost devices, regenerate the recovery codes and press **Alle anderen Sitzungen beenden**. Removing devices and regenerating codes already end all other recovery-code sessions (an attacker with a code of the old batch loses access); the last step also ends sessions of browsers you no longer trust. Store the new codes offline.
2. **No code left: re-run the bootstrap** by deactivating the old credentials in the database. Whoever can do this already controls your Fly account, so treat it as an owner-only procedure. It needs no maintenance mode: SQLite allows a second short writer and Litestream sees the change through the WAL.

   ```
   # 1. Mark the moment (UTC) in case something goes wrong; the bucket has full history.
   # 2. Set a new setup token (the app restarts):
   # (value from your password manager, through stdin as in section 3 step 3)
   read -rs token && printf 'BUDGET_SETUP_TOKEN=%s\n' "$token" | fly secrets import --app budget-fg; unset token
   # 3. Deactivate passkeys, sessions and unused recovery codes (rows are kept for the audit trail):
   fly ssh console --app budget-fg
   cd /app && setpriv --reuid=node --regid=node --init-groups node -e "
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

   The app now has zero active passkeys and zero sessions (recovery-code sessions included), so the setup screen accepts the token again. Register a new passkey (section 3, step 8), store the new recovery codes, then `fly secrets unset BUDGET_SETUP_TOKEN --app budget-fg`.

   Notes: the script runs as `node` so the database files keep their owner; only `revoked_at` is set; no financial data is touched. If the statements fail because a table name differs (schema changed), read `packages/db/src/schema/auth.ts` and adapt, do not delete rows. To undo a mistake, restore a point in time (4.2).
3. **Database itself lost too**: restore first (section 4), then step 2.

## 10. Deploy pipeline and GitHub settings

**How a deploy happens.** A merge to `main` runs the `CI` workflow (`check`, `check-windows`, `docker`, `restore-test`). When that run finishes successfully, `.github/workflows/deploy.yml` starts (`workflow_run`), checks out the commit CI tested and runs `flyctl deploy --remote-only --ha=false`, followed by a guard that fails the job if more than one machine exists. A red CI never deploys. `workflow_dispatch` (Actions tab, "Run workflow", branch `main`) redeploys the current `main` without a new commit. Deploys never run in parallel (`concurrency: deploy`) and are never cancelled half way. The Fly token exists only in the environment of the deploy steps, all actions are pinned to full commit SHAs (Dependabot proposes updates), and the checkout keeps no git credentials.

The deploy step reads `git rev-parse HEAD` from that checked-out source and passes it as Docker build argument `BUDGET_BUILD_REVISION`. `/health` returns `{ "status": "ok", "revision": "<40-character lowercase commit SHA>" }` when a valid revision was baked in; without one it keeps the legacy `{ "status": "ok" }` response. CI builds and smoke-tests the image against the exact checked-out SHA. `github.event.workflow_run.head_sha` selects the source checkout. The GitHub API's Deploy-run `head_sha` can instead show a newer default-branch head, so that run field does not prove which image is running. Verify the returned health revision against the commit the successful CI tested to verify the running image.

**Settings only you can make in GitHub** (repo **Settings**; the workflows cannot set these):

1. **Environments > New environment `production`**: deployment branches = "Selected branches" > `main`. The secret `FLY_API_TOKEN` belongs here (Environment secret), not in the repository secrets. Create the environment before the first pipeline run; GitHub otherwise creates an unrestricted one.
2. **Branches > Add branch ruleset (or classic rule) for `main`**:
   - Require a pull request before merging (no direct pushes), include administrators.
   - Require status checks to pass, branch up to date before merging; required checks: `check`, `check-windows`, `docker`, `restore-test`.
   - Require conversation resolution before merging.
   - Block force pushes and deletions.
3. **Actions > General**: "Allow actions created by GitHub and verified creators" at most; workflow permissions "Read repository contents" (the workflows already declare `contents: read`).
4. Two-factor authentication on the GitHub and the Fly account (they are the trust root, see section 7).

If the deploy job shows "FLY_API_TOKEN is not set, skipping deploy", the environment secret is missing; nothing was deployed.

## 11. Rolling back the app, and migrations

**Rule: migrations are additive only.** New tables, new nullable or defaulted columns, new indexes. Never rename or drop a column or table in the same release that stops using it. A destructive change takes two releases: release N stops reading and writing the thing, release N+1 drops it. This keeps the previous image runnable against the current database, which is what makes the rollback below safe. The server applies migrations at start and never runs them backwards. **One exception, before any real data:** `0003_ledger_model_v2` (P1f-3) rebuilds tables and moves columns; an image older than it cannot run on a database migrated by it, so a rollback across that release needs the database restored to a point before it (section 4.2).

**Rollback of a bad release** (code only; the database keeps its state):

```
fly releases --app budget-fg --image            # list releases with their image references
fly deploy --app budget-fg --image registry.fly.io/budget-fg:deployment-<id> --ha=false
fly status --app budget-fg                      # one machine, check passing
curl -fsS https://budget-fg.fly.dev/health
```

Then fix forward on `main` (the next green merge deploys again; until then a `workflow_dispatch` would redeploy the bad `main`, so revert the commit first). If the bad release also damaged data, restore a point in time before that release (section 4.2).

## 12. One-time YNAB migration (operator task)

The app has no import feature (owner decision 01.10.2026). The one-time migration runs on the
machine with `migrate-cli.js` (same tasks as the former wizard: each step is one transaction,
`revert` undoes a whole run). The export files and the private mapping never enter the repo.

1. Check the backup: the nightly encrypted copy and Litestream are current (sections 4 and 8).
2. Copy the files to the volume (PowerShell, owner's machine):
   `fly ssh sftp shell -a budget-fg` then `put "<Register.tsv>" /data/migration/register.tsv`,
   `put "<Plan.tsv>" /data/migration/plan.tsv`, `put budget.mapping.json /data/migration/mapping.json`
   (create the folder first: `fly ssh console -a budget-fg -C "mkdir -p /data/migration"`).
3. Stage and dry run:
   `fly ssh console -a budget-fg -C "node /app/migrate-cli.js stage --register /data/migration/register.tsv --plan /data/migration/plan.tsv --mapping /data/migration/mapping.json"`
   then `... dry-run --run <id>`. Proceed only with 0 problems, 0 Gate 2 differences (Zu
   verteilen, Available, Activity and every account balance in every month) and 0 "app vs import"
   differences.
4. Commit: `... commit --run <id>`; check with `... report --run <id>`.
5. Remove the private files: `fly ssh console -a budget-fg -C "rm -rf /data/migration"`.
   Undo if needed: `... revert --run <id>` (refused once imported data was changed in the app).
   A run committed by an older version of the tool is reverted the same way (the revert only
   undoes the run's audit group); then stage, dry-run and commit the export again.

### 12.1 Account order (operator task)

The owner arranges accounts in the app (sidebar pencil or Konten › Übersicht › Reihenfolge ändern;
`PATCH /api/accounts/order`, audited, "Rückgängig" in the toast). To set the starting order on the
live database in one step, run on the machine (names separated by `|`, exact account names, case
does not matter; unknown names are reported and skipped, nothing is created, accounts that are not
listed follow in their current order; the groups themselves keep their fixed order Budget-Konten,
Kreditkarten, Kredite, Investments):

```
fly ssh console -a budget-fg -C "node /app/migrate-cli.js order-accounts --names 'Konto A|Konto B|Konto C' --dry-run"
fly ssh console -a budget-fg -C "node /app/migrate-cli.js order-accounts --names 'Konto A|Konto B|Konto C'"
```

`--dry-run` only prints the counts (listed, matched, unknown, ambiguous) and writes nothing; without it
the write is one transaction and one audit group (the output shows the group id). A name that
matches two accounts is reported as ambiguous and skipped. Running the command again with another
list simply sets the new order.

### 12.2 Audit groups, undo and moving money (operator tasks)

Three more commands of `migrate-cli.js` work on the owner's own actions. They call the same
domain functions as the app (`undo` behind `POST /api/undo`, `moveMoney` behind Plan › Geld
verschieben, `assignMany` behind the assigned amounts), so every write is audited, guarded and
undoable like one from the app. The writes carry the actor `operator` (the app writes `owner`).
Direct SQL on the live database is not used.

```
list-groups --since <ISO ts> [--until <ts>] [--entity envelope_month] [--out <file>]
undo-group  --group <id> [--group <id> ...] [--dry-run]
move-money  --month YYYY-MM --from "<category>" --to "<category>" --cents N [--dry-run]
move-money  --file <list-groups json> [--allow-unbalanced] [--dry-run]
```

**`list-groups`** prints the audit groups that are not part of an import run (`group_id` not like
`import:%`) and not undone, oldest first: group id, time, actor and one line per change. For
`envelope_month` that is category name, month and the assigned change in EUR (`Beta 2026-10 +12,34 €`).
A group that was undone and redone is listed again; the records of an undo are not listed.
`--since` and `--until` are ISO timestamps (inclusive, compared with the time of the group's first
entry); `--entity` keeps only groups that touch that table. `--out <file>` also writes the groups
that changed assigned amounts as JSON, `[{groupId, ts, moves: [{category, month, deltaCents}]}]`.
That file holds real category names and amounts: write it to the private volume
(`/data/migration/`), never into the repo.

**`undo-group`** undoes the groups through `undo`, so it refuses what `POST /api/undo` refuses
(for example "it changed after this entry"). The groups are applied newest first, in one
transaction: if one is refused, none is undone. `--dry-run` does everything and rolls back, so it
shows exactly what the real run would refuse. An import run (`import:...`) is not undone here but
with `revert`, which also resets the run.

**`move-money`** moves an assigned amount from one category to another in one month. Names are
matched exactly (trimmed, case-insensitive) among the live (not deleted) categories, hidden ones
included. An unknown or ambiguous name fails before anything is written. Each move is one audit
group. With `--file`, the groups of a `list-groups --out` file are applied in order, all in one
transaction (a refusal rolls everything back):

- A group with two lines in a month that net to zero (−x on A, +x on B) becomes a move from A to B
  of x cents.
- Any other group (a single line, a non-zero net, more than two lines) is reported as `skipped`
  with its lines, and the command ends with exit code 3 after applying the rest. With
  `--allow-unbalanced` its lines are assigned one by one instead (`assignMany`, one audit group per
  line, with the usual "Zu verteilen" guard).
- `--dry-run` prints what would be moved and writes nothing.

### 12.3 Single bookings (operator task)

`book --file <json> [--dry-run] [--details]` adds, re-dates, re-prices, re-splits or deletes single bookings
from a JSON list. The file holds real names and amounts: keep it on the private volume
(`/data/migration/`), never in the repo. Entries run in file order; each has a unique `id` and a
`kind`:

- `add`: `account`, `date`, `amountCents` (signed), optional `payee` (created if missing, as in the
  app), `memo`, `cleared` (`cleared` or `uncleared`, default `uncleared`), and either `category` or
  `transferAccount` (a proper linked Umbuchung; a negative amount leaves `account`). A transfer between a budget and a tracking account may carry its envelope as `transferCategory` (put on the budget leg, as `categoryId` of the transfer route does; refused between two budget accounts).
- `change_amount` (`newAmountCents`), `change_date` (`newDate`), `delete`: address the booking by
  `match: {account, date, amountCents, payee?, memo?, category?, transferAccount?, identical?}` (`category`: one of its splits has this category; `transferAccount`: the other leg of the transfer is in this account; both only narrow a match that is otherwise ambiguous; `identical: N` deletes or changes one of exactly N true duplicates, the oldest). An inflow without category may carry an income type by name as `incomeType` (e.g. `Kapitalerträge`). It must resolve to exactly one top-level
  booking (a split booking counts with its total). These three also take `unlock: true`, the
  explicit per-entry unlock of a reconciled (geprüft) booking: it passes the same `unlockReconciled`
  option as the app's unlock (`PATCH /api/bookings/:id`, `DELETE ...?unlock=1`), so
  the change is audited and undoable. Without it a reconciled booking is skipped
  (`reconciled_locked`); `add` does not take it, and every other rule of the app still applies.
- `set_splits` replaces all splits of one booking at once (for example a salary inflow into pay and
  tax-free reimbursements): `match` as above (its `amountCents` is the booking's amount) and
  `splits: [{category?, amountCents, memo?, incomeType?, contact?}]`, which must add up to that
  amount (checked before anything runs). A split has either a `category` or an `incomeType` (an
  inflow without category), or neither (Zu verteilen); `contact` (a receivable share, by name) needs
  an "Auslagen" category. Amount, date, account and payee of the booking stay; a transfer is
  refused (`is_transfer`); `unlock: true` as above. The whole replacement is one audit group, so
  Rückgängig restores the old splits.

Everything goes through the booking functions behind the HTTP routes, so transfer pairing,
splits, trade cash flows, payment links, reconciliation locks and the envelopes behave as in the
app, and whatever the app refuses (a trade settlement, a reconciled booking, a split-level transfer,
a closed account) is skipped. Account and category names are exact (case-insensitive) and never
created. Each entry is one audit group with the actor `operator`; the output has one line per entry
(kind, id, account, date, cents, group id), so the app's Rückgängig or `undo-group --group <id>` can
undo it on its own. A skipped entry prints `skipped <id> <reason> <candidate count>` (`--details`
adds the message), the rest still goes through, and the exit code is 3. `--dry-run` does it all and
rolls back. Running a list twice adds twice; check with `--dry-run` first.

#### Revert a run when the owner has budgeted on top of it

`revert` is refused while assigned amounts that the run did not write sit on the run's categories.
The owner's moves have to come off first and go back on after the new import. Take a backup first
(sections 4 and 8). Names, not ids, carry the moves over: the new import creates its categories
again. Each command below runs as `fly ssh console -a budget-fg -C "node /app/migrate-cli.js
<command and options>"`, only the part in the backticks is shown. The files are on the volume, so
keep `/data/migration` until the end.

1. List the owner's moves since before the first one and keep them:
   `list-groups --since <ISO ts before the first move> --entity envelope_month --out /data/migration/moves.json`
   Check the list: only the owner's moves, nothing else.
2. Undo them: `undo-group --group <id> --group <id> ... --dry-run`, then without `--dry-run`.
   If one is refused, resolve that one first (the message names the entry); nothing was undone.
3. Revert the run: `revert --run <run id>`.
4. Stage the corrected export and mapping, `dry-run --run <new id>` (0 problems, 0
   differences), then `commit --run <new id>` (section 12).
5. Move the money again: `move-money --file /data/migration/moves.json --dry-run`, check the
   list and any `skipped` lines, then without `--dry-run`. Groups that were not simple moves are
   skipped; handle them by hand in the app, or with `--allow-unbalanced` if single assignments are
   what you want.
6. Check Plan › Monat for the months involved, then remove the private files (section 12, step 5).

### 12.4 Historical payslips (operator task)

`payslips --file <json> [--dry-run] [--details] [--replace]` imports the owner's historical payslips
(Gehaltszettel) from a JSON file. The file holds real amounts: keep it on the private volume
(`/data/migration/`), never in the repo. Every entry is passed to `savePayslip`, the function behind
`POST /api/payslips`, so the input rules and the link rules are the app's own:

```json
{
  "payslips": [
    {
      "month": "2024-06",
      "kind": "regular",
      "specialType": null,
      "grossCents": 300000,
      "svCents": 50000,
      "taxCents": 40000,
      "netCents": 227000,
      "lines": [
        { "section": "earning", "label": "Bonus", "amountCents": 10000 },
        { "section": "deduction", "label": "Canteen", "amountCents": 5000 },
        { "section": "reimbursement", "label": "Home office", "amountCents": 12000 }
      ],
      "salaryBooking": { "account": "Checking", "date": "2024-06-14", "amountCents": 227000, "payee": "Employer" }
    }
  ]
}
```

- Fields are those of the payslip form: `kind` is `regular` or `special` (a `special` slip needs
  `specialType` `salary13`, `salary14` or `other`, a regular one must not have it); amounts are
  cents. `svCents` and `taxCents` are signed (a negative value is a refund or Aufrollung credit),
  line amounts are not: a line is `earning` (added to the gross), `deduction` (another deduction) or
  `reimbursement` (tax-free, paid on top; Telearbeit, Fahrgeld, Reisespesen). The net must equal
  gross + earnings - SV - tax - deductions + reimbursements, or the file is rejected before anything
  is written (the message names the payslip). A signed Aufrollung goes into `svCents`/`taxCents`;
  a credit that would be a negative deduction is netted into the deduction it reduces.
- A regular payslip and the special payslips of the same payout are separate entries (one
  `kind`/`specialType` each) that name the same payout in `salaryBooking`.
- `salaryBooking` (optional) finds the booking the payout arrived with: `account` (exact name,
  case-insensitive), `date` (the booking may be up to 3 days earlier or later), `amountCents` (the
  booking's amount, the whole payout) and optionally `payee`. The payslip is linked only when exactly
  one booking matches and the app accepts it as a salary booking (EUR inflow with a Gehalt or
  Sonderzahlung split). Otherwise the payslip is still imported, without link, and reported as
  `unlinked` with the reason (`no_salary_booking`, `unknown_account`, `ambiguous_account`,
  `no_booking`, `ambiguous_booking`, `link_refused`).
- One savepoint and one audit group (actor `operator`) per payslip; the output prints its group id,
  so `undo-group --group <id>` (or the app's Rückgängig) removes exactly that payslip again.
- A payslip for a month, kind and special type that exists already is reported as `exists` and left
  alone, whatever the file says. `--replace` updates it through the same `savePayslip` path (same
  id, lines replaced; a working link is kept when the file's booking is not found). Several `other`
  special payments may exist in one month: they are paired by their figures, and with `--replace`
  also by being the only unpaired one of the month on both sides.
- A payslip the app refuses is `skipped` with a reason (`--details` adds the message); the rest goes
  through and the exit code is 3. `--dry-run` does everything and rolls back, so it reports exactly
  what the real run would.

The last line is `payslips N created C [replaced R] exists E unlinked U skipped S`. Run `--dry-run`
first, check the `unlinked` lines, then run it for real. Review the result in Berichte › Gehalt.

### 12.5 Instrument facts and employer pension (operator task)

The Finanz-Check rules (R17 to R22) need private values that do not belong in the repo: the TER and
the leverage of single instruments, and the explicit monthly employer pension contributions.
`instrument-facts --file <json> [--dry-run] [--details]` enters them from a private file (keep it on
`/data/migration/`, never in the repo):

```json
{
  "securities": [{ "isin": "XX0000000001", "terBp": 20, "leverageFactorTenths": null }],
  "employerPension": [{ "month": "2026-01", "amountCents": 12345 }],
  "bookSettings": { "birthYear": 1990, "birthMonth": 6 }
}
```

Run it as `fly ssh console -a budget-fg -C "node /app/migrate-cli.js instrument-facts --file
/data/migration/facts.json --dry-run"`, check the output, then again without `--dry-run`.

- `securities`: matched by `isin` (case-insensitive) to exactly one live security; no match or
  several are skipped (`unknown_isin`, `ambiguous_isin`). `terBp` is the total expense ratio in
  basis points (0 to 10000), `leverageFactorTenths` the leverage in tenths (10 = 1.0x, 10 to 1000).
  Only fields that are present and not `null` are written; a value equal to the stored one is
  reported as `unchanged` and writes nothing. Same ranges as the security routes; the write is
  `updateSecurity`, as behind `PATCH /api/securities/:id`.
- `employerPension`: one row per month (`YYYY-MM`, `amountCents` 0 or more, an explicit 0 counts).
  A month is created, changed, or restored if it was deleted; an equal amount is `unchanged`. The
  write is `saveBookSettings`, as behind the rules settings route, so validation and audit match
  the app.
- `bookSettings` (optional): the private birth month for the rules, `birthYear` (1900 up to the
  current year) and `birthMonth` (1 to 12). Only provided, non-null fields are written; a missing
  one is taken from the stored birth month, and if none is stored yet both are needed (else
  skipped). The write is `saveBookSettings`, as behind the rules settings route, so the app's
  plausibility check applies (a date in the future is skipped). Equal values are `unchanged`.
- The whole file is validated first (a bad value, an ISIN or month listed twice, a birth year or month out of range) and nothing runs
  if it is wrong. Then each entry runs in its own savepoint and audit group (actor `operator`), so
  the app's Rückgängig or `undo-group --group <id>` reverts it on its own; an entry the app would
  refuse is skipped with its reason, the rest goes through, and the exit code is 3.
- Output: one line per entry (`updated`/`unchanged`/`skipped <isin> ...`, `pension <month> ...`,
  with the group id), then the summaries `securities <total> updated <n> unchanged <n> skipped <n>`,
  `pension <n> upserted <n> unchanged <n> skipped <n>`, and, if the file has `bookSettings`,
  `settings updated|unchanged|skipped`. `--dry-run` does all of it, reports
  exactly what would change (no group ids) and rolls everything back. Running a file twice is safe:
  the second run reports everything as unchanged.

### 12.6 Owner configuration (operator task)

The additive `assetClassTree` section manages groups, class assignments, dated targets and explicit account classes, including operator-only P2P defaults. See [configuration, dry-run and owner steps](portfolio-composition.md#operator-configuration).

`owner-config --file <json> [--dry-run] [--details]` loads the owner's private settings from one file
(keep it on `/data/migration/`, never in the repo). Every section is optional; entries share one
audit group per run (actor `operator`, `undo-group --group <id>` reverts the run) and call the function
behind the matching app route, so validation and audit are those of the UI. A file is checked as a
whole first (unknown keys, bad values, duplicates); nothing runs if it is wrong. An entry the app
would refuse is `skipped <reason>` (`--details` adds the message), the rest goes through, the exit
code is 3. Running a file twice is safe: the second run reports everything as `unchanged`.
`--dry-run` does all of it and rolls back, so it reports exactly what the real run would change.

```json
{
  "profile": {
    "name": "...", "initials": "AB", "birthDate": "1990-06-15",
    "country": "AT", "region": "Wien", "householdSize": 2
  },
  "rules": { "enable": ["R17"], "disable": ["R18"] },
  "categoryStages": [{ "category": "Miete", "stage": 1 }, { "category": "Reisen", "stage": null }],
  "assetClasses": { "rename": [{ "from": "Aktien", "to": "Aktien Welt" }] },
  "securities": [
    {
      "isin": "XX0000000001", "quoteUrl": "https://...", "symbol": "ABC",
      "quoteExchange": "...", "coingeckoId": "bitcoin", "pricesEnabled": true
    }
  ],
  "expectedPayments": [
    {
      "name": "Miete", "kind": "outflow", "accountName": "Giro", "categoryName": "Miete",
      "rhythm": "monthly", "dueDay": 1, "startDate": "2026-01-01", "amountCents": 80000,
      "note": "..."
    }
  ],
  "skipOccurrences": [{ "name": "Miete", "month": "2026-12", "reason": "..." }],
  "clearBookings": { "before": "2026-09-01", "accounts": ["Giro"] }
}
```

Sections run in this order: `assetClassTree`, `createSecurities`, `cryptoMappings`, `splitCategories`, then
`profile`, `rules`, `categoryStages`, `assetClasses`, `securities`,
`expectedPayments`, `skipOccurrences`, `clearBookings`. Names are matched exactly (trimmed,
case-insensitive for existing sections); unknown and ambiguous references are skipped. Each entry
has a savepoint: a refusal rolls back only that entry. The following examples are synthetic:

```json
{
  "createSecurities": [{ "name": "Synthetic Coin", "kind": "crypto", "assetClass": "Synthetic Class" }],
  "cryptoMappings": [{ "key": "asset:synthetic-coin", "account": "Synthetic Depot", "security": "Synthetic Coin" }],
  "splitCategories": [{ "splitId": "synthetic-split-id", "category": "Synthetic Group › Synthetic Category", "contact": null }]
}
```

- `createSecurities`: required `name`, `kind` (`etf`, `stock`, `fund`, `bond`, `crypto`, `p2p`,
  `commodity`, `other`); `currency` defaults to `EUR` (three uppercase letters), `pricesEnabled`
  defaults to `false`. Optional `assetClass` is an exact live class name, `isin` a 12-character ISIN,
  `symbol` a quote symbol. Creates through the normal securities/exposure path. An existing live
  ISIN, or case-insensitive name when ISIN is omitted, is `unchanged`; different kind/currency is
  `skipped conflicting`. Other fields of an existing security are retained.
- `cryptoMappings`: `key` is `asset:<providerId>` or `currency:<providerId>`, `account` an exact live
  account name. Asset keys require `security` (ISIN or exact live name); currency keys omit it.
  Merges into `source.crypto.mappings` using the source mapping schema and audited write path:
  identical target is `unchanged`, changed target is `updated` with `mapping replaced` detail.
  Unlisted keys remain. Active off-budget accounts are required; assets need crypto/brokerage
  accounts and unique account/instrument targets. Explicit setup before the first fetch is allowed;
  when a source balance exists its currency validation applies. No provider request or booking is made.
- `splitCategories`: `splitId` identifies a split of a live booking; `category` is an exact name or
  `Group › Category`; or give `incomeType` (exact live name) instead to move the split to income
  without a category. Optional `contact` is an exact live name, `null` clears it, omission retains it.
  The normal booking update validates contacts/categories and respects reconciled/transfer/trade
  locks; refusals are skipped. Transfer legs are skipped (`transfer_leg`); a reconciled booking needs
  `"unlock": true` on the entry (it stays reconciled). An income split cannot keep a contact. Booking amount/date/account and all split amounts/identities are
  asserted unchanged. Undo restores categorisation/contact together with the rest of the run.

- `profile`: the Einstellungen › Profil values. `region` is the Bundesland (code `AT-1` to `AT-9`
  or name); `country` only accepts Austria (`AT`, `Österreich`) or, as an alias, a Bundesland;
  `householdSize` (alias `household`) 1 to 20; `birthDate` a past day. `profile.birth_month` (a rules
  book input) is set to the month of `birthDate` in the same group. The output lists the changed
  field names, never the values.
- `rules`: `enable` / `disable` lists of rule codes (checklist codes such as `S2-1` too); a code in
  both lists is an input error, an unknown code is skipped (`unknown_rule`).
- `categoryStages`: `stage` 1 to 9 or `null` (clear), matched by exact category name
  (`unknown_category`, `ambiguous_category`).
- `assetClasses.rename`: `from` to `to`. A finished rename (old name gone, new name present) is
  `unchanged`; a taken new name is `name_taken`. Nothing else about asset classes is touched.
- `securities`: matched by `isin` (exactly one live one) or `name`; writes `quoteUrl` (https),
  `symbol`, `quoteExchange`, `coingeckoId`, `pricesEnabled` through `updateSecurity`; `null` clears a
  text field, equal values are `unchanged`.
- `expectedPayments`: created or updated by name (exactly one live payment of that name; several are
  `ambiguous_payment`). `kind` `outflow` / `inflow`, `accountName` (required), `categoryName` or
  `incomeType` (by name, not both), `rhythm` `monthly` / `quarterly` / `semiannual` / `yearly`
  (`dueMonth` is required for all but monthly), `dueDay` 1 to 31, `startDate`, `amountCents` above 0.
  A new payment gets its first version from `validFrom` (default `startDate`). For an existing one,
  changed fields are updated and, when the amount in force on `validFrom` (default: first day of the
  current month) differs, a new version starts that day (versions are never edited); occurrences are
  re-planned as in the app. An omitted `note` keeps the stored one.
- `skipOccurrences`: marks the one occurrence of the payment in `month` (`YYYY-MM`) as `missed`
  ("ausgefallen", the existing occurrence status). Occurrences exist from last month to twelve months
  ahead (`no_occurrence` otherwise); a linked one is refused (`linked_occurrence`). `reason` is
  required as the file's own documentation and is not stored.
- `clearBookings`: per account (`accounts`, default all open accounts) every `pending`
  ("vorgemerkt") booking dated strictly before `before` becomes `confirmed` ("bestätigt", the status
  the app's bulk action sets) through `updateBooking`. One savepoint per account, all or nothing;
  the output line per account gives the count.

Output: one line per entry (`created`/`updated`/`unchanged <section> <key> <changes> <group>` or
`skipped <section> <key> <reason>`), then one summary per section
(`<section> created C updated U unchanged N skipped S`).

### 12.7 Owner trades (operator task)

`owner-trades --file <json> [--dry-run] [--details]` back-fills or removes trades explicitly
selected by the owner after read-source reconciliation. Server/database only; no provider calls,
UI or automatic inbox confirmation. Keep the JSON and terminal output on the private volume;
never copy private input into the repository or a PR. No new secrets or credentials are needed.

Synthetic example (the accounts and security must already exist; the depot's
`referenceAccountId` must point to `Synthetic Platform - Cash`):

```json
{
  "trades": [
    {
      "id": "synthetic-buy",
      "kind": "add",
      "account": "Synthetic Platform - Depot",
      "cashAccount": "Synthetic Platform - Cash",
      "security": "Synthetic Coin",
      "date": "2026-03-02",
      "tradeKind": "buy",
      "units": "1.23456789",
      "amountCents": 12000,
      "feeCents": 100,
      "importKey": "owner:synthetic:purchase"
    },
    {
      "id": "synthetic-reward",
      "kind": "add",
      "account": "Synthetic Platform - Depot",
      "security": "Synthetic Coin",
      "date": "2026-03-03",
      "tradeKind": "reward",
      "units": "0.025",
      "amountCents": 250,
      "importKey": "owner:synthetic:reward",
      "note": "Synthetic staking reward"
    }
  ]
}
```

The entire file is checked before writes: exactly `{trades: [...]}`, at most 500 entries,
unique non-empty `id`, unknown keys refused, valid ISO day, exactly one `security` name or
12-character `isin`. Names match exactly ignoring case; no fuzzy match or entity creation.
All cents are safe non-negative integers in the investment account's currency. `amountCents`
is the positive gross value, not the net settlement (deliveries and splits may use 0). `feeCents` and `taxCents` default to 0;
`note` is optional. Required `units` is a signed decimal string with a decimal point and at
most eight fractional digits, converted exactly (no exponent or rounding). Buy and delivery_in
need positive units; sell and delivery_out negative units; dividend, interest, fee and tax need
`"0"`; split needs a nonzero signed change and amount 0. Deliveries may have amount 0.
The app's trade-kind money rules also apply.

`importKey` is required and unique within the file for adds. Suffixes `:buy`, `:div` and `:cash`
are reserved and rejected at parse. Repeating the same live entry reports `unchanged`;
a previously deleted or undone trade is skipped as `deleted_by_owner`. Use `undo-group` to
restore it, or a new key for a genuinely new trade. Reusing a key for different live trade
values is skipped as `conflict`. `cashAccount` is required for buy/sell/dividend/interest/fee/tax
when the depot has a `referenceAccountId`; omission is skipped as `missing_cash_account`.
When supplied, it must be the depot's open reference account. The PP migration's shared settlement calculation
creates an app transfer with memo `Verrechnung` and key `<importKey>:cash` on both legs:
buy debits cash and credits depot by gross plus fee; sell/dividend/interest debit depot and
credit cash by gross minus fee and tax. Standalone fee/tax debit cash and credit depot by their
amount. Deliveries/splits create no cash transfer. The depot's trade settlement cancels its transfer leg.
Without a depot reference account, settlement stays on the investment account. A duplicate
add with `cashAccount` repairs a missing `<importKey>:cash` transfer and reports `repaired`.
An existing transfer, including a soft-deleted one, reports `unchanged` and is not restored.

`reward` is one atomic dividend plus buy for the supplied EUR value on that day, with keys
`<importKey>:div` / `<importKey>:buy`. It adds units, leaves depot cash unchanged and records
capital income in reports/performance. The investment account must use EUR. Fees/tax must be zero; cashAccount is refused. An incomplete
or conflicting existing pair is skipped atomically. The owner supplies the historical value;
the command does not fetch or estimate it.

Delete example (use a separate private file):

```json
{
  "trades": [
    {
      "id": "synthetic-delete",
      "kind": "delete",
      "match": {
        "account": "Synthetic Platform - Depot",
        "security": "Synthetic Coin",
        "date": "2026-03-02",
        "tradeKind": "buy",
        "units": "1.23456789",
        "amountCents": 12000
      }
    }
  ]
}
```

`match` requires account, security/isin, date and tradeKind; units and gross amount are optional
narrowing fields. Exactly one live trade must match, otherwise `not_found` / `ambiguous`.
Delete uses the app's soft-delete path for trade and settlement, plus both transfer legs found
through `<importKey>:cash`. A reward match uses the buy's units/value and removes both reward
trades and settlements. Deleting a single buy/dividend reward leg with an existing sibling
is skipped as `reward_leg`; use `tradeKind: "reward"`. Closed accounts, unknown securities, `unitsRuleViolation`, reconciled
locks and app refusals are skipped in their entry savepoint; other entries continue.

Run, verify and undo (inside the server, with the existing operator environment from section 12):

```sh
node /app/migrate-cli.js owner-trades --file /data/private/owner-trades.json --dry-run --details
node /app/migrate-cli.js owner-trades --file /data/private/owner-trades.json --details
# Copy the audit group ID from an added/repaired/deleted line, then verify app account histories,
# holdings and Reports > Portfolio > Kosten, Steuern, Erträge against the source.
node /app/migrate-cli.js owner-trades --file /data/private/owner-trades.json --dry-run
node /app/migrate-cli.js undo-group --group <group-id> --dry-run
node /app/migrate-cli.js undo-group --group <group-id>
```

Before the real run, inspect skips and compare `cash-change` (signed cents per account) and
`units-change` (signed decimals per security) with the platform. After the run, the same add file
must be unchanged with zero deltas. Delete files resolve live trades, so repeating deletion is
`not_found`. One audit group per run, actor `operator`; no `importRunId` is created or accepted.
Undo is only via `undo-group`, which restores the entire run.
Dry-run exercises writes, invariants and audit and then rolls everything back, with no group ID.

Output has one status line per entry: `added|repaired|unchanged|deleted <id> <account> <date> <tradeKind>
<units> <gross-cents> [group]`, or `skipped <id> <reason> <account> <date> <tradeKind> <units>
<gross-cents>`. Omitted delete match fields show `*` on skips. `--details` adds refusal messages;
the summary counts logical entries (one reward counts as one). Exit 3 means at least one skip,
1 means a file/command error, 0 means no skip. Output stays in the operator terminal.

### 12.8. Rebuild a crypto depot from staged source operations

Owner decision 2026-10-04: `source-rebuild` repairs incomplete PP trade history
using staged `read_source` operations. Complete the history and asset/fiat mappings
first ([crypto read source](crypto-read-source.md)). It never fetches a provider,
changes mappings, sends orders or writes to budget accounts. Bank-side transfers
stay intact. No new dependency, migration, key or secret is required.

```sh
node /app/migrate-cli.js source-rebuild --depot "<depot-name>" --cash "<cash-name>" \
  --since 2026-03-01 --dry-run --details --report /data/private/rebuild-preview.json
node /app/migrate-cli.js source-rebuild --depot "<depot-name>" --cash "<cash-name>" \
  --since 2026-03-01 --details --report /data/private/rebuild-applied.json
```

Use the existing operator environment from section 12. Select active off-budget
investment accounts by exact name; cash must be the depot's separate same-currency
reference account. Reports must be **new files inside `DATA_DIR` on the private
volume**, mode 0600. Existing files are never overwritten; report write failure
rolls back the database run. Terminal output and JSON contain private ledger facts:
never copy them into the repository, shared logs, issues or PRs.

One transaction/audit group per run, actor `operator`, savepoint per removal or
trade/reward pair. `--dry-run` exercises writes/invariants/audit, then rolls back
everything. Exit 3 means skips, problems, unmatched fiat or unit differences;
1 is an input/run error; 0 means none of these. Cash differences alone are reported
because bank dates and an unadjusted opening balance can legitimately differ.

With `--residual-to-opening` (owner decision 75) remaining final unit differences move
to the start: each asset's opening correction at `since - 1 day` is adjusted by the exact
difference (created if missing), listed under `residualToOpening` and as `residual_to_opening`
issues, and no correction trades are placed in the history. Intermediate-day differences
stay reported; `unitDifferences` counts only days still differing.

1. Remove PP import trades on/after `since`, settlements and their `<key>:cash`
   Verrechnung transfer pair to cash, obsolete rebuild rows, and cash's
   `pp:cash-target:<account-id>` balancing booking (dated suffix supported).
   Manual/`owner:` rows stay and the existing matcher claims them once before
   creating counterparts; individual owner rewards are matched before aggregation.
   Reconciled rows skip the whole removal unit unless `--unlock` explicitly grants
   the same booking unlock option as `book`.
2. At `since - 1 day`, sum each asset's wallet balances (`balanceAfter`, then later
   flows; without snapshots replay from zero), including visible staking wallets. Subtract remaining pre-start trades
   and create a delivery correction with that exact day's stored price, or zero
   plus `opening_no_price`. Holding snapshots override trade history in the app,
   so such a depot is refused before writes. Cash opening balance is never changed:
   `openingCash` gives the exact difference, current/proposed `openingBalanceCents`
   and the operator field **Einstellungen > Konten > Anfangssaldo**. If the account
   opens after the comparison day, `proposedOpeningDate` requests correcting that
   date first; the proposed balance is withheld until the operator reruns.
3. Rebuild each primary mapped asset leg on its Europe/Vienna `creditedAt` day.
   Group by `tradeId`, falling back to the operation; never round unsupported e8
   units/cents. Missing prices and ambiguous allocation are reported.
4. Verify `units` at opening, every completed month end and today: all
   `differenceE8` values must be zero. `cash` lists every differing day,
   `cashTop20` the largest differences and `cashEnd` today (even if equal).
   Each differing security/date includes `byType`: source net units versus actual
   created/preserved units by source operation type, with an opening baseline.
   `unhandledOperations` lists IDs/types the planner does not handle.
   JSON also includes created count/cent sums by kind, removed trade/booking
   counts, retained/matched/skipped rows, unmapped fiat effects and the original
   app matcher verdict plus `cashStatus` (including `matched_by_sum`).

| Source type | Ledger effect |
| --- | --- |
| `buy`, `sell`, `earn_on_fiat_buy`, `savings_plan`, `leverage_liquidation`, `index_buy`, `index_sell`, `index_rebalancing`, `swap`, `earn_on_fiat_swap`, `dust_swap`, `margin_*` | Buy for units in, sell for units out. Same-asset fees (including separate legs in another wallet) reduce incoming or increase outgoing units, once. Primary fiat supplies gross value, including separate sell/buy fiat legs in swaps; stored-price swap valuation is the fallback without fiat. Fiat fees become `feeCents`, fiat tax becomes sell `taxCents`. Several assets share fiat/fees by stored-price value with conserved cent remainders. Shared PP/owner-trades helper creates `<key>:cash` settlement transfers. |
| Separate outgoing `fee` leg in another asset | Sell the fee asset at its stored-price value V with `feeCents = V`: units decrease, settlement nets to zero, no cash transfer. Unmapped/unpriced fee assets are reported (`unmapped_asset` / `fee_no_price`). |
| `merger_crypto` | One outgoing and one incoming asset on the same day, no fiat/tradeId: sell A and buy B at A's stored-price value. Without A's price, zero-valued `delivery_out` / `delivery_in` plus `merger_no_price`. Net cash is zero. |
| Asset `deposit`, `withdrawal` | Net-unit `delivery_in` / `delivery_out` at stored-price value; absent price means zero plus `delivery_no_price`. Asset fee legs follow the same rules as trades. |
| Asset `reclaim` | Zero-valued `delivery_out`, reported as `reclaim_zero_value`. |
| `reward`, `passive_earn_reward`, `onetime_reward`, `best_reward`, `instant_trade_bonus`, `giveaway`, `trading_premium` (asset in, no fiat) | Equal EUR dividend and buy using a stored EUR price at most seven days old. Aggregate exact net units and individually rounded values per security/month; date = last included reward day, note = count. Unpriced rewards aggregate separately as zero-valued `delivery_in`, with report lines. Reward pairs require an EUR depot. Monthly aggregation shifts within-month timing; month-end units stay exact. |
| `earn_on_fiat_reward` | Depot interest with cash transfer; the first mapped instrument supplies the existing money-only trade's required security reference. |
| `stake`, `unstake`, platform `transfer` | No ledger effect. Sum main and staking wallets. Separate stake-IN/OUT operations are valid. An unstake-IN without a same-asset OUT in that operation reduces the eligible staking wallet from that instant until its next snapshot. |
| Fiat `deposit`, `withdrawal`, `refund`, `reclaim`; every unknown type | No trade; report `matchSourceOperations` verdict. Remaining same-sign cash movements may match one cash booking by an exact sum of up to eight movements within ±12 days. Each movement/booking is claimed once. Above 100,000 subtotal states, report `aggregate_search_limit` and leave unresolved. |
| Unmapped asset | No trade; report per-asset count and signed fiat effect. Allocation requiring an unknown price/mapping reports an unavailable effect; map first, rerun. |

The reference sums each wallet's latest `balanceAfter` plus subsequent staged
flows. Staking wallets receive stake-IN legs and rewards. For an incomplete
unstake, choose the eligible staking wallet with the most recent balance at
least as large as the incoming amount; subtract that amount once. A later
snapshot supersedes the correction. Explicit unstake-OUT legs need no correction.

`--staked-now "<mapped-security-name>=<decimal units>"` is an optional, repeatable
override for the declared assets only; omission makes no staking adjustment.
Names resolve uniquely against mapped securities;
units must be nonnegative exact e8 decimals. Example with synthetic names:
`--staked-now "Synthetic Coin a=1.5" --staked-now "Synthetic Coin b=0"`.
The override replaces the observed staking total, preserving its historical
changes. If no staking wallet is identifiable, reverse only main-wallet
stake-OUT/unstake-IN movements from the declared total. Opening and verification
use the same override; `staked` reports only explicitly declared assets.
Negative reconstructed units are refused before ledger writes.

Unmapped fiat legs in eligible trades/interest use their stored source currency
identity (`read_source` balances) and the **latest stored ECB rate on/before the day** (EUR per
native unit, micro-units), with one integer-cent rounding into cash's currency.
Without an available rate, an EUR depot trade uses units times the stored EUR
asset price, at most seven days old, and reports `fx_fallback_price`. Fiat fees
and taxes preserve their native ratio to the principal with integer-cent rounding.
Without both rate and recent price, use the nearest stored ECB rate of that
currency in either direction, with `fx_nearest` and its `rateDate`. A currency
without any stored ECB rate still skips. This also covers fiat interest. No provider is fetched.
`fx_converted` retains currency, original amount/cents, source/target rate and
converted cents. Interest in such a currency settles on the mapped cash account;
cash verification adds the corresponding converted source flows to that account's
native wallet replay. A buy or sell whose principal fiat is a non-base currency
(separate source wallet, e.g. USD) never touches the base-currency cash account:
it becomes `delivery_in`/`delivery_out` valued at the converted cost (fees included
in the cost, proceeds net of fee/tax), adds no `fxCashMovements`, and is listed as
issue `fiat_wallet_not_eur`. Rewards in coin were never cash: the monthly pair is a
dividend plus an equal buy on the depot and moves no platform cash. Fiat-only bank deposits/withdrawals retain their existing
bank-side behavior. FX valuation changes of a second wallet are not cash flows.

Keys: `rebuild:<operation-id>:<leg-index>`,
`rebuild:<operation-id>:merger:out/in`,
`rebuild:opening:<since>:<security-id>:source:<JSON-operation-ids>`, and
`rebuild:reward:<YYYY-MM>:<security-id>[:unpriced]:source:<JSON-operation-ids>`
(`:div`/`:buy` for reward pairs). Reward IDs are sorted and retain all contributing
source operations; fee sells and swap legs keep their operation ID too.
Equal rebuild rows/transfer pairs are `unchanged`, without second-run writes.
Changed live rows update through trade/booking repositories. Deleted keys skip;
restore the relevant audit group first rather than silently reviving owner deletions.

Repeat `--trace "<mapped-security-name>"` to print private monthly diagnosis from
`since - 1 day`, also included in `--report`. Each month has wallet balances with
their last leg, snapshot and unstake correction; every source asset leg with
operation ID/type and running source/app units; and live trades with importKey,
kind, signed units, gross/fee/tax cents and running app/source units. App trades
have day precision; source legs retain their timestamps. The opening trace
contains all earlier source legs/trades. Keep terminal output and JSON private.
Wallet replay detects snapshot deltas not explained by staged wallet legs,
including leverage/expired products. For mapped assets, the rebuild books these
exact signed deltas as zero-valued `split` trades. `split_from_balance` reports
their date, signed e8 units, wallet and both snapshot leg IDs.
Changes on the same security/day sum under `rebuild:split:<securityId>:<day>`.

After rebuilding, `dust` lists zero-valued deliveries dated today, with note
`Rundungsausgleich Quelle` and key `rebuild:dust:<securityId>`. They close only
nonzero unit differences worth strictly less than one unrounded EUR cent at the
latest stored price on/before today (stored ECB conversion for foreign quotes).
Without a stored price, the absolute difference must be strictly below 0.001
units. Missing quote FX or larger differences stay reported. Repeated runs
reuse the live dust row; deleted keys and reconciled locks retain their safeguards.

Review the private preview against the platform, map missing assets, resolve quotes,
locked/retained trades and opening cash separately, then run. Repeat to verify
`unchanged` and zero new writes. Keep the group ID; undo restores previous live
rows, balances and units (new rows remain audited soft-deleted history):

```sh
node /app/migrate-cli.js undo-group --group <group-id> --dry-run
node /app/migrate-cli.js undo-group --group <group-id>
```

Synthetic domain/database/CLI tests cover wallet replay, Vienna dates, proportional
cent conservation, swaps, asset/fiat fees and tax, exact monthly rewards, unmapped
cash effects, aggregated deposits, owner trades, openings, locks/unlock, unchanged
reruns, dry-run rollback, report write refusal and undo. Live private reconciliation
and deployment remain owner steps.

Second-round local verification (2026-10-05): complete typecheck/lint, 317 suites
and 3,066 tests passed; production build passed. The restricted Windows runtime
used the existing ignored `os.userInfo()` test preload, without changing assertions.
CI and private reconciliation remain owner steps.

Third-round local verification (2026-10-05): complete `npm run check` passed
(317 suites, 3,071 tests), and production build passed. The restricted Windows
runtime used one test worker, extended test limits, one retry, the ignored
`os.userInfo()` preload and native Node compile cache. Assertions and production
dependencies are unchanged. CI and private reconciliation remain owner steps.

### 12.9 Plan snapshot backfill (operator task)

The nightly job takes the day-15 snapshot of the current month and tries to reconstruct only
the previous two months. Older months are an explicit operator job; months whose inputs changed
after their 15th are recorded in `plan_snapshot_gap` and not retried (delete the row to retry).

```powershell
npx.cmd tsx scripts/plan-snapshot.ts 2025-01 2026-08   # prints one status per month, no amounts
```

## 13. One-time Portfolio Performance migration (operator task)

Same rules as section 12 (no import feature in the app, files and the private mapping never enter the repo). Prerequisite: the YNAB migration is committed (the depot, crypto and P2P accounts exist). `migrate-pp-cli.js` has the same shape: each step is one transaction, `revert` undoes a whole run (the newest committed one only, also across sources). What is written and why: `docs/migration/pp-export.md` §Commit.

1. Check the backup (sections 4 and 8). Copy the PP XML (plain save, version 70 verified) and the mapping to the volume (as in section 12, folder `/data/migration`).
2. Draft the mapping from the file and the accounts in the database, then edit it (`?` marks what needs a decision; a security has a `comment` where a quote id is missing):
   `node /app/migrate-pp-cli.js propose --file /data/migration/pp.xml --out /data/migration/pp.mapping.json`
3. Stage and dry run:
   `... stage --file /data/migration/pp.xml --mapping /data/migration/pp.mapping.json`, then `... dry-run --run <id>` (change the mapping with `... map --run <id> --mapping <file>`, every save is a version). A dry run is the commit in a rolled-back transaction: it prints the changes and the Gate 3 report. Proceed only with 0 errors.
   Accounts are created by this tool, not by the YNAB mapping: a portfolio entry with `cashAccount` renames the YNAB account to the cash account and creates the securities account at commit (`docs/migration/pp-export.md`, platforms).
4. Commit: `... commit --run <id>`. Look at the report: **0 differences in units and in position value** and 0 in cost (with the cost method of the app; PP's FIFO figure is part of the data). Differences in account value come from cash flows (YNAB transfers against PP deposits) and are listed per year; `suggestedOpeningCents` per account is the opening balance that would equalise one day. Returns per depot: app against PP replay; for PP's own numbers pass `--reference ref.json` (`{"<account>": {"1J": {"ttwrorPct": 12.34, "irrPct": 5.6}}}`, tolerance 0,01 Pp). `--days 2025-12-31,2026-09-30` chooses the checkpoint days, `--out report.json` keeps the whole report (private storage), `--details` prints it.
   The report explains the cash difference per platform (`cash difference today (app - PP) explained by`) and sorts every unmatched flow into a bucket (`docs/migration/pp-export.md`). Valuation adjustments of YNAB on PP-managed accounts are dropped, not counted as cash.
   Real platform cash from the statements goes into the mapping as `cashTarget` per cash account (`docs/migration/pp-export.md`); the commit prints each correction (`cash target`) as the amount YNAB missed.
   Platform statements (`statement` in the mapping) are staged with the run (`stage --mapping` reads the file named there); the commit prints per statement the matched, added and removed rows, the old holdings, and the bank account's balance before and after. For Trade Republic: `abgleich --web <list.tsv> [--pytr <csv>] --cashback <giro name> --depot <depot name> --real <EUR> --out <report.md>`.
5. Quote sources are taken from PP's own feeds (contract: `docs/market-data.md`, "Fields on `security`"): `quote_url` from the HTML-table feed URL on Ariva or cryptocalc, `coingecko_id` from the PP property `COINGECKOCOINID` (crypto without one: the helper of the market module), `symbol` from a Yahoo feed. `fallback_quote_id` is never set. Securities without any source keep their imported prices and get no refresh; set the Ariva page or the coin in the app.
6. Remove the private files: `rm -rf /data/migration`. Undo if needed: `... revert --run <id>` (refused once trades were added to its securities).

Notes: after the commit the YNAB Gate 2 report shows differences on the depot accounts that PP took over (their balance now includes trades); the PP report is authoritative for them. A re-import of a newer file (stage, commit) is idempotent and prints what changed (`unchanged`, `changed`, `missing`). Deliveries in and out count as capital flows in the depot view (as in PP); securities without any quote count as 0 in the returns and are listed.


### Legacy HTTP importer and bounded backup requests

The application has no import UI. `BUDGET_IMPORT_HTTP` is unset by default;
`BUDGET_IMPORT_HTTP=1` may enable legacy HTTP routes in development/tests only.
Production (`NODE_ENV=production`) always leaves them unmounted. Operator
`/app/migrate-cli.js` and `/app/migrate-pp-cli.js` do not depend on this flag.

Encrypted-backup S3 requests have a fixed 30-second deadline including response
body reads. Error bodies are limited to 4 KiB and list pages to 1 MiB. Unknown
provider text and operational exception details never reach logs/inbox; only
allowlisted S3 codes or generic German failure hints do. The existing hourly
retry and inbox resolution policy is unchanged. No new secret/env value is needed.
