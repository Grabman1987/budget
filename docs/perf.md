# Performance

The timings below are historical synthetic measurements from the original performance branch,
before the #282 cache repair and its union with current main. The current integration's evidence is
in [cache integrity](evidence/cache-integrity-282.md); it verifies selected financial responses and
regressions, not all-route performance or live speed. The measurement loop invalidates the response
cache before every repetition, and the comparison script currently skips missing after-routes.
Reproducible browser cold/warm measurement and profiling remain #280/#281; the inaccurate warmed
model count for `/inbox/count` remains #349. Do not treat the old table as their acceptance evidence.

Server timings of the read models on a production-sized synthetic ledger, how to measure them and
what was changed (part 1: PR #236, part 2: this document). Money results are integer cents and
stay identical: every optimised read model is compared response by response (`scripts/perf/compare.mjs`)
and by tests (`packages/fixtures/src/request-memo-reads.test.ts`).

## Measuring

```bash
npm run db:seed -- --file data/perf.sqlite --fresh      # synthetic sample ledger (no real data)
DATABASE_PATH=data/perf.sqlite npx tsx scripts/perf/scale.ts   # ~7.0k bookings, ~3.7k trades, 3.1k inbox rows
. scripts/perf/env.sh                                   # Git Bash: DATABASE_PATH, BUDGET_MIGRATIONS_DIR, MIGRATE=0
ROUTES="$(cat scripts/perf/routes.txt)" REPS=9 OUT=data/after.json npx tsx scripts/perf/measure.ts
node scripts/perf/compare.mjs data/before.json data/after.json   # timings side by side, hashes must match
scripts/perf/prof.sh '/heute?period=month&month=2026-09' 25    # V8 CPU profile of one route
```

`measure.ts` calls the ledger API in process (`app.request`), moves the database stamp before every
repetition (so the read-model cache cannot answer) and records time, statement count/time and a hash of
the response. `before.json` comes from the same script on the commit before the change.

## Results (server time per request, best of 9, ms)

Dataset: 7,033 bookings (7,125 splits), 3,749 trades, 3,153 inbox rows, 9 accounts. Machine: a
Windows laptop, single request at a time. Queries = SQL statements per request.

| Endpoint | Before | After | Queries | Factor |
| --- | ---: | ---: | --- | ---: |
| Heute (Monat) | 1214 | 501 | 692 -> 625 | 2.4x |
| Heute (bis Gehalt) | 1471 | 507 | 686 -> 639 | 2.9x |
| Konten | 20 | 23 | 29 -> 33 | 0.9x |
| Plan Monat | 305 | 158 | 68 -> 70 | 1.9x |
| Plan Monate (4) | 372 | 164 | 84 -> 86 | 2.3x |
| Vermögen 1 J | 68 | 54 | 55 -> 59 | 1.3x |
| Vermögen Alles | 67 | 77 | 55 -> 59 | 0.9x |
| Finanz-Check | 248 | 163 | 267 -> 277 | 1.5x |
| Jahresreport | 225 | 149 | 109 -> 119 | 1.5x |
| Vergleich | 33 | 28 | 8 -> 12 | 1.2x |
| Gesamtübersicht 1 J | 358 | 216 | 88 -> 88 | 1.7x |
| Gesamtübersicht Alles | 353 | 277 | 88 -> 88 | 1.3x |
| One-Pager | 604 | 328 | 495 -> 497 | 1.8x |
| Einnahmen | 145 | 85 | 40 -> 43 | 1.7x |
| Posteingang | 175 | 68 | 18 -> 22 | 2.6x |
| Posteingang Zähler | 172 | 61 | 17 -> 21 | 2.8x |
| Cashflow | 262 | 77 | 28 -> 29 | 3.4x |
| Nettovermögen-Verlauf | 267 | 93 | 215 -> 219 | 2.9x |
| Vermögen/Schulden-Verlauf | 645 | 156 | 688 -> 692 | 4.1x |
| Inflation | 458 | 160 | 259 -> 255 | 2.9x |
| Bankkosten | 444 | 198 | 37 -> 38 | 2.2x |

The few extra statements are the cheap database-stamp reads of the request memo. Konten and the two
net-worth figures are within measurement noise (they were already fast).

Paginated lists (`limit` is optional; without it both answer as before):

| Endpoint | Payload | Time |
| --- | ---: | ---: |
| `GET /api/trades` (3,749 trades) | 1,329 kB | 18 ms |
| `GET /api/trades?limit=100` | 36 kB | 2 ms |
| `GET /api/inbox` | 28 kB | 68 ms |
| `GET /api/inbox?limit=100` | 18 kB | 70 ms |

## What was slow, and what changed

Profiles showed that a request spent its time re-reading the same large tables (7k splits, 3.7k
trades, all FX rates) through the ORM and re-deriving the same budget several times, not in SQLite itself.

1. **Per-request reads** (`packages/db/src/repos/request-memo.ts`): `memoizedShared` hands every caller
   of one request the same read-only object, no copy. Used for the budget ledger (`budgetLedger`), the
   classified report ledger (`overviewData`), the trades and FX rates of the valuation, the cashless
   contact bookings, all live trades of the savings plans and the rule facts (`loadFacts`). The
   budget run itself is shared per ledger, span and options (`budgetOfLedger`). A transaction without
   writes of its own may use what the plain handle stored (same database stamp), so the Posteingang
   (it reads in a transaction) no longer reads the ledger again. Entries still die with any write
   (`total_changes`, `data_version`) and never cross a rolled-back transaction.
2. **No per-month rescans in the budget** (`budgetMonths`): cash balances at each month end come from
   one pass (`balanceSeries`), and next-month income per month from one sweep, instead of filtering
   and summing all splits for every month.
3. **Geldalter** (`ageOfMoneyAt`): one sorted pass answers all month ends of the report tables;
   `daysBetween` parses every date once.
4. **Sparplan-Abgleich** (`matchExecutions`, `savingsExecutionProposals`): buys are grouped per
   position and bookings looked up by (month, security, account) instead of nested scans over all trades.
5. **Heute warm-up**: after start (1.5 s) the server asks Heute for the current month in both balance
   periods once, in process, so the first visit after a deploy is answered from the read-model cache
   (`BUDGET_WARM_UP=0` switches it off). The cache key is now path and query without host.
6. **Pagination**: `GET /api/trades?limit=&offset=` (answers `total`, `next`) and
   `GET /api/inbox?limit=&offset=`. The Posteingang page draws a long queue 100 rows at a time
   ("Weitere anzeigen"); group counts stay those of the whole queue.

No migration and no new index were needed: no statement was slow on its own (the largest takes
about 25 ms for 7k rows), the cost was repeated reading and mapping.

## CI flakes

- `e2e/shell.spec.ts` route sweep (`main` landmark within 5 s on `/reports/finanzcheck`,
  `/reports/jahresreport`, `/reports/vergleich`): the three pages do not render slowly by themselves;
  the sample server is one Node process shared by all workers, and a long synchronous Heute, One-Pager
  or Gesamtübersicht from another spec delays everything behind it. Those requests are now 1.5-3x
  shorter, and repeated reads without a write come from the cache.
- `e2e/whole-picture.spec.ts` (120 s timeout on a click): the click was the second "Mehr anzeigen" of the
  One-Pager pace chart after a viewport resize. Whether the resize redraws the chart (resetting the
  toggle) is timing dependent; when it did not, the button read "Weniger anzeigen" and the click waited
  until the test timeout. The spec now brings the toggle into the wanted state whichever it is in and
  still asserts that the income line is visible.

## Not done / ideas

- The ORM row mapping (`drizzle-orm` `mapResultRow`) is now the largest single cost of the big reads
  (about a fifth of Heute). Raw prepared statements for the three big row sets (splits, trades, prices)
  would remove most of it but touch many callers.
- The net worth of 12 month ends in One-Pager/Heute computes a valuation per day; a series from one
  pass over trades and prices would be faster but has to reproduce the valuation rules exactly.
