#!/bin/sh
# Usage: scripts/perf/prof.sh '/route?x=1' [topN] [callerOf]  -- CPU profile of one route (8 cold reps).
export MSYS_NO_PATHCONV=1 MIGRATE=0 REPS=${REPS:-8}
: "${DATABASE_PATH:?}" "${BUDGET_MIGRATIONS_DIR:?}"
rm -rf data/prof
ROUTES="$1" OUT=data/prof-out.json node --cpu-prof --cpu-prof-dir=data/prof --import tsx scripts/perf/measure.ts 2>&1 | grep -E "^[0-9]{3} "
node scripts/perf/profile-summary.mjs data/prof/*.cpuprofile "${2:-14}" $3 | grep -v "measure.ts\|node:internal\|:0$"
