#!/usr/bin/env bash
# Idempotent: creates or updates every label the queue uses. Needs an authenticated `gh`.
set -euo pipefail

mk() { gh label create "$1" --color "$2" --description "$3" --force >/dev/null && echo "label $1"; }

mk ready "0e8a16" "Specified and cleared for the agent runner"
mk needs-human "d93f0b" "Agent stopped; owner decision or action required"
mk blocked "b60205" "Waiting on another issue or external input"
mk epic "5319e7" "Too large for one PR; split into child issues"
mk in-progress "fbca04" "An agent job is running (set by the runner)"
mk agent-failed "e11d21" "Runner job ended without a PR"
mk attempt:1 "c5def5" "Escalation ladder: attempt 1 (claude sonnet)"
mk attempt:2 "bfdadc" "Escalation ladder: attempt 2 (claude sonnet + error log)"
mk attempt:3 "a2bbd1" "Escalation ladder: attempt 3 (codex)"
mk tests-change-approved "0052cc" "Owner approved changing existing tests or tolerances"
mk ui-change "1d76db" "Visible UI changes; visual baselines may update"
mk flaky-test "ededed" "Test failed then passed on re-run"
mk incident "000000" "Suspected data loss or security problem; stop and review"
mk visual-baselines "c2e0c6" "Visual snapshot baselines updated"
mk risk:low "0e8a16" "Eligible for local auto-merge"
mk risk:high "b60205" "Independent review and manual merge"
for a in ledger ui nav portfolio plan reports accounts settings infra docs; do
  mk "area:$a" "006b75" "Area lock: one running issue per area ($a)"
done
mk size:S "c2e0c6" "Small: --max-turns 25"
mk size:M "fef2c0" "Medium: --max-turns 40"
mk size:L "f9d0c4" "Large: split before running"
