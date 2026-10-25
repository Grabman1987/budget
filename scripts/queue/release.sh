#!/usr/bin/env bash
# Publish one immutable checked main revision, potentially containing several merged PRs.
set -euo pipefail
export PATH="$PATH:/c/Program Files/GitHub CLI" GH_REPO=Grabman1987/budget
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
revision=${1:?usage: release.sh FULL_MAIN_SHA}
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || exit 1
git fetch -q origin main
[ "$(git rev-parse origin/main)" = "$revision" ] || { echo 'main moved; choose its current verified revision'; exit 1; }
before=$(gh run list --workflow=deploy.yml --event=workflow_dispatch -L 1 --json databaseId -q '.[0].databaseId // 0')
gh workflow run deploy.yml --ref main -f "revision=$revision"
run=''
for attempt in $(seq 1 30); do
  candidate=$(gh run list --workflow=deploy.yml --event=workflow_dispatch --commit "$revision" -L 1 --json databaseId -q '.[0].databaseId // 0')
  if [ "${candidate:-0}" -gt "${before:-0}" ]; then run=$candidate; break; fi
  sleep 10
done
[ -n "$run" ] || { echo 'Could not identify the dispatched release; inspect Actions before retrying.'; exit 1; }
gh run watch "$run" --interval 15 --exit-status
node --input-type=module - "$revision" <<'JS'
const health = await fetch('https://budget-fg.fly.dev/health').then(r => r.json());
if (health.status !== 'ok' || health.revision !== process.argv[2]) process.exit(1);
console.log(`LIVE ${health.revision}`);
JS
