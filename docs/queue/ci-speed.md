# CI speed

Measured on real runs of the same suite (155 e2e specs): baseline = CI run 39001708281 on `main`
(2026-10-17), after = CI run 39013219359 on PR #545. Durations are job start to end, in minutes.

| Job                      | Before                      | After                       |
| ------------------------ | --------------------------- | --------------------------- |
| e2e (Playwright)         | 3 shards: 11.9 / 16.9 / 19.4 | 12 shards: 4.5 to 6.5       |
| unit (Linux)             | 5.0 (typecheck+lint+tests)  | `static` 3.2, `unit` 2 shards 1.9 / 2.5 |
| check-windows            | 11.3                        | 2 shards 4.3 / 4.5          |
| visual (screenshots)     | inside e2e                  | 4.0 (new job, own runner)   |
| docker / restore-test    | 0.8 / 0.2                   | 0.7 / 0.2                   |
| **PR wall clock**        | **about 20**                | **6.7**                     |

## What runs where

- `check` (required) needs `static`, `unit`, `e2e` and `visual`.
- `static`: typecheck and lint on Ubuntu. They are OS-independent (`.gitattributes` pins `eol=lf`), so Windows no longer repeats them.
- `unit`: `vitest --shard=i/2` on Ubuntu, with `age` installed (`BUDGET_REQUIRE_AGE=1`).
- `e2e`: 12 Playwright shards with `--ignore-snapshots`. Screenshot assertions are skipped there, every other assertion still runs. Each shard builds the bundle itself (seconds), so no build artifact is passed around.
- `visual`: only the specs that call `expectScreenshot` / `toHaveScreenshot` (found by grep, so new ones are picked up), without `--ignore-snapshots`. Still blocking through `check`.
- `check-windows` (required) is the aggregate of `windows-unit` (`npm ci` without compiler, `vitest --shard=i/2` incl. DB path handling).
- `docker` and `restore-test` are unchanged.

## UI changes

A PR that changes the UI on purpose needs reviewed Linux baselines before it merges:
run the manual workflow `update-snapshots.yml` for the branch. Its optional `specs` input
(space-separated paths, e.g. `e2e/shell.spec.ts`) limits the run; empty means all specs that compare
screenshots. The workflow commits to the branch with `GITHUB_TOKEN`, which does not start CI, so push
an empty commit afterwards.

## Limits

GitHub's free plan runs 20 jobs at once; one PR now uses about 20, so several PRs in parallel queue.
Shard 12 (6.5 min) is the slowest; Playwright splits by test count, not by duration.
