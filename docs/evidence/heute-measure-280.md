# Heute handler cold/warm measurement — #280

This script measures the two Heute API handlers in process against a prepared synthetic database. It does not migrate, seed, scale, or write financial rows. Each observation uses a fresh SQLite connection and a new API instance. The handler-only API setup does not run an auth/session flow or create auth/session rows. A cold observation times the first request; a warm observation times the matching request after that API instance's `warm()` has completed. These are handler measurements, not fresh-process or browser timings.

## Prepare the synthetic database separately

Choose an absolute temporary path outside both the repository and every Dropbox folder. Seed and scale that file in separate commands, before measurement:

```powershell
$directory = Join-Path $env:TEMP ('budget-heute-280-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $directory -ErrorAction Stop | Out-Null
$db = Join-Path $directory 'synthetic.sqlite'
npm run db:seed -- --file $db --fresh
$env:DATABASE_PATH = $db
npx tsx scripts/perf/scale.ts
Remove-Item Env:DATABASE_PATH
```

Before making separate handler/browser copies, normalize the server's registered rule defaults in the prepared synthetic file. The sample seed contains 16 rules; the normal server startup calls `ensureDefaultRules` and adds 20 missing rules. That startup preparation must happen before the frozen dataset baseline, not inside an observed run:

```powershell
$env:DATABASE_PATH = $db
npx tsx --eval 'import { ensureDefaultRules, openDatabase } from "@budget/db"; const opened = openDatabase(process.env.DATABASE_PATH!); try { console.log(ensureDefaultRules(opened.db)); console.log(ensureDefaultRules(opened.db)); console.log(opened.sqlite.pragma("wal_checkpoint(TRUNCATE)")); } finally { opened.close(); }'
Remove-Item Env:DATABASE_PATH
$browserDb = Join-Path $directory 'browser-synthetic.sqlite'
Copy-Item -LiteralPath $db -Destination $browserDb
```

Use fresh, distinct temporary targets; do not replace an existing database. The repeated default preparation must report zero created/updated rules. Checkpoint and close the SQLite connection before copying. Handler measurements use `$db`; browser measurements use `$browserDb`, so auth preparation cannot alter the handler baseline.

Do not point this process at a production or personal database. The measurement CLI requires the path explicitly, rejects paths inside the repository or Dropbox, checks the synthetic `acc-giro` / `inst-bank-a` fixture markers, and requires an empty audit log. The prepared database must remain unchanged for the run.

## Measure

Run from the repository root, passing the same absolute synthetic path:

```powershell
npx tsx scripts/perf/heute-cold-warm.ts --database $db > $env:TEMP\heute-280.json
```

The run pins `today` to `2026-09-17` and requests `/api/heute?period=month&month=2026-09` and `/api/heute?period=payday&month=2026-09`. It plans ten independent cold and ten independent warm samples for each route. JSON stdout records the planned, attempted and completed sample counts per route/state; raw setup, warm-up and request milliseconds; HTTP status, response bytes and SHA-256; Node version, platform and architecture; and Git HEAD and dirty state. Before and after all attempted handler samples, it fingerprints every non-`sqlite_` SQLite table using the full table row counts and rows ordered by primary key (or `rowid` where no primary key exists). The data hash includes table and column names. A failed or incomplete sample, changed dataset, or cold/warm response hash mismatch makes the process exit unsuccessfully and omits success summaries. Raw samples remain in the JSON, so early termination shows the incomplete planned count.

The warm-up gate requires exactly two successful responses and does not reinterpret three as two. The verified #349 source from PR #380 is included in integrated main `788b15150f7cfbe27077660a09f92944e08377bb`; its eight Main-CI jobs and actual deployment/one-machine guard passed. Fresh `/health` at 2026-10-09 00:38:14 UTC returned that exact revision. Browser readiness and browser timing remain separate measurements.

## Browser harness

[`scripts/perf/heute-browser-cold-warm.ts`](../../scripts/perf/heute-browser-cold-warm.ts) runs the existing server and web bundles against an explicitly selected synthetic database. It requires `apps/server/dist/index.js` and `apps/web/dist/index.html` to exist; it does not build them. Use a normal production web build (`npm run build`) for the measurement; the E2E build includes additional development routes. The local synthetic server still uses the harness's test configuration for real synthetic auth preparation and disabled external jobs. Run it from the repository root with the same absolute temp-database path:

```powershell
npx tsx scripts/perf/heute-browser-cold-warm.ts --database $browserDb > $env:TEMP\heute-280-browser.json
```

