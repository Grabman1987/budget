#!/bin/sh
set -eu
umask 077
[ "${BUDGET_PREVIEW:-}" = 1 ] &&
[ "${BUDGET_ORIGIN:-}" = 'https://budget-fg-preview.fly.dev' ] &&
[ "${BUDGET_REPLICATE:-}" = 0 ] &&
[ "${DATA_DIR:-/data}" = /data ] &&
[ "${DATABASE_PATH:-/data/budget.sqlite}" = /data/budget.sqlite ] &&
[ -z "${BUCKET_NAME:-}" ] &&
[ -z "${ENABLE_BANKING_APP_ID:-}" ] || {
  echo 'Preview requires its isolated origin and no production integrations.' >&2
  exit 1
}
# The separate Fly app owns this volume. Never overwrite an existing preview account/data.
for name in DROPBOX_PAYSLIP_ROOT AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY BUDGET_BACKUP_RECIPIENT; do
  if printenv "$name" | grep -q .; then echo "Unexpected integration setting: $name" >&2; exit 1; fi
done
mkdir -p /data
if [ ! -f /data/budget.sqlite ]; then cp /app/preview.sqlite /data/budget.sqlite; fi
exec docker-entrypoint.sh "$@"
