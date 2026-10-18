# Delivery pipeline audit, Grabman1987/budget, 2026-10-17

Scope: last 100 runs of ci.yml (2026-10-16 19:15Z to 10-17 20:39Z, 25 h) with all jobs/steps; 212 ci.yml runs and 51 deploy.yml runs since 10-13; 46 PRs merged since 10-13 (38 since 10-15), 12 open.
Scripts + raw JSON: `scratchpad/audit/` (`analyze.cjs` T1/T2/T5, `conc.cjs`/`conc2.cjs` queueing, `layouts.cjs`, `prs.cjs` T3/T4/T6, `fails2.cjs`; outputs `out-*.txt`, data `ci-runs*.json*`, `jobs/`, `logs/`, `pr-lead-times.json`).
Era split: "new" = runs with a `static` job (22 jobs: static, unit x2, e2e x12, visual, windows-unit x2, docker, restore-test, check, check-windows), n=62, from 10-17 07:19Z. "old" = n=34 (unit, e2e x3, check-windows; 1 transitional run with e2e x10 counted old). 4 runs have no jobs (action_required/never started) and are excluded from timings.
Method: queue = first job started_at minus run created_at; exec = last job completed minus first job started; wall = run updated minus created. Timings use completed success+failure runs only (cancelled reported separately). Medians/p90 (nearest-rank).

## 1. Run timings (minutes)
| era / event | n | queue med | queue p90 | exec med | exec p90 | wall med | wall p90 |
|---|---|---|---|---|---|---|---|
| old PR | 22 | 0.1 | 0.7 | 19.5 | 20.5 | 20.0 | 44.3 |
| old main (push) | 7 | 0.1 | 0.1 | 19.5 | 35.6 | 19.6 | 35.7 |
| new PR | 39 | 0.1 | 0.9 | 8.6 | 13.4 | 8.8 | 13.5 |
| new main (push) | 13 | 0.1 | 0.1 | 8.5 | 11.9 | 8.6 | 11.9 |
| new success only | 41 | 0.1 | 0.1 | 8.6 | 11.7 | 8.7 | 12.0 |
| new failure only | 11 | 0.1 | 0.9 | 8.8 | 21.9 | 9.2 | 22.3 |
Run-level queue is not a problem (0 of 96 runs waited > 2 min to start the first job, max 1.6 min). #545 cut wall by 56 % (19.6 -> 8.7 min) but job-minutes per run rose 67.5 -> 87.7 (+30 %).
Cancelled: old 8 runs / 143 job-min, new 7 runs / 287 job-min (median 2.9 min each before cancel). All 25 cancelled PR runs since 10-13 were superseded by a newer run on the same branch.

## 2. Per job (successful jobs; new era unless noted; seconds are medians of step-class sums)
| job | n | median | p90 | setup (job+checkout+node+npm ci+pw+build) | test step |
|---|---|---|---|---|---|
| e2e (12 shards) | 599 | 5.4m | 7.0m | ~67s (pw install 41, npm ci 9, build 8, checkout 5, node 3) | 256s |
| static | 48 | 3.2m | 3.4m | ~19s | 170s |
| unit (x2) | 101 | 3.0m | 3.2m | ~21s (+9s age install) | 150s |
| visual | 49 | 4.0m | 4.3m | ~60s (pw 37, build 8) | 180s |
| windows-unit (x2) | 101 | 4.3m | 4.8m | ~50s (checkout 12, node 13, npm ci 23) | 206s |
| docker | 51 | 0.7m | 0.8m | image build 33s | 1s |
| restore-test | 52 | 0.2m | 0.2m | ~8s | 1s |
| check / check-windows | 41/49 | 0.1m | 0.1m | - | - |
| old: e2e (3 shards) | 65 | 17.1m | 19.7m | ~67s | 950s (shard 3 19.4m, shard 9 4.4m) |
| old: check-windows | 25 | 11.2m | 11.5m | ~50s | 610s |
| old: unit | 25 | 8.2m | 8.6m | ~21s | 463s |
New e2e shards (median min): 1=6.8, 2=5.4, 3=4.6, 4=5.8, 5=5.3, 6=6.1, 7=5.0, 8=5.8, 9=5.0, 10=5.4, 11=5.9, 12=8.1. Shard 12 was the last non-aggregate job to finish in 34 of 49 successful/failed new runs (69 %), shard 1 in 7, shard 11 in 5.
Setup is ~21 % of each e2e job: 12 shards x ~67 s = ~13 job-min per run; Playwright browser install (41 s) is the largest single setup step. Job-start latency per job is 3 s median in both eras.