The CLI rejects database paths inside the repository or any Dropbox folder, verifies the `acc-giro` and `inst-bank-a` seed markers plus empty `audit_log`, and fingerprints every non-`sqlite_` user table except the five auth tables (`passkey`, `auth_session`, `recovery_code`, `auth_challenge`, `auth_event`). The logical hash includes table/column names, row counts, and rows ordered by primary key (or `rowid` where there is no primary key). It compares that fingerprint before and after auth preparation and again after all attempted samples; auth table counts are reported separately and excluded from this financial-data comparison. Real synthetic passkey/session preparation uses the existing `e2e/bootstrap.ts` before samples. The temporary Playwright storage-state file is removed in `finally`; its cookie and session identifier are not printed. Before each measured server starts, the harness refreshes the prepared `auth_session` timestamps. During samples, observed API requests must be GETs with HTTP 200.

The browser harness measures only `/?monat=2026-09&period=payday` on the fixed date `2026-09-17`: ten cold and ten warm samples, twenty planned total. Each sample owns a fresh server process and browser context. A warm sample continues only if the real startup log reports exactly two successful models. It waits for the current navigation's successful Heute JSON response, required Heute-derived GETs, main answer/chart/attention/upcoming/net-worth content, and expanded savings proposals, pinned envelopes, checks, net-worth breakdown, funding notes, and recent bookings. Fonts must finish loading, two animation frames must pass and API requests/body reads must settle before the full-content timestamp. The page currently shows a “50/30/20 und Budgettreue erklären” link; it does not render a 50/30/20 calculation on Heute, so the harness waits for that visible link only.

Stdout JSON records planned, attempted, and completed counts, every raw sample and API observation, statuses, payload hashes/bytes, navigation-to-content and browser-observed Heute-response durations, session refresh/server startup/browser setup/warm-up timings, the non-auth table counts/hash, auth preparation notes, Node/platform/architecture/Chromium versions, actual Git HEAD and dirty-entry count, and the harness source SHA-256. Failures or incomplete samples exit nonzero, retain partial raw observations, and omit success summaries. On a complete run, all ten cold/warm Heute payload hashes must match. Source without #349 reports three warm models and is rejected rather than accepted as warmed.

Preparation verification on 2026-10-09: `npm ci` passed (504 packages, 36 seconds); both scripts passed an explicit strict TypeScript project extending the repository's base configuration, with DOM and Node types. Scoped ESLint initially found a mutable declaration and an unsafe throw from `finally`; the fixes preserve the primary error and fail an otherwise successful sample on cleanup failure. The repeated strict type and ESLint checks passed, and both scripts and this evidence passed formatting checks. The fresh E2E build passed; the subsequent normal production web build also passed (10.50 seconds, exit 0) and replaced the E2E web output for measurement. All 120 bundle files remained hash-identical after advancing the checkout to the actual integrated main. The added font gate also passed strict type/lint/format checks. Invalid database selections exited nonzero with zero attempted samples and no success summaries. The final repository-wide check and exact-head CI remain separate delivery gates.

## Observed baseline — 2026-10-09

The measured application source is integrated/live main `788b15150f7cfbe27077660a09f92944e08377bb` (tree `cb9d778a682614be2de27005834452662126a0d5`). The two new measurement scripts and this evidence were uncommitted additions during the run; raw Git metadata reports that dirty state explicitly. Handler source SHA-256: `7a5deb9532f2f653561b348530945037c52aa275814255756489d74fe659f9fa`; browser source SHA-256: `1abe0e56ecc53bf1c1e268e3e98900d6b5f4c9dd3d50b0e098c5c554b65756d3`. Both remained unchanged throughout measurement.

Environment: Windows x64, Node 24.12.0, Chromium 141.0.7390.37, Core i5-1135G7 (4 cores / 8 logical processors), 8,402,083,840 bytes physical RAM. Only one heavy local runner executed at a time. The web bundle is a normal production build; the synthetic local server uses test configuration with fixed today and disabled external jobs. Samples are sequential: handler alternates cold/warm within each route; browser completes ten cold samples followed by ten warm samples. These state orders and local machine load can affect the ranges; no confidence interval or production latency is claimed.

Prepared dataset: 7,033 bookings, 7,125 splits, 3,749 trades, 3,153 inbox items, 36 rules and zero audit rows. The initial browser preparation correctly rejected the unnormalized 16-rule seed because normal server startup added 20 defaults. It attempted zero timed samples and produced no success summaries ([failure record](heute-measure-280/browser-preparation-failure.jsonl)). The defaults were then added separately: only `rule` changed; a second `ensureDefaultRules` call created/updated zero rows and every table hash stayed identical. After checkpoint/close, the two prepared copies had identical file SHA-256 `95463ea333b106904ef30748c947ff0b55c977b67f92d6e2888855968a13cbc7`. The initial 16-rule handler run is superseded by the following shared 36-rule baseline.

