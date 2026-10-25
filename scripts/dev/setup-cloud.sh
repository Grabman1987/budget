#!/usr/bin/env bash
# Run while preparing/publishing a Linux cloud environment, not before each task.
# No production credentials, database seeding, tests or deployment.
set -euo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
node -e 'const major = Number(process.versions.node.split(".")[0]); if (![22,24].includes(major)) { console.error("Select Node 22 or 24 for this environment."); process.exit(1); }'
npm ci
if ! command -v age >/dev/null; then
  if [ "$(id -u)" -eq 0 ]; then
    apt-get update
    apt-get install -y age
  else
    sudo apt-get update
    sudo apt-get install -y age
  fi
fi
npx playwright install --with-deps chromium webkit
printf '%s\n' 'Environment prepared. Run only the checks relevant to the next task.'
