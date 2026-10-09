# source me from the repo root (Git Bash on Windows): . scripts/perf/env.sh
W=$(pwd -W 2>/dev/null || pwd)
export MSYS_NO_PATHCONV=1 DATABASE_PATH="$W/data/perf.sqlite" BUDGET_MIGRATIONS_DIR="$W/packages/db/drizzle" MIGRATE=0
