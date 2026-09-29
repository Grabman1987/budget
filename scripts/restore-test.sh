#!/usr/bin/env bash
# Self-contained Litestream restore test, no cloud needed.
#
# Creates a synthetic SQLite database (WAL), replicates it to a FILE replica with the Litestream
# binary, deletes the database, restores it from the replica and compares row count, content
# checksum and PRAGMA integrity_check. Prints PASS or FAIL and cleans up.
#
# Usage:   scripts/restore-test.sh
# Env:     LITESTREAM_BIN  path to the litestream binary (default: `litestream` from PATH)
#          KEEP=1          keep the temp directory for inspection
#          RESTORE_TEST_DRIVER=node|sqlite3  force the SQL driver (default: node if available)
# Needs:   the litestream binary (version pinned in the Dockerfile) and either the repo's
#          better-sqlite3 (npm install) or the sqlite3 CLI.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ls_bin="${LITESTREAM_BIN:-litestream}"

if ! command -v "$ls_bin" >/dev/null 2>&1; then
  echo "FAIL: litestream binary not found ('$ls_bin')." >&2
  echo "Install the version pinned in the Dockerfile (ARG LITESTREAM_VERSION) from" >&2
  echo "https://github.com/benbjohnson/litestream/releases and put it on PATH, or set" >&2
  echo "LITESTREAM_BIN=/path/to/litestream." >&2
  exit 2
fi

# SQL helper: run one statement or a script against a database, print rows separated by newlines.
# Prefers the repo's better-sqlite3 (always present after npm install), falls back to the CLI.
driver="${RESTORE_TEST_DRIVER:-}"
if [ -z "$driver" ]; then
  if (cd "$repo_root" && node -e "require('better-sqlite3')") >/dev/null 2>&1; then
    driver=node
  else
    driver=sqlite3
  fi
fi
if [ "$driver" = "node" ]; then
  sql() {
    (cd "$repo_root" && node --input-type=commonjs -e '
      const Database = require("better-sqlite3");
      const [file, statement] = process.argv.slice(1);
      const db = new Database(file);
      db.pragma("journal_mode = WAL");
      if (/^\s*(select|pragma)/i.test(statement)) {
        console.log(db.prepare(statement).pluck().all().join("\n"));
      } else {
        db.exec(statement);
      }
      db.close();
    ' "$1" "$2")
  }
elif command -v sqlite3 >/dev/null 2>&1; then
  sql() { sqlite3 "$1" "$2"; }
else
  echo "FAIL: neither better-sqlite3 (run npm install) nor the sqlite3 CLI is available." >&2
  exit 2
fi

work="$(mktemp -d "${TMPDIR:-/tmp}/budget-restore-test.XXXXXX")"
cleanup() {
  if [ "${KEEP:-0}" = "1" ]; then
    echo "kept $work"
  else
    rm -rf -- "$work"
  fi
}
trap cleanup EXIT
fail() {
  echo "FAIL: $*" >&2
  exit 1
}

db="$work/data/budget.sqlite"
replica="$work/replica"
restored="$work/restored/budget.sqlite"
config="$work/litestream.yml"
mkdir -p "$work/data" "$replica"

cat >"$config" <<EOF
dbs:
  - path: $db
    replica:
      type: file
      path: $replica
EOF

echo "litestream: $("$ls_bin" version)"

# 1. Restore from an empty replica must be a no-op (first start of a fresh deployment).
"$ls_bin" restore -config "$config" -if-db-not-exists -if-replica-exists "$db" >/dev/null 2>&1 ||
  fail "restore from an empty replica should exit 0 with -if-replica-exists"
[ ! -e "$db" ] || fail "restore from an empty replica must not create a database"

# 2. Synthetic data (no real records): 3.000 rows, integer cents.
sql "$db" "pragma journal_mode = wal" >/dev/null
sql "$db" "
  create table booking(id integer primary key, amount_cents integer not null, note text not null);
  with recursive n(i) as (select 1 union all select i + 1 from n where i < 3000)
  insert into booking(amount_cents, note) select i * 137 % 100000, 'synthetic ' || i from n;
"
"$ls_bin" replicate -once -config "$config" >/dev/null 2>&1 || fail "first replicate -once failed"

# 3. More writes after the first sync must arrive as incremental WAL segments.
sql "$db" "insert into booking(amount_cents, note) values (-4200, 'late write after first sync')"
"$ls_bin" replicate -once -config "$config" >/dev/null 2>&1 || fail "second replicate -once failed"

want_count="$(sql "$db" 'select count(*) from booking')"
digest() {
  sql "$1" "select group_concat(id || '|' || amount_cents || '|' || note, ';') from (select * from booking order by id)" |
    sha256sum | cut -d' ' -f1
}
want_sum="$(digest "$db")"
[ "$want_count" = "3001" ] || fail "source has $want_count rows, expected 3001"

# 4. Lose the database, restore from the replica.
rm -f -- "$db" "$db-wal" "$db-shm"
"$ls_bin" restore -config "$config" -o "$restored" "$db" >/dev/null 2>&1 || fail "litestream restore failed"
[ -s "$restored" ] || fail "restore produced no database file"

# 5. Compare.
got_count="$(sql "$restored" 'select count(*) from booking')"
got_sum="$(digest "$restored")"
integrity="$(sql "$restored" 'pragma integrity_check')"

[ "$integrity" = "ok" ] || fail "integrity_check returned: $integrity"
[ "$got_count" = "$want_count" ] || fail "row count $got_count, expected $want_count"
[ "$got_sum" = "$want_sum" ] || fail "content checksum differs after restore"

echo "PASS: restored $got_count rows, checksum ${got_sum:0:12}, integrity_check ok"
