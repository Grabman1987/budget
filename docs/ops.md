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
- `VACUUM INTO` writes a transaction-consistent snapshot into a private temp folder while the app keeps working; `age --encrypt -r <recipient>` seals it; the plaintext file is deleted before the upload.
- Upload to the same Tigris bucket under **`encrypted/budget-YYYY-MM-DD.sqlite.age`** (Litestream only uses `budget.sqlite/`). Retention: the newest 30 daily copies plus the first copy of each of the newest 12 months; the job deletes older ones and never touches other keys.
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
fly logs --app budget-fg      # "Encrypted backup on (1 recipient(s))", about 2 minutes later "Encrypted backup uploaded: encrypted/budget-YYYY-MM-DD.sqlite.age"
```

Several recipients (e.g. a second key kept only on paper) are separated by commas; each can decrypt on its own. Rotating the key: generate a new pair (8.1), set the new public key, keep the old private key as long as copies encrypted to it exist (up to 12 months).

### 8.3 Restore from an encrypted copy

1. **Download** the copy. Tigris dashboard (`fly storage dashboard <bucket>`, folder `encrypted/`), or with the AWS CLI and the bucket keys in your session only:

   ```
   aws s3 ls s3://<bucket>/encrypted/ --endpoint-url https://fly.storage.tigris.dev
   aws s3 cp s3://<bucket>/encrypted/budget-2026-10-01.sqlite.age . --endpoint-url https://fly.storage.tigris.dev
   ```

2. **Decrypt** on your machine with the key from the password manager (paste it into a temp file, delete that afterwards):

   ```
   age --decrypt -i budget-backup-key.txt -o budget-restored.sqlite budget-2026-10-01.sqlite.age
   sqlite3 budget-restored.sqlite 'PRAGMA integrity_check;'     # must print: ok
   rm budget-backup-key.txt
   ```

3. **Put it back** (only when the live database is lost or wrong): exactly as in section 4.3, "To put that file on a new volume": maintenance mode, move the old files aside as in 4.2, upload `budget-restored.sqlite` to `/data/budget.sqlite` with `fly ssh sftp shell`, unset maintenance. Litestream then starts a new history from this state.

**Restore test in CI**: `apps/server/src/backup/backup.test.ts` generates a throwaway age key pair for the test, backs up the synthetic ledger to a local fake S3 endpoint, downloads and decrypts the copy, checks `PRAGMA integrity_check` and the row counts of every table, and shows that another key cannot decrypt it. The `check` job installs age and sets `BUDGET_REQUIRE_AGE=1`, so the test cannot silently skip. It never sees the owner's key.

**Drill**: twice a year download one copy, decrypt it with the offline key (both the password-manager copy and the paper, typed in) and run `PRAGMA integrity_check`.

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
