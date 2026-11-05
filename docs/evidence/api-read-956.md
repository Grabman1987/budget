# Synthetic API read latency (#956)

The original API is main `9a4acd22fa2ce7ac0bfffdafe948e9432e15720a`.
Commit `2101dd2dbd513cff80ba412f1cbb6c8def48af79` adds only the fixture and
measurement harness to that revision; it is the reproducible baseline in this PR.
The optimized measurements use the subsequent product changes in this PR.

## Method and boundaries

- Offline Linux container, production's Node 22 Bookworm slim image pinned to
  `sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da`
  (Node 22.23.4). Docker limits: one CPU, 512 MiB RAM, no swap, no network.
  This caps CPU throughput; it does not reproduce Fly shared-CPU contention.
- Synthetic public sample extended to 10,000 bookings, 2,500 trades, 16 accounts,
  3,153 inbox items and 1,000 market runs. Six securities, 36 categories, multiple
  years of history, transfers, currencies and stored prices remain in the sample.
  No production database, private export or provider call is an input.
- The identical SQLite dataset is used in both arms, SHA-256
  `480a1f50b0a3ceaba1c198810bd26967606eb60d9f4a8da32663282be0000dae`.
  The harness validates a synthetic marker and an empty audit log on the same
  read-only handle before fingerprinting or recording anything. Creation refuses
  an existing path. Measurement asserts the connection writes no rows.
- Ten sequential samples per route, a fresh API/response cache per sample, fixed
  day `2026-09-17`, warm OS/page cache. Timing includes the handler and consumption
  of the complete response body; route construction and event-loop yields between
  samples are excluded. These are in-process Hono reads, excluding TCP, TLS, auth,
  provider/worker activity and browser/rendering time. The redesign's actual Plan
  requests include `previewBasis=1`.
- The baseline captures literal response buffers. Every optimized sample compares
  the entire buffer, including preview tokens, with those files. Only the random
  restart UUID input is fixed, identically in both processes; no response field is
  removed or normalized. The new reference-only endpoint must equal the literal
  `{reference: oldReport.reference}` projection. A separate profiled run verifies
  five additional existing routes (positions, both Heute periods, account series,
  liquidity), for **14 unchanged existing responses** in total.
- Profile instrumentation is used separately for query counts, never for the
  latency numbers below. One heavy local job runs at a time. The saved raw results
  include sample distributions, CPU usage, cgroup limits, GC and process memory:
  [before](api-read-956/before.json), [after](api-read-956/after.json),
  [1 GiB capacity comparison](api-read-956/after-1024.json).

## Results

Milliseconds; median is the conventional median, maximum is the largest of ten
samples. Each listed API read is below 500 ms in this controlled after run.

| API path (under `/api`) | Before median / max | After median / max |
| --- | ---: | ---: |
| `/budget/2026-09?previewBasis=1` | 767.4 / 904.6 | 374.6 / 454.0 |
| `/budget/months?months=2026-08,2026-09&previewBasis=1` | 713.2 / 810.1 | 336.5 / 383.3 |
| `/accounts` | 85.4 / 100.9 | 92.1 / 140.9 |
| `/payslip-intake/status` | 5.0 / 37.5 | 5.7 / 8.7 |
| `/reports/spending/inflation` | 517.2 / 626.3 | 396.5 / 451.9 |
| `/sources/crypto` | 7.4 / 49.2 | 2.7 / 5.7 |
| `/inbox/count` | 59.2 / 92.2 | 85.1 / 115.7 |
| `/market/status` | 1.6 / 36.8 | 1.5 / 3.1 |
| `/profile` | 1.6 / 2.6 | 1.4 / 1.8 |
| `/inflation-basket/reference` (new settings projection) | Full report above | 1.8 / 50.6 |

A representative seven-read settings/shell burst (Plan, accounts, payslip status,
crypto, inbox, market and CPI) completes in **1,515.5 → 429.8 ms**. It substitutes
the reference projection for the unused personal inflation report. This is one
synthetic handler burst, not a reproduced 25-second browser page load.

## Causes and changes

1. Plan read models passed transaction handles to independently loading helpers.
   Request memoization already exists, but the transaction policy deliberately
   does not store newly computed results. Explicitly passing the same immutable
   ledger to facts and report history reduces the large split/booking join from
   **five executions to one** per Plan request. Total SQL executions fall from
   **113 → 82** (single month), **125 → 94** (two months). Memo invalidation,
   transaction policy and preview revision/hash construction are unchanged.
2. Plan history and inflation used the complete report-table model although they
   consume only month spending/assignments. A projection through the same shared
   calculation omits unused FIFO money-age events/calculation and payee ranking.
   The full report endpoint still calculates and returns its original fields.
3. Mapping every primitive ledger cell through the ORM adds allocation/dispatch
   costs. The same join, predicates, selected column order and SQLite connection
   now produce aliased primitive rows directly. Boolean decoding mirrors the
   installed ORM's `Number(value) === 1`; integer money values are unchanged.
4. Inflation's repeated booking search is replaced with a lookup retaining the
   original first row, insertion order and subtraction order. Five COICOP queries
   become one complete query, retaining empty classes and every stored month.
   Inflation SQL executions fall **254 → 248** overall. Settings now requests
   just its public CPI reference metadata, avoiding household calculations.
5. Crypto settings discarded computed account balances; it now reads the same
   live account rows and SQLite ordering without calculating those balances.