## 3. Runs per PR and conclusions
Merged PRs since 10-13 (n=46): 141 PR runs = 71 success, 48 failure, 22 cancelled; runs per PR median 3, p90 5, max 9 (#533: 9 runs, 7 failures). 23 of 46 PRs had at least one failed run, 15 at least one cancelled.
All PR-event runs since 10-13 (n=166): 79 success, 58 failure, 25 cancelled, 4 other. Failure share of terminal runs = 42 %. 13 runs have attempt > 1 (7 success, 5 failure, 1 cancelled).
Next run after a failed PR run (n=38, since 10-15): 12 success, 18 failure again, 5 cancelled, 2 none, 1 action_required.
Job-minutes (100-run sample): old era 36 % in failed runs + 7 % cancelled; new era 19 % failed + 6 % cancelled (939 + 287 of 4830 job-min).
Main push CI since 10-13: 45 success, 1 failure (10-13 02:06Z, before the window of section 4).
Open PRs (12): #653 (1 run, in progress), #652 (2: 1 cancelled), #651 (3: 2 failed, 1 cancelled), #648 (1 failed), #642 (8 runs: 5 failed, 1 cancelled), #614 (1 ok); dependabot #455-#460 (1-2 runs each; #457 and #458 failed). Per-PR table for the 46 merged PRs: `out-prs.txt`.

## 4. Failing tests (38 failed runs since 10-15; 34 had logs, 4 empty `--log-failed` output)
Failed jobs (runs containing): e2e 31, unit 5, static 4, windows-unit 3, visual 3, docker 1 (e2e-only 25 runs). Distinct failing e2e locations per failed run: median 2.5, range 0-22; 8 runs had >= 10 failing locations (broad UI/snapshot breakage).
Top 10 by number of failed runs (a spec counted once per run). "On main" = failed on any main push run since 10-15 (main had 0 failing push runs in that window, so all are PR-only):
| # | spec location | failed runs | branches | on main? |
|---|---|---|---|---|
| 1 | e2e/capture.spec.ts:616 | 9 | 5 | no |
| 2 | e2e/capture-dialog-layout.spec.ts:29 | 9 | 5 | no |
| 3 | e2e/rules.spec.ts:118 | 7 | 3 | no |
| 4 | e2e/networth.spec.ts:204 | 6 | 2 | no |
| 5 | e2e/expected.spec.ts:153 | 6 | 2 | no |
| 6 | e2e/expected.spec.ts:169 | 6 | 2 | no |
| 7 | e2e/shell.spec.ts:412 | 6 | 2 | no |
| 8 | e2e/shell.spec.ts:426 | 6 | 2 | no |
| 9 | e2e/assignment-rules.spec.ts:79 | 6 | 1 | no |
| 10 | e2e/components.spec.ts:157 | 5 | 1 | no |
By file: shell.spec.ts 10 runs, capture.spec.ts 9, capture-dialog-layout.spec.ts 9, rules.spec.ts 7, networth/expected/goals/components 6 each, assignment-rules 6, auth 5, verdicts 5 (4 branches). No vitest `FAIL` unit-test lines matched a stable file pattern (unit failures: 5 runs, see logs). 79 distinct failing locations in total. Flake vs real regression cannot be separated from logs alone (Playwright retries are not recorded in --log-failed).

## 5. Concurrency vs the 20-job limit and waits > 2 min
- One new-era run starts exactly 20 parallel jobs (static 1 + unit 2 + e2e 12 + visual 1 + windows-unit 2 + docker 1 + restore-test 1) plus 2 aggregate jobs at the end; old era median 8 jobs per run (max 20 only in the transitional 10-shard run).
- 38 of 59 new-era runs overlapped in time with at least one other run (old: 20 of 35). Observed running jobs >= 20 for ~61 minutes in the 25 h sample.
- Job start delay (created -> started): old median 3 s / p90 4 s / p99 76 s (1.8 % of 284 jobs > 60 s); new median 3 s / p90 108 s / p99 297 s (12.2 % of 1358 jobs > 60 s; 206 jobs > 30 s; max 5.7 min). Summed delay of delayed jobs: 541 job-min new vs 9 old.
- 187 of the 211 delayed jobs started while 15-19 other jobs were running, consistent with the 20-slot cap. Linux jobs p90 delay 115 s, Windows 42 s.
- Runs with at least one job waiting > 2 min: 13 of 59 new (22 %), 0 of 35 old; > 1 min: 17 of 59. Effect on wall: overlapping runs exec median 8.8 vs 8.3 min alone, but p90 PR wall is 13.5 vs 8.8 median.

## 6. PR lead time (38 PRs merged since 10-15; exact merge-commit match to a main push run and deploy run for all 38)
| segment | median | p90 | max |
|---|---|---|---|
| PR created -> merged | 89m | 660m | 2007m |
| merged -> main CI done | 17m | 21m | 59m |
| main CI done -> deploy start | 0m | 0m | 0m |
| deploy run duration | 2m | 2m | 189m |
| merged -> deploy success | 19m | 37m | 209m |
| created -> deploy success | 111m | 676m | - |
Split by CI era: merged before #545 (n=25) merge -> deploy median 20.9m (main CI 19.3m); after (n=13) 10.2m (main CI 8.6m); created -> merge 107m vs 53m. Outliers: #537 deploy run 189m (209m after merge), #504 main CI 59m (61m to deploy). Deploy runs since 10-13: 45 success, 6 skipped.

## Top 5 bottlenecks (ranked by cost to delivery speed)
1. PR CI failure churn: 42 % of terminal PR runs fail; 23 of 46 merged PRs needed >= 1 failed run; median 3 runs and 89 min open-to-merge (p90 11 h); after a failed run the next run on the branch fails again 18 of 38 times. Failed + cancelled runs burned 25 % of new-era job-minutes (36 % in the old era). Evidence: sections 3, 4, 6.
2. Same specs fail across several PR branches and never on main: capture.spec.ts:616 and capture-dialog-layout.spec.ts:29 in 9 runs / 5 branches each, shell.spec.ts 10 runs, rules.spec.ts:118 7 runs / 3 branches; 8 runs had >= 10 failing locations. Points to layout/snapshot-sensitive e2e coupled to shared UI (and possible flakes; 7 of 13 re-attempts passed). Evidence: section 4.
3. 20-slot concurrency cap: each run needs all 20 slots; 38 of 59 runs overlap; 12 % of jobs wait > 60 s (p99 297 s) vs 1.8 % before; 22 % of runs have a job waiting > 2 min; 541 job-min of queueing; cancelled/superseded runs (7 runs / 287 job-min in the sample; 25 since 10-13) hold slots ~3 min each. Run-level queue metric hides this (0 runs > 2 min). Evidence: sections 1, 5.
4. e2e critical path: shard 12 (8.1m median) finishes last in 69 % of runs while shard 3 takes 4.6m and the median shard 5.4m; balancing could cut ~2.5 min (about 30 %) of the 8.7 min wall. Also ~67 s setup per e2e job (Playwright install 41 s, build 8 s repeated 13x) = ~13 job-min per run that adds to slot pressure. Evidence: section 2.
5. Serial merge -> deploy: main re-runs the full suite before deploy (median 19m total, 10.2m post-#545) although the PR head already passed; deploy itself is 2 min. Tail risks: #537 deploy 189m, #504 main CI 59m. A queued main CI behind PR runs in the slot pool also lengthens this (main CI wall p90 11.9m). Evidence: section 6.

Caveats: 25 h sample for job-level data (n=96 usable runs); PR run counts use runs created since 10-13, so PRs opened earlier (#443-#447) are undercounted; windows jobs may use a separate runner pool (lower delay) so the 20-cap attribution is inferred from timing, not from the plan settings; 4 failed-run logs were empty.

## Measured CI variants (PR #654, closed without merge)
- Fail-fast (static before e2e): +2-3 min on every green PR run; only 4 of 38 failed runs were static-only failures, 25 failed on e2e only and are not helped.
- Container job: no measurable gain (image pull is about the same as the apt step).
- Shard count: 12 shards is fastest; 8 shards +3.4 min, 6 shards +4.4 min, no job-minute savings.
- Conclusion: nothing merged. The bigger levers are the recurring test-isolation failures (#653, #655) and skipping the duplicate full CI on main for an identical, already-validated tree (`reuse` job in ci.yml, `scripts/ci/reuse-validated-tree.mjs`).
