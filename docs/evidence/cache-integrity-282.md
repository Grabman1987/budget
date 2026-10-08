# Request cache integrity — #282

Three synthetic regressions failed before the repair at their literal assertions:

- An Explorer read through September 15 discarded later splits from shared data: the September 30 read returned 125 instead of 500 cents.
- A historical accuracy read added archived categories to shared live facts: subsequent live Pace returned 15,000 instead of 0 cents.
- An outer transaction retained a child savepoint's valuation after rollback: it returned 5,000 instead of 1,000 cents.

Explorer filtering and historical categories now use local shallow objects. Transaction reads are never stored in the request memo. A transaction may still reuse matching committed connection entries; plain-handle reads during an open transaction bypass memo storage, and existing defensive-copy behavior remains intact.

The same four focused files passed all 29 tests after the changes. An actual ledger API test checks net worth and Heute's account balance at 1,000 cents, after a +250-cent booking, undo, redo, and a failed DB transaction. Each state uses independent 1,000/1,250-cent expectations. Repeated responses for both endpoints are byte-identical and add no `db.select` calls. This spy checks read-model selection work; it does not count every raw SQL generation check. The rollback is injected at the DB transaction boundary, not through a new production HTTP hook. Existing warm-up middleware tests use a separate synthetic read endpoint.

Scoped lint, formatting and DB/server typechecks passed. The lead read the RED and GREEN runtime logs; independent review found no source issue. The full `npm run check` passed at the frozen implementation: typecheck, lint, formatting, and 372 test files / 3,410 tests, exit 0; Vitest duration 970.12 seconds. Full-check log: `budget-cache-integrity-282-full-check-1008.log`. This evidence does not establish external-connection rollback behavior, real-data reconciliation, performance timing, deployment, or owner acceptance. No private financial data was used.

PR #372 was merged into `origin/perf/part2-1007` at `16a4bd8a203a807d713f956d3d10ff5fd0f8ecdb`, preserving the cache fixes and evidence. This branch unions that performance work with verified `origin/main` at `61aa041cf9ff8ec7adeb0d335ca3ae791504ec1d`. The separate pre-union result above is historical; the integrated union passed `npm run check` with typecheck, lint and formatting, 376 test files / 3,476 tests, exit 0 (Vitest 1,103.46s). The E2E build passed. Focused desktop/mobile inbox and One-Pager browser tests passed 18 cases with one desktop-only backdrop case skipped; evidence and limits are in [main-union browser evidence](cache-integrity-282/main-union-browser.md). Its merge conflicts were limited to this roadmap and `e2e/whole-picture.spec.ts`; the latter retains main's phone-breakpoint readiness check and the performance branch's retry-aware context-toggle assertion. No calculation, schema, or cache behavior was changed by conflict resolution.

Local logs are retained as `budget-cache-integrity-282-focused-red-1008.log`, `budget-cache-integrity-282-focused-green-expanded-1008.log`, and `budget-cache-integrity-282-full-check-1008.log`.
