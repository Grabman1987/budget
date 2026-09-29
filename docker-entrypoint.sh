#!/bin/sh
# Container entrypoint. Fly mounts the volume at /data owned by root: fix ownership once, then run
# everything (restore, Litestream, server) as the unprivileged `node` user.
#
# Replication is on when BUDGET_REPLICATE=1, or when BUCKET_NAME is set (`fly storage create` sets it)
# unless BUDGET_REPLICATE=0. Then the database is restored from the replica if the volume has none,
# and the server runs as a child of `litestream replicate`, which flushes the last WAL frames when it
# receives SIGTERM. Without replication (local docker, CI smoke test) the server runs on its own.
set -e
# Database, WAL and restored files are readable by their owner only.
umask 077

DATA_DIR="${DATA_DIR:-/data}"
export DATA_DIR
LITESTREAM_CONFIG="${LITESTREAM_CONFIG:-/etc/litestream.yml}"
export LITESTREAM_CONFIG

drop=""
if [ "$(id -u)" = "0" ]; then
  chown -R node:node "$DATA_DIR"
  drop="setpriv --reuid=node --regid=node --init-groups"
fi

# Maintenance mode (BUDGET_MAINTENANCE=1, see docs/ops.md): keep the machine and volume up without
# server or replication, so an operator can restore or repair the database over `fly ssh console`.
if [ -n "${BUDGET_MAINTENANCE:-}" ]; then
  echo "docker-entrypoint: maintenance mode, server and replication are not running" >&2
  trap 'exit 0' TERM INT
  while :; do sleep 1; done
fi

case "${BUDGET_REPLICATE:-auto}" in
  1) replicate=1 ;;
  auto) if [ -n "${BUCKET_NAME:-}" ]; then replicate=1; else replicate=0; fi ;;
  *) replicate=0 ;;
esac

if [ "$replicate" = "1" ]; then
  if [ -z "${BUCKET_NAME:-}" ]; then
    echo "docker-entrypoint: replication is on but BUCKET_NAME is not set (run fly storage create)" >&2
    exit 1
  fi
  db="$DATA_DIR/budget.sqlite"
  if [ -n "${DATABASE_PATH:-}" ] && [ "$DATABASE_PATH" != "$db" ]; then
    echo "docker-entrypoint: DATABASE_PATH must be $db when replication is on" >&2
    exit 1
  fi
  # No-op if the database exists or the bucket holds no backup yet. Any other failure (bad
  # credentials, network) stops the start: never boot an empty database over an existing backup.
  # shellcheck disable=SC2086
  $drop litestream restore -config "$LITESTREAM_CONFIG" -if-db-not-exists -if-replica-exists "$db"
  # shellcheck disable=SC2086
  exec $drop litestream replicate -config "$LITESTREAM_CONFIG" -exec "$*"
fi

# shellcheck disable=SC2086
exec $drop "$@"