6. Startup warm-up awaited synchronous reads back-to-back, draining microtasks
   without giving ready I/O a turn. It now yields between completed requests,
   outside transactions, still warming both models in the same order. A queued
   check-phase callback runs after **2,901.0 → 1,358.7 ms**; total warm-up is
   **2,881.3 → 2,692.4 ms**, two models in both arms. This is an event-loop fairness
   measurement, **not** a measured health socket response or proof about 503s.
7. Pending source dates and pending account valuations now say “Wird geladen …”.
   Resolved missing data still says “Nicht verfügbar”; loaded amounts are retained.

No schema/index migration, financial formula, writer, lock, audit, Undo,
cross-request cache policy, production configuration or provider feature changes.
The remaining scans do not justify a migration for this measured target.

## Memory, capacity and owner proposal

At 512 MiB, the Node heap limit is 259 MiB. Whole-harness peak RSS is
**217.6 → 202.3 MiB**, with zero cgroup OOM/OOM kills in both runs. GC count/time
falls **8,076 / 9,450.8 ms → 4,725 / 5,541.2 ms** across the entire benchmark.
Whole-process peak RSS includes setup and fingerprinting. The GC observer starts
after fingerprinting; its totals cover subsequent API setup, repeated cold
requests, the burst and warm-up. These are not production process memory or
per-request GC measurements.

A separate optimized run at **the same one CPU, 1 GiB RAM, no swap** keeps every
response byte equal. Node's default heap limit becomes 524 MiB. Plan median is
**320.7 ms**, inflation **324.2 ms**, burst **415.7 ms**; peak RSS **205.2 MiB**,
GC **1,193 / 3,370.5 ms**. The measured larger-memory environment helps allocation
and GC behavior even though this fixture does not approach 512 MiB RSS. It does
not prove that machine size caused the production incident.

Proposal for owner approval after reviewing/deploying this fix: retain the
current configuration for initial comparison; correlate Fly CPU throttling,
memory/OOM events, health latency, cold-start timing, concurrent worker activity
and actual `NODE_OPTIONS` with the 13:39Z incident. If GC/latency remains material,
trial **shared-cpu-1x with 1 GiB** under the same synthetic and owner acceptance
workload, recording before/after p95 and RSS. If CPU throttling is dominant,
evaluate a dedicated-CPU canary separately. This PR changes no machine size,
`fly.toml`, Node flags or production data, and claims no production SLO result.

## Reproduction

Use a disposable checkout with dependencies installed on supported Node 22.
Never substitute an operator database for the generated fixture.

```bash
git worktree add --detach work/api-956-baseline 2101dd2dbd513cff80ba412f1cbb6c8def48af79
(cd work/api-956-baseline && npm ci)
mkdir -p work/api-956/results
npx esbuild work/api-956-baseline/scripts/perf/api-reads.ts \
  --bundle --platform=node --format=esm --target=node22 \
  --external:better-sqlite3 '--external:pdfjs-dist/*' \
  --banner:js="import{createRequire}from'node:module';const require=createRequire(import.meta.url);" \
  --outfile=work/api-956/before.mjs
npx esbuild scripts/perf/api-reads.ts \
  --bundle --platform=node --format=esm --target=node22 \
  --external:better-sqlite3 '--external:pdfjs-dist/*' \
  --banner:js="import{createRequire}from'node:module';const require=createRequire(import.meta.url);" \
  --outfile=work/api-956/after.mjs

# docker_run uses the current checkout, a writable SQLite sidecar directory,
# and a read-only SQLite measurement handle inside the harness.
docker_run() {
  env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH \
    docker --host=unix:///var/run/docker.sock run --rm --network none \
    --cpus 1 --memory 512m --memory-swap 512m -v "$PWD:/repo" -w /repo \
    -e BUDGET_MIGRATIONS_DIR=/repo/packages/db/drizzle \
    node:22-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da \
    node "$@"
}
docker_run work/api-956/before.mjs --database /repo/work/api-956/synthetic.sqlite --create
docker_run work/api-956/before.mjs --database /repo/work/api-956/synthetic.sqlite \
  --samples 10 --capture /repo/work/api-956/results/bodies --settings-burst --startup \
  > work/api-956/results/before.json
docker_run work/api-956/after.mjs --database /repo/work/api-956/synthetic.sqlite \
  --samples 10 --compare /repo/work/api-956/results/bodies --reference-card --settings-burst --startup \
  > work/api-956/results/after.json
```

For the additional byte comparisons, repeat the two arms with `--samples 1
--include-extras --profile-sql` and a separate capture directory. For the capacity
experiment, repeat the optimized arm with both memory limits set to `1g`.
Keep the same dataset, restart UUID input, SQLite journal/sidecar environment and
route list in each comparison. Preview tokens intentionally include SQLite's
connection revision; a changed journal environment is not an equivalent input.

## Regression coverage

- `read-performance-956.test.ts` and its JSON corpus: nine original full response
  byte digests/lengths, independently captured from main; reference projection,
  absent reference, zero writes and synthetic/read-only measurement safeguards.
- `inflation-subindices.test.ts`: literal JSON equivalence with the old complete
  per-class lookup, including nonchronological inserts and empty classes.
- `response-cache.test.ts`: ready callback between warm models, retaining count/order.
- `overview-redesign.test.tsx`: pending linked valuation then exact loaded amount.
- `settings-redesign-slices.test.tsx`: pending dates and reference-only request.

Existing financial, mutation, preview-staleness, valuation, lock and Undo
expectations, test timeouts and skips are unchanged. Independent full-diff review
includes these test additions and their effect on coverage.
