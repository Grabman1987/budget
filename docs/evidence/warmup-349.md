# #349 Honest Heute warm-up count

Prepared on 2026-10-08 at source HEAD `a61c09a9f78104054c243e5a337b764736b487e2`.
The normal source union on 2026-10-09 is `1cf1560d5ac91a999511868e1250ef81455eea33`,
including the reviewed #279 head `913fb6c3cfec46078eb2d43924e6bb5d4f62f4ba` and main's #287 delivery.
All five restored task files outside the normally merged roadmap retained their pre-union SHA-256 hashes.

## Regression and result

The initial focused regression failed for the intended reason: `warmReadModels` returned 3 while
the independent expectation was 2. The test output was `1 failed | 7 skipped`; the failing
assertion was `expect(warmed).toBe(2)`. This established that the success counter included the
uncached `/inbox/count` route.

The warm-up now requests only the month and payday Heute read models. The existing response-cache
allowlist remains unchanged, so the inbox badge remains live and uncached. The regression calls the
real Hono `/inbox/count` route twice after warm-up, checks both HTTP responses and equal count
payloads, and observes one additional database transaction per request. `warmReadModels` reports
two successful cacheable Heute responses.

The focused GREEN run for `response-cache.test.ts` passed all 8 tests. The broader focused API/GREEN
run passed 2 files / 12 tests, including the inbox API tests. Server TypeScript checking completed
without diagnostics. Existing output logs are in the local `%TEMP%` directory:

- `budget-warmup-349-red-1008.log` — expected 2, observed 3 before the correction.
- `budget-warmup-349-focused-green-1008.log` — 1 file / 8 tests passed.
- `budget-warmup-349-api-green-1008.log` — 2 files / 12 tests passed.
- `budget-warmup-349-typecheck-1008.log` — server TypeScript check completed.

After that union, the focused response-cache and inbox API run passed again: 2 files / 12 tests,
20.23 seconds, exit 0, with an explicit single worker. Log:
`%TEMP%/budget-warmup-349-final-union-api-1009.log`.

The timing table in [`perf.md`](../perf.md) remains a historical synthetic measurement; these
focused checks are not a new performance measurement.

The final repository-wide `npm run check -- -- --maxWorkers=1` passed all type, lint and formatting
checks and 379 files / 3,504 unit tests (917.26 seconds for the unit run, exit 0). Log:
`%TEMP%/budget-warmup-349-final-union-full-check-1009.log`. All 2,108 frozen file paths and SHA-256
hashes remained unchanged after the run. The actual #279 main merge `8bf37eb0b93771b77a435cef57d8ef0717795ff9`
was then normally unioned as `c042130f109ac61a48c1985979abb2756086982e`; the same manifest again had
zero path or hash changes. Only evidence, roadmap and historical-performance status text were then
updated and format-checked before committing. Exact-head CI, integration, deployment and owner
acceptance remain pending.