All 40 handler samples and all 20 browser samples completed, with no failed/incomplete timed samples. Every measured response was HTTP 200. Browser observation recorded 180 successful GET requests, including all required queries; warm startup reported exactly two models for all ten warm samples. Cold/warm JSON hashes match in each layer, and all handler/browser payday responses also share hash `042d70244bc811f69611e7fa7641dd20c1c97e80968fcb9084d16dc1e4f1c717` (24,122 UTF-8 bytes). Month payloads are 22,309 bytes.

| Layer / state                          | n   | Median ms | Min–max ms          |
| -------------------------------------- | --- | --------- | ------------------- |
| Month handler / cold                   | 10  | 439.064   | 393.806–1,230.364   |
| Month handler / warm                   | 10  | 1.077     | 0.907–33.682        |
| Payday handler / cold                  | 10  | 439.734   | 388.721–947.757     |
| Payday handler / warm                  | 10  | 1.107     | 0.914–1.611         |
| Browser payday full content / cold     | 10  | 1,719.514 | 1,572.259–2,652.400 |
| Browser payday full content / warm     | 10  | 1,324.264 | 1,040.006–3,096.992 |
| Browser-observed Heute response / cold | 10  | 857.621   | 729.576–1,497.414   |
| Browser-observed Heute response / warm | 10  | 294.981   | 201.493–730.820     |

Warm-up is outside the request/navigation timings: handler medians are 804.496 ms (month) and 934.712 ms (payday), and browser warm-server preparation including startup/delayed warm-up is 3,293.630 ms. Its actual model-computation warm-up median is 1,300.500 ms. Setup/startup/warm-up raw values remain available separately; the warmed full-content figure does not include this preparation cost.

Handler all-table logical fingerprint stayed `0e2823c27d2d5ed91eb1541d2ec1491f41d076aad0f3e90abc7c3b24056181fb`. Browser non-auth logical fingerprint stayed `8d421100aefc6f12d1ba0e7bf93554b9b62af813a3f35b55dd5f41b5232ad682` before/after auth preparation and after all samples. These intentionally differ because the handler hashes auth tables too; both baseline copies contain the same financial rows. Browser auth-table changes are reported separately. Temporary session storage was removed successfully.

Raw observations and complete metadata are preserved as JSON Lines: a `run` record, each `sample`, then each `summary`. No database paths, cookies or session IDs are published:

- [Handler raw data](heute-measure-280/handler-raw.jsonl), SHA-256 `bc1454996a1a5c2e1567cb6bd998bf0045f5b491c432f084597e6384c53ffa56`.
- [Browser raw data](heute-measure-280/browser-raw.jsonl), SHA-256 `731b1e9d2da9d9effe1a52faa61622ce96ab74d77cada69ae82a6e5870b7ff91`.
- [Rejected browser preparation](heute-measure-280/browser-preparation-failure.jsonl), SHA-256 `6099a51e5b59f33e0d0c3574c8e2f7667aefae05fcfd645995bc95cb57aa4838`.

The warmed handler is much faster locally, but browser full-content time still includes other API work, transport and rendering. Neither measurement isolates CPU/SQL/rendering costs or proves an infrastructure bottleneck; #281 owns that next single-path profile. No Fly scaling recommendation follows from this local baseline. Real iPhone/Safari and private financial acceptance remain separate.

## Final delivery verification

Independent read-only review checked both scripts, protocol, raw records and all six main request/full-content summaries, with no concrete findings. All `n`, minimum and maximum values match exactly; medians agree within the 0.0005 ms rounding precision of emitted timings.

Final `npm run check -- -- --maxWorkers=1` passed on the frozen tree: all workspace typechecks, ESLint, formatting and 379 Vitest files / 3,504 tests (880.60 seconds for Vitest), exit 0. `BUDGET_REQUIRE_AGE=1` was set. The 2,114-file source/path SHA-256 manifest remained entirely unchanged after the check. Log: `%TEMP%/budget-heute-280-final-full-check-1009.log`. This result is followed only by protocol/roadmap delivery-result documentation and scoped formatting; measurement code and raw record values are unchanged. Raw JSON Lines were normalized to repository LF endings before commit, and the listed file hashes describe those published bytes. Exact-head CI, integration, actual deployment and fresh live revision remain pending.
